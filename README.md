# Straico Proxy

Local proxy for Straico's API that adds streaming and function calling support, making it compatible with tools like OpenCode that require these features.

## What This Project Does

Straico's API is OpenAI-compatible but lacks two critical features:
- **Streaming responses** - Real-time text generation
- **Function calling / tool use** - Ability to call external functions

This proxy sits between OpenCode/your app and Straico, simulating these missing features by:

1. **Streaming Simulation**: Converts non-streaming Straico responses into Server-Sent Events (SSE) with simulated chunking and delays
2. **Function Calling**: Converts tool definitions into system prompts and parses AI responses to detect and format tool calls
3. **OpenAI Compatibility**: Presents an OpenAI-compatible API interface (`/v1/chat/completions`)

## Architecture

```
OpenCode Client / Application
    ↓ (expects streaming + function calls)
Proxy Server (localhost:8000)
    ↓ (transforms requests to Straico format)
Straico API (no streaming, no function calls)
```

### Key Components

- **server.js** - Express server that handles all requests and orchestrates proxy logic
- **streaming.js** - Module that converts non-streaming responses into SSE format with delays
- **tools.js** - Module that handles function calling by injecting tools into prompts and parsing responses
- **utils.js** - Helper functions for logging, delays, and response formatting

## Installation

### Prerequisites

