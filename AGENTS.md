# AGENTS.md

Guidelines for agentic coding assistants working on this Straico Proxy project.

## Build, Lint, and Test Commands

### Running the Application
```bash
npm start              # Start proxy server (node server.js)
npm run dev            # Start with hot-reload (node --watch server.js)
docker-compose up -d   # Build and start in detached mode
docker-compose down    # Stop and remove containers
```

### Code Quality
```bash
npm run lint           # Run ESLint to check code style
npm run lint:fix      # Auto-fix linting issues
npm run typecheck      # Run JSDoc type checking (if configured)
npm test               # Run all tests
npm run test:watch     # Run tests in watch mode
```

Test files use Jest and are in `__tests__/` or alongside source files with `.test.js` suffix.

## Code Style Guidelines

### Import Style
- Use ES6 module syntax: `import express from 'express'` and `export function`
- Group imports: third-party packages, then local modules

### Naming Conventions
- **Files**: kebab-case (e.g., `streaming.js`, `tools.js`)
- **Variables/Functions**: camelCase (e.g., `simulateStream`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `STRAICO_API_KEY`)
- **Environment variables**: UPPER_SNAKE_CASE (e.g., `PROXY_PORT`)

### Code Formatting
- Use 2 spaces for indentation (no tabs)
- Use single quotes for strings
- Add semicolons at end of statements
- Maximum line length: 100 characters
- No trailing whitespace

### Functions
- Prefer named exports for better debugging
- Use async/await for asynchronous operations
- Document parameters and return values with JSDoc
- Keep functions small and focused

### Error Handling
- Use try/catch for async operations
- Log errors with context (timestamp, request details)
- Return appropriate HTTP status codes (401, 404, 500)
- Forward Straico API errors to client with original status

### Environment Variables
- Load with `dotenv.config()` at the top of `server.js`
- Always provide sensible defaults
- Document all variables in `.env.example`
- Never commit `.env` to version control

### Express Routes
- Use named route handlers where practical
- Use `express.json()` middleware for body parsing
- Validate request parameters before processing
- Log all requests with timestamp, method, and path
- Return JSON responses with proper status codes

### Project Structure
```
straico-proxy/
├── server.js          # Main Express application
├── streaming.js        # Stream simulation module
├── tools.js            # Function calling module
├── utils.js            # Helper functions
├── package.json
├── .env.example
├── .env                # Gitignored
├── Dockerfile
├── docker-compose.yml
└── README.md
```

### Testing
- Write tests for all core functionality
- Test both success and error paths
- Mock external API calls (Straico)
- Use descriptive test names

### Commit Messages
- Use present tense ("Add feature" not "Added feature")
- Keep first line under 50 characters
- Reference user stories: "feat: implement US-006 streaming simulation"

### Security
- Never log or expose API keys or secrets
- Validate all user input
- Use HTTPS in production
- Implement rate limiting for production
- Keep dependencies updated with `npm audit fix`

## Quality Gates

Before considering any user story complete:
1. `npm start` runs without errors
2. `curl http://localhost:8000/health` returns `{"status":"ok","service":"straico-proxy"}`
3. `npm run lint` passes with no errors
4. `npm run typecheck` passes (if configured)
5. All acceptance criteria from the PRD are met
6. For streaming: verify SSE chunks are received correctly
7. For function calling: verify tool call objects are properly formatted

## Common Patterns

### Making HTTP Requests
```javascript
const straicoResponse = await axios.post(
  `${STRAICO_API_URL}/chat/completions`,
  requestData,
  {
    headers: {
      'Authorization': `Bearer ${STRAICO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    timeout: 60000,
  }
);
```

### Delay Implementation
```javascript
const delayMs = (ms) => new Promise(resolve => setTimeout(resolve, ms));
await delayMs(80);
```

### Response Formatting (OpenAI Compatible)
```javascript
const response = {
  id: `chatcmpl-${Date.now()}`,
  object: 'chat.completion',
  created: Math.floor(Date.now() / 1000),
  model: model || 'gpt-3.5-turbo',
  choices: [{
    index: 0,
    message: { role: 'assistant', content: aiResponse },
    finish_reason: 'stop',
  }],
  usage: straicoResponse.data.usage || {
    prompt_tokens: 0, completion_tokens: 0, total_tokens: 0,
  },
};
```
