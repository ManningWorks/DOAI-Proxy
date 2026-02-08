# Docker Deployment Guide

This guide helps you deploy the AI Provider Proxy on any machine using Docker.

## Prerequisites

- Docker installed (version 20.10 or higher)
- Docker Compose installed
- API key for your chosen provider (Straico, OpenAI, etc.)

## Quick Start

### 1. Clone or Copy the Project

```bash
# Clone from repository (if available)
git clone <repository-url>
cd ai-provider-proxy

# OR copy project files to target machine
# - server.js
# - streaming.js
# - tools.js
# - utils.js
# - providers/
# - package.json
# - Dockerfile
# - docker-compose.yml
# - .env.example
```

### 2. Configure Environment

```bash
# Create .env file
cp .env.example .env

# Edit .env and add your provider's API key
nano .env  # or use your preferred editor
```

**Required configuration in `.env`:**

**For Straico (default provider):**
```bash
PROVIDER_TYPE=straico
STRAICO_API_KEY=your_actual_straico_api_key_here
STRAICO_API_URL=https://api.straico.com/v2
PROXY_PORT=8000
STREAM_CHUNK_SIZE=15
STREAM_DELAY_MS=80
LOG_LEVEL=info
```

**For other providers (when available):**
See provider-specific configuration examples in the Configuration section below.

### 3. Build and Start Container

```bash
# Build and start in detached mode
docker-compose up -d --build

# Check container status
docker-compose ps

# View logs
docker logs ai-provider-proxy
```

### 4. Verify Deployment

```bash
# Check health endpoint
curl http://localhost:8000/health

# Expected output:
# {"status":"ok","service":"straico-proxy","timestamp":"2026-02-04T23:30:00.000Z"}
```

### 5. Test the Proxy

```bash
# Basic chat test
curl -X POST http://localhost:8000/v2/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-sonnet-4.5",
    "messages": [{"role": "user", "content": "Hello, world!"}],
    "stream": false
  }'
```

## Configuration

### Quick Start with Straico (Default)

If you just want to get started with Straico quickly:

```bash
# Create .env with Straico configuration
cat > .env << 'EOF'
PROVIDER_TYPE=straico
STRAICO_API_KEY=your_actual_straico_api_key_here
STRAICO_API_URL=https://api.straico.com/v2
PROXY_PORT=8000
STREAM_CHUNK_SIZE=15
STREAM_DELAY_MS=80
LOG_LEVEL=info
EOF

# Start the proxy
docker-compose up -d --build
```

### Full Configuration Options

#### Required Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `STRAICO_API_KEY` | Your Straico API key (if PROVIDER_TYPE=straico) | - (required) |
| `OPENAI_API_KEY` | Your OpenAI API key (if PROVIDER_TYPE=openai) | - (required when using OpenAI) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (if PROVIDER_TYPE=anthropic) | - (required when using Anthropic) |

#### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PROVIDER_TYPE` | Provider type to use | `straico` |
| `STRAICO_API_URL` | Straico API base URL | `https://api.straico.com/v2` |
| `STRAICO_API_TIMEOUT` | Straico API timeout (ms) | `60000` |
| `OPENAI_API_URL` | OpenAI API base URL | `https://api.openai.com/v1` |
| `OPENAI_API_TIMEOUT` | OpenAI API timeout (ms) | `60000` |
| `ANTHROPIC_API_URL` | Anthropic API base URL | `https://api.anthropic.com` |
| `ANTHROPIC_API_TIMEOUT` | Anthropic API timeout (ms) | `60000` |
| `PROXY_PORT` | Proxy server port | `8000` |
| `STREAM_CHUNK_SIZE` | Characters per SSE chunk | `15` |
| `STREAM_DELAY_MS` | Delay between chunks (ms) | `80` |
| `LOG_LEVEL` | Logging verbosity (debug, info, warn, error) | `info` |

### Provider-Specific Configuration

#### Straico (Current Default)

```bash
PROVIDER_TYPE=straico
STRAICO_API_KEY=your_straico_api_key
STRAICO_API_URL=https://api.straico.com/v2
```

#### OpenAI (Coming Soon)

```bash
PROVIDER_TYPE=openai
OPENAI_API_KEY=your_openai_api_key
OPENAI_API_URL=https://api.openai.com/v1
```

