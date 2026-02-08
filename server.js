import express from 'express';
import dotenv from 'dotenv';
import { ProviderFactory } from './providers/index.js';
import { simulateStream } from './streaming.js';
import { parseToolCall, formatToolCallResponse } from './tools.js';
import {
  delayMs,
  logRequest,
  logResponse,
  logRequestDetails,
  logProviderResponse,
  logError,
  formatSSEChunk,
  generateRequestId,
} from './utils.js';

dotenv.config();

const AUTH_MODES = {
  REQUIRED: 'required',
  OPTIONAL: 'optional',
  DISABLED: 'disabled',
  EXTERNAL: 'external'
};

const PROVIDER_TYPE = process.env.PROVIDER_TYPE || 'straico';
const AUTH_MODE = process.env.AUTH_MODE || (
  process.env.NODE_ENV === 'production' ? AUTH_MODES.REQUIRED : AUTH_MODES.OPTIONAL
);
const PROXY_API_KEY = process.env.PROXY_API_KEY;
const NODE_ENV = process.env.NODE_ENV || 'development';

function validateAuthConfig() {
  const issues = [];

  switch (AUTH_MODE) {
  case AUTH_MODES.REQUIRED:
    if (!PROXY_API_KEY) {
      issues.push('AUTH_MODE=required requires PROXY_API_KEY');
    }
    break;

  case AUTH_MODES.DISABLED:
    console.warn('\n⚠️  WARNING: AUTH_MODE=disabled - No authentication configured!');
    console.warn('⚠️  Ensure external security measures are in place.\n');
    break;

  case AUTH_MODES.EXTERNAL:
    if (!PROXY_API_KEY) {
      console.info('\nℹ️  AUTH_MODE=external - Trusting external auth system');
      console.info('ℹ️  Ensure API gateway/service mesh is configured.\n');
    }
    break;

  case AUTH_MODES.OPTIONAL:
    if (!PROXY_API_KEY && NODE_ENV === 'production') {
      console.warn('\n⚠️  WARNING: No PROXY_API_KEY set in production!');
      console.warn('⚠️  Consider setting AUTH_MODE=disabled if intentional.\n');
    }
    break;

  default:
    issues.push(`Unknown AUTH_MODE: ${AUTH_MODE}. Use: required, optional, disabled, external`);
  }

  return issues;
}

let provider;
try {
  provider = ProviderFactory.create(PROVIDER_TYPE, process.env);
  provider.validateConfig();
} catch (error) {
  console.error(`FATAL: Provider configuration invalid: ${error.message}`);
  process.exit(1);
}

const authIssues = validateAuthConfig();
if (authIssues.length > 0 && NODE_ENV === 'production') {
  console.error('\n🚨 AUTHENTICATION CONFIGURATION ERROR:');
  authIssues.forEach(issue => console.error(`🚨   ${issue}`));
  console.error('🚨 Fix configuration or set AUTH_MODE=disabled\n');
  process.exit(1);
}

const app = express();
const PORT = process.env.PROXY_PORT || 8000;

app.use(express.json());

app.use(async (req, res, next) => {
  const requestId = generateRequestId();
  res.setHeader('X-Request-ID', requestId);
  res.locals.requestStartTime = Date.now();
  await logRequest(req, 0);
  next();
});

if (AUTH_MODE === AUTH_MODES.REQUIRED || AUTH_MODE === AUTH_MODES.OPTIONAL) {
  app.use('/v1/', (req, res, next) => {
    if (AUTH_MODE === AUTH_MODES.OPTIONAL && !PROXY_API_KEY) {
      return next();
    }

    const auth = req.headers['authorization'];
    const expectedAuth = `Bearer ${PROXY_API_KEY}`;

    if (!auth) {
      return res.status(401).json({
        error: {
          message: 'Missing Authorization header',
          type: 'authentication_error'
        }
      });
    }

    if (auth !== expectedAuth) {
      return res.status(401).json({
        error: {
          message: 'Invalid API key',
          type: 'authentication_error'
        }
      });
    }

    next();
  });
}

