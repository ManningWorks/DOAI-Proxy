---
title: Streaming Response
---

# Streaming Response

## Streaming Request

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_proxy_api_key" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Tell me a short story"}],
    "stream": true
  }'
```

## Response (SSE Format)

```
data: {"id":"chatcmpl-12345","object":"chat.completion.chunk","created":1234567890,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"content":"Once"},"finish_reason":null}]}

data: {"id":"chatcmpl-12345","object":"chat.completion.chunk","created":1234567890,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"content":" upon"},"finish_reason":null}]}

data: {"id":"chatcmpl-12345","object":"chat.completion.chunk","created":1234567890,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"content":" a time..."},"finish_reason":null}]}

data: {"id":"chatcmpl-12345","object":"chat.completion.chunk","created":1234567890,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

## Node.js Streaming Client

```javascript
import fetch from 'node-fetch';

const response = await fetch('http://localhost:8000/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your_proxy_api_key',
  },
  body: JSON.stringify({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'user', content: 'Tell me a short story' }
    ],
    stream: true,
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') break;
      const parsed = JSON.parse(data);
      const content = parsed.choices[0]?.delta?.content;
      if (content) process.stdout.write(content);
    }
  }
}
```

## Python Streaming Client

```python
import requests
import json

response = requests.post(
    'http://localhost:8000/v1/chat/completions',
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer your_proxy_api_key',
    },
    json={
        'model': 'gpt-3.5-turbo',
        'messages': [{'role': 'user', 'content': 'Tell me a short story'}],
        'stream': True,
    },
    stream=True,
)

for line in response.iter_lines():
    if line:
        line = line.decode('utf-8')
        if line.startswith('data: '):
            data = line[6:]
            if data == '[DONE]':
                break
            parsed = json.loads(data)
            content = parsed['choices'][0].get('delta', {}).get('content', '')
            if content:
                print(content, end='', flush=True)
```

For streaming configuration options, see [Streaming](/guides/streaming). For the full API reference, see [Endpoints](/api/endpoints).
