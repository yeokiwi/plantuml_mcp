# PlantUML MCP Agent

A **Model Context Protocol (MCP) agent** that bridges a **DeepSeek LLM chat interface** with a **PlantUML diagram generation server**. Converse in natural language to generate UML diagrams — and optionally point the interface at a local **C# or C++** codebase to generate architecture diagrams directly from source code.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  React Chat Frontend                     │
│  (DeepSeek LLM Chat + Diagram Viewer + Code Explorer)   │
└───────────────────────┬──────────────────────────────────┘
                        │ HTTP / SSE
┌───────────────────────▼──────────────────────────────────┐
│               Node.js Backend Server (Express)           │
│  - DeepSeek API client (tool use / agentic loop)         │
│  - MCP Client → PlantUML MCP Server                      │
│  - MCP Client → Code Parser MCP Server                   │
│  - Code Context Manager (in-memory symbol cache)         │
└────────┬──────────────────────────┬──────────────────────┘
         │ MCP (stdio)              │ MCP (stdio)
┌────────▼───────────────┐  ┌──────▼───────────────────────┐
│   PlantUML MCP Server  │  │   Code Parser MCP Server     │
│  - generate_diagram    │  │  - browse_directory           │
│  - list_diagram_types  │  │  - parse_codebase             │
│  - validate_dsl        │  │  - get_symbol_summary         │
└────────┬───────────────┘  └──────────────────────────────┘
         │
┌────────▼───────────────┐
│    PlantUML Engine     │
│  (Local JAR or remote) │
└────────────────────────┘
```

---

## Features

- **Natural language → UML diagrams** via DeepSeek LLM with tool use
- **Code-faithful diagrams**: load a C# or C++ project and generate class diagrams, inheritance hierarchies, and component diagrams from real source code
- **Two MCP servers**: PlantUML rendering server + Code Parser server
- **Agentic loop**: LLM calls tools iteratively to validate, refine, and render diagrams
- **Theme support**: blueprint, cerulean, materia, minty, superhero, sketchy
- **Streaming SSE**: real-time token streaming from LLM to browser
- **Diagram gallery**: browse, expand, and download all generated diagrams
- **Fallback rendering**: if local PlantUML JAR unavailable, falls back to plantuml.com API

---

## Quick Start

### 1. Clone and install

```bash
cd plantuml-mcp-agent
npm run install:all
```

### 2. Download PlantUML JAR

```bash
curl -L https://github.com/plantuml/plantuml/releases/latest/download/plantuml.jar \
  -o plantuml/plantuml.jar
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env and set your DEEPSEEK_API_KEY
# Optionally configure ALLOWED_BASE_PATHS for code context security
```

### 4. Start all services

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Health check: http://localhost:3000/health

---

## Project Structure

```
plantuml-mcp-agent/
├── mcp-server/                # PlantUML MCP Server
│   ├── index.js               # Server entry (StdioServerTransport)
│   ├── tools/
│   │   ├── generateDiagram.js
│   │   └── listDiagramTypes.js
│   └── utils/
│       └── plantuml.js        # JAR wrapper + remote fallback
│
├── code-parser-server/        # Code Parser MCP Server
│   ├── index.js               # Server entry (StdioServerTransport)
│   ├── tools/
│   │   ├── browseDirectory.js
│   │   ├── parseCodebase.js
│   │   └── getSymbolSummary.js
│   └── parsers/
│       ├── csharpParser.js    # Regex-based C# parser (+ optional Roslyn)
│       ├── cppParser.js       # tree-sitter C++ parser (+ regex fallback)
│       └── symbolExtractor.js # Normalised SymbolModel builder
│
├── backend/
│   ├── server.js              # Express + SSE endpoints
│   ├── mcpClient.js           # MCP client → PlantUML server
│   ├── codeParserMcpClient.js # MCP client → Code Parser server
│   ├── codeContextManager.js  # In-memory symbol cache + chunking
│   └── deepseekClient.js      # DeepSeek API + agentic loop
│
├── frontend/
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx            # Three-panel layout
│       ├── components/
│       │   ├── ChatWindow.jsx
│       │   ├── DiagramViewer.jsx
│       │   ├── MessageInput.jsx
│       │   ├── CodeContextPanel.jsx
│       │   ├── DirectoryPicker.jsx
│       │   └── SymbolSummaryBadge.jsx
│       └── api/
│           ├── chat.js        # SSE stream client
│           └── codeContext.js # Code parser API calls
│
├── plantuml/
│   └── plantuml.jar           # (download separately)
│
├── .env.example
└── package.json               # Root: concurrently starts backend + frontend
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/tools` | List all MCP tools |
| POST | `/api/chat` | Chat with SSE streaming |
| POST | `/api/diagram` | Direct diagram generation |
| POST | `/api/code/browse` | Browse directory for source files |
| POST | `/api/code/parse` | Parse C#/C++ codebase |
| GET | `/api/code/summary` | Get symbol summary for session |
| DELETE | `/api/code/context` | Clear cached code context |

---

## Environment Variables

See `.env.example` for all configuration options.

Key variables:

| Variable | Description |
|----------|-------------|
| `DEEPSEEK_API_KEY` | DeepSeek API key (required) |
| `PLANTUML_JAR_PATH` | Path to plantuml.jar |
| `PLANTUML_USE_REMOTE` | Use plantuml.com instead of local JAR |
| `CSHARP_PARSER_STRATEGY` | `regex` (default) or `roslyn` |
| `ALLOWED_BASE_PATHS` | Comma-separated list of allowed directories |
| `CODE_CONTEXT_MAX_TOKENS` | Max tokens for LLM context injection |

---

## Security

- All directory paths are validated against `ALLOWED_BASE_PATHS`
- Path traversal (`..`) is rejected
- Raw file contents are never sent to the LLM or frontend — only parsed symbol models
- Code parser runs with the same OS permissions as the backend process

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| LLM | DeepSeek API (`deepseek-chat`) |
| MCP Framework | `@modelcontextprotocol/sdk` (Node.js) |
| Backend | Node.js + Express + SSE |
| Frontend | React + Vite |
| Diagram Engine | PlantUML JAR or plantuml.com |
| C# Parsing | Regex-based (or Roslyn CLI) |
| C++ Parsing | tree-sitter + tree-sitter-cpp |
