# Straico Proxy Implementation Plan

Complete guide to building a local proxy that adds streaming and function calling support to Straico's API for use with OpenCode.

## Overview

**Problem**: Straico API is OpenAI-compatible but lacks two critical features:
- Streaming responses (real-time text generation)
- Function calling / tool use

**Solution**: A local proxy server that sits between OpenCode and Straico, simulating these missing features.

## Architecture

```
OpenCode Client
    ↓ (expects streaming + function calls)
Proxy Server (localhost:8000)
    ↓ (transforms requests)
Straico API (no streaming, no function calls)
```

## What the Proxy Does

1. **Streaming Simulation**
   - Accepts streaming requests (`stream: true`)
   - Makes non-streaming request to Straico
   - Waits for full response
   - Chunks response into small pieces
   - Sends chunks as Server-Sent Events (SSE)
   - Simulates realistic timing with delays

2. **Function Calling Simulation**
   - Accepts tool/function definitions
   - Converts them into system prompt instructions
   - Parses AI response to detect tool calls
   - Returns formatted tool call objects
   - Handles multi-turn conversations with tool execution

3. **OpenAI API Compatibility**
   - Accepts standard `/v1/chat/completions` format
   - Returns responses matching OpenAI schema
   - Handles both streaming and non-streaming modes

## File Structure

```
straico-proxy/
├── package.json           # Dependencies and scripts
├── server.js             # Main Express server
├── streaming.js          # Stream simulation logic
├── tools.js              # Function calling logic
├── utils.js              # Helper functions
├── .env.example          # Environment variables template
├── .env                  # Your actual API keys (gitignored)
├── Dockerfile            # Docker image definition
├── docker-compose.yml    # Docker orchestration
└── README.md             # Setup and usage instructions
```

## Step-by-Step Implementation

### Step 1: Initialize Project

```bash
mkdir straico-proxy
cd straico-proxy
npm init -y
```

**Expected `package.json`**:
```json
{
  "name": "straico-proxy",
  "version": "1.0.0",
  "description": "Local proxy for Straico API with streaming and function calling",
  "main": "server.js",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "dotenv": "^16.3.1",
    "axios": "^1.6.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

**Install dependencies**:
```bash
npm install express dotenv axios
```

### Step 2: Environment Configuration

Create `.env.example`:
```bash
# Straico API Configuration
STRAICO_API_KEY=your_straico_api_key_here
STRAICO_API_URL=https://api.straico.com/v1

# Proxy Configuration
PROXY_PORT=8000

# Streaming Simulation
STREAM_CHUNK_SIZE=15      # Characters per chunk
STREAM_DELAY_MS=80        # Delay between chunks (ms)

# Logging
LOG_LEVEL=info            # debug, info, warn, error
```

Create `.env` with your actual API key:
```bash
cp .env.example .env
# Edit .env and add your Straico API key
```

### Step 3: Streaming Simulation Module

Create `streaming.js`:

**Purpose**: Convert non-streaming responses into streaming SSE format.

**Logic**:
1. Accept full response text
2. Split into chunks (default 15 characters each)
3. Add delay between chunks (default 80ms)
4. Format each chunk as SSE event
5. Send final `[DONE]` event

**Key Functions**:

```javascript
// Main function to simulate streaming
export async function simulateStream(responseText, res, config = {}) {
  const { chunkSize = 15, delay = 80 } = config;

  // Split response into chunks
  const chunks = responseText.match(new RegExp(`.{1,${chunkSize}}`, 'g')) || [responseText];

  // Send each chunk as SSE
  for (const chunk of chunks) {
    await delayMs(delay);

    const sseData = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'straico-proxy',
      choices: [{
        index: 0,
        delta: { content: chunk },
        finish_reason: null,
      }],
    };

    res.write(`data: ${JSON.stringify(sseData)}\n\n`);
  }

  // Send final chunk with finish_reason: stop
  const finalChunk = {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'straico-proxy',
    choices: [{
      index: 0,
      delta: {},
      finish_reason: 'stop',
    }],
  };

  res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

