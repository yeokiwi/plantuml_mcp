'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const { BROWSE_DIRECTORY_SCHEMA, handleBrowseDirectory } = require('./tools/browseDirectory');
const { PARSE_CODEBASE_SCHEMA, handleParseCodebase } = require('./tools/parseCodebase');
const { GET_SYMBOL_SUMMARY_SCHEMA, handleGetSymbolSummary } = require('./tools/getSymbolSummary');

const server = new Server(
  { name: 'code-parser-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [BROWSE_DIRECTORY_SCHEMA, PARSE_CODEBASE_SCHEMA, GET_SYMBOL_SUMMARY_SCHEMA]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'browse_directory':
      return await handleBrowseDirectory(args);

    case 'parse_codebase':
      return await handleParseCodebase(args);

    case 'get_symbol_summary':
      return await handleGetSymbolSummary(args);

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
  process.stderr.write('Code Parser MCP Server running on stdio\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err.message}\n`);
  process.exit(1);
});
