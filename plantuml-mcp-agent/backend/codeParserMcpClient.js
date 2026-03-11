'use strict';

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const path = require('path');

const CODE_PARSER_SERVER_PATH = path.resolve(__dirname, '../code-parser-server/index.js');

let client = null;
let toolSchemas = [];

async function connect() {
  if (client) return client;

  const transport = new StdioClientTransport({
    command: 'node',
    args: [CODE_PARSER_SERVER_PATH],
    env: { ...process.env }
  });

  client = new Client({ name: 'code-parser-backend', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);

  const { tools } = await client.listTools();
  toolSchemas = tools;
  console.log(`Code Parser MCP: connected, ${tools.length} tools available`);
  return client;
}

async function listTools() {
  await connect();
  return toolSchemas;
}

async function callTool(toolName, args) {
  const c = await connect();
  const result = await c.callTool({ name: toolName, arguments: args });
  return result;
}

async function browseDirectory(dirPath, options = {}) {
  return callTool('browse_directory', { path: dirPath, ...options });
}

async function parseCodebase(dirPath, options = {}) {
  return callTool('parse_codebase', { path: dirPath, ...options });
}

async function getSymbolSummary(sessionId, focus) {
  return callTool('get_symbol_summary', { session_id: sessionId, ...(focus ? { focus } : {}) });
}

/**
 * Convert MCP tool schema to OpenAI-compatible function definition
 */
function mcpToolToOpenAI(tool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema || { type: 'object', properties: {} }
    }
  };
}

async function getOpenAITools() {
  const tools = await listTools();
  return tools.map(mcpToolToOpenAI);
}

module.exports = { connect, listTools, callTool, browseDirectory, parseCodebase, getSymbolSummary, getOpenAITools };
