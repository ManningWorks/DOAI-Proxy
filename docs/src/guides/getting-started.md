---
title: Getting Started
description: Get up and running with DOAI Proxy in minutes
---

# Getting Started

## Prerequisites

- Node.js 18 or higher
- API key for your chosen provider (Straico, OpenAI, etc.)

## Installation

### Clone and Install

```bash
git clone <repository-url>
cd doai-proxy
npm install
```

### Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your provider's API key:

**For Straico (default):**

```bash
PROVIDER_TYPE=straico
STRAICO_API_KEY=your_actual_api_key_here
```

### Run the Proxy

```bash
npm start
```

Or run in development mode with hot-reload:

```bash
npm run dev
```

### Verify It's Working

```bash
curl http://localhost:8000/health
```

Expected output:

```json
{"status":"ok","service":"doai-proxy","timestamp":"2026-02-04T23:30:00.000Z"}
```

## Architecture

```
OpenAI-Compatible Client (OpenCode, etc.)
    ↓ "Hi, I'd like to speak to OpenAI please"
DOAI Proxy (localhost:8000)
    ↓ "One moment... *frantically translates*"
Provider API (Straico, etc.)
```

### Key Components

- **server.js** - Express server that handles all requests and orchestrates proxy logic
- **streaming.js** - Module that converts non-streaming responses into SSE format with 2 streaming modes
- **tools.js** - Module that handles function calling by injecting tools into prompts and parsing responses
- **utils.js** - Helper functions for logging, delays, and response formatting
- **providers/** - Provider abstraction layer supporting multiple AI providers
  - **base-provider.js** - Abstract base class defining provider interface
  - **provider-factory.js** - Factory for creating provider instances
  - **straico-provider.js** - Straico API implementation

## Testing

```bash
npm test
npm run lint
npm run typecheck
```

## Development

```bash
npm run dev
```

This uses `node --watch` to automatically restart on file changes.

Run quality checks:

```bash
npm run lint          # Lint code
npm run typecheck     # Type check
npm test              # Run tests
```

Fix linting issues:

```bash
npm run lint:fix      # Auto-fix
```

## Contributing

When contributing:

1. Follow code style guidelines (see AGENTS.md)
2. Run quality checks before submitting
3. Use descriptive commit messages
4. Test thoroughly with both streaming and function calling

## Next Steps

- [Configuration Guide](/guides/configuration) - Customize proxy behavior and provider settings
- [Streaming Guide](/guides/streaming) - Learn about SSE streaming modes
- [Function Calling Guide](/guides/function-calling) - Use tool calls through the proxy
- [API Endpoints](/api/endpoints) - Full endpoint reference
