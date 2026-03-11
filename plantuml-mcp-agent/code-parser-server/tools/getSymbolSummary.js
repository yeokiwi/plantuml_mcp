'use strict';

const { sessionCache } = require('./parseCodebase');

const GET_SYMBOL_SUMMARY_SCHEMA = {
  name: 'get_symbol_summary',
  description: 'Returns a high-level summary of previously parsed codebase symbols: total class count, namespace list, inheritance chains, dependency graph edges, and recommended diagram types.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'Session identifier used when parse_codebase was called.'
      },
      focus: {
        type: 'string',
        description: 'Optional class or namespace name to focus the summary on.'
      }
    },
    required: ['session_id']
  }
};

function buildInheritanceChains(model) {
  const chains = [];
  const inheritsEdges = model.dependencyEdges.filter(e => e.type === 'inherits' || e.type === 'implements');
  const seen = new Set();

  for (const edge of inheritsEdges) {
    const key = `${edge.from}->${edge.to}`;
    if (!seen.has(key)) {
      seen.add(key);
      chains.push({ child: edge.from, parent: edge.to, relationship: edge.type });
    }
  }
  return chains;
}

function recommendDiagramTypes(model) {
  const recommendations = [];
  const totalClasses = model.stats?.totalClasses || 0;
  const hasInheritance = model.dependencyEdges.some(e => e.type === 'inherits');
  const hasInterfaces = model.dependencyEdges.some(e => e.type === 'implements');
  const namespaceCount = model.namespaces?.length || 0;

  recommendations.push({ type: 'class', reason: 'Shows all classes and their relationships' });

  if (hasInheritance) {
    recommendations.push({ type: 'class (inheritance focus)', reason: 'Highlights inheritance hierarchy' });
  }
  if (hasInterfaces) {
    recommendations.push({ type: 'class (interface focus)', reason: 'Shows interface implementations' });
  }
  if (namespaceCount > 1) {
    recommendations.push({ type: 'component', reason: 'Shows namespace-level dependencies' });
  }
  if (totalClasses > 10) {
    recommendations.push({ type: 'package', reason: 'High-level package/namespace overview for large codebase' });
  }
  recommendations.push({ type: 'sequence', reason: 'For specific method call flows' });

  return recommendations;
}

async function handleGetSymbolSummary(args) {
  const { session_id, focus } = args;

  if (!session_id) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'INVALID_INPUT', message: 'session_id is required' }) }],
      isError: true
    };
  }

  const model = sessionCache.get(session_id);
  if (!model) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'SESSION_NOT_FOUND',
          message: `No parsed codebase found for session '${session_id}'. Call parse_codebase first.`
        })
      }],
      isError: true
    };
  }

  let namespaces = model.namespaces;

  // Apply focus filter
  if (focus) {
    const focusLower = focus.toLowerCase();
    namespaces = model.namespaces
      .map(ns => {
        if (ns.name.toLowerCase().includes(focusLower)) return ns;
        const filteredClasses = ns.classes.filter(cls =>
          cls.name.toLowerCase().includes(focusLower) ||
          cls.baseClasses.some(b => b.toLowerCase().includes(focusLower)) ||
          cls.implementedInterfaces.some(i => i.toLowerCase().includes(focusLower))
        );
        if (filteredClasses.length > 0) return { ...ns, classes: filteredClasses };
        return null;
      })
      .filter(Boolean);
  }

  const namespaceSummaries = namespaces.map(ns => ({
    name: ns.name,
    classCount: ns.classes.length,
    classes: ns.classes.map(cls => ({
      name: cls.name,
      type: cls.type,
      methodCount: cls.methods.length,
      baseClasses: cls.baseClasses,
      implementedInterfaces: cls.implementedInterfaces,
      file: cls.file
    }))
  }));

  const inheritanceChains = buildInheritanceChains(model);
  const recommendedDiagrams = recommendDiagramTypes(model);

  const dependencyEdges = focus
    ? model.dependencyEdges.filter(e =>
        e.from.toLowerCase().includes(focus.toLowerCase()) ||
        e.to.toLowerCase().includes(focus.toLowerCase())
      )
    : model.dependencyEdges;

  const summary = {
    sessionId: session_id,
    language: model.language,
    rootPath: model.rootPath,
    focus: focus || null,
    stats: model.stats,
    namespaces: namespaceSummaries,
    inheritanceChains,
    dependencyEdges,
    recommendedDiagramTypes: recommendedDiagrams
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }]
  };
}

module.exports = { GET_SYMBOL_SUMMARY_SCHEMA, handleGetSymbolSummary };
