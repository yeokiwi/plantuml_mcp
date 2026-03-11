# PlantUML MCP Agent

A conversational diagram generator that connects a **DeepSeek LLM** to a **PlantUML rendering engine** via the **Model Context Protocol (MCP)**. Describe the diagram you want in plain English and the agent writes the PlantUML DSL, renders it, and displays the result inline in the chat.

An optional **code context** feature lets you point the agent at a local **C# or C++** project. The backend parses the source files, extracts classes, interfaces, methods, and relationships, and injects this structured knowledge into the LLM prompt so that generated diagrams reflect the real codebase — no manual DSL authoring required.

---

## How it works

```
Browser (React)
     │  HTTP / Server-Sent Events
     ▼
Node.js Backend (Express)
     │  spawns via stdio
     ├──► PlantUML MCP Server  ──► plantuml.jar (or plantuml.com)
     └──► Code Parser MCP Server  (C# regex / C++ tree-sitter)
```

1. The user types a request in the chat, e.g. *"Draw a class diagram for my authentication module"*.
2. The backend forwards the conversation to DeepSeek together with the available MCP tool definitions.
3. DeepSeek decides which tools to call (`generate_diagram`, `get_symbol_summary`, etc.) and the backend executes them via the MCP servers.
4. The rendered diagram (base64 PNG or SVG) is streamed back to the browser over SSE and displayed inline.

---

## Features

