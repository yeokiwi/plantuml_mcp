'use strict';

/**
 * Normalised Symbol Model builder.
 * Both csharpParser and cppParser use these helpers to produce a consistent SymbolModel.
 */

function createSymbolModel(language, rootPath) {
  return {
    language,
    rootPath,
    namespaces: [],
    dependencyEdges: [],
    stats: {
      totalFiles: 0,
      totalClasses: 0,
      totalMethods: 0,
      parseErrors: []
    }
  };
}

function createNamespace(name) {
  return { name, classes: [] };
}

function createClass(name, type = 'class', access = 'public') {
  return {
    name,
    type,
    access,
    baseClasses: [],
    implementedInterfaces: [],
    file: null,
    line: 0,
    methods: [],
    properties: [],
    fields: [],
    dependencies: []
  };
}

function createMethod(name, returnType = 'void', access = 'public') {
  return {
    name,
    access,
    returnType,
    parameters: [],
    isStatic: false,
    isVirtual: false,
    isAbstract: false
  };
}

function createProperty(name, type, access = 'public') {
  return { name, type, access };
}

function createField(name, type, access = 'private') {
  return { name, type, access };
}

/**
 * Merge partial class members (C# partial classes, C++ header + impl pairings)
 */
function mergeClasses(existing, incoming) {
  existing.methods.push(...incoming.methods);
  existing.properties.push(...incoming.properties);
  existing.fields.push(...incoming.fields);
  existing.dependencies.push(
    ...incoming.dependencies.filter(d => !existing.dependencies.includes(d))
  );
  if (!existing.baseClasses.length) existing.baseClasses = incoming.baseClasses;
  if (!existing.implementedInterfaces.length) existing.implementedInterfaces = incoming.implementedInterfaces;
}

/**
 * Find or create namespace in symbol model
 */
function getOrCreateNamespace(model, namespaceName) {
  let ns = model.namespaces.find(n => n.name === namespaceName);
  if (!ns) {
    ns = createNamespace(namespaceName);
    model.namespaces.push(ns);
  }
  return ns;
}

/**
 * Add dependency edge (deduplicating)
 */
function addDependencyEdge(model, from, to, type) {
  const exists = model.dependencyEdges.some(e => e.from === from && e.to === to && e.type === type);
  if (!exists) {
    model.dependencyEdges.push({ from, to, type });
  }
}

/**
 * Apply scope filtering: remove private/protected members based on scope param
 */
function applyScope(model, scope) {
  if (scope === 'full') return model;

  for (const ns of model.namespaces) {
    for (const cls of ns.classes) {
      if (scope === 'public_only') {
        cls.methods = cls.methods.filter(m => m.access === 'public');
        cls.properties = cls.properties.filter(p => p.access === 'public');
        cls.fields = cls.fields.filter(f => f.access === 'public');
      } else if (scope === 'summary') {
        cls.methods = [];
        cls.properties = [];
        cls.fields = [];
      }
    }
  }
  return model;
}

/**
 * Compute stats for the model
 */
function computeStats(model) {
  let totalClasses = 0;
  let totalMethods = 0;
  for (const ns of model.namespaces) {
    totalClasses += ns.classes.length;
    for (const cls of ns.classes) {
      totalMethods += cls.methods.length;
    }
  }
  model.stats.totalClasses = totalClasses;
  model.stats.totalMethods = totalMethods;
}

module.exports = {
  createSymbolModel,
  createNamespace,
  createClass,
  createMethod,
  createProperty,
  createField,
  mergeClasses,
  getOrCreateNamespace,
  addDependencyEdge,
  applyScope,
  computeStats
};
