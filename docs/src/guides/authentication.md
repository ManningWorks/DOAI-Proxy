---
title: Authentication
description: Configure authentication modes for DOAI Proxy using the AUTH_MODE environment variable
---

# Authentication

DOAI Proxy supports four authentication modes configured via `AUTH_MODE` environment variable. All auth checks use timing-safe comparison (`crypto.timingSafeEqual`) to prevent timing attacks.

## Modes

### `required` (recommended for production)

`PROXY_API_KEY` must be set. All `/v1/*` requests must carry `Authorization: Bearer <key>`. Requests without a valid key receive `401 Unauthorized`.

```bash
AUTH_MODE=required
PROXY_API_KEY=your_secret_key_here
```

### `optional` (good for development)

Auth is enforced only if `PROXY_API_KEY` is set. If no key is configured, all requests are allowed. In production, a warning is logged if no key is set.

```bash
AUTH_MODE=optional
PROXY_API_KEY=your_secret_key_here  # optional
```

### `disabled`

No authentication. All requests are allowed. A loud warning is emitted on startup. Use only in isolated environments.

```bash
AUTH_MODE=disabled
```

### `external`

Auth is handled by a downstream gateway (Kubernetes service mesh, API gateway, etc.). Optionally checks for the presence of a custom header via `EXTERNAL_AUTH_HEADER`.

```bash
AUTH_MODE=external
EXTERNAL_AUTH_HEADER=X-API-Gateway-Auth
```

## Client Configuration

When auth is enabled, configure your client to send the API key:

```bash
# With curl
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_proxy_api_key" \
  -d '{"model": "...", "messages": [...]}'
```

For OpenCode, add the API key to your configuration.

## Default Behavior

When `AUTH_MODE` is not explicitly set:
- **Production** (`NODE_ENV=production`): Defaults to `required`
- **Development** (`NODE_ENV=development`): Defaults to `optional`

## Security Considerations

- Use strong, randomly generated keys for `PROXY_API_KEY`
- Never commit API keys to version control
- Use HTTPS in production to protect keys in transit
- Consider adding rate limiting for production deployments (see [Production](/guides/production))
