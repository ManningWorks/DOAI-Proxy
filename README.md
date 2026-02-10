# AI Provider Proxy

OpenAI-compatible proxy that adds streaming and function calling support to AI provider APIs that lack these features, making them compatible with tools like OpenCode.

**Currently supports Straico with extensible architecture for future providers.**

## What This Project Does

Many AI provider APIs are OpenAI-compatible but lack two critical features:
- **Streaming responses** - Real-time text generation
- **Function calling / tool use** - Ability to call external functions

This proxy sits between your OpenAI-compatible client (OpenCode, etc.) and the provider API, simulating these missing features by:

1. **Streaming Simulation**: Converts non-streaming provider responses into Server-Sent Events (SSE) with simulated chunking and delays
2. **Function Calling**: Converts tool definitions into system prompts and parses AI responses to detect and format tool calls (for providers without native support)
3. **OpenAI Compatibility**: Presents an OpenAI-compatible API interface (`/v2/chat/completions`)

## Architecture

```
OpenAI-Compatible Client (OpenCode, etc.)
    ↓ (expects streaming + function calls)
AI Provider Proxy (localhost:8000)
    ↓ (transforms to provider format)
Provider API (Straico, OpenAI, Anthropic, etc.)
```

### Key Components

- **server.js** - Express server that handles all requests and orchestrates proxy logic
- **streaming.js** - Module that converts non-streaming responses into SSE format with 3 streaming modes
- **tools.js** - Module that handles function calling by injecting tools into prompts and parsing responses
- **utils.js** - Helper functions for logging, delays, and response formatting
- **providers/** - Provider abstraction layer supporting multiple AI providers
  - **base-provider.js** - Abstract base class defining provider interface
  - **provider-factory.js** - Factory for creating provider instances
  - **straico-provider.js** - Straico API implementation
  - More providers can be added in future

### Provider System

This proxy uses a provider-based architecture to support multiple AI providers. Currently, Straico is the only supported provider, but the system is designed to be easily extended.

**Supported Providers:**
- **Straico**: API aggregator with streaming simulation and function calling
- **OpenAI**: Coming soon (will support native streaming and function calling)
- **Anthropic**: Coming soon (will support native streaming and function calling)

**Provider Configuration:**
Set the provider type using the `PROVIDER_TYPE` environment variable:

```bash
PROVIDER_TYPE=straico  # Currently only option
```

**Adding New Providers:**
The provider system is designed to be extensible. To add support for a new provider:
1. Create a new provider class in `providers/` directory
2. Implement the `BaseProvider` interface
3. Add the provider to `ProviderFactory`
4. Add environment variables for the provider's credentials

See [docs/ADDING_PROVIDERS.md](docs/ADDING_PROVIDERS.md) for detailed instructions.

## Installation

### Prerequisites

- Node.js 18 or higher
- API key for your chosen provider (Straico, OpenAI, etc.)

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

   Edit `.env` and add your provider's API key:

   **For Straico:**
   ```bash
   PROVIDER_TYPE=straico
   STRAICO_API_KEY=your_actual_api_key_here
   ```

   **For other providers (when available):**
   See provider-specific configuration examples in the Configuration section below.

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
| `STRAICO_API_KEY` | Your Straico API key (if PROVIDER_TYPE=straico) | - (required) |
| `OPENAI_API_KEY` | Your OpenAI API key (if PROVIDER_TYPE=openai) | - (required when using OpenAI) |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PROVIDER_TYPE` | Provider type to use | `straico` |
| `STRAICO_API_URL` | Straico API base URL | `https://api.straico.com/v2` |
| `STRAICO_API_TIMEOUT` | Straico API timeout (ms) | `60000` |
| `PROXY_PORT` | Proxy server port | `8000` |
| `STREAM_MODE` | Streaming mode: `none`, `simple`, or `smart` | `smart` |
| `STREAM_CHUNK_SIZE` | Characters per SSE chunk (used by `smart` mode) | `15` |
| `STREAM_DELAY_MS` | Delay between chunks (ms) | `80` |
| `LOG_LEVEL` | Logging verbosity (debug, info, warn, error) | `info` |

### Provider-Specific Configuration

#### Straico (Current Default)
```bash
PROVIDER_TYPE=straico
STRAICO_API_KEY=your_key
STRAICO_API_URL=https://api.straico.com/v2
```

#### OpenAI (Coming Soon)
```bash
PROVIDER_TYPE=openai
OPENAI_API_KEY=your_key
OPENAI_API_URL=https://api.openai.com/v1
```

### Tuning Streaming

The proxy supports three streaming modes to balance formatting preservation with streaming "feel":

**Streaming Modes:**
- **`none`**: Send whole response in 1-2 chunks (100% formatting preserved)
- **`simple`**: Split into 2-3 chunks at newlines (95% formatting preserved)
- **`smart`**: Boundary-aware chunking with ~15-char target (90% formatting preserved, default)

**Example Configuration:**
```bash
# Best formatting, minimal streaming feel
STREAM_MODE=none

# Good balance of formatting and streaming
STREAM_MODE=simple

# Maximum streaming feel with good formatting (default)
STREAM_MODE=smart
```

**Adjusting Smart Mode:**
```bash
# Smoother, faster
STREAM_CHUNK_SIZE=25
STREAM_DELAY_MS=40

# More realistic, slower
STREAM_CHUNK_SIZE=8
STREAM_DELAY_MS=100
```

**Recommendation:** Use `simple` mode for production - good formatting with minimal chunking.

## How It Works

### Streaming Simulation

The proxy supports three streaming modes configured via `STREAM_MODE`:

1. Proxy accepts requests with `stream: true`
2. Makes non-streaming call to provider API
3. Waits for full response
4. Chunks response based on `STREAM_MODE`:
   - `none`: Send whole response in 1-2 chunks
   - `simple`: Split into 2-3 chunks at natural boundaries (newlines)
   - `smart`: Boundary-aware chunking with ~15-char target (default)
5. Adds delay between chunks (default 80ms)
6. Sends chunks as SSE (Server-Sent Events)
7. Sends `[DONE]` marker when complete

**Why these defaults?**
- 15 chars = readable chunks that aren't too choppy (smart mode)
- 2-3 chunks = good balance between streaming feel and formatting (simple mode)
- 80ms = feels like real streaming (similar to actual LLM streaming)
- Total time for 500-word response: ~40-60 seconds (realistic)

### Function Calling

Function calling support varies by provider:

**For providers without native function calling (e.g., Straico):**
1. **Request Processing**: Proxy detects if request includes `tools` parameter
2. **Tool Injection**: Converts tool definitions into system prompt instructions
3. **Prompt Formatting**: Tells AI to use format: `TOOL_CALL: name\nARGUMENTS: {json}`
4. **Response Parsing**: Checks AI response for tool call pattern
5. **Tool Call Detection**: Extracts tool name and arguments from response
6. **Response Formatting**: Returns tool call object with `finish_reason: 'tool_calls'`
7. **Multi-turn Support**: Client can execute tool and send result back as `role: 'tool'` message

**Example Tool Format:**
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

**AI Response Format:**
```
I can help you check the weather. Let me get that information for you.
TOOL_CALL: get_weather
ARGUMENTS: {"location": "Tokyo"}
```

**Tool Call Object Returned:**
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

### POST /v2/chat/completions

Main chat endpoint that supports both streaming and function calling.

**Request Format:**
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

**Response Format (Non-Streaming):**
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

**Response Format (Streaming):**
Server-Sent Events (SSE) format:
```
data: {"id":"chatcmpl-12345","object":"chat.completion.chunk","created":1234567890,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-12345","object":"chat.completion.chunk","created":1234567890,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}

data: {"id":"chatcmpl-12345","object":"chat.completion.chunk","created":1234567890,"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

**Response Format (Function Call):**
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

**Request:**
```bash
curl http://localhost:8000/health
```

**Response:**
```json
{
  "status": "ok",
  "service": "straico-proxy",
  "timestamp": "2026-02-04T23:30:00.000Z"
}
```

**Note:** The `service` field reflects the provider type (e.g., `straico-proxy`, `openai-proxy`).

### GET /v2/models

List available models (currently not implemented for all providers, returns empty array).

## Usage Examples

### Basic Chat (Non-Streaming)

```bash
curl -X POST http://localhost:8000/v2/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello, world!"}],
    "stream": false
  }'
```

### Streaming Response

```bash
curl -X POST http://localhost:8000/v2/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Tell me a short story"}],
    "stream": true
  }'
```

### Function Calling

```bash
curl -X POST http://localhost:8000/v2/chat/completions \
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

const response = await fetch('http://localhost:8000/v2/chat/completions', {
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
   # Edit .env with your provider's API key
   ```

2. **Start container**:
   ```bash
   docker-compose up -d
   ```

3. **Check status**:
   ```bash
   docker-compose ps
   docker logs straico-proxy
   ```

4. **Stop container**:
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

**Cause**: Invalid or missing provider API key

**Solutions**:
1. Verify `.env` file exists and contains your API key:
   ```bash
   cat .env | grep API_KEY
   ```
2. Check which provider you're using:
   ```bash
   cat .env | grep PROVIDER_TYPE
   ```
3. Test your API key directly with the provider (e.g., Straico):
   ```bash
   curl https://api.straico.com/v2/models \
     -H "Authorization: Bearer YOUR_API_KEY"
   ```
4. Ensure you copied `.env.example` to `.env` and filled it in

### Timeout Waiting for Response

**Symptom**: `Error: timeout of 60000ms exceeded`

**Causes**:
- Provider API is slow
- Network issues
- Timeout too short

**Solutions**:
1. Increase timeout in `.env`:
   ```bash
   STRAICO_API_TIMEOUT=120000  # 2 minutes
   ```
2. Check provider status:
   ```bash
   curl https://api.straico.com/v2/health
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
- Chunk size or delay not optimized for your use case

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
- Provider API error
- Server-side bug

**Solutions**:
1. Check error details in logs:
   ```bash
   LOG_LEVEL=debug npm start
   ```
2. Check provider API is accessible:
   ```bash
   curl https://api.straico.com/v2/models \
     -H "Authorization: Bearer YOUR_KEY"
   ```
3. Report error with full logs

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
curl -X POST http://localhost:8000/v2/chat/completions \
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
- **Configurable behavior**: Chunking strategy depends on `STREAM_MODE` setting
- **Total time**: Longer responses take proportionally longer to stream
- **Smart mode limitations**: May still occasionally break markdown in complex cases (though significantly improved)
- **Format preservation**: `none` mode = 100%, `simple` mode = ~95%, `smart` mode = ~90%

### Function Calling Limitations

- **Format dependency**: AI must follow exact format for tool calls to be detected (for providers without native support)
- **Single tool call**: Only one tool call per response is supported
- **No tool execution**: Proxy doesn't execute tools, just formats tool call objects
- **Requires AI compliance**: If AI doesn't follow format, tool calls won't be detected
- **Tool output size**: Limited by provider's response size

### API Compatibility Limitations

- **No actual streaming**: Providers without native streaming (like Straico) have streaming simulated by the proxy
- **No actual function calling**: Providers without native function calling (like Straico) use prompt injection
- **Model list**: `/v2/models` endpoint returns empty (not implemented)
- **Provider-specific limitations**: Each provider has its own API limitations (rate limits, context window, etc.)

### Other Limitations

 - **No caching**: Each request is processed independently
- **No rate limiting**: No built-in rate limiting
- **No authentication**: Any client can call the proxy (unless you add your own middleware)
- **Memory usage**: Responses are stored in memory until sent (not streamed from provider)
- **Log rotation**: Automatic log file rotation when files exceed 50MB. Keeps 5 backup files. Configurable via `MAX_LOG_SIZE` and `MAX_LOG_FILES` environment variables.

### Known Issues

1. **Multi-turn conversations with tools**: Currently only one turn (user → tool → assistant) is supported. Extended conversations may have issues.
2. **Large tool definitions**: Very large tool schemas may not fit in provider's context window.
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
├── providers/                # Provider abstraction layer
│   ├── base-provider.js        # Abstract base class
│   ├── provider-factory.js     # Provider factory
│   ├── straico-provider.js     # Straico implementation
│   └── index.js                 # Provider exports
├── package.json              # Dependencies and scripts
├── .env.example              # Environment variables template
├── Dockerfile                # Docker image definition
├── docker-compose.yml        # Docker orchestration
├── .eslintrc.json            # ESLint configuration
├── docs/                    # Documentation
│   └── ADDING_PROVIDERS.md  # Provider implementation guide
├── logs/                     # Log files directory
│   ├── requests.log             # Request/response logs
│   └── server.log              # Server error logs
└── README.md                 # This file
```

## Contributing

When contributing:
1. Follow code style guidelines (see AGENTS.md)
2. Run quality checks before submitting
3. Use descriptive commit messages
4. Test thoroughly with both streaming and function calling

## Security Considerations

### For Repository Users

1. **Never commit `.env`** to version control
2. **Use strong API keys** - Obtain your provider API key from official sources
3. **Keep API keys secret** - Never share or commit API keys
4. **Use HTTPS in production** - Add a reverse proxy with SSL when exposing publicly
5. **Add authentication** - Consider implementing API key authentication for the proxy itself if deploying to public servers
6. **Monitor logs** - Regularly check for suspicious activity in `server.log` and `requests.log`

### For Repository Maintainers

1. **No secrets in code** - All secrets are loaded from environment variables only
2. **No sensitive files tracked** - `.env`, `*.log`, and other sensitive files are in `.gitignore`
3. **Regular dependency audits** - Run `npm audit fix` regularly
4. **Keep dependencies updated** - Use `npm update` for security patches

### Known Limitations

- **Proxy does not execute tools** - Tool calls are formatted but not executed by the proxy
- **No rate limiting** - Consider adding rate limiting for production deployments
- **No authentication** - Any client can access the proxy (add middleware if needed)
- **Logs stored locally** - Logs are written to disk and not encrypted

### Recommended Security Enhancements

For production deployments:

```javascript
// Add rate limiting (in server.js)
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
});

app.use('/v2/', limiter);

// Add authentication (in server.js)
app.use('/v2/', (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${process.env.PROXY_API_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

## Production Deployment

### Docker Production Build

```bash
docker build -t straico-proxy:latest .
docker run -d \
  --name ai-provider-prod \
  --restart unless-stopped \
  -p 8000:8000 \
  --env-file .env \
  straico-proxy:latest
```

### systemd Service (Linux)

Create `/etc/systemd/system/ai-provider-proxy.service`:

```ini
[Unit]
Description=AI Provider Proxy
After=network.target

[Service]
Type=simple
User=provider
WorkingDirectory=/opt/ai-provider-proxy
ExecStart=/usr/bin/node /opt/ai-provider-proxy/server.js
Restart=always
RestartSec=10
EnvironmentFile=/opt/ai-provider-proxy/.env

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable ai-provider-proxy
sudo systemctl start ai-provider-proxy
sudo systemctl status ai-provider-proxy
```

## Security

This proxy is designed to be secure and suitable for public use. However, users should be aware of the following security considerations:

### For Repository Users

1. **Never commit `.env`** to version control
2. **Use strong API keys** - Obtain your provider API key from official sources (Straico, OpenAI, Anthropic, etc.)
3. **Keep API keys secret** - Never share or commit API keys
4. **Use HTTPS in production** - Add a reverse proxy with SSL when exposing publicly
5. **Add authentication** - Consider implementing API key authentication for the proxy itself if deploying to public servers
6. **Monitor logs** - Regularly check for suspicious activity in `server.log` and `requests.log`

### For Repository Maintainers

1. **No secrets in code** - All secrets are loaded from environment variables only
2. **No sensitive files tracked** - `.env`, `*.log`, and other sensitive files are in `.gitignore`
3. **Regular dependency audits** - Run `npm audit fix` regularly
4. **Keep dependencies updated** - Use `npm update` for security patches

### Recommended Security Enhancements

For production deployments:

```javascript
// Add rate limiting (in server.js)
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
});

app.use('/v2/', limiter);

// Add authentication (in server.js)
app.use('/v2/', (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${process.env.PROXY_API_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

## License

See LICENSE file for details.

## Support

For issues and questions:
1. Check Troubleshooting section above
2. Enable debug logging: `LOG_LEVEL=debug npm start`
3. Review logs for error messages
4. Test your provider's API directly with curl
5. Check your provider's API status page

**For provider-specific support:**
- Straico: https://straico.com
- OpenAI: https://platform.openai.com
- Anthropic: https://anthropic.com

**For adding new providers:**
See [docs/ADDING_PROVIDERS.md](docs/ADDING_PROVIDERS.md) for detailed implementation guide.

**For bug reports:**
Include your provider type (`PROVIDER_TYPE`), configuration (sanitized logs), and steps to reproduce.