if (AUTH_MODE === AUTH_MODES.EXTERNAL) {
  app.set('trust proxy', true);

  const externalAuthHeader = process.env.EXTERNAL_AUTH_HEADER;

  if (externalAuthHeader) {
    app.use('/v1/', (req, res, next) => {
      const authValue = req.headers[externalAuthHeader.toLowerCase()];

      if (!authValue) {
        return res.status(401).json({
          error: {
            message: `Missing ${externalAuthHeader} header`,
            type: 'authentication_error'
          }
        });
      }

      next();
    });
  }
}

app.get('/health', async (req, res) => {
  const startTime = Date.now();
  const response = { 
    status: 'ok', 
    service: `${PROVIDER_TYPE}-proxy`, 
    timestamp: new Date().toISOString() 
  };
  const responseTime = Date.now() - startTime;
  await logResponse(res, 200, response, responseTime);
  res.json(response);
});

app.post('/v1/chat/completions', async (req, res) => {
  const requestId = req.headers['x-request-id'] || 'unknown';
  const startTime = Date.now();

  try {
    const { messages, model, ...otherParams } = req.body;

    logRequestDetails(model, messages, !!req.body.tools);

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      const errorResponse = {
        error: {
          message: 'messages is required and must be a non-empty array',
          type: 'invalid_request_error',
        },
      };
      const responseTime = Date.now() - startTime;
      await logResponse(res, 400, errorResponse, responseTime);
      return res.status(400).json(errorResponse);
    }

    if (!model) {
      const errorResponse = {
        error: {
          message: 'model is required',
          type: 'invalid_request_error',
        },
      };
      const responseTime = Date.now() - startTime;
      await logResponse(res, 400, errorResponse, responseTime);
      return res.status(400).json(errorResponse);
    }

    const providerRequest = provider.transformRequest({
      model: model,
      messages: messages,
      tools: req.body.tools,
      ...otherParams
    });

    const requestInfo = {
      model: providerRequest.model,
      messageCount: providerRequest.messages.length,
      hasTools: !!req.body.tools,
    };

    console.log(`[${provider.getType()} Request] ${requestInfo.model} - ${requestInfo.messageCount} messages`);

    const providerResponse = await provider.makeRequest(providerRequest);

    logProviderResponse(providerResponse, provider.getType());

    const aiResponse = providerResponse.data.choices[0]?.message?.content || '';

    if (req.body.tools) {
      const toolCalls = parseToolCall(aiResponse);

      if (toolCalls) {
        console.log(`[Tool Call Detected] ${toolCalls.map(t => t.function.name).join(', ')}`);

        const toolResponse = formatToolCallResponse(toolCalls);

        if (req.body.stream) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

          try {
            if (!aiResponse) {
              const finalChunk = formatSSEChunk(
                { tool_calls: toolCalls, content: null },
                toolResponse.id,
                providerResponse.data.model,
                'tool_calls'
              );
              res.write(finalChunk);
              res.write('data: [DONE]\n\n');
              res.end();

              const responseTime = Date.now() - startTime;
              console.log(`[Request Complete] ${requestId} - ${responseTime}ms - Tool call response`);
              return;
            }

            const chunks = aiResponse.match(/.{1,15}/g) || [aiResponse];
            for (const chunk of chunks) {
              await delayMs(80);
              const sseChunk = formatSSEChunk(
                { content: chunk },
                toolResponse.id,
                providerResponse.data.model,
                null
              );
              res.write(sseChunk);
            }

            const finalChunk = formatSSEChunk(
              { tool_calls: toolCalls, content: null },
              toolResponse.id,
              providerResponse.data.model,
              'tool_calls'
            );
            res.write(finalChunk);
            res.write('data: [DONE]\n\n');
            res.end();

            const responseTime = Date.now() - startTime;
            console.log(`[Request Complete] ${requestId} - ${responseTime}ms - Tool call response`);

            return;
          } catch (streamError) {
            console.error('Failed to stream AI response:', streamError);

            const errorChunk = {
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: providerResponse.data.model,
              choices: [{
                index: 0,
                delta: {},
                finish_reason: 'error',
              }],
            };

            res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();

            const responseTime = Date.now() - startTime;
            console.log(`[Request Failed] ${requestId} - ${responseTime}ms - Tool call streaming error`);
            return;
          }
        } else {
          const responseTime = Date.now() - startTime;
          await logResponse(res, 200, toolResponse, responseTime);
          res.json(toolResponse);
          return;
        }
      }
    }

    if (req.body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      console.log('Simulating streaming...');

      try {
        await simulateStream(aiResponse, res, {
          chunkSize: parseInt(process.env.STREAM_CHUNK_SIZE) || 15,
          delay: parseInt(process.env.STREAM_DELAY_MS) || 80,
        });

        const responseTime = Date.now() - startTime;
        console.log(`[Request Complete] ${requestId} - ${responseTime}ms - Streaming response`);
        return;
      } catch (streamError) {
        console.error('Streaming error:', streamError);

        const errorChunk = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: providerResponse.data.model,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'error',
          }],
        };

        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();

        const responseTime = Date.now() - startTime;
        console.log(`[Request Failed] ${requestId} - ${responseTime}ms - Streaming error`);
        return;
      }
    } else {
      const response = provider.transformResponse(providerResponse);
      const responseTime = Date.now() - startTime;

      await logResponse(res, 200, response, responseTime);
      res.json(response);

      console.log(`[Request Complete] ${requestId} - ${responseTime}ms - Non-streaming response`);
    }

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`[Error Processing Request] ${requestId}`);

    const errorContext = {
      requestId,
      method: req.method,
      path: req.path,
      responseTime,
    };

    logError(error, errorContext);

    if (error.response) {
      await logResponse(res, error.response.status, error.response.data, responseTime);
      res.status(error.response.status).json(error.response.data);
    } else {
      const errorResponse = {
        error: {
          message: error.message,
          type: 'internal_error',
        },
      };
      await logResponse(res, 500, errorResponse, responseTime);
      res.status(500).json(errorResponse);
    }
  }
});

