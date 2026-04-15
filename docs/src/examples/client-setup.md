---
title: Client Setup
---

# Client Setup

## OpenCode

After the proxy is running, update OpenCode's configuration. The proxy auto-syncs available models via the startup script.

### Configuration

Edit `~/.config/opencode/opencode.json` and add the DOAI Proxy provider:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "deepseek/deepseek-chat-v3.1",
  "provider": {
    "doai": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "DOAI Proxy",
      "options": {
        "baseURL": "http://localhost:8000/v1"
      },
      "models": {
        "anthropic/claude-sonnet-4.5": {
          "name": "Anthropic: Claude Sonnet 4.5"
        },
        "deepseek/deepseek-chat-v3.1": {
          "name": "DeepSeek: DeepSeek V3.1"
        },
        "openai/gpt-4o-mini": {
          "name": "OpenAI: GPT-4o Mini"
        }
      }
    }
  }
}
```

Key fields:
- **`model`** — The default model OpenCode uses (must match a model ID in your provider's `models` block)
- **`provider.<name>.options.baseURL`** — Points to your DOAI Proxy instance
- **`provider.<name>.models`** — Maps model IDs to display names; these correspond to models available through your upstream provider

Then in OpenCode:
1. Run `/models` command to refresh model list
2. Select your provider and model
3. Start chatting

**Note on Models:** The models listed above are examples. Actual available models depend on your upstream provider and account access level. Check your provider's documentation for the complete list.

## curl

Basic usage with curl. All examples assume the proxy is running on `http://localhost:8000`.

```bash
# Health check
curl http://localhost:8000/health

# Chat completion
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_proxy_api_key" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

## Node.js / OpenAI SDK

The proxy is compatible with the official OpenAI Node.js SDK:

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'your_proxy_api_key',
  baseURL: 'http://localhost:8000/v1',
});

const response = await client.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(response.choices[0].message.content);
```

## Python / OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(
    api_key='your_proxy_api_key',
    base_url='http://localhost:8000/v1',
)

response = client.chat.completions.create(
    model='gpt-3.5-turbo',
    messages=[{'role': 'user', 'content': 'Hello!'}],
)

print(response.choices[0].message.content)
```

## Any OpenAI-Compatible Client

Since DOAI Proxy presents a fully OpenAI-compatible API, any client that supports custom base URLs should work:

1. Set the **base URL** to `http://localhost:8000/v1`
2. Set the **API key** to your `PROXY_API_KEY`
3. Use any model supported by your provider

For Docker deployments with remote access, see [Docker Deployment](/guides/docker#network-access).
