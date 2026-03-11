'use strict';

// In-memory store: sessionId → SymbolModel
const contextStore = new Map();

const DEFAULT_MAX_TOKENS = parseInt(process.env.CODE_CONTEXT_MAX_TOKENS || '8000', 10);

/**
 * Store a parsed SymbolModel for a session
 */
function storeContext(sessionId, symbolModel) {
  contextStore.set(sessionId, {
    model: symbolModel,
    loadedAt: Date.now()
  });
}

/**
 * Check if context is loaded for a session
 */
function hasContext(sessionId) {
  return contextStore.has(sessionId);
}

/**
 * Estimate token count for a JSON string (rough: ~4 chars per token)
 */
function estimateTokens(str) {
  return Math.ceil(str.length / 4);
}

/**
 * Retrieve a context chunk sized to fit within maxTokens.
 * Prioritises classes related to focus, then trims.
 *
 * @param {string} sessionId
 * @param {string|null} focus - class or namespace name to prioritise
 * @param {number} maxTokens
 * @returns {{ chunk: object, truncated: boolean, totalClasses: number, includedClasses: number }}
 */
function getContextChunk(sessionId, focus = null, maxTokens = DEFAULT_MAX_TOKENS) {
  const entry = contextStore.get(sessionId);
  if (!entry) return null;

  const { model } = entry;

  // Build a shallow copy we can truncate
  const chunk = {
    language: model.language,
    rootPath: model.rootPath,
    namespaces: [],
    dependencyEdges: [],
    stats: model.stats
  };

  let allClasses = [];
  for (const ns of model.namespaces) {
    for (const cls of ns.classes) {
      allClasses.push({ ns: ns.name, cls });
    }
  }

  // Sort: focus-related first
  if (focus) {
    const focusLower = focus.toLowerCase();
    allClasses.sort((a, b) => {
      const aRelevant = a.cls.name.toLowerCase().includes(focusLower) || a.ns.toLowerCase().includes(focusLower) ? -1 : 1;
      const bRelevant = b.cls.name.toLowerCase().includes(focusLower) || b.ns.toLowerCase().includes(focusLower) ? -1 : 1;
      return aRelevant - bRelevant;
    });
  }

  const totalClasses = allClasses.length;
  let includedClasses = 0;

  for (const { ns: nsName, cls } of allClasses) {
    // Strip method bodies, keep signatures only (already done by scope)
    const strippedCls = {
      name: cls.name,
      type: cls.type,
      baseClasses: cls.baseClasses,
      implementedInterfaces: cls.implementedInterfaces,
      file: cls.file,
      methods: cls.methods.map(m => ({ name: m.name, returnType: m.returnType, parameters: m.parameters, access: m.access })),
      properties: cls.properties,
      dependencies: cls.dependencies
    };

    // Tentatively add and check token budget
    let targetNs = chunk.namespaces.find(n => n.name === nsName);
    if (!targetNs) {
      targetNs = { name: nsName, classes: [] };
      chunk.namespaces.push(targetNs);
    }
    targetNs.classes.push(strippedCls);

    const currentTokens = estimateTokens(JSON.stringify(chunk));
    if (currentTokens > maxTokens) {
      // Remove the last added class
      targetNs.classes.pop();
      if (targetNs.classes.length === 0) {
        chunk.namespaces = chunk.namespaces.filter(n => n !== targetNs);
      }
      break;
    }
    includedClasses++;
  }

  // Include relevant dependency edges
  const includedClassNames = new Set(
    chunk.namespaces.flatMap(ns => ns.classes.map(c => c.name))
  );
  chunk.dependencyEdges = model.dependencyEdges.filter(
    e => includedClassNames.has(e.from) || includedClassNames.has(e.to)
  );

  return {
    chunk,
    truncated: includedClasses < totalClasses,
    totalClasses,
    includedClasses
  };
}

/**
 * Clear context for a session
 */
function clearContext(sessionId) {
  contextStore.delete(sessionId);
}

/**
 * Get basic stats about a stored context
 */
function getContextStats(sessionId) {
  const entry = contextStore.get(sessionId);
  if (!entry) return null;
  const { model } = entry;
  return {
    language: model.language,
    rootPath: model.rootPath,
    stats: model.stats,
    loadedAt: entry.loadedAt
  };
}

module.exports = { storeContext, hasContext, getContextChunk, clearContext, getContextStats };