app.listen(PORT, () => {
  const providerName = PROVIDER_TYPE.charAt(0).toUpperCase() + PROVIDER_TYPE.slice(1);
  const hasAuth = !!PROXY_API_KEY;
  const authEnabled = AUTH_MODE === AUTH_MODES.REQUIRED || (AUTH_MODE === AUTH_MODES.OPTIONAL && hasAuth);

  console.log('\n' + '='.repeat(60));
  console.log(`🚀 ${providerName} Proxy v1.0.0`);
  console.log('='.repeat(60));
  console.log(`📡 Listening:      http://0.0.0.0:${PORT}`);
  console.log(`🔑 AUTH_MODE:      ${AUTH_MODE}`);
  console.log(`🔑 API Key:        ${hasAuth ? '✅ Set' : '❌ Not set'}`);
  console.log(`🔒 Auth Enabled:   ${authEnabled ? '✅ YES' : '❌ NO'}`);
  console.log(`🏭 Environment:   ${NODE_ENV}`);
  console.log(`🏥 Health check:  http://0.0.0.0:${PORT}/health`);
  console.log(`🔗 API endpoint:  http://0.0.0.0:${PORT}/v1/chat/completions`);

  if (!authEnabled && NODE_ENV === 'production') {
    console.log('\n🚨 SECURITY WARNING:');
    console.log('🚨 No authentication enabled!');
    console.log('🚨 Ensure external security measures are in place.');
  } else if (!authEnabled) {
    console.log('\n💡 Tip: Set PROXY_API_KEY to enable authentication');
  }

  console.log('='.repeat(60) + '\n');
});
