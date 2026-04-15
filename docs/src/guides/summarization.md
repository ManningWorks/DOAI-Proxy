---
title: Summarization
description: Enable conversation summarization for long sessions to stay within model context limits.
---

# Summarization

DOAI Proxy can automatically summarize older messages in long conversations to stay within a model's context limit. This is useful for extended sessions where the conversation history grows beyond what the model can handle.

## How It Works

When enabled, the proxy estimates input tokens from the message history. If the estimated tokens exceed a percentage of the model's context limit:

1. Older messages are replaced with a concise summary
2. Recent messages are kept verbatim
3. System messages are always preserved

The summarization is done by making a separate API call to the provider, asking it to summarize the conversation history.

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `SUMMARIZATION_ENABLED` | Enable conversation summarization | `false` |
| `SUMMARIZATION_THRESHOLD_PCT` | Percentage of context limit that triggers summarization | `70` |
| `SUMMARIZATION_KEEP_MESSAGES` | Number of recent messages to keep verbatim | `10` |
| `SUMMARIZATION_MODEL` | Model for summarization. `"auto"` uses smart_llm_selector | `auto` |
| `SUMMARIZATION_TIMEOUT` | Timeout in ms for summarization API calls | `15000` |

## Enabling Summarization

```bash
# Enable summarization
SUMMARIZATION_ENABLED=true

# Trigger when input exceeds 70% of model context
SUMMARIZATION_THRESHOLD_PCT=70

# Keep the last 10 messages verbatim
SUMMARIZATION_KEEP_MESSAGES=10

# Use auto model selection for summarization
SUMMARIZATION_MODEL=auto

# Timeout after 15 seconds
SUMMARIZATION_TIMEOUT=15000
```

## Threshold Percentage

The `SUMMARIZATION_THRESHOLD_PCT` controls when summarization kicks in:

- **Lower values** (e.g., 50): More aggressive summarization, triggers sooner
- **Higher values** (e.g., 85): Less aggressive, only triggers when context is nearly full
- **Default (70)**: Good balance between context utilization and summarization frequency

Input tokens are estimated as `JSON.stringify(messages).length / 3.5`. The proxy compares `estimatedTokens + outputTokens` against `model.word_limit * (threshold / 100)`.

## Model Selection

The `SUMMARIZATION_MODEL` setting determines which model generates summaries:

- **`auto`** (default): Uses Straico's `smart_llm_selector` with `pricing_method: "balance"` for automatic, cost-optimized model selection
- **Specific model ID**: Use any supported model (e.g., `meta-llama/llama-3.1-8b-instruct`)

Using a smaller, faster model for summarization can reduce cost while still producing useful summaries.

## Timeout Behavior

If the summarization API call exceeds `SUMMARIZATION_TIMEOUT` (default 15 seconds), the proxy falls back to sending the original, unsummarized messages. This ensures the conversation continues even if summarization fails or times out.

## What Gets Preserved

- **System messages**: Always preserved verbatim, never summarized
- **Recent messages**: The last `SUMMARIZATION_KEEP_MESSAGES` messages (default 10) are kept verbatim
- **Older messages**: Replaced with a summary

## Context Validation

The proxy also validates total context independently of summarization. If input tokens + output tokens exceed the model's limit, the request is rejected with a `400` error. Summarization helps prevent this from happening by reducing the input size proactively.

See [Configuration](/guides/configuration) for all environment variables and [Error Codes](/api/error-codes) for context validation errors.
