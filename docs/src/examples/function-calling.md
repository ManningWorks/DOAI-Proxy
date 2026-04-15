# Function Calling

## Basic Tool Use

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_proxy_api_key" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "What is the weather in Tokyo?"}],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get current weather for a location",
          "parameters": {
            "type": "object",
            "properties": {
              "location": {
                "type": "string",
                "description": "City name"
              }
            },
            "required": ["location"]
          }
        }
      }
    ]
  }'
```

## Response

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
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

## Multi-Turn Tool Use (Sending Results Back)

After executing the tool, send the result back:

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_proxy_api_key" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [
      {"role": "user", "content": "What is the weather in Tokyo?"},
      {"role": "assistant", "content": null, "tool_calls": [
        {
          "id": "call_1234567890",
          "type": "function",
          "function": {
            "name": "get_weather",
            "arguments": "{\"location\":\"Tokyo\"}"
          }
        }
      ]},
      {"role": "tool", "tool_call_id": "call_1234567890", "content": "{\"temperature\": 22, \"condition\": \"sunny\"}"}
    ]
  }'
```

## Node.js Complete Tool Loop

```javascript
import fetch from 'node-fetch';

const API_URL = 'http://localhost:8000/v1/chat/completions';
const API_KEY = 'your_proxy_api_key';

async function chat(messages, tools = null) {
  const body = { model: 'gpt-3.5-turbo', messages };
  if (tools) body.tools = tools;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  return await response.json();
}

// Define tools
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City name' }
        },
        required: ['location']
      }
    }
  }
];

// Execute tool (your implementation)
function executeTool(name, args) {
  if (name === 'get_weather') {
    return { temperature: 22, condition: 'sunny' };
  }
}

// Run
const messages = [{ role: 'user', content: 'What is the weather in Tokyo?' }];
const response = await chat(messages, tools);

if (response.choices[0].finish_reason === 'tool_calls') {
  const toolCall = response.choices[0].message.tool_calls[0];
  const result = executeTool(
    toolCall.function.name,
    JSON.parse(toolCall.function.arguments)
  );

  messages.push(response.choices[0].message);
  messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
    content: JSON.stringify(result),
  });

  const finalResponse = await chat(messages);
  console.log(finalResponse.choices[0].message.content);
}
```

For details on how function calling works, see [Function Calling](/guides/function-calling).
