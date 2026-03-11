'use strict';

const fs = require('fs/promises');
const path = require('path');

const {
  createSymbolModel, createClass, createMethod, createProperty, createField,
  mergeClasses, getOrCreateNamespace, addDependencyEdge, applyScope, computeStats
} = require('./symbolExtractor');

const MAX_FILE_SIZE = parseInt(process.env.MAX_PARSE_FILE_SIZE_KB || '512', 10) * 1024;

let treeSitterAvailable = false;
let Parser, Cpp;

// Try to load tree-sitter — fall back to regex if unavailable
try {
  Parser = require('tree-sitter');
  Cpp = require('tree-sitter-cpp');
  const p = new Parser();
  p.setLanguage(Cpp);
  treeSitterAvailable = true;
} catch {
  treeSitterAvailable = false;
}

// ── Regex fallback patterns ───────────────────────────────────────────────────
const RE_NAMESPACE = /namespace\s+([\w:]+)\s*\{/g;
const RE_CLASS = /(?:^|\n)\s*(?:template\s*<[^>]*>\s*)?(class|struct)\s+(\w+)(?:\s*:\s*([\w\s:,]+?))?\s*\{/gm;
const RE_METHOD = /(?:virtual\s+|static\s+|inline\s+|explicit\s+|constexpr\s+)*([\w:*&<>[\]]+\s+)(\w+)\s*\(([^)]*)\)\s*(?:const\s*)?(?:override\s*)?(?:= *0\s*)?(?:[;{])/gm;
const RE_INCLUDE = /#include\s+["<]([\w./]+)[">]/g;

/**
 * Parse a single C++ file using tree-sitter
 */
async function parseFileTreeSitter(filePath, relPath) {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_FILE_SIZE) return null;

  const source = await fs.readFile(filePath, 'utf8');
  const parser = new Parser();
  parser.setLanguage(Cpp);
  const tree = parser.parse(source);

  const classes = [];
  const includes = extractIncludes(source);

  function getNodeText(node) {
    return source.substring(node.startIndex, node.endIndex);
  }

  function getLineNumber(node) {
    return node.startPosition.row + 1;
  }

  function walkNamespace(node, currentNamespace = '(global)') {
    for (const child of node.children) {
      if (child.type === 'namespace_definition') {
        const nameNode = child.childForFieldName('name');
        const nsName = nameNode ? getNodeText(nameNode) : '(anonymous)';
        const fullNs = currentNamespace === '(global)' ? nsName : `${currentNamespace}::${nsName}`;
        const bodyNode = child.childForFieldName('body');
        if (bodyNode) walkNamespace(bodyNode, fullNs);
      } else if (child.type === 'class_specifier' || child.type === 'struct_specifier') {
        const cls = extractClass(child, source, relPath, currentNamespace, includes);
        if (cls) classes.push({ cls, namespaceName: currentNamespace });
      } else if (child.children) {
        walkNamespace(child, currentNamespace);
      }
    }
  }

  walkNamespace(tree.rootNode);
  return classes;
}

function extractClass(node, source, relPath, namespaceName, includes) {
  const getNodeText = (n) => source.substring(n.startIndex, n.endIndex);

  const nameNode = node.childForFieldName('name');
  if (!nameNode) return null;

  const className = getNodeText(nameNode);
  const kind = node.type === 'struct_specifier' ? 'struct' : 'class';
  const cls = createClass(className, kind, 'public');
  cls.file = relPath;
  cls.line = node.startPosition.row + 1;

  // Base classes
  const baseClauseNode = node.childForFieldName('base_class_clause');
  if (baseClauseNode) {
    for (const base of baseClauseNode.children) {
      if (base.type === 'base_class_specifier') {
        const baseNameNode = base.childForFieldName('name');
        if (baseNameNode) {
          const baseName = getNodeText(baseNameNode).split('::').pop();
          if (baseName.startsWith('I') && /^I[A-Z]/.test(baseName)) {
            cls.implementedInterfaces.push(baseName);
          } else {
            cls.baseClasses.push(baseName);
          }
        }
      }
    }
  }

  // Body members
  const bodyNode = node.childForFieldName('body');
  if (bodyNode) {
    let currentAccess = kind === 'struct' ? 'public' : 'private';
    for (const member of bodyNode.children) {
      if (member.type === 'access_specifier') {
        currentAccess = getNodeText(member).replace(':', '').trim();
      } else if (member.type === 'function_definition' || member.type === 'declaration') {
        const method = extractMethod(member, source, currentAccess);
        if (method && method.name !== className) {
          cls.methods.push(method);
        }
      } else if (member.type === 'field_declaration') {
        const field = extractField(member, source, currentAccess);
        if (field) {
          cls.fields.push(field);
          cls.dependencies.push(...extractCppTypeNames(field.type));
        }
      }
    }
  }

  // Include-based dependencies
  cls.dependencies.push(...includes.map(i => path.basename(i, path.extname(i))));
  cls.dependencies = [...new Set(cls.dependencies.filter(d => d && d !== className))];

  return cls;
}

function extractMethod(node, source, access) {
  const getNodeText = (n) => source.substring(n.startIndex, n.endIndex);

  // function_definition has declarator
  const declaratorNode = node.childForFieldName('declarator');
  if (!declaratorNode) return null;

  // Walk to function_declarator
  let funcDecl = declaratorNode;
  while (funcDecl && funcDecl.type !== 'function_declarator') {
    funcDecl = funcDecl.children?.find(c => c.type === 'function_declarator') || null;
  }
  if (!funcDecl) return null;

  const nameNode = funcDecl.childForFieldName('declarator');
  if (!nameNode) return null;

  const rawName = getNodeText(nameNode).split('::').pop().replace(/[~*&]/, '');
  if (!rawName || rawName.includes('(')) return null;

  const returnTypeNode = node.childForFieldName('type');
  const returnType = returnTypeNode ? getNodeText(returnTypeNode).trim() : 'void';

  const method = createMethod(rawName, returnType, access);

  // Check modifiers
  const fullText = getNodeText(node);
  method.isStatic = /\bstatic\b/.test(fullText);
  method.isVirtual = /\bvirtual\b/.test(fullText);
  method.isAbstract = /=\s*0/.test(fullText);

  // Parameters
  const paramListNode = funcDecl.childForFieldName('parameters');
  if (paramListNode) {
    method.parameters = extractParameters(paramListNode, source);
  }

  return method;
}

function extractParameters(paramListNode, source) {
  const getNodeText = (n) => source.substring(n.startIndex, n.endIndex);
  const params = [];
  for (const param of paramListNode.children) {
    if (param.type === 'parameter_declaration') {
      const typeNode = param.childForFieldName('type');
      const declaratorNode = param.childForFieldName('declarator');
      const type = typeNode ? getNodeText(typeNode).trim() : 'auto';
      const name = declaratorNode ? getNodeText(declaratorNode).replace(/[*&]/, '').trim() : '';
      params.push({ name, type });
    }
  }
  return params;
}

function extractField(node, source, access) {
  const getNodeText = (n) => source.substring(n.startIndex, n.endIndex);
  const typeNode = node.childForFieldName('type');
  const declaratorNode = node.children.find(c => c.type === 'init_declarator' || c.type === 'identifier');
  if (!typeNode || !declaratorNode) return null;
  const type = getNodeText(typeNode).trim();
  const name = getNodeText(declaratorNode).split('=')[0].replace(/[*&;]/, '').trim();
  return createField(name, type, access);
}

function extractIncludes(source) {
  const includes = [];
  let m;
  RE_INCLUDE.lastIndex = 0;
  while ((m = RE_INCLUDE.exec(source)) !== null) {
    includes.push(m[1]);
  }
  return includes;
}

function extractCppTypeNames(typeStr) {
  return typeStr
    .replace(/[*&<>[\]]/g, ' ')
    .split(/\s+/)
    .filter(t => /^[A-Z][a-zA-Z0-9_]*$/.test(t));
}

/**
 * Regex-based fallback C++ parser
 */
async function parseFileRegex(filePath, relPath) {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_FILE_SIZE) return null;

  const source = await fs.readFile(filePath, 'utf8');
  const includes = extractIncludes(source);
  const classes = [];

  let m;
  RE_CLASS.lastIndex = 0;
  while ((m = RE_CLASS.exec(source)) !== null) {
    const kind = m[1];
    const name = m[2];
    const inheritance = m[3] ? m[3].trim() : '';

    const cls = createClass(name, kind === 'struct' ? 'struct' : 'class', kind === 'struct' ? 'public' : 'private');
    cls.file = relPath;
    cls.line = source.substring(0, m.index).split('\n').length;

    if (inheritance) {
      const parts = inheritance.split(',').map(s => s.replace(/public|private|protected/, '').trim().split('::').pop());
      for (const part of parts) {
        if (!part) continue;
        cls.baseClasses.push(part);
      }
    }

    const classBody = extractBracedBlock(source, m.index + m[0].length - 1);

    // Simple method extraction
    RE_METHOD.lastIndex = 0;
    let mm;
    while ((mm = RE_METHOD.exec(classBody)) !== null) {
      const returnType = mm[1].trim();
      const methodName = mm[2];
      if (methodName === name || !returnType) continue;
      const method = createMethod(methodName, returnType, 'public');
      method.parameters = parseParamsRegex(mm[3]);
      cls.methods.push(method);
    }

    cls.dependencies = [...new Set(includes.map(i => path.basename(i, path.extname(i))))];
    classes.push({ cls, namespaceName: '(global)' });
  }

  return classes;
}