// Helper function for delays
function delayMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Why 15 chars / 80ms?**:
- 15 chars = readable chunks, not too choppy
- 80ms = feels like real streaming (similar to actual LLM streaming)
- Total time for 500-word response: ~40-60 seconds (realistic)

### Step 4: Function Calling Module

Create `tools.js`:

**Purpose**: Handle function calling since Straico doesn't support it natively.

**Challenge**: Straico returns plain text, we need to detect tool calls and format them as OpenAI tool call objects.

**Approach**: Convert tool definitions into system prompt, then parse AI response for tool calls.

**Key Functions**:

```javascript
// Inject tool definitions into system message
export function injectToolsIntoSystem(messages, tools) {
  if (!tools || tools.length === 0) return messages;

  const toolDescriptions = tools
    .map(t => `- ${t.function.name}: ${t.function.description}`)
    .join('\n');

  const toolSchema = tools
    .map(t => `${t.function.name}: ${JSON.stringify(t.function.parameters)}`)
    .join('\n\n');

  const toolInstruction = `You have access to the following tools:
${toolDescriptions}

Tool schemas:
${toolSchema}

When you need to use a tool, format your response like this:
TOOL_CALL: <tool_name>
ARGUMENTS: <json_arguments>

For example:
TOOL_CALL: search_web
ARGUMENTS: {"query": "how to implement streaming in Node.js"}

Only make one tool call at a time. Wait for the result before making another tool call.`;

  // Find or create system message
  const systemIndex = messages.findIndex(m => m.role === 'system');
  if (systemIndex !== -1) {
    messages[systemIndex].content = `${messages[systemIndex].content}\n\n${toolInstruction}`;
  } else {
    messages.unshift({ role: 'system', content: toolInstruction });
  }

  return messages;
}

// Parse response to detect tool calls
export function parseToolCall(responseText) {
  const toolCallPattern = /TOOL_CALL:\s*(\w+)\s*\nARGUMENTS:\s*({.*})/s;

  const match = responseText.match(toolCallPattern);
  if (!match) return null;

  const [, toolName, argsString] = match;

  try {
    const args = JSON.parse(argsString);

    return [{
      id: `call_${Date.now()}`,
      type: 'function',
      function: {
        name: toolName,
        arguments: JSON.stringify(args),
      },
    }];
  } catch (error) {
    console.error('Failed to parse tool call arguments:', error);
    return null;
  }
}

// Format response with tool calls for OpenAI format
export function formatToolCallResponse(toolCalls) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'straico-proxy',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        tool_calls: toolCalls,
        content: null,
      },
      finish_reason: 'tool_calls',
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

// Handle tool execution result (what to do after tool runs)
export function formatToolResultMessage(toolCallId, result) {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content: typeof result === 'string' ? result : JSON.stringify(result),
  };
}
```

**How It Works**:

1. **Request Processing**:
   - Detect if request includes `tools` parameter
   - Convert tool definitions into system prompt
   - Tell AI to use specific format: `TOOL_CALL: name\nARGUMENTS: {json}`

2. **Response Parsing**:
   - Check if AI response contains `TOOL_CALL:` pattern
   - Extract tool name and arguments
   - Format as OpenAI tool call object

3. **Response Formatting**:
   - Return tool call object with `finish_reason: 'tool_calls'`
   - OpenCode will execute the tool and send result back
   - Proxy adds tool result as `role: 'tool'` message
   - Continues conversation with result

**Limitations**:
- AI might not follow the format perfectly
- Multiple tool calls in one response not supported
- Tool output size limited by Straico's response size

### Step 5: Main Server Module

Create `server.js`:

**Purpose**: Express server that handles all incoming requests and orchestrates the proxy logic.

**Endpoints**:
- `POST /v1/chat/completions` - Main chat endpoint
- `GET /v1/models` - Model listing (optional)

