# Opencode-Straico-Proxy: Detailed Repository Analysis

---

## 1. High-Level Purpose and Problem Statement

**What it does:** This is a Node.js/Express reverse proxy that sits between OpenAI-compatible clients (primarily [OpenCode](https://opencode.ai), a CLI coding assistant) and the [Straico](https://straico.com) API — an AI model aggregator that routes requests to Claude, GPT, DeepSeek, etc. through a single endpoint.

**The problem it solves:** Straico's API (at `https://api.straico.com/v2`) is OpenAI-compatible in format but **lacks two critical features** that tools like OpenCode rely on:

1. **Streaming responses** (Server-Sent Events / SSE) — Straico returns full responses synchronously; clients expecting a stream receive nothing until the entire response is ready.
2. **Function calling / tool use** — Straico has no native `tools` / `function_calling` support; clients that inject tool definitions and expect structured tool-call responses are unsupported.

The proxy fills both gaps via **streaming simulation** (converting a buffered response into SSE chunks) and **prompt-injection-based tool calling** (converting OpenAI tool schemas into system prompt text, parsing the model's text output for tool calls, and re-serializing into OpenAI's `finish_reason: "tool_calls"` format).

**Secondary use case:** When deployed via Docker, the startup entrypoint (`docker-entrypoint.sh`) auto-syncs the local OpenCode config file (`~/.config/opencode/opencode.json`) with the live list of Straico models — so OpenCode's model picker always reflects what Straico currently offers.

---

## 2. Architecture Diagram (in Words)

```
┌──────────────────────────────────────────────────────────┐
│          OpenAI-Compatible Client (OpenCode, curl, etc.)  │
│          Sends: POST /v1/chat/completions                 │
│          Expects: OpenAI streaming SSE, tool_calls        │
└───────────────────────────┬──────────────────────────────┘
                            │ HTTP (Bearer auth)
                            ▼
┌──────────────────────────────────────────────────────────┐
│               Express Server  (server.js)                 │
│  ┌─────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ Auth MW     │  │ Request MW      │  │ /health      │ │
│  │ (4 modes)   │  │ (request ID,    │  │ GET          │ │
│  │             │  │  activeRequests,│  │              │ │
│  │             │  │  shutdown gate) │  │              │ │
│  └─────────────┘  └─────────────────┘  └──────────────┘ │
│  ┌──────────────────────────────────────────────────────┐│
│  │  POST /v1/chat/completions  (main handler)           ││
│  │  1. Validate messages + model                        ││
│  │  2. validateTotalContext() → 400 if over limit       ││
│  │  3. provider.transformRequest() → Straico format     ││
│  │  4. provider.makeRequest() → axios POST to Straico   ││
│  │  5. parseToolCall() → detect tool invocations        ││
│  │  6a. Tool detected → streamToolCalls() or JSON resp  ││
│  │  6b. No tool → simulateStream() or JSON resp         ││
│  └──────────────────────────────────────────────────────┘│
└───────────────────────────┬──────────────────────────────┘
       provider.makeRequest()│ HTTPS, Bearer token
                            ▼
┌──────────────────────────────────────────────────────────┐
│              Straico API (api.straico.com/v2)             │
│          POST /chat/completions                           │
│          GET  /models  (startup only)                     │
└──────────────────────────────────────────────────────────┘
```

**Request flow summary:**

1. Client → `POST /v1/chat/completions` with OpenAI payload
2. Auth middleware validates `Bearer` token
3. Main handler validates input; checks model context limits
4. `StraicoProvider.transformRequest()` injects tool schemas into system prompt, normalizes messages
5. `StraicoProvider.makeRequest()` POSTs to `https://api.straico.com/v2/chat/completions`
6. Response is parsed; if tools requested, `parseToolCall()` scans the AI text for tool invocations
7. **If tool call found:** `streamToolCalls()` or `formatToolCallResponse()` returns `finish_reason: "tool_calls"`
8. **Otherwise:** `simulateStream()` (SSE) or plain JSON depending on client `stream` flag

---

## 3. Entrypoints, Routes, and Configuration

### Server Entrypoint

- **`server.js`** — sole HTTP entrypoint; ESM module; started with `node server.js`
- Startup order (`server.js:489–518`):
  1. `fetchModelLimits()` — pre-fetches Straico model catalog
  2. `app.listen(PORT)` — begins accepting connections

### HTTP Routes

| Method | Path | Handler | Auth |
|--------|------|---------|------|
| `GET`  | `/health` | Inline (`server.js:183`) | None |
| `POST` | `/v1/chat/completions` | Inline (`server.js:195`) | Yes (when mode ≠ disabled) |

> **Note:** The README mentions `/v2/chat/completions` in some examples — this is a documentation error; the actual route in `server.js:195` is `/v1/chat/completions`.

### Configuration (`.env.example`, `server.js:22–34`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PROVIDER_TYPE` | `straico` | Which provider to use |
| `STRAICO_API_KEY` | *(required)* | Straico bearer token |
| `STRAICO_API_URL` | `https://api.straico.com/v2` | Upstream API base |
| `STRAICO_API_TIMEOUT` | `60000` | ms per upstream request |
| `PROXY_PORT` | `8000` | Listen port |
| `PROXY_API_KEY` | unset | Token expected from clients |
| `AUTH_MODE` | `optional` (dev) / `required` (prod) | Auth enforcement level |
| `EXTERNAL_AUTH_HEADER` | unset | Custom header for external auth mode |
| `NODE_ENV` | `development` | Env tag |
| `STREAM_MODE` | `none` | `none` or `smart` |
| `STREAM_CHUNK_SIZE` | `15` | Target chars per SSE chunk (smart mode) |
| `STREAM_DELAY_MS` | `80` | ms delay between SSE chunks |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `SHUTDOWN_TIMEOUT` | `30000` | Grace period for in-flight requests |

---

## 4. Core Domain Logic

### 4a. Authentication (`server.js:22–181`)

Four `AUTH_MODE` values:

- **`required`**: `PROXY_API_KEY` must be set; all `/v1/*` requests must carry `Authorization: Bearer <key>`; timing-safe comparison via `crypto.timingSafeEqual` (`server.js:36–50`)
- **`optional`**: Auth enforced only if `PROXY_API_KEY` is set
- **`disabled`**: No auth; warns loudly on startup
- **`external`**: Trusts a downstream gateway; can optionally check presence of a custom header (`EXTERNAL_AUTH_HEADER`)

### 4b. Request Transformation (`providers/straico-provider.js:67–144`)

`StraicoProvider.transformRequest()` does:

1. **Tool injection** — `injectToolsIntoSystem(messages, tools)` (`tools.js:1–47`): appends a tool-use instruction block to the system message (or creates one) with tool names, descriptions, schemas, and a text format protocol (`TOOL_CALL: <name>\nARGUMENTS: {...}`)
2. **Message normalization** — `normalizeMessages()` (`tools.js:49–68`): flattens multi-part array content to strings, converts `tool_calls` in assistant messages to the text format, strips `<system-reminder>` parts
3. **Tool message filtering** — when `isToolRequest=true`, removes `role: "tool"` messages (Straico doesn't understand them); adjacent tool result messages are converted to `role: "user"` with a `[Tool Result]: ...` prefix (truncated at 5,000 chars)
4. **Empty assistant message filtering** — removes assistant turns with no content
5. **Smart model selector** — if `model` is absent or `"auto"`, uses Straico's `smart_llm_selector` with `pricing_method: "balance"` instead of a named model
6. **Parameter pass-through** — `temperature` (default `0.7`), `max_tokens`, `replace_failed_models` are forwarded if present

### 4c. Upstream HTTP (`providers/straico-provider.js:153–175`)

- Uses `axios.post()` to `${STRAICO_API_URL}/chat/completions`
- Header: `Authorization: Bearer <STRAICO_API_KEY>`
- Reuses a persistent `https.Agent` with `keepAlive: true`, `maxSockets: 50`, `maxFreeSockets: 10`, `timeout: 60000` (`straico-provider.js:6–11`)
- Request-level axios `timeout` is also set (default 60 s)
- **No automatic retries** — a single attempt is made; network errors bubble to the main handler

### 4d. Streaming Simulation (`streaming.js`)

Because Straico doesn't stream, the proxy receives a complete response and then simulates SSE:

**Mode: `none`** (`simulateStreamNone`, `streaming.js:23–75`):
- Sends the entire text as one SSE chunk with `finish_reason: null`, immediately followed by a `finish_reason: "stop"` chunk and `[DONE]`
- No artificial delay; recommended for production

**Mode: `smart`** (`simulateStreamSmart`, `streaming.js:77–135`):
- Calls `smartChunkText(text, targetSize)` which segments text by trying to break at newlines, then whitespace, then extends to avoid splitting Markdown delimiters (`**`, `__`, ` ``` `, `` ` ``)
- Each chunk is sent after `STREAM_DELAY_MS` ms (default 80 ms)
- Final empty-delta chunk with `finish_reason: "stop"` + `[DONE]`

Both modes set `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.

### 4e. Tool Call Streaming (`streaming.js:227–311` — `streamToolCalls()`)

When tool calls are detected and `stream: true`:

- For each tool call, sends two SSE delta chunks:
  1. **Init chunk** — `delta.tool_calls[{index, id, type, function: {name, arguments: ""}}]`
  2. **Args chunk** — `delta.tool_calls[{index, function: {arguments: <full_json>}}]`
- After all tools: final chunk with empty delta and `finish_reason: "tool_calls"`

### 4f. Tool Call Parsing (`tools.js:70–314`)

`parseToolCall(responseText)` tries four parsers in order:

1. **Minimax XML** (`parseMinimaxXML`): matches `<minimax:tool_call><invoke ...>` with attribute-style or `<parameter>` children
2. **Claude XML** (`parseClaudeXML`): matches `<invoke name="..."><parameter_list><parameter name="...">...</parameter></parameter_list></invoke>`
3. **OpenAI Native** (`parseOpenAIToolCalls`): looks for `"tool_calls": [...]` JSON fragments inside the response text
4. **Text Format** (`parseTextFormat`): matches `TOOL_CALL: <name>\nARGUMENTS: {json}` (the format the system prompt instructs)

Each parser returns `[]` on miss and the first non-empty result wins. Parsed tool calls are validated against the client-provided tool list; unknown tool names are filtered (`server.js:291–303`).

### 4g. Context Validation (`utils/model-limits.js`)

At startup, `fetchModelLimits()` fetches `GET /models` from Straico (10 s timeout) and caches `{ model_id → { max_output, word_limit, name, model_type, metadata } }` in the module-level `MODEL_LIMITS` object.

`validateTotalContext(inputTokens, maxTokens, modelId)` (`model-limits.js:97–116`):
- Estimates input tokens as `JSON.stringify(messages).length / 3.5`
- `outputTokens = max_tokens || model.max_output`
- Returns error if `inputTokens + outputTokens > model.word_limit`
- Silently passes if the model is not in the cache (e.g., unknown models)

### 4h. Error Handling (`server.js:409–462`)

The main handler wraps everything in try/catch and maps errors:

| Condition | HTTP Status | Error Type |
|-----------|-------------|------------|
| `error.response` present | Upstream status | Forwarded as-is |
| `error.statusCode` set | `error.statusCode` | `invalid_request_error` |
| `ECONNREFUSED`, `ENOTFOUND`, `ECONNRESET` | `502` | `upstream_error` |
| `ETIMEDOUT`, `ECONNABORTED` | `504` | `upstream_error` |
| Other | `500` | `internal_error` |

### 4i. Graceful Shutdown (`server.js:465–487`)

Handles `SIGTERM` / `SIGINT`:
- Sets `isShuttingDown = true`; new requests receive `503`
- Polls `activeRequests` counter every 100 ms
- Calls `server.close()` when drained
- Force-exits after `SHUTDOWN_TIMEOUT` (default 30 s)

---

## 5. Data Models, Request/Response Transformation

### Incoming Request (OpenAI format)

```json
{
  "model": "anthropic/claude-sonnet-4.5",
  "messages": [{ "role": "user", "content": "..." }],
  "tools": [...],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 1000,
  "replace_failed_models": true
}
```

### Transformed Straico Request

```json
// Named model:
{ "model": "anthropic/...", "messages": [...], "temperature": 0.7 }

// Auto model:
{ "smart_llm_selector": { "quantity": 1, "pricing_method": "balance" }, "messages": [...] }
```

### Straico Response (expected shape)

```json
{
  "data": {
    "model": "...",
    "choices": [{ "message": { "role": "assistant", "content": "..." }, "finish_reason": "stop" }],
    "usage": { "prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150 }
  }
}
```

### Outgoing OpenAI Response (non-streaming, `utils.js:230–252`)

```json
{
  "id": "chatcmpl-<timestamp>",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "...",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "..." }, "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 }
}
```

> **Note:** Usage always returns zeros — no token count is computed by the proxy itself.

### Tool Call Response (`tools.js:288–313`)

```json
{
  "id": "chatcmpl-<timestamp>",
  "object": "chat.completion",
  "choices": [{
    "message": { "role": "assistant", "tool_calls": [...], "content": null },
    "finish_reason": "tool_calls"
  }],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 }
}
```

### Message Normalization / Compatibility Shims

| Input form | Transformation |
|------------|----------------|
| Array `content` (multimodal) | Joined to plain text; `<system-reminder>` blocks stripped (`tools.js:60`) |
| `role: "tool"` messages | Converted to `role: "user"` with `[Tool Result]:` prefix, or dropped |
| `role: "assistant"` with `tool_calls` | Serialized to `TOOL_CALL: <name>\nARGUMENTS: <json>` text |
| Empty assistant messages | Dropped to avoid Straico API errors |

---

## 6. Operational Concerns

### Logging (`utils.js`)

- Log level controlled via `LOG_LEVEL` env (`debug` / `info` / `warn` / `error`)
- Structured JSON log entries written to `logs/requests.log` and `logs/server.log` via `fs/promises.appendFile`
- Authorization headers are redacted (`[REDACTED]`); response bodies with `content` > 200 chars are truncated; keys containing `password`, `token`, `api_key` are replaced with `[REDACTED]`
- Log rotation: files exceeding 50 MB are renamed with date suffix; up to 5 archives kept
- All requests get an `X-Request-ID` header set in response

### Metrics

No metrics system (Prometheus, StatsD, etc.) — only `console.log` timing lines such as `[Request Complete] <id> - <ms>ms`.

### Rate Limiting

None implemented in the proxy itself. Straico's own limits apply.

### Caching

None. Every request is forwarded to Straico; model limits are fetched once at startup and cached in memory (`MODEL_LIMITS` object).

### Security

- Timing-safe comparison for API key checks (`crypto.timingSafeEqual`, `server.js:36–50`)
- Auth mode `disabled` emits console warnings; `optional` in production warns if no key set
- `trust proxy` enabled only in `external` mode (`server.js:161`)
- JSON body limit: 50 MB (`server.js:113`)
- `.gitignore` excludes `.env`, `logs/`, and generated API docs

### Secrets Management

Secrets live in `.env` file (not committed). `STRAICO_API_KEY` and `PROXY_API_KEY` are consumed from environment. No vault or rotation mechanism.

---

## 7. How to Run Locally, Build, Test, Deploy

### Run Locally

```bash
cp .env.example .env
# Edit .env: set STRAICO_API_KEY
npm install
npm start          # node server.js
# or
npm run dev        # node --watch server.js (hot reload)
```

Health check:

```bash
curl http://localhost:8000/health
```

### Lint

```bash
npm run lint        # eslint .
npm run lint:fix    # eslint . --fix
```

### Tests

All tests are manual runner scripts in `__tests__/` (no framework like Jest/Mocha is configured):

| File | What it tests | How to run |
|------|--------------|------------|
| `test-streaming.js` | `simulateStream()` with mock res | `node __tests__/test-streaming.js` |
| `test-tool-parsing.js` | All 4 tool call parsers, `formatToolCallResponse` | `node __tests__/test-tool-parsing.js` |
| `test-stream-tool-calls.js` | `streamToolCalls()` SSE format | `node __tests__/test-stream-tool-calls.js` |
| `test-stream-tool-calls-final.js` | `streamToolCalls()` simplified verification | `node __tests__/test-stream-tool-calls-final.js` |
| `test-stream-tool-calls-index.js` | Tool call index consistency across chunks | `node __tests__/test-stream-tool-calls-index.js` |
| `test-minimax-tool-calls.js` | Minimax XML parser with real-world payload | `node __tests__/test-minimax-tool-calls.js` |
| `test-tool-request.js` | `StraicoProvider.transformRequest()` output | `node __tests__/test-tool-request.js` |
| `test-max-tokens-validation.js` | Context limit validation (requires live proxy) | `node __tests__/test-max-tokens-validation.js` |
| `test-us006.sh` | E2E health + streaming (requires server running) | `bash __tests__/test-us006.sh` |

### Docker Deployment

```bash
docker-compose up -d --build
docker-compose ps
curl http://localhost:8000/health
```

The `docker-compose.yml` mounts `.env` as read-only and also mounts `~/.config/opencode` so the sync script can update the OpenCode config inside the container.

### Utility Scripts

```bash
# Sync OpenCode model list from Straico API:
node scripts/sync-opencode-config.js

# Fetch/update Straico API documentation from Postman:
node scripts/update-straico-api-docs.js [--check] [--json]
```

---

## 8. Notable Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | `^4.18.2` | HTTP server framework |
| `axios` | `^1.6.0` | Upstream HTTP client (with connection pooling via `https.Agent`) |
| `dotenv` | `^16.3.1` | `.env` file loading |
| `eslint` | `^8.55.0` (dev) | Linter (2-space indent, single quotes, semicolons required) |
| Node.js | `>=18.0.0` | Runtime requirement (ESM `import/export`, `crypto.timingSafeEqual`) |
| Alpine Linux | base image | Docker base (`node:18-alpine`) |

---

## 9. Folder-by-Folder Walkthrough

```
/
├── server.js              # Express app, auth middleware, POST /v1/chat/completions,
│                          # graceful shutdown, startup orchestration
├── streaming.js           # simulateStream() (none/smart modes), streamToolCalls()
├── tools.js               # injectToolsIntoSystem(), normalizeMessages(),
│                          # parseToolCall() (4 parsers), formatToolCallResponse()
├── utils.js               # Logging (logRequest, logResponse, logError, etc.),
│                          # delayMs(), sanitizeObject(), formatChatCompletionResponse(),
│                          # generateRequestId(), log rotation
│
├── providers/
│   ├── base-provider.js   # Abstract BaseProvider class (7 abstract methods)
│   ├── straico-provider.js# StraicoProvider: transformRequest/transformResponse/makeRequest
│   ├── provider-factory.js# ProviderFactory.create() switch; openai/anthropic stubs
│   └── index.js           # Re-exports all 3 above
│
├── utils/
│   └── model-limits.js    # fetchModelLimits() (startup), MODEL_LIMITS cache,
│                          # getModelLimits(), validateTotalContext()
│
├── scripts/
│   ├── sync-opencode-config.js  # Fetches Straico models, updates ~/.config/opencode/opencode.json
│   └── update-straico-api-docs.js # Fetches Postman collection, generates markdown + JSON docs
│
├── __tests__/
│   ├── test-streaming.js           # Unit: simulateStream
│   ├── test-tool-parsing.js        # Unit: parseToolCall (all formats)
│   ├── test-stream-tool-calls.js   # Unit: streamToolCalls
│   ├── test-stream-tool-calls-final.js  # Unit: streamToolCalls (simplified)
│   ├── test-stream-tool-calls-index.js  # Unit: SSE index consistency
│   ├── test-minimax-tool-calls.js  # Unit: Minimax XML parser
│   ├── test-tool-request.js        # Unit: transformRequest output
│   ├── test-max-tokens-validation.js # Integration: context limit (needs live server)
│   └── test-us006.sh               # E2E: bash integration test
│
├── docs/
│   ├── ADDING_PROVIDERS.md  # Step-by-step guide to add a new provider
│   ├── DOCKER_DEPLOYMENT.md # Docker setup, configuration, troubleshooting
│   └── REPOSITORY_ANALYSIS.md  # This file
│
├── Dockerfile             # node:18-alpine, npm ci --only=production, EXPOSE 8000
├── docker-compose.yml     # Single service, env_file, healthcheck, opencode mount
├── docker-entrypoint.sh   # Runs sync-opencode-config.js, then starts server.js
├── .env.example           # Template with all variables documented
├── .eslintrc.json         # ESLint config (recommended + style rules)
├── package.json           # Scripts: start, dev, lint, lint:fix; ESM type
└── .gitignore             # Excludes .env, logs/, node_modules/, generated docs
```

---

## 10. Known Limitations and TODOs

### Hard-coded / Missing Features

- **Only one real provider**: `provider-factory.js:24–31` — `openai` and `anthropic` cases intentionally throw `"not implemented yet"`. The architecture supports them but they don't exist.
- **No usage token reporting**: All `usage` fields in responses return `{ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }` (`utils.js:245–249`, `tools.js:305–308`). Clients relying on token counts will see zeros.
- **Model limits only at startup**: The `MODEL_LIMITS` cache is populated once; if Straico adds/removes models, a restart is required to pick up changes.
- **Streaming simulation is fake**: Despite accepting `stream: true`, the proxy makes a blocking request to Straico and then re-serializes. True real-time streaming (tokens as they generate) is not possible with Straico's current API.
- **No `/v1/models` endpoint**: Clients that discover available models via the OpenAI `GET /v1/models` endpoint will get a 404.
- **No request deduplication or retries**: A single upstream call is made; transient errors are not retried.
- **No rate limiting**: High-volume clients can exhaust Straico's rate limits without any proxy-level protection.
- **No metrics export**: No Prometheus, OpenTelemetry, or health-check details beyond `{status: "ok"}`.

### Bugs

- **Log rotation path bug** (`utils.js:138`, `163`): `rotateLogIfNeeded('requests.log')` is called with a relative path rather than the `LOG_FILE_PATHS.requests` constant (`'logs/requests.log'`), meaning rotation checks the wrong file.
- **`StraicoProvider` does not extend `BaseProvider`**: No `extends BaseProvider` in `straico-provider.js` — the abstract contract is defined but not enforced via JS inheritance, only by convention.

### Documentation Inconsistencies

- README mentions `/v2/chat/completions` in curl examples (`README.md:275`, `docs/DOCKER_DEPLOYMENT.md:85`), but the actual route is `/v1/chat/completions` (`server.js:195`).
- `DOCKER_DEPLOYMENT.md` lists `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` variables as "required when using OpenAI/Anthropic" — neither provider is actually implemented.

### Test Infrastructure

- Test files use ad-hoc `assert()` / `assertEquals()` helpers rather than a standard test framework.
- There is no `npm test` script defined in `package.json`.
- Docker `docker-compose.yml` hardcodes the OpenCode config mount to `~/.config/opencode`, which only works if the user running Docker has OpenCode installed at that path.
