# PRD: Straico Proxy with Streaming and Function Calling

## Overview

Create a local proxy server that adds streaming responses and function calling support to Straico's API, making it compatible with OpenCode and other applications requiring these OpenAI-compatible features. The proxy sits between clients and Straico, transforming requests/responses to simulate missing functionality.

## Goals

- Provide OpenAI-compatible `/v1/chat/completions` endpoint
- Simulate streaming responses using Server-Sent Events (SSE)
- Implement function calling via tool injection and response parsing
- Enable local development using Docker and Node.js
- Support Straico API key authentication via headers
- Configure streaming parameters (chunk size, delay) via environment variables
- Include health check endpoint for monitoring
- Provide comprehensive logging (console, structured JSON, request/response)
- Support 1-10 concurrent requests with local development scale
- Document setup, configuration, and usage

## Quality Gates

These commands must pass for every user story:
- `node server.js` must start without errors and display server information
- `curl http://localhost:8000/health` must return `{"status":"ok","service":"straico-proxy"}`
- For streaming stories: verify SSE chunks are received
- For function calling stories: verify tool call objects are properly formatted
- Code must pass type checking and linting

## User Stories

### US-001: Initialize project with dependencies
**Description:** As a developer, I want to set up the Node.js project with Express, Axios, and dotenv so that the proxy can serve HTTP requests and handle environment configuration.

**Acceptance Criteria:**
- [ ] Create `package.json` with proper dependencies (express, axios, dotenv)
- [ ] Add scripts: `start` (node server.js) and `dev` (node --watch server.js)
- [ ] Set `type: "module"` in package.json for ES6 modules
- [ ] Add Node.js engine requirement (>= 18.0.0)
- [ ] Install all dependencies via npm install

### US-002: Configure environment variables
**Description:** As a developer, I want to set up environment variables for Straico API credentials and proxy configuration so that the proxy can authenticate with Straico and run on the correct port.

**Acceptance Criteria:**
- [ ] Create `.env.example` with documented variables (STRAICO_API_KEY, STRAICO_API_URL, PROXY_PORT, STREAM_CHUNK_SIZE, STREAM_DELAY_MS, LOG_LEVEL)
- [ ] Create `.env` from .env.example
- [ ] Add `.env` to .gitignore
- [ ] Load environment variables in server.js using dotenv.config()
- [ ] Use default values for optional configurations

### US-003: Implement health check endpoint
**Description:** As a user, I want a health check endpoint so that I can verify the proxy is running and properly configured.

**Acceptance Criteria:**
- [ ] Create GET `/health` route
- [ ] Return JSON response: `{"status":"ok","service":"straico-proxy"}`
- [ ] Respond with 200 status code
- [ ] Include health check in Docker configuration with timeout settings

### US-004: Create Express server with middleware
**Description:** As a developer, I want an Express server that handles incoming requests and applies logging middleware so that all requests are tracked and logged.

**Acceptance Criteria:**
- [ ] Initialize Express app in server.js
- [ ] Configure app to use `express.json()` for request body parsing
- [ ] Add logging middleware that logs timestamp, method, and path for each request
- [ ] Listen on port from PROXY_PORT environment variable (default 8000)
- [ ] Display server startup message with URL and health check URL

### US-005: Implement text generation endpoint (non-streaming)
**Description:** As a user, I want to send standard chat completion requests that return complete responses so that basic AI interaction works without streaming.

**Acceptance Criteria:**
- [ ] Create POST `/v1/chat/completions` route
- [ ] Extract messages, model, and other parameters from request body
- [ ] Forward request to Straico API with Straico API key authentication
- [ ] Return Straico response in OpenAI-compatible format with same structure
- [ ] Include usage tokens if provided by Straico
- [ ] Test with curl to verify non-streaming response

### US-006: Implement streaming simulation module
**Description:** As a developer, I want a streaming module that chunks responses into small pieces and sends them as Server-Sent Events so that clients receive text incrementally.

**Acceptance Criteria:**
- [ ] Create `streaming.js` module
- [ ] Implement `simulateStream()` function that accepts response text and response object
- [ ] Split text into chunks (default 15 characters, configurable via env)
- [ ] Add delay between chunks (default 80ms, configurable via env)
- [ ] Format each chunk as SSE event with OpenAI chunk structure
- [ ] Send final chunk with `finish_reason: 'stop'` and `[DONE]` marker
- [ ] Test with curl to verify SSE stream is received