**Logic Flow**:

```javascript
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { simulateStream } from './streaming.js';
import { injectToolsIntoSystem, parseToolCall, formatToolCallResponse } from './tools.js';

dotenv.config();

const app = express();
const PORT = process.env.PROXY_PORT || 8000;
const STRAICO_API_KEY = process.env.STRAICO_API_KEY;
const STRAICO_API_URL = process.env.STRAICO_API_URL || 'https://api.straico.com/v1';

app.use(express.json());

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'straico-proxy' });
});

// Chat completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { messages, model, stream, tools, tool_choice, ...otherParams } = req.body;

    console.log('Request details:', { model, stream, hasTools: !!tools });

    // Inject tools into system message if present
    const processedMessages = injectToolsIntoSystem(messages, tools);

    // Build request to Straico
    const straicoRequest = {
      model: model || 'gpt-3.5-turbo',
      messages: processedMessages,
      ...otherParams,
    };

    // Add temperature if not provided (default 0.7)
    if (!straicoRequest.temperature) {
      straicoRequest.temperature = 0.7;
    }

    console.log('Forwarding to Straico...');

    // Call Straico API
    const straicoResponse = await axios.post(
      `${STRAICO_API_URL}/chat/completions`,
      straicoRequest,
      {
        headers: {
          'Authorization': `Bearer ${STRAICO_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000, // 60 second timeout
      }
    );

    const aiResponse = straicoResponse.data.choices[0].message.content;
    console.log('Straico response length:', aiResponse?.length);

    // Check if response contains a tool call
    const toolCalls = parseToolCall(aiResponse);

    if (toolCalls) {
      console.log('Tool call detected:', toolCalls.map(t => t.function.name));

      // Return tool call in OpenAI format
      const toolResponse = formatToolCallResponse(toolCalls);

      if (stream) {
        // Stream tool call response
        const chunks = aiResponse.match(/.{1,15}/g) || [aiResponse];
        for (const chunk of chunks) {
          await new Promise(r => setTimeout(r, 80));
          const sseData = {
            id: toolResponse.id,
            object: 'chat.completion.chunk',
            created: toolResponse.created,
            model: toolResponse.model,
            choices: [{
              index: 0,
              delta: { content: chunk },
              finish_reason: null,
            }],
          };
          res.write(`data: ${JSON.stringify(sseData)}\n\n`);
        }

        // Final chunk with tool_calls
        const finalChunk = {
          id: toolResponse.id,
          object: 'chat.completion.chunk',
          created: toolResponse.created,
          model: toolResponse.model,
          choices: [{
            index: 0,
            delta: { tool_calls: toolCalls, content: null },
            finish_reason: 'tool_calls',
          }],
        };
        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        // Non-streaming tool call response
        res.json(toolResponse);
      }

      return;
    }

    // Regular text response
    if (stream) {
      // Simulate streaming
      console.log('Simulating streaming...');
      await simulateStream(aiResponse, res, {
        chunkSize: parseInt(process.env.STREAM_CHUNK_SIZE) || 15,
        delay: parseInt(process.env.STREAM_DELAY_MS) || 80,
      });
    } else {
      // Non-streaming response - return directly
      const response = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || 'gpt-3.5-turbo',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: aiResponse,
          },
          finish_reason: 'stop',
        }],
        usage: straicoResponse.data.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      };

      res.json(response);
    }

  } catch (error) {
    console.error('Error processing request:', error.message);

    if (error.response) {
      console.error('Straico API error:', error.response.data);
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({
        error: {
          message: error.message,
          type: 'internal_error',
        },
      });
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Straico Proxy running on http://localhost:${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 API endpoint: http://localhost:${PORT}/v1/chat/completions\n`);
});
```

**Key Features**:

1. **Request Transformation**:
   - Extracts `messages`, `model`, `stream`, `tools` from request
   - Injects tools into system message
   - Forwards to Straico

2. **Response Handling**:
   - Parses AI response for tool calls
   - Routes to streaming or non-streaming handler
   - Formats output as OpenAI-compatible

3. **Error Handling**:
   - Catches and logs errors
   - Returns appropriate HTTP status codes
   - Preserves Straico error messages

### Step 6: Docker Configuration

Create `Dockerfile`:

```dockerfile
# Use Node.js Alpine for small image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Expose port
EXPOSE 8000