#### Anthropic (Coming Soon)

```bash
PROVIDER_TYPE=anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_API_URL=https://api.anthropic.com
```

### Tuning Streaming

Adjust these values to control how streaming feels:

- **Larger chunks** (e.g., `STREAM_CHUNK_SIZE=25`, `STREAM_DELAY_MS=40`) → Smoother, faster
- **Smaller chunks** (e.g., `STREAM_CHUNK_SIZE=8`, `STREAM_DELAY_MS=100`) → More realistic, slower

## Container Management

### Start/Stop/Restart

```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# Restart
docker-compose restart

# View logs (follow)
docker logs ai-provider-proxy -f
```

### Update Configuration

```bash
# Edit .env file
nano .env

# Restart container to apply changes
docker-compose restart
```

### Rebuild After Code Changes

```bash
# Rebuild and start
docker-compose up -d --build

# Or force rebuild (completely recreate)
docker-compose down
docker-compose up -d --build --force-recreate
```

## Configure Clients

### OpenCode Configuration Example

**Note:** This is an example configuration for OpenCode. Adjust based on your needs.

After the proxy is running, update OpenCode's configuration:

1. Run OpenCode
2. Open Settings → AI Providers
3. Add new provider configuration:

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
    // Add more models as needed
  }
}
```

**Note on Models:**
The models listed above are examples available through Straico. The actual available models depend on:
1. Your provider configuration (Straico, OpenAI, etc.)
2. Your account's access level
3. Provider's supported models

Check your provider's documentation for the complete list of available models.

Then in OpenCode:
1. Run `/models` command to refresh model list
2. Select your provider and model
3. Start chatting!

## Network Access

### Localhost Access (Default)

By default, the proxy listens on `http://localhost:8000`.

### Remote Access

To access the proxy from another machine or expose it publicly:

#### Option 1: Expose on All Interfaces (Simple)

Edit `docker-compose.yml`:
```yaml
services:
  ai-provider-proxy:
    # ... other config ...
    ports:
      - "0.0.0.0:8000"  # Expose on all interfaces
```

Then access via:
- `http://<server-ip>:8000` from other machines
- `http://<server-ip>:8000/health` for health check

#### Option 2: Use SSH Tunneling (From client machine)

```bash
# From client machine (where OpenCode is running)
ssh -L 8000:localhost:8000 user@server

# Then access via http://localhost:8000
```

#### Option 3: Reverse Proxy (Production)

Use Nginx, Caddy, or another reverse proxy for HTTPS and authentication:

**Nginx Example:**
```nginx
server {
    listen 80;
    server_name your-proxy-domain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # Optional: Add authentication
        # auth_basic "Restricted";
        # auth_basic_user_file /etc/nginx/.htpasswd;
    }
}
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs ai-provider-proxy

# Check if port is in use
lsof -i :8000

# Check container status
docker-compose ps

# Check Docker daemon
sudo systemctl status docker
```

### Connection Refused

```bash
# Verify container is running
docker-compose ps

# Verify port is exposed
docker port ai-provider-proxy

# Check health endpoint
curl http://localhost:8000/health
```

### API Key Issues

```bash
# Check .env is mounted correctly
docker exec ai-provider-proxy cat /app/.env

# Verify environment variables
docker exec ai-provider-proxy env | grep API_KEY

# Check which provider you're using
docker exec ai-provider-proxy env | grep PROVIDER_TYPE

# Test API key directly with provider
# For Straico:
curl https://api.straico.com/v2/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Timeout Waiting for Response

```bash
# Increase timeout in .env
STRAICO_API_TIMEOUT=120000  # 2 minutes

# Check provider status
# For Straico:
curl https://api.straico.com/v2/health

# Check your network connection
ping api.straico.com
```

### Tool Calls Not Being Detected

```bash
# Enable debug logging
LOG_LEVEL=debug
docker-compose restart

# Check logs for AI response format
docker logs ai-provider-proxy | grep -i "tool_call"
```

### Streaming Feels Unnatural

```bash
# Adjust in .env
STREAM_CHUNK_SIZE=20  # Larger chunks
STREAM_DELAY_MS=50     # Faster delay

# Restart to apply changes
docker-compose restart
```

### 500 Internal Server Error

```bash
# Check error details in logs
docker logs ai-provider-proxy

