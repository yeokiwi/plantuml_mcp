'use strict';

const OpenAI = require('openai');

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

const SYSTEM_PROMPT_NO_CONTEXT = `You are a diagram assistant powered by PlantUML. When the user requests a diagram, you MUST:
1. Determine the appropriate PlantUML diagram type.
2. Write complete, valid PlantUML DSL (always include @startuml / @enduml).
3. Call the \`generate_diagram\` tool with the DSL.
4. When the tool returns, present the diagram to the user and offer to refine it.
If unsure about diagram type, call \`list_diagram_types\` first.
Never return raw PlantUML DSL to the user — always render it via the tool.

Best practices for DSL:
- Use \`skinparam\` for styling where appropriate.
- Add meaningful labels and notes for clarity.
- If the requested diagram would be very large (>30 elements), decompose it into multiple focused diagrams.
- Support themes via the theme parameter in generate_diagram.`;

const SYSTEM_PROMPT_WITH_CONTEXT = `You are a diagram assistant with access to a parsed C# / C++ codebase.
The user has loaded a source directory. When generating diagrams:
1. ALWAYS call \`get_symbol_summary\` first to understand the codebase structure.
2. Use the returned classes, interfaces, inheritance chains, and dependencies
   as the authoritative source for diagram content.
3. Generate PlantUML DSL that faithfully reflects the actual code — do NOT
   invent classes or relationships not present in the symbol model.
4. Call \`generate_diagram\` to render the DSL.
5. Cite which source files contributed to the diagram (mention them in your response).

If the user asks about a specific class or module, call \`get_symbol_summary\`
with the \`focus\` parameter set to that class or namespace name.

Never return raw PlantUML DSL to the user — always render it via the tool.
If the codebase is very large, suggest focusing on a specific namespace or class.`;

/**
 * Create DeepSeek client (OpenAI-compatible)
 */
function createClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY environment variable is not set');
  }
  return new OpenAI({
    apiKey,
    baseURL: DEEPSEEK_BASE_URL
  });
}

/**
 * Extract diagram data from tool results for SSE streaming
 */
function extractDiagramFromToolResult(toolResult) {
  if (!toolResult?.content) return null;
  for (const item of toolResult.content) {
    if (item.type === 'image') {
      return { data: item.data, mimeType: item.mimeType };
    }
  }
  // Check text content for JSON with image data
  for (const item of toolResult.content) {
    if (item.type === 'text') {
      try {
        const parsed = JSON.parse(item.text);
        if (parsed.data && parsed.mimeType) return parsed;
      } catch {}
    }
  }
  return null;
}

/**
 * Convert MCP tool result content to string for LLM
 */
function toolResultToString(toolResult) {
  if (!toolResult?.content) return 'Tool returned no content';
  return toolResult.content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n') || 'Tool executed successfully';
}

/**
 * Run the agentic loop with streaming SSE output.
 *
 * @param {object} params
 * @param {Array} params.messages - Chat history
 * @param {string} params.sessionId
 * @param {boolean} params.codeContextLoaded
 * @param {object} params.mcpClient - PlantUML MCP client
 * @param {object} params.codeParserClient - Code Parser MCP client
 * @param {object} params.codeContextManager
 * @param {Function} params.sendEvent - (event, data) => void for SSE
 */
async function runAgenticLoop({
  messages,
  sessionId,
  codeContextLoaded,
  mcpClient,
  codeParserClient,
  codeContextManager,
  sendEvent
}) {
  const deepseek = createClient();

  // Gather tools from both MCP servers
  const plantumlTools = await mcpClient.getOpenAITools();
  const codeParserTools = codeContextLoaded ? await codeParserClient.getOpenAITools() : [];
  const allTools = [...plantumlTools, ...codeParserTools];

  const systemPrompt = codeContextLoaded ? SYSTEM_PROMPT_WITH_CONTEXT : SYSTEM_PROMPT_NO_CONTEXT;

  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  // Agentic loop
  let iterations = 0;
  const MAX_ITERATIONS = 10;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    let response;
    try {
      response = await deepseek.chat.completions.create({
        model: DEEPSEEK_MODEL,
        messages: chatMessages,
        tools: allTools.length > 0 ? allTools : undefined,
        tool_choice: allTools.length > 0 ? 'auto' : undefined,
        stream: false,
        max_tokens: 4096
      });
    } catch (err) {
      if (err.status === 401) {
        sendEvent('error', { type: 'error', error: 'INVALID_API_KEY', message: 'DeepSeek API key is invalid or missing.' });
      } else {
        sendEvent('error', { type: 'error', error: 'API_ERROR', message: err.message });
      }
      return;
    }

    const choice = response.choices[0];
    const msg = choice.message;

    chatMessages.push(msg);

    if (choice.finish_reason === 'tool_calls' && msg.tool_calls) {
      for (const toolCall of msg.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs;
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          toolArgs = {};
        }

        // Attach session_id for code parser tools
        if (toolName === 'parse_codebase' || toolName === 'get_symbol_summary') {
          if (!toolArgs.session_id) toolArgs.session_id = sessionId;
        }

        let toolResult;
        let isCodeParserTool = ['browse_directory', 'parse_codebase', 'get_symbol_summary'].includes(toolName);

        try {
          if (isCodeParserTool) {
            // Send parsing progress event
            if (toolName === 'parse_codebase') {
              sendEvent('code_context', { type: 'code_context', status: 'parsing', message: 'Parsing codebase...' });
            }
            toolResult = await codeParserClient.callTool(toolName, toolArgs);

            // Cache parsed model in context manager
            if (toolName === 'parse_codebase' && toolResult?.content) {
              try {
                const modelText = toolResult.content.find(c => c.type === 'text')?.text;
                if (modelText) {
                  const model = JSON.parse(modelText);
                  if (!model.error) {
                    codeContextManager.storeContext(sessionId, model);
                    sendEvent('code_context', {
                      type: 'code_context',
                      status: 'complete',
                      filesFound: model.stats?.totalFiles || 0,
                      filesProcessed: model.stats?.totalFiles || 0,
                      totalClasses: model.stats?.totalClasses || 0
                    });
                  }
                }
              } catch {}
            }
          } else {
            toolResult = await mcpClient.callTool(toolName, toolArgs);
          }
        } catch (err) {
          toolResult = {
            content: [{ type: 'text', text: JSON.stringify({ error: 'TOOL_CALL_FAILED', message: err.message }) }],
            isError: true
          };
        }

        // Extract and stream diagram if present
        const diagram = extractDiagramFromToolResult(toolResult);
        if (diagram) {
          const format = diagram.mimeType?.includes('svg') ? 'svg' : 'png';
          sendEvent('diagram', {
            type: 'diagram',
            format,
            data: diagram.data,
            mimeType: diagram.mimeType
          });
        }

        const toolResultStr = toolResultToString(toolResult);
        chatMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResultStr
        });
      }
    } else {
      // Final text response — stream tokens
      const content = msg.content || '';
      if (content) {
        // Simulate token streaming (DeepSeek non-stream API returns full response)
        sendEvent('token', { type: 'text', content });
      }
      sendEvent('done', { type: 'done' });
      return;
    }
  }

  sendEvent('error', { type: 'error', error: 'MAX_ITERATIONS', message: 'Maximum tool call iterations reached.' });
  sendEvent('done', { type: 'done' });
}

module.exports = { runAgenticLoop, SYSTEM_PROMPT_NO_CONTEXT, SYSTEM_PROMPT_WITH_CONTEXT };
