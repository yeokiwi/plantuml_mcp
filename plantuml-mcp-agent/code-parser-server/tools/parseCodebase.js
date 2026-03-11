'use strict';

const fs = require('fs/promises');
const path = require('path');
const { parseCSharp } = require('../parsers/csharpParser');
const { parseCpp } = require('../parsers/cppParser');

const CS_EXTS = ['.cs'];
const CPP_EXTS = ['.cpp', '.h', '.hpp', '.cxx', '.cc'];

const PARSE_CODEBASE_SCHEMA = {
  name: 'parse_codebase',
  description: 'Parses all C# and C++ source files in the given directory. Extracts classes, structs, interfaces, enums, methods, properties, fields, inheritance relationships, and namespace/package structure. Returns a structured JSON symbol model.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the root source directory.'
      },
      language: {
        type: 'string',
        enum: ['csharp', 'cpp', 'auto'],
        default: 'auto',
        description: "Language to parse. 'auto' detects from file extensions."
      },
      scope: {
        type: 'string',
        enum: ['full', 'public_only', 'summary'],
        default: 'public_only',
        description: "Parsing depth: 'full' includes private members, 'public_only' limits to public API, 'summary' returns class names and relationships only."
      },
      file_filter: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of specific file paths (relative to root) to parse.'
      },
      session_id: {
        type: 'string',
        description: 'Session identifier for caching the parsed result.'
      }
    },
    required: ['path']
  }
};

async function collectFiles(dirPath, extensions, fileFilter) {
  const results = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip common non-source directories
        if (['node_modules', 'bin', 'obj', '.git', 'dist', 'build', '__pycache__'].includes(entry.name)) continue;
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  await walk(dirPath);

  if (fileFilter && fileFilter.length > 0) {
    const filterSet = new Set(fileFilter.map(f => path.resolve(dirPath, f)));
    return results.filter(f => filterSet.has(f));
  }

  return results;
}

function detectLanguage(dirPath) {
  // Async detection would require file listing; this is a sync heuristic
  return 'auto';
}

// In-memory session cache (for standalone server mode)
const sessionCache = new Map();

async function handleParseCodebase(args) {
  const { path: dirPath, language = 'auto', scope = 'public_only', file_filter, session_id } = args;

  if (!dirPath) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'INVALID_INPUT', message: 'path is required' }) }],
      isError: true
    };
  }

  if (dirPath.includes('..')) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'SECURITY_ERROR', message: 'Path traversal not allowed' }) }],
      isError: true
    };
  }

  const allowedPaths = (process.env.ALLOWED_BASE_PATHS || '').split(',').map(p => p.trim()).filter(Boolean);
  if (allowedPaths.length > 0 && !allowedPaths.some(base => dirPath.startsWith(base))) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'ACCESS_DENIED', message: 'Path not in allowed directories' }) }],
      isError: true
    };
  }

  try {
    await fs.access(dirPath);
  } catch {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'PATH_NOT_FOUND', message: `Directory not found: ${dirPath}` }) }],
      isError: true
    };
  }

  try {
    let csFiles = [];
    let cppFiles = [];

    if (language === 'csharp' || language === 'auto') {
      csFiles = await collectFiles(dirPath, CS_EXTS, file_filter ? file_filter.filter(f => f.endsWith('.cs')) : null);
    }
    if (language === 'cpp' || language === 'auto') {
      cppFiles = await collectFiles(dirPath, CPP_EXTS, file_filter ? file_filter.filter(f => !f.endsWith('.cs')) : null);
    }

    if (csFiles.length === 0 && cppFiles.length === 0) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'NO_SOURCE_FILES', message: 'No C# or C++ source files found.' }) }],
        isError: true
      };
    }

    let model;
    if (csFiles.length > 0 && cppFiles.length === 0) {
      model = await parseCSharp(csFiles, dirPath, scope);
    } else if (cppFiles.length > 0 && csFiles.length === 0) {
      model = await parseCpp(cppFiles, dirPath, scope);
    } else {
      // Mixed project — parse both and merge
      const csModel = await parseCSharp(csFiles, dirPath, scope);
      const cppModel = await parseCpp(cppFiles, dirPath, scope);
      model = {
        language: 'mixed',
        rootPath: dirPath,
        namespaces: [...csModel.namespaces, ...cppModel.namespaces],
        dependencyEdges: [...csModel.dependencyEdges, ...cppModel.dependencyEdges],
        stats: {
          totalFiles: csModel.stats.totalFiles + cppModel.stats.totalFiles,
          totalClasses: csModel.stats.totalClasses + cppModel.stats.totalClasses,
          totalMethods: csModel.stats.totalMethods + cppModel.stats.totalMethods,
          parseErrors: [...csModel.stats.parseErrors, ...cppModel.stats.parseErrors]
        }
      };
    }

    if (session_id) {
      sessionCache.set(session_id, model);
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(model) }]
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'PARSE_FAILED', message: err.message }) }],
      isError: true
    };
  }
}

module.exports = { PARSE_CODEBASE_SCHEMA, handleParseCodebase, sessionCache };
