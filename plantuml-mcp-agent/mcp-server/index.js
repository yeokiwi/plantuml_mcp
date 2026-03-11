'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const { GENERATE_DIAGRAM_SCHEMA, handleGenerateDiagram } = require('./tools/generateDiagram');
const { LIST_DIAGRAM_TYPES_SCHEMA, handleListDiagramTypes } = require('./tools/listDiagramTypes');
const { validateDsl } = require('./utils/plantuml');

const VALIDATE_DSL_SCHEMA = {
  name: 'validate_dsl',
  description: 'Validates PlantUML DSL without rendering. Returns any syntax errors.',
  inputSchema: {
    type: 'object',
    properties: {
      dsl: { type: 'string', description: 'PlantUML DSL source to validate.' }
    },
    required: ['dsl']
  }
};

const server = new Server(
  { name: 'plantuml-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [GENERATE_DIAGRAM_SCHEMA, LIST_DIAGRAM_TYPES_SCHEMA, VALIDATE_DSL_SCHEMA]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'generate_diagram':
      return await handleGenerateDiagram(args);

    case 'list_diagram_types':
      return handleListDiagramTypes();

    case 'validate_dsl': {
      if (!args.dsl) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'INVALID_INPUT', message: 'dsl is required' }) }],
          isError: true
        };
      }
      const result = await validateDsl(args.dsl);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        isError: !result.valid
      };
    }

    default:
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'UNKNOWN_TOOL', message: `Unknown tool: ${name}` }) }],
        isError: true
      };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('PlantUML MCP Server running on stdio\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err.message}\n`);
  process.exit(1);
});
