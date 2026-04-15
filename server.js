import express from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { ProviderFactory } from './providers/index.js';
import { simulateStream, streamToolCalls } from './streaming.js';
import { formatToolCallResponse } from './tools.js';
import {
  logRequest,
  logResponse,
  logRequestDetails,
  logProviderResponse,
  logError,
  generateRequestId,
  info,
  warn,
  error as logErrorFn,
  debug,
} from './utils.js';
import {
  validateRequestBody,
  validateProviderResponse,
  extractToolCalls,
  handleUpstreamError,
  setSSEHeaders,
  writeStreamError,
} from './request-handlers.js';
import {
  MODEL_LIMITS,
  fetchModelLimits,
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

app.use(express.json({ limit: '10mb' }));

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
  const externalAuthValue = process.env.EXTERNAL_AUTH_VALUE;

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

      if (externalAuthValue && authValue !== externalAuthValue) {
        return res.status(401).json({
          error: {
            message: `Invalid ${externalAuthHeader} value`,
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

    const incomingSize = JSON.stringify(req.body).length;
    const incomingEstimatedTokens = Math.ceil(incomingSize / 4);
    info(`[Incoming Request] Model: ${model}, Size: ${incomingSize} chars (~${incomingEstimatedTokens} tokens), Messages: ${messages?.length ?? 0}`);

    logRequestDetails(model, messages, !!req.body.tools);

    const validationError = validateRequestBody(req.body);
    if (validationError) {
      const responseTime = Date.now() - startTime;
      await logResponse(res, validationError.status, validationError.error, responseTime);
      return res.status(validationError.status).json(validationError.error);
    }

    debug(`[Validation] max_tokens valid for model ${model}`);

    const providerRequest = await provider.transformRequest({
      model,
      messages,
      tools: req.body.tools,
      ...otherParams,
      isToolRequest: true,
    });

    const requestInfo = {
      model: providerRequest.model,
      messageCount: providerRequest.messages.length,
      hasTools: !!req.body.tools,
      requestSize: JSON.stringify(providerRequest).length,
      estimatedTokens: Math.ceil(JSON.stringify(providerRequest).length / 4),
    };

    info(`[${provider.getType()} Request] ${requestInfo.model} - ${requestInfo.messageCount} messages (${requestInfo.requestSize} chars, ~${requestInfo.estimatedTokens} tokens)`);

    const providerResponse = await provider.makeRequestWithRetry(providerRequest);
    logProviderResponse(providerResponse, provider.getType());
    validateProviderResponse(providerResponse);

    let aiResponse = providerResponse.data.choices[0].message.content || '';

    if (!aiResponse && req.body.tools) {
      warn('[Empty Response] Model returned empty response with tools requested');
      aiResponse = '';
    }

    const validToolCalls = extractToolCalls(aiResponse, req.body.tools);

    if (validToolCalls) {
      const toolResponse = formatToolCallResponse(validToolCalls);

      if (req.body.stream) {
        setSSEHeaders(res);

        try {
          await streamToolCalls(validToolCalls, res, toolResponse.id, providerResponse.data.model);
          res.write('data: [DONE]\n\n');
          res.end();

          const responseTime = Date.now() - startTime;
          info(`[Request Complete] ${requestId} - ${responseTime}ms - Tool call response`);
          return;
        } catch (streamError) {
          logErrorFn('Failed to stream AI response:', streamError);
          writeStreamError(res, providerResponse.data.model);
          const responseTime = Date.now() - startTime;
          info(`[Request Failed] ${requestId} - ${responseTime}ms - Tool call streaming error`);
          return;
        }
      } else {
        const responseTime = Date.now() - startTime;
        await logResponse(res, 200, toolResponse, responseTime);
        res.json(toolResponse);
        return;
      }
    }

    if (aiResponse === '.' && req.body.tools) {
      aiResponse = '';
    }

    if (req.body.stream) {
      setSSEHeaders(res);
      info('Simulating streaming...');

      try {
        await simulateStream(aiResponse, res, {
          chunkSize: parseInt(process.env.STREAM_CHUNK_SIZE) || 15,
          delay: parseInt(process.env.STREAM_DELAY_MS) || 80,
        });

        const responseTime = Date.now() - startTime;
        info(`[Request Complete] ${requestId} - ${responseTime}ms - Streaming response (${process.env.STREAM_MODE || 'smart'} mode)`);
        return;
      } catch (streamError) {
        logErrorFn('Streaming error:', streamError);
        writeStreamError(res, providerResponse.data.model);
        const responseTime = Date.now() - startTime;
        info(`[Request Failed] ${requestId} - ${responseTime}ms - Streaming error`);
        return;
      }
    } else {
      const response = provider.transformResponse(providerResponse);
      const responseTime = Date.now() - startTime;
      await logResponse(res, 200, response, responseTime);
      res.json(response);
      info(`[Request Complete] ${requestId} - ${responseTime}ms - Non-streaming response`);
    }

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logErrorFn(`[Error Processing Request] ${requestId}`);
    logError(error, { requestId, method: req.method, path: req.path, responseTime });
    await handleUpstreamError(error, res, responseTime);
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
