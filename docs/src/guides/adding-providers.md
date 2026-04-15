---
title: Adding a New Provider
description: Learn how to add a new AI provider to DOAI Proxy by implementing the BaseProvider interface, registering it in the factory, and configuring environment variables.
---

# Adding a New Provider

This guide explains how to add a new AI provider to DOAI Proxy.

## Provider Interface

All providers must implement the `BaseProvider` class from `providers/base-provider.js`.

### Required Methods

Your provider class must implement these methods:

```javascript
import { BaseProvider } from './base-provider.js';

export class YourProvider extends BaseProvider {
  getType() {
    return 'yourprovider';
  }

  getName() {
    return 'yourprovider';
  }

  validateConfig() {
    const apiKey = process.env.YOUR_API_KEY;
    if (!apiKey) {
      throw new Error('YOUR_API_KEY is required');
    }
    return true;
  }

  transformRequest(openAIRequest) {
    const { messages, model, tools, ...otherParams } = openAIRequest;

    return {
      model: model,
      messages: messages,
    };
  }

  transformResponse(providerResponse) {
    return {
      id: providerResponse.data.id,
      object: 'chat.completion',
      created: providerResponse.data.created,
      model: providerResponse.data.model,
      choices: providerResponse.data.choices,
      usage: providerResponse.data.usage,
    };
  }

  async makeRequest(request) {
    const response = await axios.post(
      `${this.config.apiUrl}/chat/completions`,
      request,
      {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: this.config.timeout,
      }
    );
    return response;
  }

  supportsStreaming() {
    return true;
  }

  supportsTools() {
    return true;
  }
}
```

## Registration

Register your provider in `providers/provider-factory.js`:

```javascript
import { YourProvider } from './yourprovider-provider.js';

export class ProviderFactory {
  static create(providerType, env) {
    const type = providerType?.toLowerCase() || 'straico';

    switch (type) {
      case 'yourprovider':
        return new YourProvider(env);

      // ... other cases

      default:
        throw new Error(`Unknown provider type: ${providerType}`);
    }
  }
}
```

## Configuration

Add environment variables to `.env.example`:

```bash
# YourProvider Configuration
YOUR_API_KEY=your_api_key_here
YOUR_API_URL=https://api.yourprovider.com/v1
YOUR_API_TIMEOUT=60000
```

## Reusing Existing Modules

### Streaming

If your provider doesn't support native streaming, you can reuse the [simulated streaming](/guides/streaming) module:

```javascript
import { simulateStream } from '../streaming.js';

if (req.body.stream && !this.supportsStreaming()) {
  await simulateStream(aiResponse, res, {
    chunkSize: parseInt(process.env.STREAM_CHUNK_SIZE) || 15,
    delay: parseInt(process.env.STREAM_DELAY_MS) || 80,
  });
}
```

### Tools

If your provider doesn't support native function calling, you can reuse the [prompt injection](/guides/function-calling) module:

```javascript
import { injectToolsIntoSystem, parseToolCall, formatToolCallResponse } from '../tools.js';

const processedMessages = injectToolsIntoSystem(messages, tools);
```

## Testing Your Provider

### 1. Set Provider Type

Add to your `.env` file:

```bash
PROVIDER_TYPE=yourprovider
YOUR_API_KEY=your_actual_key
```

### 2. Start the Proxy

```bash
npm start
```

### 3. Test with OpenAI-Compatible Client

Test with curl:

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-model-name",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Examples

See existing providers for reference:

- **Straico Provider** (`providers/straico-provider.js`) — Simulated streaming (no native support), prompt injection for tools (no native support), OpenAI-compatible request/response format. Good example of non-native providers.

## Best Practices

1. **Keep provider-specific logic isolated** — Don't mix providers. Each provider should be self-contained.

2. **Reuse existing utilities** — Use `simulateStream()` for non-native streaming, `injectToolsIntoSystem()` for non-native tools, and logging functions from `utils.js`.

3. **Handle errors gracefully** — Provide clear error messages, validate configuration on startup, and use try-catch for API calls.

4. **Support both streaming and non-streaming** — Let the client decide via the `stream: true/false` parameter. Implement `supportsStreaming()` correctly.

5. **Support both tools and non-tools** — Let the client decide via the `tools` parameter. Implement `supportsTools()` correctly.

6. **Log requests and responses** — Use `logRequest()` and `logResponse()` from `utils.js`, `logProviderResponse()` with provider type, and `logError()` for errors.

7. **Follow OpenAI compatibility** — Request format should match OpenAI's `/v1/chat/completions`, response format should match OpenAI's chat completion format, and SSE format should use the standard `data: {...}\n\n` pattern.

## Testing Checklist

Before submitting your provider:

- [ ] All required methods are implemented
- [ ] `validateConfig()` throws clear errors for missing config
- [ ] `transformRequest()` produces valid provider requests
- [ ] `transformResponse()` produces OpenAI-compatible responses
- [ ] `makeRequest()` handles timeouts and errors
- [ ] `supportsStreaming()` returns correct value
- [ ] `supportsTools()` returns correct value
- [ ] Non-streaming requests work correctly
- [ ] Streaming requests work correctly (native or simulated)
- [ ] Tool requests work correctly (native or prompt injection)
- [ ] Error messages are clear and helpful
- [ ] Environment variables are documented in `.env.example`
- [ ] Provider is added to `ProviderFactory`
- [ ] README.md is updated with provider information
