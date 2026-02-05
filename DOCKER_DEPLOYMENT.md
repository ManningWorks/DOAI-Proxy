# Docker Deployment Guide

This guide helps you deploy the Straico Proxy on any machine using Docker.

## Prerequisites

- Docker installed (version 20.10 or higher)
- Docker Compose installed
- Straico API key

## Quick Start

### 1. Clone or Copy the Project

```bash
# Clone from repository (if available)
git clone <repository-url>
cd StraicoProxy

# OR copy the project files to the target machine
# - server.js
# - streaming.js
# - tools.js
# - utils.js
# - package.json
# - package-lock.json
# - Dockerfile
# - docker-compose.yml
# - .env.example
```

### 2. Configure Environment

```bash
# Create .env file
cp .env.example .env

# Edit .env and add your Straico API key
nano .env  # or use your preferred editor
```

**Required configuration in `.env`**:
```bash
STRAICO_API_KEY=your_actual_straico_api_key_here
STRAICO_API_URL=https://api.straico.com/v2
PROXY_PORT=8000
STREAM_CHUNK_SIZE=15
STREAM_DELAY_MS=80
LOG_LEVEL=info
```

### 3. Build and Start Container

```bash
# Build and start in detached mode
docker-compose up -d --build

# Check container status
docker-compose ps

# View logs
docker logs straico-proxy
```

### 4. Verify Deployment

```bash
# Check health endpoint
curl http://localhost:8000/health

# Expected output:
# {"status":"ok","service":"straico-proxy","timestamp":"..."}
```

### 5. Test the Proxy

```bash
# Basic chat test
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-sonnet-4.5",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

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
docker logs straico-proxy -f
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

# Or remove and rebuild completely
docker-compose down
docker-compose up -d --build --force-recreate
```

## Configure OpenCode

After the proxy is running, update `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "straico": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Straico",
      "options": {
        "baseURL": "http://localhost:8000/v1"
      },
      "models": {
        "anthropic/claude-sonnet-4.5": {
          "name": "Anthropic: Claude Sonnet 4.5"
        },
        "deepseek/deepseek-chat": {
          "name": "DeepSeek V3"
        }
        // Add more models as needed
      }
    }
  }
}
```

Then in OpenCode:
1. Run `/models` command
2. Select "Straico" provider
3. Choose your model
4. Start chatting!

## Network Access

### Localhost Access (Default)

By default, the proxy listens on `http://localhost:8000`.

### Remote Access

To access the proxy from another machine:

**Option 1: Expose on All Interfaces**

Edit `docker-compose.yml`:
```yaml
ports:
  - "0.0.0.0:8000:8000"
```

Then access via:
- `http://<server-ip>:8000` from other machines
- `http://<server-ip>:8000/health` for health check

**Option 2: Use SSH Tunneling**

```bash
# From client machine
ssh -L 8000:localhost:8000 user@server

# Then access via http://localhost:8000
```

**Option 3: Reverse Proxy (Production)**

Use Nginx or Caddy for HTTPS and authentication:
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

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs straico-proxy

# Check if port is in use
lsof -i :8000

# Check container status
docker-compose ps
```

### Connection Refused

```bash
# Verify container is running
docker-compose ps

# Verify port is exposed
docker port straico-proxy

# Check health endpoint
curl http://localhost:8000/health
```

### API Key Issues

```bash
# Check .env is mounted correctly
docker exec straico-proxy cat /app/.env

# Verify environment variables
docker exec straico-proxy env | grep STRAICO

# Test API key directly
curl https://api.straico.com/v2/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Outdated Container

```bash
# Rebuild with latest code
docker-compose down
docker-compose up -d --build --force-recreate

# Or pull updated image (if using registry)
docker-compose pull
docker-compose up -d
```

## Production Considerations

### Security

1. **Never expose `.env` publicly** - ensure `.gitignore` includes it
2. **Add authentication** - implement middleware in `server.js` if exposing publicly
3. **Use HTTPS** - set up reverse proxy with SSL
4. **Firewall rules** - restrict access to trusted IPs if possible
5. **Monitor logs** - regularly check for suspicious activity

### Performance

1. **Adjust streaming parameters** in `.env`:
   ```bash
   STREAM_CHUNK_SIZE=20  # Larger chunks = faster
   STREAM_DELAY_MS=50     # Shorter delay = faster
   ```

2. **Resource limits** in `docker-compose.yml`:
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '1.0'
         memory: 512M
   ```

### Monitoring

```bash
# View resource usage
docker stats straico-proxy

# View logs in real-time
docker logs straico-proxy -f

# Check container health
docker inspect straico-proxy --format='{{.State.Health.Status}}'
```

### Backup and Restore

```bash
# Export container configuration
docker inspect straico-proxy > straico-proxy-config.json

# Backup .env file (don't commit to git!)
cp .env .env.backup

# Restore on new machine:
# 1. Copy .env to new machine
# 2. Run docker-compose up -d
```

## Available Models

The proxy works with all Straico v2 models. Common options:

- `anthropic/claude-sonnet-4.5` - Anthropic: Claude Sonnet 4.5
- `deepseek/deepseek-chat` - DeepSeek V3
- `anthropic/claude-3.7-sonnet` - Anthropic: Claude 3.7 Sonnet Reasoning
- `openai/gpt-4o-mini` - OpenAI: GPT-4o mini
- `google/gemini-2.5-flash` - Google: Gemini 2.5 Flash

See Straico documentation for the complete list of available models.

## Next Steps

1. **Configure OpenCode** - Update `~/.config/opencode/opencode.json` with proxy URL
2. **Test with multiple models** - Try different Straico models
3. **Monitor performance** - Adjust streaming parameters for your use case
4. **Deploy to remote server** (if needed) - Follow "Remote Access" section above

## Support

For issues or questions:
1. Check logs: `docker logs straico-proxy`
2. Enable debug logging: Add `LOG_LEVEL=debug` to `.env` and restart
3. Test API key directly with Straico
4. Review main README.md for additional troubleshooting
