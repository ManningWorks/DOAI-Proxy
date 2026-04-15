# DOAI Proxy

**Definitely OpenAI.** *(It's definitely not.)*

An OpenAI-compatible API proxy that makes any AI provider speak the OpenAI protocol — complete with streaming and function calling — even when the provider supports neither.

**Currently only supports Straico as an AI Provider, but has an extensible architecture for future providers.**

## Quick Start

```bash
git clone <repository-url>
cd doai-proxy
npm install
cp .env.example .env
# Edit .env and add your provider API key
npm start
```

Verify:

```bash
curl http://localhost:8000/health
# {"status":"ok","service":"doai-proxy","timestamp":"..."}
```

## What It Does

Some AI providers are *almost* OpenAI-compatible but lack streaming and function calling. DOAI Proxy fills both gaps:

- **Streaming Simulation**: Converts non-streaming responses into SSE with configurable chunking
- **Function Calling**: Injects tool definitions into prompts, parses responses, formats as `tool_calls`
- **OpenAI Compatibility**: Presents `/v1/chat/completions`, `/v1/models` — the client never knows the difference

```
OpenAI-Compatible Client (OpenCode, etc.)
    ↓
DOAI Proxy (localhost:8000)
    ↓
Provider API (Straico, etc.)
```

## Architecture

- **server.js** - Express server, auth middleware, request orchestration
- **streaming.js** - SSE streaming simulation (none/smart modes)
- **tools.js** - Function calling via prompt injection + 4 response parsers
- **utils.js** - Logging, delays, response formatting
- **providers/** - Extensible provider layer (`straico`, more coming)

## Docker

```bash
cp .env.example .env
docker-compose up -d --build
curl http://localhost:8000/health
```

## Development

```bash
npm run dev        # Hot-reload via node --watch
npm run lint       # ESLint
npm run lint:fix   # Auto-fix lint
npm test           # Run tests
```

## Documentation

Full documentation is available at [docs site](https://doai-proxy.manningworks.dev) (or run `npm run docs:dev` locally):

- [Getting Started](docs/src/guides/getting-started.md)
- [Configuration Reference](docs/src/guides/configuration.md)
- [Streaming](docs/src/guides/streaming.md)
- [Function Calling](docs/src/guides/function-calling.md)
- [Authentication](docs/src/guides/authentication.md)
- [Summarization](docs/src/guides/summarization.md)
- [Adding Providers](docs/src/guides/adding-providers.md)
- [Docker Deployment](docs/src/guides/docker.md)
- [Production](docs/src/guides/production.md)
- [Security](docs/src/guides/security.md)
- [Troubleshooting](docs/src/guides/troubleshooting.md)
- [API Reference](docs/src/api/endpoints.md)
- [Examples](docs/src/examples/basic-chat.md)

## License

See LICENSE file for details.
