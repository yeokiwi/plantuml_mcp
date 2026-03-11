'use strict';

const { renderDiagram } = require('../utils/plantuml');

const GENERATE_DIAGRAM_SCHEMA = {
  name: 'generate_diagram',
  description: 'Renders a PlantUML diagram from DSL source code and returns the result as a base64-encoded PNG or SVG string.',
  inputSchema: {
    type: 'object',
    properties: {
      dsl: {
        type: 'string',
        description: 'Valid PlantUML DSL code, including @startuml / @enduml delimiters.'
      },
      format: {
        type: 'string',
        enum: ['png', 'svg'],
        default: 'png',
        description: 'Output format for the rendered diagram.'
      },
      theme: {
        type: 'string',
        description: "Optional PlantUML theme to apply (e.g. 'blueprint', 'cerulean').",
        default: 'default'
      }
    },
    required: ['dsl']
  }
};

async function handleGenerateDiagram(args) {
  const { dsl, format = 'png', theme = 'default' } = args;

  if (!dsl || typeof dsl !== 'string') {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: 'INVALID_INPUT', message: 'dsl parameter is required and must be a string' })
      }],
      isError: true
    };
  }

  if (!dsl.includes('@startuml')) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: 'INVALID_DSL', message: 'DSL must include @startuml / @enduml delimiters', dsl })
      }],
      isError: true
    };
  }

  try {
    const result = await renderDiagram(dsl, format, theme);
    return {
      content: [
        {
          type: 'image',
          data: result.data,
          mimeType: result.mimeType
        },
        {
          type: 'text',
          text: JSON.stringify({ format: result.format, mimeType: result.mimeType, success: true })
        }
      ]
    };
  } catch (err) {
    const errorPayload = {
      error: err.code || 'RENDER_FAILED',
      message: err.message,
      dsl
    };
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(errorPayload)
      }],
      isError: true
    };
  }
}

module.exports = { GENERATE_DIAGRAM_SCHEMA, handleGenerateDiagram };
