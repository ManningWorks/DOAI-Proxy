---
title: Configuration Reference
description: Complete reference for all DOAI Proxy environment variables and configuration options.
---

# Configuration Reference

All configuration is handled through environment variables. You can set them in a `.env` file in the project root or export them directly in your shell.

## Provider Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PROVIDER_TYPE` | Provider type to use | `straico` |

## Straico Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `STRAICO_API_KEY` | Your Straico API key (required when `PROVIDER_TYPE=straico`) | — (required) |
| `STRAICO_API_URL` | Straico API base URL | `https://api.straico.com/v2` |
| `STRAICO_API_TIMEOUT` | Straico API timeout (ms) | `60000` |
| `MODEL_LIMITS_REFRESH_INTERVAL` | Interval in ms to refresh model limits from Straico API. Set to `0` or leave unset to disable. Example: `1800000` = 30 minutes | unset (disabled) |
| `TOOL_RESULT_MAX_LENGTH` | Max character length for tool result messages sent to provider. Set to `-1` or leave unset to disable truncation | unset (no truncation) |

## Proxy Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PROXY_PORT` | Proxy server port | `8000` |

## Authentication

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_MODE` | Authentication mode: `required`, `optional`, `disabled`, `external` | `required` (production) / `optional` (development) |
| `PROXY_API_KEY` | Proxy API key (required when `AUTH_MODE=required` or `optional`) | — |
| `EXTERNAL_AUTH_HEADER` | External auth header name (when `AUTH_MODE=external`) | — |

:::info
See [Authentication Guide](/guides/authentication) for full details on configuring auth modes and integrating with external auth systems.
:::

## Streaming Simulation

| Variable | Description | Default |
|----------|-------------|---------|
| `STREAM_MODE` | Streaming mode: `none` (fastest) or `smart` (demo/showcase) | `none` |
| `STREAM_CHUNK_SIZE` | Characters per SSE chunk (smart mode only) | `15` |
| `STREAM_DELAY_MS` | Delay between chunks in ms (smart mode only) | `80` |

:::info
See [Streaming Guide](/guides/streaming) for details on how streaming simulation works and when to use it.
:::

## Conversation Summarization

| Variable | Description | Default |
|----------|-------------|---------|
| `SUMMARIZATION_ENABLED` | Enable conversation summarization for long sessions | `false` |
| `SUMMARIZATION_THRESHOLD_PCT` | Percentage of model context limit that triggers summarization | `70` |
| `SUMMARIZATION_KEEP_MESSAGES` | Number of recent messages to keep verbatim | `10` |
| `SUMMARIZATION_MODEL` | Model for summarization. `"auto"` uses Straico's smart_llm_selector | `auto` |
| `SUMMARIZATION_TIMEOUT` | Timeout in ms for summarization API calls | `15000` |

:::info
See [Summarization Guide](/guides/summarization) for details on how conversation summarization works and tuning tips.
:::

## Retry Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `RETRY_MAX_ATTEMPTS` | Maximum retry attempts for transient upstream errors (429, 5xx, network). Set to `1` to disable. | `3` |
| `RETRY_BASE_DELAY_MS` | Base delay in ms for exponential backoff. Actual = `base * 2^(attempt-1) + jitter` | `1000` |

## Logging

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging verbosity: `debug`, `info`, `warn`, `error` | `info` |
| `MAX_LOG_SIZE` | Max log file size in MB before rotation | `50` |
| `MAX_LOG_FILES` | Number of archived log files to keep | `5` |

## Environment

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment tag | `development` |
| `SHUTDOWN_TIMEOUT` | Grace period for in-flight requests during shutdown (ms) | `30000` |

## Provider-Specific Configuration

### Straico (Default)

```bash
PROVIDER_TYPE=straico
STRAICO_API_KEY=your_key
STRAICO_API_URL=https://api.straico.com/v2
```

### OpenAI (Coming Soon)

```bash
PROVIDER_TYPE=openai
OPENAI_API_KEY=your_key
OPENAI_API_URL=https://api.openai.com/v1
```