# Start server
CMD ["node", "server.js"]
```

Create `docker-compose.yml`:

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
      - ./.env:/app/.env:ro  # Mount .env as read-only
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 5s
```

**Why Docker?**
- Runs consistently across machines
- Isolated from system dependencies
- Easy to deploy to laptop/server
- Restart policies for reliability

### Step 7: Usage Instructions

Create `README.md`:

```markdown
# Straico Proxy

Local proxy that adds streaming and function calling support to Straico's API.

## Setup

1. Clone and install dependencies:
   ```bash
   git clone <repo-url>
   cd straico-proxy
   npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env and add your Straico API key
   ```

3. Run locally:
   ```bash
   npm start
   ```

   Or run with Docker:
   ```bash
   docker-compose up -d
   ```

4. Configure OpenCode to use:
   - Base URL: `http://localhost:8000`
   - API Key: any value (proxy uses your .env key)

## How It Works

### Streaming
- Proxy accepts `stream: true` requests
- Makes non-streaming call to Straico
- Chunks response and sends as SSE
- Simulates realistic timing with 80ms delays

### Function Calling
- Proxy converts tool definitions to system prompt
- Tells AI to use format: `TOOL_CALL: name\nARGUMENTS: {json}`
- Parses response for tool calls
- Returns OpenAI-compatible tool call objects
- Handles multi-turn conversations

## API Endpoints

- `POST /v1/chat/completions` - Chat with AI (streaming and tools supported)
- `GET /health` - Health check
- `GET /v1/models` - List available models (optional, not implemented)

## Configuration

Edit `.env`:

```bash
STRAICO_API_KEY=your_key_here
STRAICO_API_URL=https://api.straico.com/v1
PROXY_PORT=8000
STREAM_CHUNK_SIZE=15
STREAM_DELAY_MS=80
LOG_LEVEL=info
```

## Troubleshooting

**Proxy not starting**:
- Check port 8000 is available: `lsof -i :8000`
- Check logs: `docker logs straico-proxy`

**OpenCode connection errors**:
- Verify proxy is running: `curl http://localhost:8000/health`
- Check OpenCode base URL is `http://localhost:8000`
- Check firewall rules

**Tool calls not working**:
- Enable debug logging: `LOG_LEVEL=debug`
- Check if AI is following format in logs
- Try simpler tool definitions

## Limitations

- Streaming is simulated, not real-time
- Tool calls require AI to follow specific format
- Multiple tool calls per response not supported
- Tool output size limited by Straico

## Development

Run with hot-reload:
```bash
npm run dev
```

Run tests (if implemented):
```bash
npm test
```
```

### Step 8: Add .gitignore

Create `.gitignore`:

```bash
node_modules/
.env
*.log
.DS_Store
```

## Testing the Proxy

### Test 1: Basic Request (Non-Streaming)

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello, world!"}],
    "stream": false
  }'
```

Expected: Non-streaming response with full text.

### Test 2: Streaming Request

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Tell me a short story"}],
    "stream": true
  }'
```

Expected: SSE chunks with 15-character pieces and 80ms delays.

### Test 3: Function Call

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

Expected: Response with `tool_calls` array containing tool call object.

### Test 4: Health Check

```bash
curl http://localhost:8000/health
```

Expected: `{"status":"ok","service":"straico-proxy"}`

## Configuration in OpenCode

1. Open OpenCode settings
2. Configure API provider:
   - Base URL: `http://localhost:8000`
   - API Key: `straico` (or any value)
   - Model: `gpt-3.5-turbo` (or model Straico supports)

