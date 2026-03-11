# Coding Prompt: LLM ↔ PlantUML MCP Agent

## Project Overview

Build a **Model Context Protocol (MCP) agent** that bridges a **DeepSeek LLM chat interface** with a **PlantUML diagram generation server**. The user converses with DeepSeek in natural language to request diagrams (e.g. "draw a sequence diagram for a login flow"). The LLM interprets the request, generates valid PlantUML DSL, and dispatches it to the MCP PlantUML server, which returns a rendered diagram (PNG/SVG) back to the chat UI.

A key capability of this system is **source code-driven diagram generation**: the user can point the web interface at a local directory containing **C# or C++ source code**. The backend parses the selected codebase to extract classes, interfaces, methods, inheritance hierarchies, and dependencies, then injects this structured context into the LLM prompt so that accurate, code-faithful diagrams (class diagrams, sequence diagrams, component diagrams, etc.) are automatically generated — with no manual DSL authoring required.

---

## System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  React Chat Frontend                     │
│  (DeepSeek LLM Chat + Diagram Viewer + Code Explorer)   │
│   - DirectoryPicker: browse & select C# / C++ folder    │
│   - CodeContextPanel: shows parsed file tree + symbols  │
└───────────────────────┬──────────────────────────────────┘
                        │ HTTP / SSE
┌───────────────────────▼──────────────────────────────────┐
│               Node.js Backend Server                     │
│  - DeepSeek API client (tool use)                        │
│  - MCP Client (connects to MCP server)                   │
│  - Code Context Manager (caches parsed symbols)          │
└────────┬──────────────────────────┬──────────────────────┘
         │ MCP Protocol             │ fs / chokidar
         │ (stdio / SSE)            │ (watch directory)
┌────────▼───────────────┐  ┌──────▼───────────────────────┐
│   PlantUML MCP Server  │  │   Code Parser MCP Server     │
│  - generate_diagram()  │  │  - browse_directory()         │
│  - list_diagram_types()│  │  - parse_codebase()           │
│  - validate_dsl()      │  │  - get_symbol_summary()       │
│  - Calls PlantUML JAR  │  │  - Supports: C#, C++          │
└────────┬───────────────┘  └──────────────────────────────┘
         │ subprocess / HTTP
