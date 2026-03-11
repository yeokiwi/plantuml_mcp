'use strict';

const fs = require('fs/promises');
const path = require('path');

const CS_EXTS = new Set(['.cs']);
const CPP_EXTS = new Set(['.cpp', '.h', '.hpp', '.cxx', '.cc', '.c']);
const ALL_EXTS = new Set([...CS_EXTS, ...CPP_EXTS]);

const BROWSE_DIRECTORY_SCHEMA = {
  name: 'browse_directory',
  description: 'Lists the directory tree of a given folder path, filtered to C# (.cs) and C++ (.cpp, .h, .hpp, .cxx) files. Returns a nested JSON tree of folders and files.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the root directory to browse.'
      },
      max_depth: {
        type: 'integer',
        default: 5,
        description: 'Maximum directory recursion depth.'
      },
      include_hidden: {
        type: 'boolean',
        default: false,
        description: 'Whether to include hidden files and folders.'
      }
    },
    required: ['path']
  }
};

async function buildTree(dirPath, relPath, depth, maxDepth, includeHidden) {
  if (depth > maxDepth) return null;

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const children = [];
  let csFiles = 0;
  let cppFiles = 0;

  for (const entry of entries) {
    if (!includeHidden && entry.name.startsWith('.')) continue;

    const fullPath = path.join(dirPath, entry.name);
    const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const sub = await buildTree(fullPath, entryRelPath, depth + 1, maxDepth, includeHidden);
      if (sub) {
        csFiles += sub.csFiles;
        cppFiles += sub.cppFiles;
        if (sub.children.length > 0 || sub.csFiles > 0 || sub.cppFiles > 0) {
          children.push(sub);
        }
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ALL_EXTS.has(ext)) {
        const language = CS_EXTS.has(ext) ? 'csharp' : 'cpp';
        if (language === 'csharp') csFiles++;
        else cppFiles++;
        children.push({
          type: 'file',
          name: entry.name,
          path: entryRelPath,
          language,
          extension: ext
        });
      }
    }
  }

  return {
    type: 'directory',
    name: path.basename(dirPath),
    path: relPath || '.',
    children,
    csFiles,
    cppFiles
  };
}

async function handleBrowseDirectory(args) {
  const { path: dirPath, max_depth = 5, include_hidden = false } = args;

  if (!dirPath) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'INVALID_INPUT', message: 'path is required' }) }],
      isError: true
    };
  }

  // Security: reject path traversal
  if (dirPath.includes('..')) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'SECURITY_ERROR', message: 'Path traversal not allowed' }) }],
      isError: true
    };
  }

  // Check allowed base paths
  const allowedPaths = (process.env.ALLOWED_BASE_PATHS || '').split(',').map(p => p.trim()).filter(Boolean);
  if (allowedPaths.length > 0) {
    const allowed = allowedPaths.some(base => dirPath.startsWith(base));
    if (!allowed) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'ACCESS_DENIED', message: `Path not in allowed directories: ${allowedPaths.join(', ')}` }) }],
        isError: true
      };
    }
  }

  try {
    await fs.access(dirPath);
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'NOT_A_DIRECTORY', message: `${dirPath} is not a directory` }) }],
        isError: true
      };
    }
  } catch {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'PATH_NOT_FOUND', message: `Directory not found: ${dirPath}` }) }],
      isError: true
    };
  }

  try {
    const tree = await buildTree(dirPath, '', 0, max_depth, include_hidden);
    const totalSourceFiles = (tree?.csFiles || 0) + (tree?.cppFiles || 0);

    if (totalSourceFiles === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'NO_SOURCE_FILES',
            message: 'No C# or C++ source files found in this directory.',
            tree
          })
        }],
        isError: true
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ tree, totalSourceFiles, csFiles: tree.csFiles, cppFiles: tree.cppFiles })
      }]
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'BROWSE_FAILED', message: err.message }) }],
      isError: true
    };
  }
}

module.exports = { BROWSE_DIRECTORY_SCHEMA, handleBrowseDirectory };
