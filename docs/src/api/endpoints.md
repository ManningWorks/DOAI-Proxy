---
title: API Endpoints
description: Complete reference for DOAI Proxy API endpoints including chat completions, health checks, and model listing.
---

# API Endpoints

## POST /v1/chat/completions

Main chat endpoint supporting both streaming and function calling. Requires authentication when `AUTH_MODE` is not `disabled`.

### Request Format

```json
{
  "model": "gpt-3.5-turbo",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" }
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 1000,
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get current weather",
        "parameters": {
          "type": "object",
          "properties": {
            "location": { "type": "string" }
          }
        }
      }
    }
  ]
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes* | Model ID or omit/`"auto"` for Straico's smart model selector |
| `messages` | array | Yes | Array of message objects |
| `stream` | boolean | No | Enable SSE streaming |
| `temperature` | number | No | Sampling temperature (default: 0.7) |
| `max_tokens` | number | No | Maximum tokens in response |
| `tools` | array | No | Tool definitions for function calling |
| `replace_failed_models` | boolean | No | Let Straico substitute failed models |

*When using Straico with no model or `"auto"`, the smart_llm_selector is used with `pricing_method: "balance"`.

### Response: Non-Streaming

```json
{
  "id": "chatcmpl-12345",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-3.5-turbo",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 10,
    "total_tokens": 35
  }
}
```

### Response: Streaming (SSE)

```
data: {"id":"chatcmpl-12345","object":"chat.completion.chunk","created":1234567890,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-12345","object":"chat.completion.chunk","created":1234567890,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}

data: {"id":"chatcmpl-12345","object":"chat.completion.chunk","created":1234567890,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

See [Streaming](/guides/streaming) for mode configuration.

### Response: Function Call

```json
{
  "id": "chatcmpl-12345",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-3.5-turbo",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "tool_calls": [
          {
            "id": "call_1234567890",
            "type": "function",
            "function": {
              "name": "get_weather",
              "arguments": "{\"location\":\"Tokyo\"}"
            }
          }
        ],
        "content": null
      },
      "finish_reason": "tool_calls"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 10,
    "total_tokens": 35
  }
}
```

See [Function Calling](/guides/function-calling) for detailed tool use documentation.

**Note:** Usage fields always return zeros — no token count is computed by the proxy.

## GET /health

Health check endpoint. No authentication required.

**Response:**
```json
{
  "status": "ok",
  "service": "doai-proxy",
  "timestamp": "2026-02-04T23:30:00.000Z"
}
```

## GET /v1/models

List available models. Currently returns empty array (not fully implemented).