┌────────▼───────────────┐
│    PlantUML Engine     │
│  (Local JAR or remote) │
└────────────────────────┘
```

---

## Technology Stack

| Layer              | Technology                                      |
|--------------------|-------------------------------------------------|
| LLM                | DeepSeek API (`deepseek-chat` model)            |
| MCP Framework      | `@modelcontextprotocol/sdk` (Node.js)           |
| Backend            | Node.js + Express + SSE                         |
| Frontend           | React + Vite                                    |
| Diagram Engine     | PlantUML (local Java JAR or plantuml.com API)   |
| Diagram Rendering  | Base64 PNG or SVG inline display                |
| C# Code Parsing    | `dotnet-csharp-parser` npm pkg or Roslyn CLI    |
| C++ Code Parsing   | `tree-sitter` + `tree-sitter-cpp` grammar       |
| Directory Browsing | Node.js `fs/promises` + `chokidar` watcher      |
| File Tree UI       | `react-arborist` or custom recursive tree component |
| Package Manager    | npm (Node) / pip (Python utilities if needed)   |

---

## Project File Structure

```
plantuml-mcp-agent/
├── mcp-server/
│   ├── package.json
│   ├── index.js                    # PlantUML MCP server entry point
│   ├── tools/
│   │   ├── generateDiagram.js      # Core tool: DSL → PNG/SVG
│   │   └── listDiagramTypes.js
│   └── utils/
│       └── plantuml.js             # PlantUML JAR/API wrapper
│
├── code-parser-server/             # NEW: Code Parser MCP Server
│   ├── package.json
│   ├── index.js                    # MCP server for code analysis
│   ├── tools/
│   │   ├── browseDirectory.js      # Directory tree enumeration
│   │   ├── parseCodebase.js        # C# / C++ parser orchestrator
│   │   └── getSymbolSummary.js     # Returns extracted classes/methods
│   └── parsers/
│       ├── csharpParser.js         # Roslyn CLI or regex-based C# parser
│       ├── cppParser.js            # tree-sitter C++ parser
│       └── symbolExtractor.js      # Normalised symbol model (shared)
│
├── backend/
│   ├── package.json
│   ├── server.js                   # Express server + SSE
│   ├── mcpClient.js                # MCP client → PlantUML MCP server
│   ├── codeParserMcpClient.js      # NEW: MCP client → Code Parser server
│   ├── codeContextManager.js       # NEW: Caches & chunks parsed symbols
│   └── deepseekClient.js           # DeepSeek API with tool use
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── components/
│       │   ├── ChatWindow.jsx          # Message thread
│       │   ├── DiagramViewer.jsx       # Renders PNG/SVG output
│       │   ├── MessageInput.jsx
│       │   ├── CodeContextPanel.jsx    # NEW: Directory picker + file tree
│       │   ├── DirectoryPicker.jsx     # NEW: Folder path input + browse
│       │   └── SymbolSummaryBadge.jsx  # NEW: Shows parsed symbol counts
│       └── api/
│           ├── chat.js                 # SSE stream client
│           └── codeContext.js          # NEW: code-parser API calls
│
├── plantuml/
│   └── plantuml.jar                # Local PlantUML JAR (v1.2024+)
│
└── .env
```

---

## Module 1 — PlantUML MCP Server (`mcp-server/`)

### 1.1 Server Entry (`index.js`)

- Initialise an MCP server using `@modelcontextprotocol/sdk/server`.
- Transport: `StdioServerTransport` (for subprocess-based MCP) **or** `SSEServerTransport` on a configurable port.
- Register the following tools with full JSON Schema definitions:

#### Tool: `generate_diagram`

```json
{
  "name": "generate_diagram",
  "description": "Renders a PlantUML diagram from DSL source code and returns the result as a base64-encoded PNG or SVG string.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "dsl": {
        "type": "string",
        "description": "Valid PlantUML DSL code, including @startuml / @enduml delimiters."
      },
      "format": {
        "type": "string",
        "enum": ["png", "svg"],
        "default": "png",
        "description": "Output format for the rendered diagram."
      },
      "theme": {
        "type": "string",
        "description": "Optional PlantUML theme to apply (e.g. 'blueprint', 'cerulean').",
        "default": "default"
      }
    },
    "required": ["dsl"]
  }
}
```

#### Tool: `list_diagram_types`

```json
{
  "name": "list_diagram_types",
  "description": "Returns a list of diagram types supported by PlantUML with brief descriptions.",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}
```

#### Tool: `validate_dsl`

```json
{
  "name": "validate_dsl",
  "description": "Validates PlantUML DSL without rendering. Returns any syntax errors.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "dsl": { "type": "string" }
    },
    "required": ["dsl"]
  }
}
```

---

### 1.2 PlantUML Wrapper (`utils/plantuml.js`)

Implement `renderDiagram(dsl, format, theme)` with the following logic:

1. **Write DSL to a temp file** using Node `fs/promises` + `os.tmpdir()`.
2. **Inject theme directive** if a non-default theme is specified: prepend `!theme <theme>` after `@startuml`.
3. **Spawn PlantUML JAR** via `child_process.execFile`:
   ```
   java -jar plantuml.jar -t<format> -pipe < input.puml > output.<format>
   ```
   - Use stdin/stdout piping where possible for speed.
   - Set a 15-second execution timeout.
4. **Fallback**: If local JAR unavailable, POST the DSL to `https://www.plantuml.com/plantuml/form` using the encoded URL format (compress + base64url encode the DSL using `pako` + `js-base64`).
5. Return `{ data: "<base64string>", format, mimeType }`.
6. Handle and surface Java not found, JAR missing, and PlantUML syntax errors as structured MCP error responses.

---

### 1.3 `list_diagram_types` Implementation

Return a static JSON payload listing supported PlantUML diagram categories:

- Sequence, Use Case, Class, Object, Activity, Component, Deployment, State, Timing, Network (nwdiag), Gantt, MindMap, WBS, JSON, YAML, Salt (UI wireframe), Entity-Relationship (ER), C4 Architecture.

---

## Module 2 — Code Parser MCP Server (`code-parser-server/`)

This is a second, independent MCP server dedicated to reading and analysing C# and C++ source code from a user-selected directory. It exposes tools the LLM can call to understand the codebase before generating diagrams.

