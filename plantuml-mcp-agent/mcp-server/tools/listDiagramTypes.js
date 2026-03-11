'use strict';

const DIAGRAM_TYPES = [
  { type: 'sequence', description: 'Shows object interactions arranged in time sequence. Use @startuml with participant, actor, and -> arrows.' },
  { type: 'usecase', description: 'Depicts actors and their interactions with the system (use cases). Uses actor and usecase notation.' },
  { type: 'class', description: 'Shows classes, attributes, methods, and relationships (inheritance, association, composition). Core OOP diagram.' },
  { type: 'object', description: 'Instance-level view of a class diagram showing object instances with specific attribute values.' },
  { type: 'activity', description: 'Models workflow/process flows with decisions, forks, joins, and swim lanes.' },
  { type: 'component', description: 'Shows system components and their dependencies/interfaces at an architectural level.' },
  { type: 'deployment', description: 'Illustrates the physical deployment of software onto hardware nodes and environments.' },
  { type: 'state', description: 'Describes states of an object and transitions between them. Ideal for state machines and FSMs.' },
  { type: 'timing', description: 'Shows timing constraints and state changes over time. Useful for embedded/real-time systems.' },
  { type: 'network', description: 'Network topology diagrams using nwdiag syntax showing devices and connections.' },
  { type: 'gantt', description: 'Project timeline and task scheduling chart with dependencies and milestones.' },
  { type: 'mindmap', description: 'Hierarchical tree of ideas and concepts branching from a central topic.' },
  { type: 'wbs', description: 'Work Breakdown Structure — hierarchical decomposition of project work.' },
  { type: 'json', description: 'Visualises JSON data structures as a tree diagram.' },
  { type: 'yaml', description: 'Visualises YAML data structures as a tree diagram.' },
  { type: 'salt', description: 'UI wireframe/mockup tool (Salt) for sketching user interface components.' },
  { type: 'er', description: 'Entity-Relationship diagram for database schema design using Chen or crow\'s foot notation.' },
  { type: 'c4', description: 'C4 Architecture model (Context, Container, Component, Code) for software architecture.' }
];

const LIST_DIAGRAM_TYPES_SCHEMA = {
  name: 'list_diagram_types',
  description: 'Returns a list of diagram types supported by PlantUML with brief descriptions.',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

function handleListDiagramTypes() {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ diagramTypes: DIAGRAM_TYPES }, null, 2)
    }]
  };
}

module.exports = { LIST_DIAGRAM_TYPES_SCHEMA, handleListDiagramTypes };
