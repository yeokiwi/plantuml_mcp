'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const mcpClient = require('./mcpClient');
const codeParserClient = require('./codeParserMcpClient');
const codeContextManager = require('./codeContextManager');
const { runAgenticLoop } = require('./deepseekClient');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ── Path security helper ──────────────────────────────────────────────────────
function checkPathAllowed(dirPath) {
  if (dirPath.includes('..')) {
    return { allowed: false, status: 400, error: 'INVALID_PATH', message: 'Path must not contain ".." traversal sequences.' };
  }
  const allowedPaths = (process.env.ALLOWED_BASE_PATHS || '')
    .split(',').map(p => p.trim()).filter(Boolean);
  if (allowedPaths.length === 0) return { allowed: true };
  if (!allowedPaths.some(base => dirPath.startsWith(base))) {
    return {
      allowed: false,
      status: 403,
      error: 'ACCESS_DENIED',
      message: `Path "${dirPath}" is not under an allowed directory.\n` +
               `Allowed prefixes: ${allowedPaths.join(', ')}\n` +
               `To allow all paths, set ALLOWED_BASE_PATHS= (empty) in your .env file and restart the server.`
    };
  }
  return { allowed: true };
}

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── List available MCP tools ──────────────────────────────────────────────────
app.get('/api/tools', async (req, res) => {
  try {
    const [plantumlTools, codeParserTools] = await Promise.all([
      mcpClient.listTools(),
      codeParserClient.listTools()
    ]);
    res.json({ plantumlTools, codeParserTools });
  } catch (err) {
    res.status(500).json({ error: 'TOOLS_FETCH_FAILED', message: err.message });
  }
});

// ── Chat endpoint (SSE streaming) ─────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages, sessionId: clientSessionId, codeContextLoaded = false } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'messages array is required' });
  }

  const sessionId = clientSessionId || uuidv4();

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Session-Id', sessionId);
  res.flushHeaders();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Handle client disconnect
  req.on('close', () => {
    // Cleanup if needed
  });

  try {
    await runAgenticLoop({
      messages,
      sessionId,
      codeContextLoaded: codeContextLoaded || codeContextManager.hasContext(sessionId),
      mcpClient,
      codeParserClient,
      codeContextManager,
      sendEvent
    });
  } catch (err) {
    sendEvent('error', { type: 'error', error: 'SERVER_ERROR', message: err.message });
    sendEvent('done', { type: 'done' });
  } finally {
    res.end();
  }
});

// ── Direct diagram generation (bypass LLM) ───────────────────────────────────
app.post('/api/diagram', async (req, res) => {
  const { dsl, format = 'png', theme = 'default' } = req.body;

  if (!dsl) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'dsl is required' });
  }

  try {
    const result = await mcpClient.callTool('generate_diagram', { dsl, format, theme });
    const diagramContent = result.content?.find(c => c.type === 'image');
    const textContent = result.content?.find(c => c.type === 'text');

    if (result.isError) {
      const errData = textContent ? JSON.parse(textContent.text) : { error: 'RENDER_FAILED' };
      return res.status(400).json(errData);
    }

    if (diagramContent) {
      res.json({ data: diagramContent.data, mimeType: diagramContent.mimeType, format });
    } else {
      res.status(500).json({ error: 'RENDER_FAILED', message: 'No image returned from MCP tool' });
    }
  } catch (err) {
    res.status(500).json({ error: 'RENDER_FAILED', message: err.message });
  }
});

// ── Code context: browse directory ────────────────────────────────────────────
app.post('/api/code/browse', async (req, res) => {
  const { path: dirPath } = req.body;

  if (!dirPath) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'path is required' });
  }

  const guard = checkPathAllowed(dirPath);
  if (!guard.allowed) {
    return res.status(guard.status).json({ error: guard.error, message: guard.message });
  }

  try {
    const result = await codeParserClient.browseDirectory(dirPath);
    const textContent = result.content?.find(c => c.type === 'text');
    const data = textContent ? JSON.parse(textContent.text) : {};

    if (result.isError) {
      const statusCode = data.error === 'ACCESS_DENIED' ? 403
        : data.error === 'PATH_NOT_FOUND' ? 404
        : 400;
      return res.status(statusCode).json(data);
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'BROWSE_FAILED', message: err.message });
  }
});

// ── Code context: parse codebase ──────────────────────────────────────────────
app.post('/api/code/parse', async (req, res) => {
  const { path: dirPath, language = 'auto', scope = 'public_only', sessionId } = req.body;

  if (!dirPath) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'path is required' });
  }

  const guard = checkPathAllowed(dirPath);
  if (!guard.allowed) {
    return res.status(guard.status).json({ error: guard.error, message: guard.message });
  }

  const session = sessionId || uuidv4();

  try {
    const result = await codeParserClient.parseCodebase(dirPath, { language, scope, session_id: session });
    const textContent = result.content?.find(c => c.type === 'text');
    const data = textContent ? JSON.parse(textContent.text) : {};

    if (result.isError) {
      const statusCode = data.error === 'ACCESS_DENIED' ? 403
        : data.error === 'PATH_NOT_FOUND' ? 404
        : 400;
      return res.status(statusCode).json(data);
    }

    // Cache in context manager
    if (!data.error) {
      codeContextManager.storeContext(session, data);
    }

    res.json({ ...data, sessionId: session });
  } catch (err) {
    res.status(500).json({ error: 'PARSE_FAILED', message: err.message });
  }
});

// ── Code context: get symbol summary ─────────────────────────────────────────
app.get('/api/code/summary', async (req, res) => {
  const { sessionId, focus } = req.query;

  if (!sessionId) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'sessionId query param is required' });
  }

  if (!codeContextManager.hasContext(sessionId)) {
    return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'No parsed context found for this session' });
  }

  try {
    const result = await codeParserClient.getSymbolSummary(sessionId, focus);
    const textContent = result.content?.find(c => c.type === 'text');
    const data = textContent ? JSON.parse(textContent.text) : {};

    if (result.isError) {
      return res.status(400).json(data);
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'SUMMARY_FAILED', message: err.message });
  }
});

// ── Code context: clear ───────────────────────────────────────────────────────
app.delete('/api/code/context', (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'sessionId is required' });
  }

  codeContextManager.clearContext(sessionId);
  res.json({ success: true, message: 'Code context cleared' });
});

// ── Start server ──────────────────────────────────────────────────────────────
async function start() {
  // Pre-connect to MCP servers
  try {
    await Promise.all([
      mcpClient.connect(),
      codeParserClient.connect()
    ]);
  } catch (err) {
    console.warn('Warning: Could not pre-connect to MCP servers:', err.message);
    console.warn('MCP servers will attempt to connect on first request.');
  }

  app.listen(PORT, () => {
    console.log(`Backend server running at http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