### 2.1 Server Entry (`index.js`)

- Initialise a second MCP server instance using `@modelcontextprotocol/sdk/server`.
- Transport: `StdioServerTransport` (spawned as a child process by the backend's `codeParserMcpClient.js`).
- Register the following tools:

#### Tool: `browse_directory`

```json
{
  "name": "browse_directory",
  "description": "Lists the directory tree of a given folder path, filtered to C# (.cs) and C++ (.cpp, .h, .hpp, .cxx) files. Returns a nested JSON tree of folders and files.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Absolute path to the root directory to browse."
      },
      "max_depth": {
        "type": "integer",
        "default": 5,
        "description": "Maximum directory recursion depth."
      },
      "include_hidden": {
        "type": "boolean",
        "default": false,
        "description": "Whether to include hidden files and folders."
      }
    },
    "required": ["path"]
  }
}
```

#### Tool: `parse_codebase`

```json
{
  "name": "parse_codebase",
  "description": "Parses all C# and C++ source files in the given directory. Extracts classes, structs, interfaces, enums, methods, properties, fields, inheritance relationships, and namespace/package structure. Returns a structured JSON symbol model.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Absolute path to the root source directory."
      },
      "language": {
        "type": "string",
        "enum": ["csharp", "cpp", "auto"],
        "default": "auto",
        "description": "Language to parse. 'auto' detects from file extensions."
      },
      "scope": {
        "type": "string",
        "enum": ["full", "public_only", "summary"],
        "default": "public_only",
        "description": "Parsing depth: 'full' includes private members, 'public_only' limits to public API, 'summary' returns class names and relationships only."
      },
      "file_filter": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Optional list of specific file paths (relative to root) to parse. Parses all if omitted."
      }
    },
    "required": ["path"]
  }
}
```

#### Tool: `get_symbol_summary`

```json
{
  "name": "get_symbol_summary",
  "description": "Returns a high-level summary of previously parsed codebase symbols: total class count, namespace list, inheritance chains, dependency graph edges, and recommended diagram types.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "session_id": {
        "type": "string",
        "description": "Session identifier used when parse_codebase was called."
      },
      "focus": {
        "type": "string",
        "description": "Optional class or namespace name to focus the summary on."
      }
    },
    "required": ["session_id"]
  }
}
```

---

### 2.2 C# Parser (`parsers/csharpParser.js`)

Implement using one of two strategies, selected at runtime via env config:

**Strategy A — Roslyn CLI (preferred, requires .NET SDK):**
- Invoke `dotnet script` or a bundled Roslyn-based console tool via `child_process.spawn`.
- Output a structured JSON symbol tree to stdout.
- Parse and return the JSON.

**Strategy B — Regex + AST fallback (no .NET dependency):**
- Use a regex-based pass over `.cs` files to extract:
  - `namespace` declarations
  - `class`, `interface`, `struct`, `enum` declarations (with access modifiers)
  - Base class and interface inheritance (`: BaseClass, IInterface`)
  - `public` method signatures (name, return type, parameters)
  - `public` property declarations
  - Field declarations with types
- Build a normalised `SymbolModel` object (see §2.4).

**Always:**
- Respect `scope` parameter — strip private/protected members when `scope === "public_only"`.
- Handle partial classes by merging members across files.
- Detect and record `using` imports as dependency hints.

---

### 2.3 C++ Parser (`parsers/cppParser.js`)

Use `tree-sitter` npm package with `tree-sitter-cpp` grammar:

```js
const Parser = require("tree-sitter");
const Cpp = require("tree-sitter-cpp");
const parser = new Parser();
parser.setLanguage(Cpp);
```

Extract from the syntax tree:
- `class_specifier` and `struct_specifier` nodes → class names, base classes
- `function_definition` and `declaration` nodes → method names, return types, parameters
- `access_specifier` nodes → public/protected/private scoping
- `namespace_definition` nodes → namespace hierarchy
- `#include` directives → inter-file dependencies
- Template class/function declarations

Handle:
- Header (`.h`, `.hpp`) vs implementation (`.cpp`, `.cxx`) file pairing — merge declarations from headers with implementations.
- Forward declarations (skip duplicates).
- Multiple inheritance.

---

### 2.4 Normalised Symbol Model (`parsers/symbolExtractor.js`)

Both parsers MUST output a common `SymbolModel` JSON schema:

```json
{
  "language": "csharp | cpp",
  "rootPath": "/abs/path/to/project",
  "namespaces": [
    {
      "name": "MyApp.Services",
      "classes": [
        {
          "name": "UserService",
          "type": "class | interface | struct | enum",
          "access": "public | private | internal",
          "baseClasses": ["BaseService"],
          "implementedInterfaces": ["IUserService"],
          "file": "Services/UserService.cs",
          "line": 12,
          "methods": [
            {
              "name": "GetUser",
              "access": "public",
              "returnType": "User",
              "parameters": [{ "name": "id", "type": "int" }],
              "isStatic": false,
              "isVirtual": false,
              "isAbstract": false
            }
          ],
          "properties": [
            { "name": "Repository", "type": "IUserRepository", "access": "private" }
          ],
          "fields": [],
          "dependencies": ["IUserRepository", "UserDto"]
        }
      ]
    }
  ],
  "dependencyEdges": [
    { "from": "UserService", "to": "IUserRepository", "type": "uses" },
    { "from": "AdminService", "to": "UserService", "type": "inherits" }
  ],
  "stats": {
    "totalFiles": 24,
    "totalClasses": 18,
    "totalMethods": 142,
    "parseErrors": []
  }
}
```

---

### 2.5 Code Context Manager (`backend/codeContextManager.js`)

- After `parse_codebase` completes, store the `SymbolModel` in memory keyed by `sessionId`.
- Implement `getContextChunk(sessionId, focus, maxTokens)`:
  - If the full symbol model exceeds `maxTokens` (default 8000), intelligently chunk by:
    - Prioritising classes related to `focus` (if provided).
    - Trimming method body details, keeping signatures only.
    - Returning a truncated but coherent subset of the symbol model.
- Implement `clearContext(sessionId)` to free memory when the session ends or a new directory is selected.

---

## Module 3 — Backend Server (`backend/`)

### 3.1 MCP Client (`mcpClient.js`)

- Use `@modelcontextprotocol/sdk/client` to connect to the PlantUML MCP server.
- Transport: `StdioClientTransport` that spawns `mcp-server/index.js` as a child process, **or** an `SSEClientTransport` pointed at the MCP server's HTTP port if running separately.
- On startup: call `listTools()` and cache the tool schemas.
- Export `callTool(toolName, args)` — wraps the MCP client call and returns the tool result content.

### 3.2 Code Parser MCP Client (`codeParserMcpClient.js`)

- Mirror of `mcpClient.js` but targets the `code-parser-server/index.js` process.
- On startup: call `listTools()` — cache `browse_directory`, `parse_codebase`, `get_symbol_summary` schemas.
- Export `browseDirectory(path, options)`, `parseCodebase(path, options)`, `getSymbolSummary(sessionId, focus)` as typed wrappers.

### 3.3 DeepSeek Client (`deepseekClient.js`)

- Use `openai` npm package (DeepSeek is OpenAI-compatible) pointed at `https://api.deepseek.com`.
- Model: `deepseek-chat`.
- **System prompt** — two variants injected depending on session context:

**Variant A — No code context loaded:**
```
You are a diagram assistant. When the user requests a diagram, you MUST:
1. Determine the appropriate PlantUML diagram type.
2. Write complete, valid PlantUML DSL (always include @startuml / @enduml).
3. Call the `generate_diagram` tool with the DSL.
4. When the tool returns, present the diagram to the user and offer to refine it.
If unsure about diagram type, call `list_diagram_types` first.
Never return raw PlantUML DSL to the user — always render it via the tool.
```

**Variant B — Code context loaded (injected when a directory has been parsed):**
```
You are a diagram assistant with access to a parsed C# / C++ codebase.
The user has loaded a source directory. When generating diagrams:
1. ALWAYS call `get_symbol_summary` first to understand the codebase structure.
2. Use the returned classes, interfaces, inheritance chains, and dependencies
   as the authoritative source for diagram content.
3. Generate PlantUML DSL that faithfully reflects the actual code — do NOT
   invent classes or relationships not present in the symbol model.
4. Call `generate_diagram` to render the DSL.
5. Cite which source files contributed to the diagram.
If the user asks about a specific class or module, call `get_symbol_summary`
with the `focus` parameter set to that class or namespace name.
```

- Convert MCP tool schemas (fetched from `mcpClient.listTools()`) to OpenAI-compatible `tools` array format on every chat request.
- Implement an **agentic loop**:
  ```
  while (response.finish_reason === "tool_calls") {
    for each tool_call in response.message.tool_calls:
      result = await mcpClient.callTool(tool_call.name, tool_call.arguments)
      append tool result to messages
    response = await deepseek.chat(messages, tools)
  }
  ```
- Stream the final text response back to the Express SSE endpoint.

### 3.4 Express Server (`server.js`)

**Endpoints:**

| Method | Path                        | Description                                                        |
|--------|-----------------------------|--------------------------------------------------------------------|
| POST   | `/api/chat`                 | Accepts `{ messages, sessionId, codeContextLoaded }`, runs agentic loop, streams SSE |
| GET    | `/api/tools`                | Returns list of available MCP tools (PlantUML + code parser)       |
| POST   | `/api/diagram`              | Direct diagram generation (bypasses LLM)                           |
| POST   | `/api/code/browse`          | **NEW**: Accepts `{ path }`, returns directory tree via code-parser MCP |
| POST   | `/api/code/parse`           | **NEW**: Accepts `{ path, language, scope }`, parses codebase, caches symbols |
| GET    | `/api/code/summary`         | **NEW**: Accepts `?sessionId=&focus=`, returns symbol summary       |
| DELETE | `/api/code/context`         | **NEW**: Clears the cached code context for a session              |
| GET    | `/health`                   | Health check                                                       |

**SSE Stream format** (for `/api/chat`):

```
event: token
data: {"type":"text","content":"Here is your diagram..."}

event: diagram
data: {"type":"diagram","format":"png","data":"<base64>","mimeType":"image/png"}

event: code_context
data: {"type":"code_context","status":"parsing","filesFound":24,"filesProcessed":12}

event: done
data: {"type":"done"}
```

---

## Module 4 — React Frontend (`frontend/`)

### 4.1 Chat Layout

- Three-panel layout:
  - **Left panel** (collapsible): Code Context Panel — directory picker + file tree + symbol summary (`CodeContextPanel.jsx`)
  - **Centre panel**: Chat message thread (`ChatWindow.jsx`)
  - **Right panel**: Diagram gallery (`DiagramViewer.jsx`)

### 4.2 `CodeContextPanel.jsx` (NEW)

This panel allows users to load source code into the LLM context. It has three states:

**State 1 — Empty (no directory loaded):**
- Prompt text: "Load a C# or C++ project to generate diagrams from real code."
- `DirectoryPicker` component (text input + browse button).
- Supported language badge: `C#` · `C++`.

**State 2 — Directory selected, parsing in progress:**
- Animated progress bar with status: "Scanning files… (12 / 24)".
- Live file count badge (total `.cs` / `.cpp` / `.h` files found).
- Cancel button.

**State 3 — Context loaded:**
- Green "Context Active" badge showing: `N classes · M files`.
- Collapsible file tree rendered with `react-arborist` (or equivalent), showing only C# / C++ files, with icons distinguishing `.cs` from `.cpp`/`.h`.
- Collapsible **Symbol Summary** card showing:
  - Namespace list with class counts per namespace.
  - Top-level inheritance tree (expandable).
  - "Suggested diagrams" chips: e.g. "Class diagram", "Component diagram", "Dependency graph" — clicking sends a pre-filled message to chat.
- "Change Directory" and "Clear Context" buttons.

### 4.3 `DirectoryPicker.jsx` (NEW)

- Text input for manually typing an absolute directory path.
- "Browse" button that triggers a backend call to `/api/code/browse` with the entered path, returning the first level of the directory tree for quick validation before full parse.
- Validation: show error if path does not exist or contains no C# / C++ files.
- On confirmation, POST to `/api/code/parse` and transition `CodeContextPanel` to State 2.
- Path history: remember the last 5 used directories in browser `sessionStorage` (not `localStorage`) and show as a dropdown.

### 4.4 `ChatWindow.jsx`

- Render user and assistant messages.
- Stream assistant text tokens in real time from the SSE connection.
- When an SSE `diagram` event is received, render the diagram inline in the chat bubble using `<img src="data:image/png;base64,..." />` for PNG or an inline `<div dangerouslySetInnerHTML>` for SVG.
- When code context is active, prefix user messages with a small "📁 Code context active" pill.
- Show a pulsing spinner while the LLM/tool is processing.

### 4.5 `DiagramViewer.jsx`

- Display all diagrams generated in the session as a scrollable gallery with thumbnails.
- Clicking a thumbnail expands to full-size modal view.
- Each diagram card shows: diagram type label, timestamp, source files used (if from code context), and a download button.
- Download button exports the diagram as PNG or SVG.

### 4.6 `MessageInput.jsx`

- Textarea with `Shift+Enter` for newline, `Enter` to send.
- Quick-action chips adapt based on whether code context is loaded:

  **Without code context:**
  - "Sequence diagram", "Class diagram", "Architecture diagram", "Flow chart", "Gantt chart"

  **With code context:**
  - "Class diagram from code", "Inheritance hierarchy", "Component dependencies", "Sequence for [class]", "Full architecture overview"

---

## Environment Variables (`.env`)

```env
# DeepSeek
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# MCP Server — PlantUML
MCP_TRANSPORT=stdio           # "stdio" or "sse"
MCP_SSE_PORT=3001             # Only for SSE transport

# MCP Server — Code Parser
CODE_PARSER_TRANSPORT=stdio
CODE_PARSER_SSE_PORT=3002

# PlantUML
PLANTUML_JAR_PATH=./plantuml/plantuml.jar
PLANTUML_USE_REMOTE=false     # Fallback to plantuml.com if true
PLANTUML_REMOTE_URL=https://www.plantuml.com/plantuml

# Code Parser
CSHARP_PARSER_STRATEGY=regex  # "roslyn" (requires .NET SDK) or "regex"
DOTNET_PATH=/usr/bin/dotnet   # Path to dotnet CLI (for Roslyn strategy)
MAX_PARSE_FILE_SIZE_KB=512    # Skip files larger than this
CODE_CONTEXT_MAX_TOKENS=8000  # Max tokens to inject into LLM context
ALLOWED_BASE_PATHS=/home,/workspace,/projects  # Security: restrict browseable dirs

# Backend
PORT=3000
```

---

## Implementation Requirements

### Error Handling

- If PlantUML JAR fails, return a structured error: `{ error: "RENDER_FAILED", message: "...", dsl: "..." }`.
- If DeepSeek tool call returns an error, the LLM must re-attempt with corrected DSL (inject error message back as tool result).
- Frontend must gracefully show a "Diagram failed to render" card with the raw DSL for inspection.
- If directory parsing fails (permission denied, no source files found, parse timeout), surface a clear error in the `CodeContextPanel` with corrective guidance.

### Directory Access Security

- The backend MUST validate all directory paths submitted by the frontend against an allowlist defined in `ALLOWED_BASE_PATHS`.
- Reject any path containing `..` traversal sequences.
- The `browse_directory` and `parse_codebase` MCP tools must run with the same OS user as the backend — do NOT elevate privileges.
- Do NOT expose raw file contents to the frontend or to the LLM — only the structured `SymbolModel` JSON is passed as context.

### Code Context Injection

- When both code context and a user message are present, the backend constructs the LLM message array as:
  ```
  [system prompt Variant B] +
  [{ role: "user", content: "<symbol context JSON>\n\nUser request: <message>" }]
  ```
- The symbol context is chunked to fit within `CODE_CONTEXT_MAX_TOKENS` using `codeContextManager.getContextChunk()`.
- If the symbol model exceeds the token limit even after chunking, warn the user in the chat UI and suggest scoping to a specific namespace.

### MCP Protocol Compliance

- The MCP server MUST return tool results as `{ content: [{ type: "text", text: "..." }] }` for text and `{ content: [{ type: "image", data: "<base64>", mimeType: "image/png" }] }` for diagram output.
- Implement MCP `resources` endpoint exposing recently generated diagrams as resources (optional stretch goal).

### DSL Quality

- The LLM system prompt must emphasise best practices: use `skinparam`, use meaningful labels, avoid overly complex diagrams in a single render.
- If the user asks for a very large diagram, the LLM should decompose into multiple focused diagrams.

### PlantUML Theme Support

- Ship with a pre-built list of available themes queried from `!theme` keyword support: `blueprint`, `cerulean`, `materia`, `minty`, `superhero`, `sketchy`.
- Expose theme selection as a dropdown in the frontend toolbar.

---

## Stretch Goals

1. **Diagram versioning**: Track edit history per diagram within a session; allow "undo" and "redo" for refinements.
2. **Export to Confluence / Notion**: Add an export button that posts the generated diagram to a user-configured Confluence page via the Confluence REST API.
3. **Multi-diagram responses**: Allow the LLM to generate multiple related diagrams in a single response (e.g., a C4 context + container diagram pair).
4. **PlantUML DSL editor**: Show a collapsible raw DSL editor panel; user can manually edit the DSL and re-render without the LLM.
5. **Diagram type auto-detection**: Fine-tune the system prompt to classify the user's intent into a specific diagram type before generating DSL.

---

## Acceptance Criteria

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | User types "Draw a sequence diagram for a REST API login flow" | LLM generates DSL, MCP renders PNG, diagram appears inline in chat |
| 2 | User types "Make it a dark theme" | LLM updates the DSL with `!theme blueprint`, re-renders updated diagram |
| 3 | User types "Show me a class diagram for a Node.js Express app" | Class diagram with relevant classes rendered correctly |
| 4 | PlantUML JAR missing | Error card shown with DSL fallback, option to retry via remote |
| 5 | DeepSeek API key invalid | Clear error message in chat, no crash |
| 6 | User downloads diagram | PNG/SVG file saved locally with correct filename |
| 7 | User selects "Gantt chart" quick chip | LLM scaffolds a sample Gantt diagram |
| 8 | User enters a valid C# project directory path | Backend browses directory, lists `.cs` files, CodeContextPanel shows file tree and symbol summary |
| 9 | User enters a valid C++ project directory path | Backend parses `.cpp`/`.h` files via tree-sitter, extracts classes and inheritance, displays symbol counts |
| 10 | User clicks "Class diagram from code" chip (with C# context loaded) | LLM calls `get_symbol_summary`, generates DSL using actual class names and relationships from parsed code |
| 11 | User types "Show inheritance hierarchy for the Controllers namespace" | LLM calls `get_symbol_summary` with `focus: "Controllers"`, generates accurate inheritance diagram |
| 12 | User enters a path outside `ALLOWED_BASE_PATHS` | Backend rejects with 403; frontend shows "Access denied" error in CodeContextPanel |
| 13 | User enters a path with no C# or C++ files | CodeContextPanel shows "No supported source files found" with guidance |
| 14 | User loads a very large codebase (200+ classes) | Context chunking kicks in; LLM receives scoped subset; user is prompted to narrow the focus |
| 15 | User clicks "Clear Context" | Symbol model is deleted server-side; LLM reverts to Variant A system prompt; chips revert to generic set |

---

## Getting Started Script

```bash
# 1. Clone and install dependencies
git clone <repo> plantuml-mcp-agent && cd plantuml-mcp-agent

# 2. Install PlantUML MCP server deps
cd mcp-server && npm install && cd ..

# 3. Install Code Parser MCP server deps
cd code-parser-server && npm install && cd ..

# 4. Install backend deps
cd backend && npm install && cd ..

# 5. Install frontend deps
cd frontend && npm install && cd ..

# 6. Download PlantUML JAR
curl -L https://github.com/plantuml/plantuml/releases/latest/download/plantuml.jar \
  -o plantuml/plantuml.jar

# 7. (Optional) Verify Java for PlantUML
java -version

# 8. (Optional) Verify .NET SDK for Roslyn C# parsing
dotnet --version   # Only required if CSHARP_PARSER_STRATEGY=roslyn

# 9. Configure environment
cp .env.example .env
# → Fill in DEEPSEEK_API_KEY and ALLOWED_BASE_PATHS

# 10. Start all services
npm run dev   # from root (uses concurrently to start backend + frontend)
```

---

*Generated for: LLM ↔ PlantUML MCP Agent project*  
*Stack: DeepSeek · Node.js MCP SDK · PlantUML · tree-sitter (C++) · Roslyn/regex (C#) · React*