### US-007: Integrate streaming into chat endpoint
**Description:** As a user, I want streaming support so that I receive text generation in real-time with simulated chunking.

**Acceptance Criteria:**
- [ ] Check if request body has `stream: true` flag
- [ ] When streaming enabled, call Straico with streaming disabled
- [ ] Get complete response from Straico
- [ ] Route response through streaming module to send SSE chunks
- [ ] Handle errors during streaming and close response properly
- [ ] Test with curl -k (to allow self-signed certs) to verify SSE chunks

### US-008: Implement function calling injection module
**Description:** As a developer, I want a module that converts tool definitions into system prompt instructions so that AI knows about available tools.

**Acceptance Criteria:**
- [ ] Create `tools.js` module
- [ ] Implement `injectToolsIntoSystem()` function
- [ ] Convert tools array into formatted instructions for AI
- [ ] Append instructions to system message or create new system message if not present
- [ ] Include tool names, descriptions, and parameter schemas
- [ ] Add explicit instructions for AI to use format: `TOOL_CALL: name\nARGUMENTS: {json}`

### US-009: Implement function calling response parsing
**Description:** As a developer, I want a module that detects tool calls in AI responses so that function calls can be extracted and formatted properly.

**Acceptance Criteria:**
- [ ] Implement `parseToolCall()` function to detect tool call pattern
- [ ] Parse response text for `TOOL_CALL: <name>\nARGUMENTS: <json>` format
- [ ] Extract tool name and JSON arguments
- [ ] Return formatted tool call array with id, type, and function object
- [ ] Handle JSON parsing errors gracefully
- [ ] Test with curl to verify tool call detection

### US-010: Implement function calling response formatting
**Description:** As a developer, I want a module that formats tool call responses in OpenAI-compatible format so that clients can process them properly.

**Acceptance Criteria:**
- [ ] Implement `formatToolCallResponse()` function
- [ ] Create completion object with `finish_reason: 'tool_calls'`
- [ ] Include tool_calls array in response with correct structure
- [ ] Return appropriate usage tokens
- [ ] Implement `formatToolResultMessage()` for tool execution results

### US-011: Integrate function calling into chat endpoint
**Description:** As a user, I want function calling support so that AI can detect and use available tools in conversations.

**Acceptance Criteria:**
- [ ] Check if request body includes `tools` parameter
- [ ] Inject tools into system message when present
- [ ] Parse AI response for tool calls
- [ ] If tool call detected, format response with tool_calls structure
- [ ] Handle both streaming and non-streaming modes for tool responses
- [ ] Test with curl to verify tool call object is returned

### US-012: Create utility helper functions
**Description:** As a developer, I want utility functions for delays and error handling so that code is modular and maintainable.

**Acceptance Criteria:**
- [ ] Create `utils.js` module
- [ ] Implement `delayMs()` function for promise-based delays
- [ ] Add error formatting for Straico API errors
- [ ] Add structured JSON logging for requests/responses
- [ ] Ensure all functions are exported properly

### US-013: Add Docker configuration
**Description:** As a developer, I want Docker configuration so that the proxy can run consistently across different environments without dependency issues.

**Acceptance Criteria:**
- [ ] Create Dockerfile with Node.js 18 Alpine base image
- [ ] Copy package files and install production dependencies
- [ ] Copy application code to container
- [ ] Expose port 8000
- [ ] Set CMD to start server
- [ ] Create docker-compose.yml with healthcheck
- [ ] Mount .env as read-only volume
- [ ] Set restart policy to `unless-stopped`
- [ ] Test with `docker-compose up -d`

### US-014: Create comprehensive README documentation
**Description:** As a user, I want clear documentation so that I can understand what the proxy does, how to set it up, and how to use it.

**Acceptance Criteria:**
- [ ] Document project purpose and architecture
- [ ] Provide step-by-step setup instructions (clone, install, configure, run)
- [ ] Explain how streaming works (simulated chunking)
- [ ] Explain how function calling works (tool injection and parsing)
- [ ] List all API endpoints with examples
- [ ] Document all environment variables with defaults
- [ ] Provide curl command examples for testing
- [ ] Include troubleshooting guide for common issues
- [ ] Document limitations and known issues

### US-015: Add error handling and logging
**Description:** As a user, I want proper error handling and logging so that issues can be diagnosed and resolved quickly.