function parseParamsRegex(paramsStr) {
  if (!paramsStr.trim()) return [];
  return paramsStr.split(',').map(p => {
    const parts = p.trim().replace(/[*&]/, ' ').split(/\s+/).filter(Boolean);
    const name = parts.pop() || '';
    const type = parts.join(' ') || 'auto';
    return { name, type };
  }).filter(p => p.name);
}

function extractBracedBlock(source, startIndex) {
  let depth = 0;
  let i = startIndex;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.substring(startIndex, i + 1);
    }
    i++;
    if (i - startIndex > 200000) break;
  }
  return source.substring(startIndex);
}

/**
 * Main C++ parser entry point
 */
async function parseCpp(files, rootPath, scope = 'public_only') {
  const model = createSymbolModel('cpp', rootPath);
  model.stats.totalFiles = files.length;

  // Pair .h/.hpp with .cpp/.cxx files for merging
  const classRegistry = new Map();

  for (const filePath of files) {
    const relPath = path.relative(rootPath, filePath);
    try {
      let results;
      if (treeSitterAvailable) {
        results = await parseFileTreeSitter(filePath, relPath);
      } else {
        results = await parseFileRegex(filePath, relPath);
      }
      if (!results) continue;

      for (const { cls, namespaceName } of results) {
        const ns = getOrCreateNamespace(model, namespaceName);
        const key = `${namespaceName}:${cls.name}`;
        const existing = classRegistry.get(key);
        if (existing) {
          mergeClasses(existing, cls);
        } else {
          ns.classes.push(cls);
          classRegistry.set(key, cls);
        }
      }
    } catch (err) {
      model.stats.parseErrors.push({ file: relPath, error: err.message });
    }
  }

  // Build dependency edges
  for (const ns of model.namespaces) {
    for (const cls of ns.classes) {
      for (const base of cls.baseClasses) {
        addDependencyEdge(model, cls.name, base, 'inherits');
      }
      for (const iface of cls.implementedInterfaces) {
        addDependencyEdge(model, cls.name, iface, 'implements');
      }
      for (const dep of cls.dependencies) {
        if (dep !== cls.name) addDependencyEdge(model, cls.name, dep, 'uses');
      }
    }
  }

  applyScope(model, scope);
  computeStats(model);
  return model;
}

module.exports = { parseCpp };
