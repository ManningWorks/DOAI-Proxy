---
title: Troubleshooting
description: Diagnose and fix common issues with DOAI Proxy
---

# Troubleshooting

## Enable Debug Logging

Most issues can be diagnosed by enabling debug logging:

```bash
LOG_LEVEL=debug npm start
```

## Connection Refused

**Symptom**: `curl: (7) Failed to connect to localhost port 8000: Connection refused`

**Causes**: Proxy not running, wrong port, firewall blocking

**Solutions**:

1. Check if proxy is running: `curl http://localhost:8000/health`
2. Start the proxy: `npm start` or `docker-compose up -d`
3. Check port availability: `lsof -i :8000`

## 401 Unauthorized

**Symptom**: `{"error":{"message":"Invalid API key","type":"invalid_request_error"}}`

**Causes**: Invalid or missing provider API key

**Solutions**:

1. Verify `.env` file exists and contains your API key: `cat .env | grep API_KEY`
2. Check which provider you're using: `cat .env | grep PROVIDER_TYPE`
3. Test your API key directly with the provider
4. Ensure you copied `.env.example` to `.env` and filled it in

## Timeout Waiting for Response

**Symptom**: `Error: timeout of 60000ms exceeded`

**Causes**: Provider API is slow, network issues, timeout too short

**Solutions**:

1. Increase timeout: `STRAICO_API_TIMEOUT=120000`
2. Check provider status
3. Check your network connection

## Tool Calls Not Being Detected

**Symptom**: AI response doesn't trigger tool calls or returns plain text instead

**Causes**: AI not following the format, tool definitions too complex, system prompt not clear

**Solutions**:

1. Enable debug logging: `LOG_LEVEL=debug npm start`
2. Check logs for AI response format
3. Simplify tool definitions
4. Try adding explicit instruction in system prompt

## Streaming Feels Unnatural

**Symptom**: Streaming text is too choppy or too slow

**Solutions**:

1. Use `STREAM_MODE=none` for production (recommended)
2. Adjust smart mode parameters:
   ```bash
   STREAM_CHUNK_SIZE=20  # Larger chunks
   STREAM_DELAY_MS=50    # Faster delay
   ```

## 500 Internal Server Error

**Symptom**: Server returns 500 error with stack trace

**Solutions**:

1. Check error details: `LOG_LEVEL=debug npm start`
2. Check provider API is accessible
3. Report error with full logs

## Docker Issues

### Container Won't Start

```bash
docker logs doai-proxy
lsof -i :8000
docker-compose ps
```

### API Key Issues in Docker

```bash
docker exec doai-proxy cat /app/.env
docker exec doai-proxy env | grep API_KEY
```

## Getting Help

1. Check the relevant guide in these docs
2. Enable debug logging: `LOG_LEVEL=debug`
3. Review logs for error messages
4. Test your provider's API directly with curl

**Provider support**:

- Straico: https://straico.com
- OpenAI: https://platform.openai.com
- Anthropic: https://anthropic.com