**Acceptance Criteria:**
- [ ] Catch and log all server errors
- [ ] Format Straico API errors with status codes
- [ ] Return appropriate HTTP status codes (401, 404, 500)
- [ ] Log request details (method, path, body)
- [ ] Log response details (status, time, tokens)
- [ ] Configure log level via LOG_LEVEL environment variable
- [ ] Include timestamp in all log entries
- [ ] Test error cases (invalid API key, network errors)

### US-016: Add request logging to file
**Description:** As a developer, I want request logs saved to a file so that I can review past interactions and troubleshoot issues.

**Acceptance Criteria:**
- [ ] Add file logging for all requests
- [ ] Log in structured JSON format
- [ ] Save to `requests.log` file
- [ ] Include timestamp, method, path, body, response time
- [ ] Ensure log file is created and accessible
- [ ] Test with multiple requests to verify logging

## Functional Requirements

- **FR-1:** The proxy must accept POST requests to `/v1/chat/completions` with OpenAI-compatible request format
- **FR-2:** The proxy must forward requests to Straico API using the provided API key in headers
- **FR-3:** The proxy must return responses matching OpenAI chat completion schema
- **FR-4:** When `stream: true`, the proxy must send SSE-formatted chunks with 15-character size and 80ms delay
- **FR-5:** When `tools` parameter is present, the proxy must inject tool instructions into the system message
- **FR-6:** The proxy must detect tool calls in AI responses using the `TOOL_CALL: name\nARGUMENTS: {json}` format
- **FR-7:** The proxy must return tool call objects with `finish_reason: 'tool_calls'` when detected
- **FR-8:** The proxy must support health check endpoint at `/health`
- **FR-9:** All configuration must be loaded from environment variables with sensible defaults
- **FR-10:** The proxy must log all requests with timestamps
- **FR-11:** The proxy must handle authentication via Authorization header with Bearer token
- **FR-12:** The proxy must return 401 if Straico API authentication fails

## Non-Goals

- **NG-1:** The proxy does NOT provide real streaming (it simulates streaming from non-streaming responses)
- **NG-2:** The proxy does NOT support multiple tool calls in a single response
- **NG-3:** The proxy does NOT cache responses (future enhancement)
- **NG-4:** The proxy does NOT implement rate limiting (future enhancement)
- **NG-5:** The proxy does NOT support OpenAI-compatible models other than what Straico provides
- **NG-6:** The proxy does NOT handle streaming from Straico (Straico doesn't support it)
- **NG-7:** The proxy does NOT provide authentication at the proxy level (only authenticates with Straico)
- **NG-8:** The proxy does NOT support authentication middleware (future enhancement)

## Technical Considerations

### Dependencies
- Express 4.18.2: HTTP server and routing
- Axios 1.6.0: HTTP client for Straico API
- Dotenv 16.3.1: Environment variable management

### Streaming Simulation
- Chunk size: 15 characters (configurable)
- Delay between chunks: 80ms (configurable)
- Format: Server-Sent Events (SSE)
- Total simulation time for 500-word response: ~40-60 seconds

### Function Calling Approach
- Tool definitions injected into system prompt
- AI instructed to use specific format for tool calls
- Response parsing via regex for `TOOL_CALL: name\nARGUMENTS: {json}` pattern
- Tool calls returned as OpenAI-compatible objects

### Performance
- Expected concurrent requests: 1-10
- Local development scale (not production)
- Single-threaded Node.js server (acceptable for expected load)

### Error Handling
- Straico API errors passed through with status codes
- Server errors return 500 with error details
- Network errors logged and returned appropriately
- Timeout: 60 seconds for Straico requests

### Security
- Straico API key stored in environment variables (not in code)
- Never commit `.env` file to version control
- Docker .env mounted read-only
- No exposed authentication (proxy level)

## Success Metrics

- Proxy starts successfully without errors
- Health check endpoint returns OK status
- Non-streaming requests return valid responses
- Streaming requests send valid SSE chunks
- Tool calls are properly detected and formatted
- All environment variables load correctly with defaults
- Docker container starts and runs successfully
- All acceptance criteria for each user story pass

## Open Questions

- Should we implement request caching for performance? (deferred)
- Should we add proxy-level authentication middleware? (deferred)
- Should we support streaming from Straico if they add it later? (future enhancement)
- Should we add unit tests and integration tests? (deferred to v2)
- What response caching strategy should be used if implemented? (open)
- Should we add rate limiting to prevent abuse? (open)