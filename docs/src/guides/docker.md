---
title: Docker Deployment
description: Deploy DOAI Proxy using Docker and Docker Compose
---

# Docker Deployment

This guide walks you through deploying DOAI Proxy with Docker.

## Prerequisites

- Docker 20.10 or higher
- Docker Compose
- API key for your chosen provider (Straico, OpenAI, etc.)

## Quick Start

### 1. Clone or Copy the Project

```bash
# Clone from repository
git clone <repository-url>
cd doai-proxy

# OR copy project files to target machine:
# server.js, streaming.js, tools.js, utils.js,
# providers/, package.json, Dockerfile,
# docker-compose.yml, .env.example
```

### 2. Configure Environment

```bash
cp .env.example .env
nano .env  # add your provider's API key
```

For Straico (default provider):

```bash
PROVIDER_TYPE=straico
STRAICO_API_KEY=your_actual_straico_api_key_here
STRAICO_API_URL=https://api.straico.com/v2
PROXY_PORT=8000
```

### 3. Build and Start Container

```bash
docker-compose up -d --build
docker-compose ps
docker logs doai-proxy
```

### 4. Verify Deployment

```bash
curl http://localhost:8000/health
# {"status":"ok","service":"doai-proxy","timestamp":"2026-02-04T23:30:00.000Z"}
```

### 5. Test the Proxy

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-sonnet-4.5",
    "messages": [{"role": "user", "content": "Hello, world!"}],
    "stream": false
  }'
```

## Configuration

For the full list of required and optional environment variables, provider-specific settings, and streaming tuning parameters, see the [Configuration Guide](/guides/configuration).

You set these variables in your `.env` file before starting the container:

```bash
PROVIDER_TYPE=straico
STRAICO_API_KEY=your_straico_api_key
PROXY_PORT=8000
STREAM_CHUNK_SIZE=15
STREAM_DELAY_MS=80
LOG_LEVEL=info
```

## Container Management

### Start / Stop / Restart

```bash
docker-compose up -d        # start
docker-compose down         # stop
docker-compose restart      # restart
docker logs doai-proxy -f   # follow logs
```

### Rebuild After Code Changes

```bash
docker-compose up -d --build

# or force a full recreate
docker-compose down
docker-compose up -d --build --force-recreate
```

### Update Configuration

```bash
nano .env                   # edit variables
docker-compose restart      # apply changes
```

## Client Configuration

### OpenCode Example

After the proxy is running, add a provider in OpenCode's configuration:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "straico": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Straico",
      "options": {
        "baseURL": "http://localhost:8000/v1"
      }
    }
  },
  "models": {
    "anthropic/claude-sonnet-4.5": {
      "name": "Anthropic: Claude Sonnet 4.5"
    },
    "deepseek/deepseek-chat": {
      "name": "DeepSeek V3"
    },
    "openai/gpt-4o-mini": {
      "name": "OpenAI: GPT-4o Mini"
    }
  }
}
```

Then in OpenCode:

1. Run `/models` to refresh the model list
2. Select your provider and model
3. Start chatting

## Network Access

### Localhost (Default)

The proxy listens on `http://localhost:8000` by default.

### Remote Access

#### Expose on All Interfaces

Edit `docker-compose.yml`:

```yaml
services:
  doai-proxy:
    ports:
      - "0.0.0.0:8000:8000"
```

Then access from other machines at `http://<server-ip>:8000`.

#### SSH Tunneling

From the client machine:

```bash
ssh -L 8000:localhost:8000 user@server
```

Then use `http://localhost:8000` as usual.

#### Reverse Proxy (Production)

Use Nginx, Caddy, or similar for HTTPS and authentication:

```nginx
server {
    listen 80;
    server_name your-proxy-domain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Multi-Provider Deployment

To run multiple provider instances simultaneously, use a compose file with separate services:

```yaml
version: '3.8'

services:
  doai-proxy:
    build: .
    container_name: doai-proxy
    ports:
      - "8000:8000"
    env_file:
      - .env.straico
    restart: unless-stopped
    volumes:
      - ./.env.straico:/app/.env:ro
      - ./logs:/app/logs

  openai-proxy:
    build: .
    container_name: openai-proxy
    ports:
      - "8001:8001"
    env_file:
      - .env.openai
    restart: unless-stopped
    volumes:
      - ./.env.openai:/app/.env:ro
```

Create separate `.env` files for each provider:

```bash
# .env.straico
PROVIDER_TYPE=straico
STRAICO_API_KEY=your_straico_key

# .env.openai
PROVIDER_TYPE=openai
OPENAI_API_KEY=your_openai_key
PROXY_PORT=8001
```

Start specific or all instances:

```bash
docker-compose up -d doai-proxy   # Straico only
docker-compose up -d openai-proxy # OpenAI only
docker-compose up -d              # all
```

## Troubleshooting

### Container Won't Start

```bash
docker logs doai-proxy
lsof -i :8000
docker-compose ps
sudo systemctl status docker
```

### Connection Refused

```bash
docker-compose ps
docker port doai-proxy
curl http://localhost:8000/health
```

### API Key Issues

```bash
docker exec doai-proxy cat /app/.env
docker exec doai-proxy env | grep API_KEY
docker exec doai-proxy env | grep PROVIDER_TYPE
```

Test your key directly with the provider:

```bash
curl https://api.straico.com/v2/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Timeout Waiting for Response

Increase the timeout in `.env`:

```bash
STRAICO_API_TIMEOUT=120000  # 2 minutes
```

Check provider status and network connectivity:

```bash
curl https://api.straico.com/v2/health
ping api.straico.com
```

### Tool Calls Not Being Detected

Enable debug logging and inspect:

```bash
LOG_LEVEL=debug
docker-compose restart
docker logs doai-proxy | grep -i "tool_call"
```

### Streaming Feels Unnatural

Adjust chunk size and delay in `.env`:

```bash
STREAM_CHUNK_SIZE=20  # larger chunks
STREAM_DELAY_MS=50    # faster delay
```

See [Streaming Guide](/guides/streaming) for tuning details.

### 500 Internal Server Error

```bash
docker logs doai-proxy
curl https://api.straico.com/v2/models \
  -H "Authorization: Bearer YOUR_KEY"
```

Check the logs for error details and verify the provider API is accessible.
