---
title: Production Deployment
description: Deploy DOAI Proxy to production with Docker, monitoring, and security best practices
---

# Production Deployment

## Docker Production Build

```bash
docker build -t doai-proxy:latest .
docker run -d \
  --name doai-proxy \
  --restart unless-stopped \
  -p 8000:8000 \
  --env-file .env \
  doai-proxy:latest
```

## Resource Limits

Add resource limits in `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 512M
```

## Monitoring

```bash
# View resource usage
docker stats doai-proxy

# View logs in real-time
docker logs doai-proxy -f

# Check container health
docker inspect doai-proxy --format='{{.State.Health.Status}}'
```

## Recommended Production Configuration

```bash
# Authentication
AUTH_MODE=required
PROXY_API_KEY=strong_random_key_here

# Streaming
STREAM_MODE=none

# Logging
LOG_LEVEL=info
MAX_LOG_SIZE=50
MAX_LOG_FILES=5

# Retries
RETRY_MAX_ATTEMPTS=3
RETRY_BASE_DELAY_MS=1000

# Summarization (optional, for long sessions)
SUMMARIZATION_ENABLED=true
SUMMARIZATION_THRESHOLD_PCT=70
```

## Security Enhancements

For production deployments, consider adding:

### Rate Limiting

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

app.use('/v1/', limiter);
```

### HTTPS via Reverse Proxy

Use Nginx, Caddy, or another reverse proxy for SSL:

```nginx
server {
    listen 443 ssl;
    server_name your-proxy-domain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Graceful Shutdown

The proxy handles `SIGTERM` / `SIGINT` gracefully:
- Sets `isShuttingDown = true`; new requests receive `503`
- Polls `activeRequests` counter every 100 ms
- Calls `server.close()` when drained
- Force-exits after `SHUTDOWN_TIMEOUT` (default 30 s)

## Backup and Restore

```bash
# Export container configuration
docker inspect doai-proxy > doai-proxy-config.json

# Backup .env file
cp .env .env.backup

# Restore on new machine
# 1. Copy .env to new machine
# 2. Run docker-compose up -d
```

## Next Steps

- [Security Guide](/guides/security)
- [Docker Guide](/guides/docker)