- Node.js 18 or higher
- Straico API key (obtain from [straico.com](https://straico.com))

### Setup Steps

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd straico-proxy
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Straico API key:
   ```bash
   STRAICO_API_KEY=your_actual_api_key_here
   ```

4. **Run the proxy**:
   ```bash
   npm start
   ```

   Or run in development mode with hot-reload:
   ```bash
   npm run dev
   ```

5. **Verify it's working**:
   ```bash
   curl http://localhost:8000/health
   ```
   
   Expected output:
   ```json
   {"status":"ok","service":"straico-proxy","timestamp":"2026-02-04T23:30:00.000Z"}
   ```

## Configuration

Environment variables are defined in `.env`:

### Required

| Variable | Description | Default |
|----------|-------------|---------|
| `STRAICO_API_KEY` | Your Straico API key | - (required) |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `STRAICO_API_URL` | Straico API base URL | `https://api.straico.com/v1` |
| `PROXY_PORT` | Proxy server port | `8000` |
| `STREAM_CHUNK_SIZE` | Characters per SSE chunk | `15` |
| `STREAM_DELAY_MS` | Delay between chunks (ms) | `80` |
| `LOG_LEVEL` | Logging verbosity | `info` |

### Tuning Streaming

Adjust these values to control how the streaming feels:

- **Larger chunks** (e.g., `STREAM_CHUNK_SIZE=25`, `STREAM_DELAY_MS=40`) → Smoother, faster
- **Smaller chunks** (e.g., `STREAM_CHUNK_SIZE=8`, `STREAM_DELAY_MS=100`) → More realistic, slower

## How It Works

### Streaming Simulation

1. Proxy accepts requests with `stream: true`
2. Makes non-streaming call to Straico API
3. Waits for full response
4. Splits response into chunks (default 15 characters each)
5. Adds delay between chunks (default 80ms)
6. Sends chunks as SSE (Server-Sent Events)
7. Sends `[DONE]` marker when complete

**Why 15 chars / 80ms?**
- 15 chars = readable chunks that aren't too choppy
- 80ms = feels like real streaming (similar to actual LLM streaming)
- Total time for 500-word response: ~40-60 seconds (realistic)

### Function Calling

1. **Request Processing**: Proxy detects if request includes `tools` parameter
2. **Tool Injection**: Converts tool definitions into system prompt instructions
3. **Prompt Formatting**: Tells AI to use format: `TOOL_CALL: name\nARGUMENTS: {json}`
4. **Response Parsing**: Checks AI response for tool call pattern
5. **Tool Call Detection**: Extracts tool name and arguments from response
6. **Response Formatting**: Returns tool call object with `finish_reason: 'tool_calls'`
7. **Multi-turn Support**: Client can execute tool and send result back as `role: 'tool'` message

**Example Tool Format**:
```javascript
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": { "type": "string", "description": "City name" }
          },
          "required": ["location"]
        }
      }
    }
  ]
}
```

**AI Response Format**:
```
I can help you check the weather. Let me get that information for you.
TOOL_CALL: get_weather
ARGUMENTS: {"location": "Tokyo"}
```

**Tool Call Object Returned**:
```javascript
{
  "id": "call_1234567890",
  "type": "function",
  "function": {
    "name": "get_weather",
    "arguments": "{\"location\":\"Tokyo\"}"
  }
}
```

## API Endpoints

### POST /v1/chat/completions

Main chat endpoint that supports both streaming and function calling.

**Request Format**:
```json
{
  "model": "gpt-3.5-turbo",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" }
  ],
  "stream": true,
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

**Response Format (Non-Streaming)**:
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

**Response Format (Streaming)**:
Server-Sent Events (SSE) format:
```
data: {"id":"chatcmpl-12345","object":"chat.completion.chunk","created":1234567890,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-12345","object":"chat.completion.chunk","created":1234567890,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}

data: {"id":"chatcmpl-12345","object":"chat.completion.chunk","created":1234567890,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

**Response Format (Function Call)**:
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

### GET /health

Health check endpoint.

**Request**:
```bash
curl http://localhost:8000/health
```

**Response**:
```json
{
  "status": "ok",
  "service": "straico-proxy",
  "timestamp": "2026-02-04T23:30:00.000Z"
}
```

### GET /v1/models

List available models (currently not implemented, returns empty array).

## Usage Examples

### Basic Chat (Non-Streaming)

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello, world!"}],
    "stream": false
  }'
```

### Streaming Response

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Tell me a short story"}],
    "stream": true
  }'
```

### Function Calling

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
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

### Node.js Client Example

```javascript
import fetch from 'node-fetch';

const response = await fetch('http://localhost:8000/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' }
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
      console.log(parsed.choices[0].delta.content || '');
    }
  }
}
```

## Docker Deployment

### Build and Run with Docker Compose

1. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your Straico API key
   ```

2. **Start the container**:
   ```bash
   docker-compose up -d
   ```

3. **Check status**:
   ```bash
   docker-compose ps
   docker logs straico-proxy
   ```

4. **Stop the container**:
   ```bash
   docker-compose down
   ```

**docker-compose.yml** configuration:
```yaml
version: '3.8'

services:
  straico-proxy:
    build: .
    container_name: straico-proxy
    ports:
      - "8000:8000"
    env_file:
      - .env
    restart: unless-stopped
    volumes:
      - ./.env:/app/.env:ro
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 5s
```

## Troubleshooting

### Connection Refused

**Symptom**: `curl: (7) Failed to connect to localhost port 8000: Connection refused`

**Causes**:
- Proxy not running
- Wrong port
- Firewall blocking

**Solutions**:
1. Check if proxy is running:
   ```bash
   curl http://localhost:8000/health
   ```
2. Start the proxy:
   ```bash
   npm start
   # or
   docker-compose up -d
   ```
3. Check port availability:
   ```bash
   lsof -i :8000
   ```

### 401 Unauthorized

**Symptom**: `{"error":{"message":"Invalid API key","type":"invalid_request_error"}}`

**Cause**: Invalid or missing Straico API key

**Solutions**:
1. Verify `.env` file exists and contains your API key:
   ```bash
   cat .env | grep STRAICO_API_KEY
   ```
2. Test the API key directly with Straico:
   ```bash
   curl https://api.straico.com/v1/models \
     -H "Authorization: Bearer YOUR_API_KEY"
   ```
3. Ensure you copied `.env.example` to `.env` and filled it in

### Timeout Waiting for Response

**Symptom**: `Error: timeout of 60000ms exceeded`

**Causes**:
- Straico API is slow
- Network issues
- Timeout too short

**Solutions**:
1. Increase timeout in `server.js`:
   ```javascript
   timeout: 120000,  // 2 minutes
   ```
2. Check Straico status:
   ```bash
   curl https://api.straico.com/v1/health
   ```
3. Check your network connection

### Tool Calls Not Being Detected

**Symptom**: AI response doesn't trigger tool calls or returns plain text instead

**Causes**:
- AI not following the format
- Tool definitions too complex
- System prompt not clear

**Solutions**:
1. Enable debug logging:
   ```bash
   LOG_LEVEL=debug npm start
   ```
2. Check logs for AI response format
3. Simplify tool definitions
4. Try adding explicit instruction in system prompt:
   ```javascript
   const toolInstruction = `You must use tools by responding in this exact format:
   TOOL_CALL: <tool_name>
   ARGUMENTS: <json_arguments>
   
   DO NOT include any other text before or after the format.`;
   ```

### Streaming Feels Unnatural

**Symptom**: Streaming text is too choppy or too slow

**Causes**:
- Chunk size or delay not optimized for use case

**Solutions**:
1. Adjust in `.env`:
   ```bash
   STREAM_CHUNK_SIZE=20  # Larger chunks
   STREAM_DELAY_MS=50     # Faster delay
   ```
2. Test different values:
   ```bash
   STREAM_CHUNK_SIZE=10  # More choppy but responsive
   STREAM_CHUNK_SIZE=25  # Smoother but slower
   ```
3. Restart proxy after changing values

### 500 Internal Server Error

**Symptom**: Server returns 500 error with stack trace

**Causes**:
- Straico API error
- Server-side bug

**Solutions**:
1. Check error details in logs:
   ```bash
   LOG_LEVEL=debug npm start
   ```
2. Check Straico API is accessible:
   ```bash
   curl https://api.straico.com/v1/models \
     -H "Authorization: Bearer YOUR_KEY"
   ```
3. Report the error with full logs

## Testing

### Run Tests

```bash
npm test
```

### Run Lint

```bash
npm run lint
```

### Run Type Check

```bash
npm run typecheck
```

### Test Health Check

```bash
curl http://localhost:8000/health
```

### Test Basic Request

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": false
  }'
```

## Limitations and Known Issues

### Streaming Limitations

- **Simulated, not real-time**: Streaming is simulated by chunking and delaying non-streaming responses
- **Fixed chunk size**: All responses use the same chunk size and delay (configurable)
- **Total time**: Longer responses take proportionally longer to stream

### Function Calling Limitations

- **Format dependency**: AI must follow exact format for tool calls to be detected
- **Single tool call**: Only one tool call per response is supported
- **No tool execution**: Proxy doesn't execute tools, just formats tool call objects
- **Requires AI compliance**: If AI doesn't follow format, tool calls won't be detected
- **Tool output size**: Limited by Straico's response size

### API Compatibility Limitations

- **No actual streaming**: Straico doesn't support streaming, so proxy simulates it
- **No actual function calling**: Straico doesn't support function calling, so proxy injects prompts and parses responses
- **Model list**: `/v1/models` endpoint returns empty (not implemented)

### Other Limitations

- **No caching**: Each request is processed independently
- **No rate limiting**: No built-in rate limiting
- **No authentication**: Any client can call the proxy (unless you add your own middleware)
- **Memory usage**: Responses are stored in memory until sent (not streamed from Straico)

### Known Issues

1. **Multi-turn conversations with tools**: Currently only one turn (user → tool → assistant) is supported. Extended conversations may have issues.

2. **Large tool definitions**: Very large tool schemas may not fit in Straico's context window.

3. **Debug logs**: Debug logs can be verbose. Use `LOG_LEVEL=info` or higher for production.

## Development

### Running in Development Mode

```bash
npm run dev
```

This uses `node --watch` to automatically restart on file changes.

### Code Quality

Run quality checks:
```bash
npm run lint          # Lint code
npm run typecheck     # Type check
npm test              # Run tests
```

Fix linting issues:
```bash
npm run lint:fix      # Auto-fix
```

### Project Structure

```
straico-proxy/
├── server.js                 # Main Express server
├── streaming.js              # Stream simulation logic
├── tools.js                  # Function calling logic
├── utils.js                  # Helper functions
├── package.json              # Dependencies and scripts
├── .env.example              # Environment variables template
├── .env                      # Your actual configuration (gitignored)
├── Dockerfile                # Docker image definition
├── docker-compose.yml        # Docker orchestration
├── .eslintrc.json            # ESLint configuration
└── README.md                 # This file
```

## Contributing

When contributing:
1. Follow code style guidelines (see AGENTS.md)
2. Run quality checks before submitting
3. Use descriptive commit messages
4. Test thoroughly with both streaming and function calling

## Security Considerations

1. **Never commit `.env`** to version control
2. **Use strong API keys** for Straico
3. **Run behind firewall** if exposing to network
4. **Add authentication** if exposing publicly (add middleware in server.js)
5. **Monitor logs** for suspicious activity
6. **Use HTTPS** in production (add reverse proxy like Nginx)

## Production Deployment

### Docker Production Build

```bash
docker build -t straico-proxy:latest .
docker run -d \
  --name straico-prod \
  --restart unless-stopped \
  -p 8000:8000 \
  --env-file .env \
  straico-proxy:latest
```

### systemd Service (Linux)

Create `/etc/systemd/system/straico-proxy.service`:

```ini
[Unit]
Description=Straico Proxy
After=network.target

[Service]
Type=simple
User=straico
WorkingDirectory=/opt/straico-proxy
ExecStart=/usr/bin/node /opt/straico-proxy/server.js
Restart=always
RestartSec=10
EnvironmentFile=/opt/straico-proxy/.env

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable straico-proxy
sudo systemctl start straico-proxy
sudo systemctl status straico-proxy
```

## License

See LICENSE file for details.

## Support

For issues and questions:
1. Check Troubleshooting section above
2. Enable debug logging: `LOG_LEVEL=debug npm start`
3. Review logs for error messages
4. Test API directly with curl
5. Check Straico API status
