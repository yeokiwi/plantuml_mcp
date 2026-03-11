'use strict';

const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const {
  createSymbolModel, createClass, createMethod, createProperty, createField,
  mergeClasses, getOrCreateNamespace, addDependencyEdge, applyScope, computeStats
} = require('./symbolExtractor');

const MAX_FILE_SIZE = parseInt(process.env.MAX_PARSE_FILE_SIZE_KB || '512', 10) * 1024;
const STRATEGY = process.env.CSHARP_PARSER_STRATEGY || 'regex';
const DOTNET_PATH = process.env.DOTNET_PATH || 'dotnet';

// ── Regex patterns ────────────────────────────────────────────────────────────
const RE_NAMESPACE = /namespace\s+([\w.]+)/g;
const RE_CLASS = /(?:^|\n)\s*(public|private|protected|internal|file)?\s*(?:static\s+)?(?:abstract\s+|sealed\s+)?(?:partial\s+)?(class|interface|struct|enum|record)\s+(\w+)(?:<[^>]+>)?\s*(?::\s*([\w\s,<>.]+?))?(?:\s*where\s+\w+[^{]*)?\s*\{/gm;
const RE_METHOD = /\s*(public|private|protected|internal|static|virtual|abstract|override|async|new)[\s\w<>\[\]?,]+\s+(\w+)\s*\(([^)]*)\)\s*(?:where[^{;]*)?[{;]/gm;
const RE_PROPERTY = /\s*(public|private|protected|internal)\s+(?:static\s+)?(?:readonly\s+)?([\w<>\[\]?,. ]+)\s+(\w+)\s*\{/gm;
const RE_FIELD = /\s*(public|private|protected|internal)\s+(?:static\s+)?(?:readonly\s+)?(?:const\s+)?([\w<>\[\]?,. ]+)\s+(\w+)\s*(?:=|;)/gm;
const RE_USING = /^using\s+([\w.]+)\s*;/gm;

/**
 * Parse a single C# source file using regex strategy
 */
async function parseFileRegex(filePath, relPath) {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_FILE_SIZE) return null;

  const source = await fs.readFile(filePath, 'utf8');

  // Extract using directives
  const usingImports = [];
  let m;
  RE_USING.lastIndex = 0;
  while ((m = RE_USING.exec(source)) !== null) {
    usingImports.push(m[1]);
  }

  // Find namespace blocks
  const namespaceName = (() => {
    const match = /namespace\s+([\w.]+)/.exec(source);
    return match ? match[1] : '(global)';
  })();

  // Extract classes
  const classes = [];
  RE_CLASS.lastIndex = 0;
  while ((m = RE_CLASS.exec(source)) !== null) {
    const access = m[1] || 'internal';
    const kind = m[2]; // class | interface | struct | enum | record
    const name = m[3];
    const inheritance = m[4] ? m[4].trim() : '';

    const cls = createClass(name, kind === 'record' ? 'class' : kind, access);
    cls.file = relPath;
    cls.line = source.substring(0, m.index).split('\n').length;

    // Parse base/interface list
    if (inheritance) {
      const parts = inheritance.split(',').map(s => s.trim().split('<')[0].trim());
      for (const part of parts) {
        if (!part) continue;
        if (part.startsWith('I') && /^I[A-Z]/.test(part)) {
          cls.implementedInterfaces.push(part);
        } else {
          cls.baseClasses.push(part);
        }
      }
    }

    // Extract methods within a rough class body (heuristic)
    const classStart = m.index + m[0].length - 1;
    const classBody = extractBracedBlock(source, classStart);

    RE_METHOD.lastIndex = 0;
    let mm;
    const seenMethods = new Set();
    while ((mm = RE_METHOD.exec(classBody)) !== null) {
      const modifiers = mm[1] || '';
      const params = mm[3];
      // Try to extract return type and method name from what RE_METHOD matched
      const methodLineMatch = /(?:public|private|protected|internal|static|virtual|abstract|override|async|new)[\s]+([\w<>\[\]?,. ]+)\s+(\w+)\s*\(/.exec(mm[0]);
      if (!methodLineMatch) continue;
      const returnType = methodLineMatch[1].trim();
      const methodName = methodLineMatch[2];

      // Skip constructors (same name as class) and property accessors
      if (methodName === name || methodName === 'get' || methodName === 'set' || methodName === 'init') continue;
      const key = `${methodName}(${params})`;
      if (seenMethods.has(key)) continue;
      seenMethods.add(key);

      const method = createMethod(methodName, returnType, inferAccess(modifiers));
      method.isStatic = /\bstatic\b/.test(modifiers);
      method.isVirtual = /\bvirtual\b/.test(modifiers);
      method.isAbstract = /\babstract\b/.test(modifiers);
      method.parameters = parseParameters(params);
      cls.methods.push(method);
    }

    // Extract properties
    RE_PROPERTY.lastIndex = 0;
    while ((mm = RE_PROPERTY.exec(classBody)) !== null) {
      const prop = createProperty(mm[3], mm[2].trim(), mm[1]);
      cls.properties.push(prop);
      cls.dependencies.push(...extractTypeNames(mm[2].trim()));
    }

    // Extract fields
    RE_FIELD.lastIndex = 0;
    while ((mm = RE_FIELD.exec(classBody)) !== null) {
      // Avoid matching method signatures
      if (/\(/.test(mm[0])) continue;
      const field = createField(mm[3], mm[2].trim(), mm[1]);
      cls.fields.push(field);
      cls.dependencies.push(...extractTypeNames(mm[2].trim()));
    }

    // Add using namespace dependencies
    cls.dependencies.push(...usingImports.map(u => u.split('.').pop()));
    cls.dependencies = [...new Set(cls.dependencies.filter(d => d && d !== name))];

    classes.push({ cls, namespaceName });
  }

  return classes;
}

function inferAccess(modifiers) {
  if (/\bpublic\b/.test(modifiers)) return 'public';
  if (/\bprivate\b/.test(modifiers)) return 'private';
  if (/\bprotected\b/.test(modifiers)) return 'protected';
  if (/\binternal\b/.test(modifiers)) return 'internal';
  return 'private';
}

function parseParameters(paramsStr) {
  if (!paramsStr.trim()) return [];
  return paramsStr.split(',').map(p => {
    const parts = p.trim().split(/\s+/);
    const name = parts.pop() || '';
    const type = parts.join(' ') || 'object';
    return { name: name.replace(/^@/, ''), type };
  }).filter(p => p.name);
}

function extractTypeNames(typeStr) {
  // Extract type names from generic types, arrays etc.
  return typeStr
    .replace(/[\[\]?]/g, ' ')
    .split(/[<>,\s]+/)
    .filter(t => /^[A-Z][a-zA-Z0-9]*$/.test(t))
    .filter(t => !['String', 'Int', 'Boolean', 'Object', 'Void', 'Task', 'List', 'Dictionary', 'IEnumerable', 'IList'].includes(t));
}

/**
 * Extract the content of a braced block starting at the opening brace
 */
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
    if (i - startIndex > 100000) break; // safety limit
  }
  return source.substring(startIndex);
}

/**
 * Main C# parser entry point
 */
async function parseCSharp(files, rootPath, scope = 'public_only') {
  const model = createSymbolModel('csharp', rootPath);
  model.stats.totalFiles = files.length;

  // Map class name → namespace for deduplication
  const classRegistry = new Map(); // 'Namespace:ClassName' → cls ref

  for (const filePath of files) {
    const relPath = path.relative(rootPath, filePath);
    try {
      let results;
      if (STRATEGY === 'roslyn') {
        results = await parseFileRoslyn(filePath, relPath);
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

  // Build dependency edges from class dependencies + inheritance
  for (const ns of model.namespaces) {
    for (const cls of ns.classes) {
      for (const base of cls.baseClasses) {
        addDependencyEdge(model, cls.name, base, 'inherits');
      }
      for (const iface of cls.implementedInterfaces) {
        addDependencyEdge(model, cls.name, iface, 'implements');
      }
      for (const dep of cls.dependencies) {
        if (dep !== cls.name) {
          addDependencyEdge(model, cls.name, dep, 'uses');
        }
      }
    }
  }

  applyScope(model, scope);
  computeStats(model);
  return model;
}

/**
 * Roslyn CLI strategy — invokes dotnet script or bundled Roslyn tool
 * Falls back to regex on error
 */
async function parseFileRoslyn(filePath, relPath) {
  try {
    const { stdout } = await execFileAsync(DOTNET_PATH, [
      'script', path.resolve(__dirname, '../roslyn/AnalyzeFile.csx'), '--', filePath
    ], { timeout: 30000 });
    return JSON.parse(stdout);
  } catch {
    return parseFileRegex(filePath, relPath);
  }
}

module.exports = { parseCSharp };
