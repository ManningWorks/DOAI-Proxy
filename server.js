import express from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { ProviderFactory } from './providers/index.js';
import { simulateStream, streamToolCalls } from './streaming.js';
import { parseToolCall, formatToolCallResponse } from './tools.js';
import {
  logRequest,
  logResponse,
  logRequestDetails,
  logProviderResponse,
  logError,
  generateRequestId,
} from './utils.js';
import {
  MODEL_LIMITS,
  fetchModelLimits,
  validateTotalContext,
} from './utils/model-limits.js';

const MODEL_LIMITS_REFRESH_INTERVAL = parseInt(process.env.MODEL_LIMITS_REFRESH_INTERVAL, 10) || 0;

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

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  try {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

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
const SHUTDOWN_TIMEOUT = parseInt(process.env.SHUTDOWN_TIMEOUT) || 30000;

let activeRequests = 0;
let isShuttingDown = false;
let server = null;
let modelRefreshTimer = null;

app.use(express.json({ limit: '50mb' }));

app.use(async (req, res, next) => {
  if (isShuttingDown) {
    return res.status(503).json({
      error: {
        message: 'Server is shutting down',
        type: 'service_unavailable'
      }
    });
  }

  activeRequests++;
  const requestId = generateRequestId();
  res.setHeader('X-Request-ID', requestId);
  res.locals.requestStartTime = Date.now();
  await logRequest(req, 0);

  res.on('finish', () => {
    activeRequests--;
  });

  next();
});

if (AUTH_MODE === AUTH_MODES.REQUIRED || AUTH_MODE === AUTH_MODES.OPTIONAL) {
  app.use('/v1/', (req, res, next) => {
    if (AUTH_MODE === AUTH_MODES.OPTIONAL && !PROXY_API_KEY) {
      return next();
    }

    const auth = req.headers['authorization'];
    const expectedAuth = `Bearer ${PROXY_API_KEY}`;

    if (!auth || !timingSafeEqual(auth, expectedAuth)) {
      return res.status(401).json({
        error: {
          message: !auth ? 'Missing Authorization header' : 'Invalid API key',
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

function requireAdminAuth(req, res, next) {
  if (AUTH_MODE === AUTH_MODES.DISABLED) {
    return next();
  }

  if (!PROXY_API_KEY) {
    return next();
  }

  const auth = req.headers['authorization'];
  const expectedAuth = `Bearer ${PROXY_API_KEY}`;

  if (!auth || !timingSafeEqual(auth, expectedAuth)) {
    return res.status(401).json({
      error: {
        message: !auth ? 'Missing Authorization header' : 'Invalid API key',
        type: 'authentication_error'
      }
    });
  }

  next();
}

app.get('/health', async (req, res) => {
  const startTime = Date.now();
  const response = { 
    status: 'ok', 
    service: 'doai-proxy', 
    timestamp: new Date().toISOString() 
  };
  const responseTime = Date.now() - startTime;
  await logResponse(res, 200, response, responseTime);
  res.json(response);
});

app.get('/v1/models', (req, res) => {
  const data = Object.entries(MODEL_LIMITS).map(([id, info]) => ({
    object: 'model',
    id,
    name: info.name,
    owned_by: 'straico',
  }));
  res.json({ object: 'list', data });
});

app.post('/v1/admin/refresh-models', requireAdminAuth, async (req, res) => {
  try {
    const result = await fetchModelLimits({ force: true });
    if (result.success) {
      res.json({ message: 'Model limits refreshed', model_count: result.count });
    } else {
      res.status(500).json({ error: { message: result.error, type: 'refresh_error' } });
    }
  } catch (error) {
    res.status(500).json({ error: { message: error.message, type: 'refresh_error' } });
  }
});

app.post('/v1/chat/completions', async (req, res) => {
  const requestId = req.headers['x-request-id'] || 'unknown';
  const startTime = Date.now();

  try {
    const { messages, model, ...otherParams } = req.body;
    
    // Log incoming request size for debugging
    const incomingSize = JSON.stringify(req.body).length;
    const incomingEstimatedTokens = Math.ceil(incomingSize / 4);
    console.log(`[Incoming Request] Model: ${model}, Size: ${incomingSize} chars (~${incomingEstimatedTokens} tokens), Messages: ${messages.length}`);

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

    // Validate total context against model's word_limit
    const estimatedInputTokens = Math.ceil(JSON.stringify(messages).length / 3.5);
    const totalContextError = validateTotalContext(estimatedInputTokens, req.body.max_tokens, model);
    if (totalContextError) {
      const responseTime = Date.now() - startTime;
      await logResponse(res, 400, totalContextError, responseTime);
      return res.status(400).json(totalContextError);
    }

    console.log(`[Validation] max_tokens valid for model ${model}`);

    const providerRequest = await provider.transformRequest({
      model: model,
      messages: messages,
      tools: req.body.tools,
      ...otherParams,
      isToolRequest: true
    });

    const requestInfo = {
      model: providerRequest.model,
      messageCount: providerRequest.messages.length,
      hasTools: !!req.body.tools,
      requestSize: JSON.stringify(providerRequest).length,
      estimatedTokens: Math.ceil(JSON.stringify(providerRequest).length / 4),
    };

    console.log(`[${provider.getType()} Request] ${requestInfo.model} - ${requestInfo.messageCount} messages (${requestInfo.requestSize} chars, ~${requestInfo.estimatedTokens} tokens)`);

    const providerResponse = await provider.makeRequestWithRetry(providerRequest);

    logProviderResponse(providerResponse, provider.getType());

    if (!providerResponse.data) {
      throw new Error('No data in provider response');
    }

    if (!providerResponse.data.choices || !Array.isArray(providerResponse.data.choices) || providerResponse.data.choices.length === 0) {
      throw new Error('No choices in provider response');
    }

    if (!providerResponse.data.choices[0].message) {
      throw new Error('No message in first choice');
    }

    const messageContent = providerResponse.data.choices[0].message.content;
    
    let aiResponse = messageContent || '';

    if (!aiResponse && req.body.tools) {
      console.warn('[Empty Response] Model returned empty response with tools requested');
      aiResponse = '';
    }

    if (req.body.tools) {
      const toolCalls = parseToolCall(aiResponse);
  
      if (toolCalls) {
        const availableToolNames = new Set(req.body.tools.map(t => t.function.name));
        console.debug(`[Tool Validation] Available tools: ${[...availableToolNames].join(', ')}`);
        const validToolCalls = toolCalls.filter(tc => availableToolNames.has(tc.function.name));
        const invalidToolNames = toolCalls
          .filter(tc => !availableToolNames.has(tc.function.name))
          .map(tc => tc.function.name);
        
        if (invalidToolNames.length > 0) {
          console.warn(`[Tool Validation] Filtered ${invalidToolNames.length} invalid tool(s): ${invalidToolNames.join(', ')}`);
        }
        
        if (validToolCalls.length === 0) {
          console.warn('[Tool Validation] No valid tool calls remaining, treating as text response');
          if (aiResponse === '.') {
            aiResponse = '';
          }
        } else {
          console.log(`[Tool Call Detected] ${validToolCalls.map(t => t.function.name).join(', ')}`);
          
          const toolResponse = formatToolCallResponse(validToolCalls);

 
          if (req.body.stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
 
            try {
              await streamToolCalls(validToolCalls, res, toolResponse.id, providerResponse.data.model);
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
        console.log(`[Request Complete] ${requestId} - ${responseTime}ms - Streaming response (${process.env.STREAM_MODE || 'smart'} mode)`);
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
    } else if (error.statusCode) {
      const errorResponse = {
        error: {
          message: error.message,
          type: 'invalid_request_error',
        },
      };
      await logResponse(res, error.statusCode, errorResponse, responseTime);
      res.status(error.statusCode).json(errorResponse);
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      const errorResponse = {
        error: {
          message: 'Upstream service unavailable',
          type: 'upstream_error',
        },
      };
      await logResponse(res, 502, errorResponse, responseTime);
      res.status(502).json(errorResponse);
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      const errorResponse = {
        error: {
          message: 'Upstream service timeout',
          type: 'upstream_error',
        },
      };
      await logResponse(res, 504, errorResponse, responseTime);
      res.status(504).json(errorResponse);
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

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[Shutdown] Received ${signal}, draining ${activeRequests} active request(s)...`);

  if (modelRefreshTimer) {
    clearInterval(modelRefreshTimer);
    modelRefreshTimer = null;
  }

  const forceExit = setTimeout(() => {
    console.log(`[Shutdown] Force exiting with ${activeRequests} request(s) still active`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);

  const checkDrain = setInterval(() => {
    if (activeRequests === 0) {
      clearInterval(checkDrain);
      clearTimeout(forceExit);
      console.log('[Shutdown] All requests completed, exiting gracefully');
      server?.close(() => process.exit(0));
    }
  }, 100);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

(async () => {
  await fetchModelLimits();

  if (MODEL_LIMITS_REFRESH_INTERVAL > 0) {
    console.log(`[ModelLimits] Periodic refresh enabled: every ${MODEL_LIMITS_REFRESH_INTERVAL}ms`);
    modelRefreshTimer = setInterval(async () => {
      const result = await fetchModelLimits({ force: true });
      if (!result.success) {
        console.warn(`[ModelLimits] Background refresh failed: ${result.error}`);
      }
    }, MODEL_LIMITS_REFRESH_INTERVAL);
  }

  server = app.listen(PORT, () => {
    const hasAuth = !!PROXY_API_KEY;
    const authEnabled = AUTH_MODE === AUTH_MODES.REQUIRED || (AUTH_MODE === AUTH_MODES.OPTIONAL && hasAuth);

    console.log('\n' + '='.repeat(60));
    console.log('🚀 DOAI Proxy v1.0.0');
    console.log('   Definitely OpenAI. (It\'s definitely not.)');
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
})();