3. Save and test

## Performance Tuning

**Make streaming faster**:
```bash
STREAM_CHUNK_SIZE=30  # Larger chunks
STREAM_DELAY_MS=40    # Faster delay
```

**Make streaming more realistic**:
```bash
STREAM_CHUNK_SIZE=8   # Smaller chunks
STREAM_DELAY_MS=100   # Slower delay
```

## Troubleshooting Guide

### Issue: "Connection refused"
**Cause**: Proxy not running or wrong port
**Fix**:
```bash
# Check if proxy is running
curl http://localhost:8000/health

# If not running, start it
npm start
# or
docker-compose up -d
```

### Issue: "401 Unauthorized"
**Cause**: Invalid Straico API key
**Fix**:
```bash
# Verify .env has correct key
cat .env | grep STRAICO_API_KEY

# Test key directly with Straico
curl https://api.straico.com/v1/models \
  -H "Authorization: Bearer YOUR_KEY"
```

### Issue: "Timeout waiting for response"
**Cause**: Straico API slow or proxy timeout too short
**Fix**:
```bash
# Increase timeout in server.js
timeout: 120000  # 2 minutes

# Or check Straico status
curl https://api.straico.com/v1/health
```

### Issue: Tool calls not being detected
**Cause**: AI not following format
**Fix**:
```bash
# Enable debug logging
LOG_LEVEL=debug

# Check logs for AI response format
# Simplify tool definitions
# Try adding explicit instruction in system prompt
```

### Issue: Streaming feels unnatural
**Cause**: Chunk size or delay wrong
**Fix**:
```bash
# Adjust in .env
STREAM_CHUNK_SIZE=20  # Try different sizes
STREAM_DELAY_MS=60     # Try different delays

# Or test different values:
STREAM_CHUNK_SIZE=10  # More choppy but responsive
STREAM_CHUNK_SIZE=25  # Smoother but slower
```

## Advanced Customization

### Add Response Caching

```javascript
// Simple in-memory cache
const cache = new Map();

app.post('/v1/chat/completions', async (req, res) => {
  const cacheKey = JSON.stringify(req.body);

  if (cache.has(cacheKey)) {
    console.log('Cache hit!');
    return res.json(cache.get(cacheKey));
  }

  // ... make request to Straico ...

  cache.set(cacheKey, response);
  return res.json(response);
});
```

### Add Request Logging

```javascript
// Log all requests to file
import fs from 'fs';

app.use((req, res, next) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    body: req.body,
  };

  fs.appendFileSync('requests.log', JSON.stringify(logEntry) + '\n');
  next();
});
```

### Add Rate Limiting

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
});

app.use('/v1/', limiter);
```

## Security Considerations

1. **Never commit `.env`** to git
2. **Use strong API keys** for Straico
3. **Run behind firewall** on production
4. **Add authentication** if exposing publicly
5. **Monitor logs** for abuse

```javascript
// Add basic auth middleware
app.use('/v1/', (req, res, next) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.PROXY_API_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

## Production Deployment

### Docker Production Build

```bash
# Build optimized image
docker build -t straico-proxy:latest .

# Run with restart policy
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

## Summary

This proxy enables you to use Straico's API with tools that require streaming and function calling support, like OpenCode. It simulates these features by:

1. **Streaming**: Chunking non-streaming responses with delays
2. **Function Calling**: Converting tools to prompts and parsing responses

The proxy runs locally (or in Docker), uses your Straico API key, and presents an OpenAI-compatible API interface.

## Next Steps

1. Implement the code following this guide
2. Test with curl commands
3. Configure OpenCode to use the proxy
4. Monitor logs and adjust tuning parameters
5. Deploy to your preferred environment

## Questions?

If you encounter issues or need help, check the Troubleshooting section or enable debug logging with `LOG_LEVEL=debug`.