# Check provider API is accessible
# For Straico:
curl https://api.straico.com/v2/models \
  -H "Authorization: Bearer YOUR_KEY"

# Report error with full logs
```

## Production Considerations

### Security

1. **Never expose `.env` publicly** - ensure `.gitignore` includes it
2. **Use strong API keys** - Obtain your provider API key from official sources
3. **Keep API keys secret** - Never share or commit API keys
4. **Use HTTPS in production** - Add a reverse proxy with SSL when exposing publicly
5. **Add authentication** - Consider implementing API key authentication for the proxy itself if deploying to public servers
6. **Monitor logs** - Regularly check for suspicious activity in `server.log` and `requests.log`

### Performance

1. **Adjust streaming parameters** in `.env`:
   ```bash
   STREAM_CHUNK_SIZE=20  # Larger chunks
   STREAM_DELAY_MS=50     # Faster delay
   ```

2. **Resource limits** in `docker-compose.yml`:
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '1.0'
         memory: 512M
   ```

3. **Monitoring**:
   ```bash
   # View resource usage
   docker stats ai-provider-proxy

   # View logs in real-time
   docker logs ai-provider-proxy -f

   # Check container health
   docker inspect ai-provider-proxy --format='{{.State.Health.Status}}'
   ```

### Backup and Restore

```bash
# Export container configuration
docker inspect ai-provider-proxy > ai-provider-proxy-config.json

# Backup .env file (don't commit to git!)
cp .env .env.backup

# Restore on new machine
# 1. Copy .env to new machine
# 2. Run docker-compose up -d
```

## Multi-Provider Deployment

### Running Multiple Provider Instances

To run multiple provider instances simultaneously:

```yaml
version: '3.8'

services:
  # Straico Instance
  straico-proxy:
    build: .
    container_name: straico-proxy
    ports:
      - "8000:8000"
    env_file:
      - .env.straico
    restart: unless-stopped
     volumes:
       - ./.env.straico:/app/.env:ro
       - ./logs:/app/logs:ro
       # Logs directory for organized log files

  # OpenAI Instance (when available)
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
```

Start specific instances:
```bash
# Start only Straico
docker-compose up -d straico-proxy

# Start only OpenAI
docker-compose up -d openai-proxy

# Start all
docker-compose up -d
```

## Available Models

The proxy works with models provided by your configured provider:

### Straico Models

Common Straico v2 models include:
- `anthropic/claude-sonnet-4.5` - Anthropic: Claude Sonnet 4.5
- `deepseek/deepseek-chat` - DeepSeek V3
- `anthropic/claude-3.7-sonnet` - Anthropic: Claude 3.7 Sonnet

See [Straico documentation](https://docs.straico.com) for the complete list of available models and their capabilities.

### OpenAI Models (Coming Soon)

Will support standard OpenAI models when OpenAI provider is implemented:
- `gpt-4o` - OpenAI: GPT-4o
- `gpt-4o-mini` - OpenAI: GPT-4o Mini
- `gpt-4-turbo` - OpenAI: GPT-4 Turbo

### Provider-Specific Models

Each provider has its own set of available models. To see what models are available:

1. Check your provider's API documentation
2. Test with `/v2/models` endpoint (when implemented)
3. Configure specific models in your client (e.g., OpenCode)

## Next Steps

After deploying successfully:

1. **Test with multiple models** - Try different provider models
2. **Monitor performance** - Adjust streaming parameters for your use case
3. **Review logs regularly** - Check `requests.log` for usage patterns
4. **Configure your client** - Add proxy URL to your OpenAI-compatible application
5. **Deploy to remote server** (if needed) - Follow the "Remote Access" section above
6. **Add authentication** (if exposing publicly) - See "Security" section above

## Support

For issues or questions:
1. Check logs: `docker logs ai-provider-proxy`
2. Enable debug logging: Add `LOG_LEVEL=debug` to `.env` and restart
3. Test your provider's API directly with curl
4. Review main README.md for additional troubleshooting
5. Check provider's API status page

**For provider-specific support:**
- Straico: https://straico.com
- OpenAI: https://platform.openai.com
- Anthropic: https://anthropic.com

**For adding new providers:**
See [docs/ADDING_PROVIDERS.md](docs/ADDING_PROVIDERS.md) for detailed implementation guide.