- **Natural language → UML** — sequence, class, component, state, activity, C4, Gantt, and 14 other diagram types
- **Code-context diagrams** — load a C# or C++ project; the agent reads real classes and relationships
- **Agentic tool loop** — LLM calls tools repeatedly until the final diagram is ready
- **Real-time streaming** — tokens and diagrams appear progressively via Server-Sent Events
- **Theme picker** — blueprint, cerulean, materia, minty, superhero, sketchy
- **Diagram gallery** — every generated diagram is saved, expandable, and downloadable (PNG or SVG)
- **Remote fallback** — if the local PlantUML JAR is missing, rendering falls back to plantuml.com automatically

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18 or later | Required for all three servers |
| Java | 11 or later | Required to run the local PlantUML JAR |
| DeepSeek API key | — | Sign up at [platform.deepseek.com](https://platform.deepseek.com) |
| Git | any | To clone the repository |

**Optional (code context only):**

| Requirement | Notes |
|-------------|-------|
| .NET SDK 8+ | Only if `CSHARP_PARSER_STRATEGY=roslyn` (default is `regex`, no .NET needed) |

---

## Installation

### 1. Clone the repository

```bash
git clone <repo-url>
cd plantuml-mcp-agent
```

### 2. Install all dependencies

This installs packages for the root workspace, both MCP servers, the backend, and the frontend in one command:

```bash
npm run install:all
```

<details>
<summary>What this runs under the hood</summary>

```bash
npm install                          # root (concurrently)
cd mcp-server && npm install         # PlantUML MCP server
cd code-parser-server && npm install # Code Parser MCP server
cd backend && npm install            # Express backend
cd frontend && npm install           # React + Vite frontend
```

</details>

### 3. Download the PlantUML JAR

```bash
curl -L https://github.com/plantuml/plantuml/releases/latest/download/plantuml.jar \
  -o plantuml/plantuml.jar
```

Verify that Java can run it:

```bash
java -jar plantuml/plantuml.jar -version
```

> If you skip this step the agent will automatically fall back to the plantuml.com web API. Diagram generation will be slower and subject to that service's availability.

### 4. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in the required value:

```env
DEEPSEEK_API_KEY=sk-...your-key-here...
```

Adjust any optional settings as needed (see [Environment Variables](#environment-variables) below).

---

## Running the application

### Development mode (recommended)

Starts the backend and frontend concurrently with file-watching:

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| Chat UI | http://localhost:5173 |
| Backend API | http://localhost:3000 |
| Health check | http://localhost:3000/health |

### Production mode

```bash
# Build the frontend
cd frontend && npm run build && cd ..

# Start the backend (serves API; frontend is served by your web server / CDN)
cd backend && npm start
```

The two MCP servers (`mcp-server/` and `code-parser-server/`) are **not started manually** — the backend spawns them automatically as child processes when it starts.

---

## Using the application

### Generating a diagram from natural language

1. Open http://localhost:5173 in your browser.
2. Type a request in the chat input, e.g.:
   - *"Draw a sequence diagram for a REST login flow"*
   - *"Create a class diagram for a simple e-commerce system"*
   - *"Show a Gantt chart for a 4-week sprint"*
3. Click **Send** (or press **Enter**). The agent will generate the PlantUML DSL, render it, and display the diagram inline.
4. Use the **quick-action chips** above the input for common diagram types.
5. Use the **Theme** dropdown in the toolbar to change the visual style.

### Generating diagrams from source code

1. Click the **▶** button on the left panel to expand **Code Context**.
2. Enter the absolute path to a local C# or C++ project directory, e.g. `/home/user/MyProject`.
3. Click **Load Project**. The backend will scan and parse the source files. A progress bar shows the status.
4. Once parsing is complete, the panel shows:
   - A **symbol summary** (namespace list, class counts)
   - **Suggested diagram** chips — click one to pre-fill the chat
5. Ask context-aware questions:
   - *"Generate a class diagram from code"*
   - *"Show the inheritance hierarchy for the Controllers namespace"*
   - *"What are the dependencies of the UserService class?"*
6. Click **Clear Context** to remove the parsed codebase and return to generic mode.

### Diagram gallery

Every rendered diagram is saved in the right-hand **Diagram Gallery** panel. Click any thumbnail to open a full-size modal. Use the download button to save as PNG or SVG.

---

## Environment variables

All variables are set in `.env` (copy from `.env.example`).

| Variable | Default | Description |
|----------|---------|-------------|
| `DEEPSEEK_API_KEY` | *(required)* | Your DeepSeek API key |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | DeepSeek API base URL |
| `DEEPSEEK_MODEL` | `deepseek-chat` | Model name |
| `PORT` | `3000` | Backend HTTP port |
| `PLANTUML_JAR_PATH` | `./plantuml/plantuml.jar` | Path to the PlantUML JAR |
| `PLANTUML_USE_REMOTE` | `false` | Set `true` to always use plantuml.com |
| `PLANTUML_REMOTE_URL` | `https://www.plantuml.com/plantuml` | Remote render endpoint |
| `CSHARP_PARSER_STRATEGY` | `regex` | `regex` (no .NET needed) or `roslyn` (.NET SDK required) |
| `DOTNET_PATH` | `/usr/bin/dotnet` | Path to the `dotnet` CLI (Roslyn strategy only) |
| `MAX_PARSE_FILE_SIZE_KB` | `512` | Source files larger than this are skipped |
| `CODE_CONTEXT_MAX_TOKENS` | `8000` | Maximum tokens injected into the LLM context from parsed symbols |
| `ALLOWED_BASE_PATHS` | *(empty = allow all)* | Comma-separated list of directories the code parser may access |

---

## Project structure

```
plantuml-mcp-agent/
│
├── mcp-server/                     # PlantUML MCP Server
│   ├── index.js                    # Server entry — StdioServerTransport
│   ├── tools/
│   │   ├── generateDiagram.js      # DSL → PNG/SVG via JAR or remote
│   │   └── listDiagramTypes.js     # Static list of 18 diagram types
│   └── utils/
│       └── plantuml.js             # JAR wrapper, theme injection, remote fallback
│
├── code-parser-server/             # Code Parser MCP Server
│   ├── index.js                    # Server entry — StdioServerTransport
│   ├── tools/
│   │   ├── browseDirectory.js      # Directory tree (C#/C++ files only)
│   │   ├── parseCodebase.js        # Orchestrates parsers, caches sessions
│   │   └── getSymbolSummary.js     # Inheritance chains, deps, diagram suggestions
│   └── parsers/
│       ├── csharpParser.js         # Regex C# parser (namespaces, classes, methods)
│       ├── cppParser.js            # tree-sitter C++ parser with regex fallback
│       └── symbolExtractor.js      # Shared SymbolModel schema and helpers
│
├── backend/
│   ├── server.js                   # Express app — REST + SSE endpoints
│   ├── mcpClient.js                # Spawns & connects to PlantUML MCP server
│   ├── codeParserMcpClient.js      # Spawns & connects to Code Parser MCP server
│   ├── codeContextManager.js       # In-memory symbol cache with token-budget chunking
│   └── deepseekClient.js           # DeepSeek API client + agentic tool-call loop
│
├── frontend/
│   ├── vite.config.js              # Vite config — proxies /api to backend
│   └── src/
│       ├── App.jsx                 # Three-panel shell (Code Context | Chat | Gallery)
│       ├── components/
│       │   ├── ChatWindow.jsx      # Message thread with inline diagram rendering
│       │   ├── DiagramViewer.jsx   # Gallery with thumbnail grid and download
│       │   ├── MessageInput.jsx    # Textarea, quick chips, send button
│       │   ├── CodeContextPanel.jsx# empty / parsing / loaded states
│       │   ├── DirectoryPicker.jsx # Path input with sessionStorage history
│       │   └── SymbolSummaryBadge.jsx # Context Active badge with class/file counts
│       └── api/
│           ├── chat.js             # SSE stream client
│           └── codeContext.js      # browse / parse / summary / clear API calls
│
├── plantuml/
│   └── plantuml.jar                # Download separately (see Installation)
│
├── .env.example                    # Template for environment variables
├── .gitignore
└── package.json                    # Root — npm run dev / install:all
```

---

## API reference

| Method | Path | Body / Query | Description |
|--------|------|--------------|-------------|
| `GET` | `/health` | — | Returns `{ status: "ok" }` |
| `GET` | `/api/tools` | — | Lists all registered MCP tools |
| `POST` | `/api/chat` | `{ messages, sessionId, codeContextLoaded }` | Runs agentic loop; streams SSE events |
| `POST` | `/api/diagram` | `{ dsl, format, theme }` | Renders DSL directly, skipping the LLM |
| `POST` | `/api/code/browse` | `{ path }` | Returns filtered directory tree |
| `POST` | `/api/code/parse` | `{ path, language, scope, sessionId }` | Parses codebase; caches SymbolModel |
| `GET` | `/api/code/summary` | `?sessionId=&focus=` | Returns symbol summary for a session |
| `DELETE` | `/api/code/context` | `{ sessionId }` | Clears the cached symbol model |

### SSE event types (from `/api/chat`)

| Event | Payload | Description |
|-------|---------|-------------|
| `token` | `{ type: "text", content }` | Streamed LLM text fragment |
| `diagram` | `{ type: "diagram", format, data, mimeType }` | Base64-encoded PNG or SVG |
| `code_context` | `{ type: "code_context", status, filesFound, filesProcessed }` | Parse progress |
| `error` | `{ type: "error", error, message }` | Error from LLM or tool |
| `done` | `{ type: "done" }` | Stream complete |

---

## Security

- **Path allowlist** — set `ALLOWED_BASE_PATHS` to restrict which directories the code parser can read. Requests to paths outside this list are rejected with HTTP 403.
- **Path traversal protection** — any path containing `..` is rejected before hitting the filesystem.
- **No raw source exposure** — file contents are never sent to the LLM or the browser. Only the structured `SymbolModel` JSON (class names, method signatures, relationships) is passed as context.
- **Least privilege** — the code parser process runs with the same OS user as the backend; no privilege escalation occurs.

---

## Troubleshooting

**`DEEPSEEK_API_KEY` invalid or missing**
The chat window will display a clear error message. Check that the key in `.env` matches the one from your DeepSeek account dashboard.

**PlantUML JAR not found**
The agent falls back to plantuml.com automatically. To use the local JAR, download it to `plantuml/plantuml.jar` and ensure `java` is on your `PATH`.

**`java` command not found**
Install a JDK (Java 11+). On Ubuntu/Debian: `sudo apt install default-jdk`. On macOS: `brew install openjdk`.

**No C# or C++ files found**
Make sure the directory you entered contains `.cs`, `.cpp`, `.h`, or `.hpp` files. Hidden directories and `node_modules`/`bin`/`obj` folders are automatically skipped.

**Access denied when loading a directory**
The path is outside `ALLOWED_BASE_PATHS`. Add the parent directory to that list in `.env` and restart the backend.

**Port already in use**
Change `PORT` in `.env` for the backend, or kill the process holding the port:
```bash
lsof -ti :3000 | xargs kill
```

---

## Tech stack

| Layer | Technology |
|-------|------------|
| LLM | DeepSeek API (`deepseek-chat`) via OpenAI-compatible SDK |
| MCP framework | `@modelcontextprotocol/sdk` (Node.js) |
| Backend | Node.js 18+ · Express · Server-Sent Events |
| Frontend | React 18 · Vite 5 |
| Diagram engine | PlantUML JAR (Java) · plantuml.com fallback |
| C# parsing | Regex-based (built-in) · Roslyn CLI (optional) |
| C++ parsing | `tree-sitter` + `tree-sitter-cpp` · regex fallback |
