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

const PROVIDER_TYPE = process.env.PROVIDER_TYPE || 'straico';

let provider;
try {
  provider = ProviderFactory.create(PROVIDER_TYPE, process.env);
  provider.validateConfig();
} catch (error) {
  console.error(`FATAL: Provider configuration invalid: ${error.message}`);
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

    await logRequest(req, 0);

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

    await logRequest(req, 0);

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
            return res.status(500).json({
              error: {
                message: 'Internal server error during streaming',
                type: 'internal_error',
              },
            });
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
      await simulateStream(aiResponse, res, {
        chunkSize: parseInt(process.env.STREAM_CHUNK_SIZE) || 15,
        delay: parseInt(process.env.STREAM_DELAY_MS) || 80,
      });

      const responseTime = Date.now() - startTime;
      console.log(`[Request Complete] ${requestId} - ${responseTime}ms - Streaming response`);

      return;
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
  console.log(`\n🚀 ${providerName} Proxy running on http://localhost:${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 API endpoint: http://localhost:${PORT}/v1/chat/completions\n`);
});
