---
title: Streaming
description: How streaming works in DOAI Proxy, including simulated SSE streaming, configuration options, and streaming modes.
---

# Streaming

DOAI Proxy supports streaming even when the underlying provider doesn't support native streaming. The proxy accepts requests with `stream: true`, makes a non-streaming call to the provider, waits for the full response, then simulates SSE streaming.

## How It Works

1. Proxy accepts requests with `stream: true`
2. Makes non-streaming call to provider API
3. Waits for full response
4. Chunks response based on `STREAM_MODE` setting
5. Sends chunks as SSE (Server-Sent Events)
6. Sends `[DONE]` marker when complete

## Streaming Modes

### `none` (default, recommended)

Send response as-is with zero artificial delays.

- 100% formatting preserved
- Fastest response time
- Recommended for production use

The entire text is sent as one SSE chunk with `finish_reason: null`, immediately followed by a `finish_reason: "stop"` chunk and `[DONE]`.

### `smart` (demo/showcase only)

Simulated streaming with boundary-aware chunking.

- May occasionally split markdown formatting (~90% preserved)
- Slower than `none` mode due to artificial delays
- For demos or when streaming visual effect is desired

Smart mode uses `smartChunkText()` which segments text by trying to break at newlines, then whitespace, then extends to avoid splitting Markdown delimiters (`**`, `__`, ` ``` `, backticks).

## Configuration

```bash
# Production: fastest, no formatting issues
STREAM_MODE=none

# Demo/showcase: character-by-character streaming
STREAM_MODE=smart
```

### Adjusting Smart Mode

```bash
# Smoother, faster
STREAM_CHUNK_SIZE=25
STREAM_DELAY_MS=40

# More realistic, slower
STREAM_CHUNK_SIZE=8
STREAM_DELAY_MS=100
```

| Variable | Description | Default |
|----------|-------------|---------|
| `STREAM_MODE` | `none` or `smart` | `none` |
| `STREAM_CHUNK_SIZE` | Target chars per SSE chunk (smart mode) | `15` |
| `STREAM_DELAY_MS` | Delay between chunks in ms (smart mode) | `80` |

## SSE Format

Both modes set `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.

```
data: {"id":"chatcmpl-12345","object":"chat.completion.chunk","created":1234567890,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-12345","object":"chat.completion.chunk","created":1234567890,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}

data: {"id":"chatcmpl-12345","object":"chat.completion.chunk","created":1234567890,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

## Limitations

- **Simulated, not real-time**: Streaming is simulated by chunking non-streaming responses
- **Total time**: Longer responses take proportionally longer to stream in smart mode
- **Smart mode**: May occasionally split markdown in complex cases (~90% preserved)
- **No actual streaming benefit**: Smart mode adds delays, making it slower than none mode

## Next Steps

- [Streaming Examples](/examples/streaming) — usage examples for streaming requests
- [Configuration](/guides/configuration) — full reference for all environment variables
