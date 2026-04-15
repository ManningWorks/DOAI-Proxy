---
title: Error Codes
description: Reference for error codes, HTTP status codes, and error response formats used by DOAI Proxy
---

# Error Codes

The proxy maps errors to appropriate HTTP status codes and OpenAI-compatible error types.

## Error Response Format

```json
{
  "error": {
    "message": "Description of the error",
    "type": "error_type"
  }
}
```

## HTTP Status Codes

### Client Errors

| Status | Type | Cause |
|--------|------|-------|
| 400 | `invalid_request_error` | Invalid messages, missing model, context limit exceeded |
| 401 | `authentication_error` | Invalid or missing API key |
| 503 | `service_unavailable` | Server is shutting down, try again later |

### Upstream Errors

| Status | Type | Cause |
|--------|------|-------|
| Same as upstream | `upstream_error` | Forwarded from provider API (4xx/5xx from provider) |
| 502 | `upstream_error` | `ECONNREFUSED`, `ENOTFOUND`, `ECONNRESET` |
| 504 | `upstream_error` | `ETIMEDOUT`, `ECONNABORTED` |

### Server Errors

| Status | Type | Cause |
|--------|------|-------|
| 500 | `internal_error` | Unexpected server error |

## Context Validation Errors

The proxy validates that input + output tokens don't exceed the model's context limit. If exceeded:

```json
{
  "error": {
    "message": "Input too long: estimated X tokens exceeds model limit of Y tokens",
    "type": "invalid_request_error"
  }
}
```

Input tokens are estimated as `JSON.stringify(messages).length / 3.5`.

## Retry Behavior

When `RETRY_MAX_ATTEMPTS` > 1, the proxy automatically retries transient upstream errors:

- **Retried**: 429 (rate limit), 5xx (server errors), network errors
- **Not retried**: 4xx client errors (except 429)

Retries use exponential backoff with jitter:
- Actual delay = `RETRY_BASE_DELAY_MS * 2^(attempt-1) + random jitter`
- Default: 1000ms base, 3 max attempts

## Graceful Shutdown

During shutdown (`SIGTERM` / `SIGINT`), new requests receive `503`:

```json
{
  "error": {
    "message": "Server is shutting down",
    "type": "service_unavailable"
  }
}
```
