import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import { simulateStream } from './streaming.js';
import { injectToolsIntoSystem, parseToolCall, formatToolCallResponse } from './tools.js';
import {
  delayMs,
  logRequest,
  logResponse,
  logRequestDetails,
  logStraicoResponse,
  logError,
  formatChatCompletionResponse,
  formatSSEChunk,
  generateRequestId,
} from './utils.js';

dotenv.config();

const app = express();
const PORT = process.env.PROXY_PORT || 8000;
const STRAICO_API_KEY = process.env.STRAICO_API_KEY;
const STRAICO_API_URL = process.env.STRAICO_API_URL || 'https://api.straico.com/v1';

app.use(express.json());

app.use((req, res, next) => {
  const requestId = generateRequestId();
  res.setHeader('X-Request-ID', requestId);
  logRequest(req);
  next();
});

app.get('/health', (req, res) => {
  const response = { status: 'ok', service: 'straico-proxy', timestamp: new Date().toISOString() };
  logResponse(res, 200, response);
  res.json(response);
});

app.post('/v1/chat/completions', async (req, res) => {
  const requestId = req.headers['x-request-id'];
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
      logResponse(res, 400, errorResponse);
      return res.status(400).json(errorResponse);
    }

    if (!model) {
      const errorResponse = {
        error: {
          message: 'model is required',
          type: 'invalid_request_error',
        },
      };
      logResponse(res, 400, errorResponse);
      return res.status(400).json(errorResponse);
    }

    const processedMessages = injectToolsIntoSystem(messages, req.body.tools);

    const straicoRequest = {
      model: model,
      messages: processedMessages,
      ...otherParams,
    };

    if (!straicoRequest.temperature) {
      straicoRequest.temperature = 0.7;
    }

    const requestInfo = {
      model: straicoRequest.model,
      messageCount: straicoRequest.messages.length,
      hasTools: !!req.body.tools,
    };

    console.log(`[Straico Request] ${requestInfo.model} - ${requestInfo.messageCount} messages`);

    const straicoResponse = await axios.post(
      `${STRAICO_API_URL}/chat/completions`,
      straicoRequest,
      {
        headers: {
          'Authorization': `Bearer ${STRAICO_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    logStraicoResponse(straicoResponse);

    const aiResponse = straicoResponse.data.choices[0]?.message?.content || '';

    if (req.body.tools) {
      const toolCalls = parseToolCall(aiResponse);

      if (toolCalls) {
        console.log(`[Tool Call Detected] ${toolCalls.map(t => t.function.name).join(', ')}`);

        const toolResponse = formatToolCallResponse(toolCalls);

        if (req.body.stream) {
          const chunks = aiResponse.match(/.{1,15}/g) || [aiResponse];
          for (const chunk of chunks) {
            await delayMs(80);
            const sseChunk = formatSSEChunk(
              { content: chunk },
              toolResponse.id,
              straicoResponse.data.model,
              null
            );
            res.write(sseChunk);
          }

          const finalChunk = formatSSEChunk(
            { tool_calls: toolCalls, content: null },
            toolResponse.id,
            straicoResponse.data.model,
            'tool_calls'
          );
          res.write(finalChunk);
          res.write('data: [DONE]\n\n');
          res.end();

          const responseTime = Date.now() - startTime;
          console.log(`[Request Complete] ${requestId} - ${responseTime}ms - Tool call response`);

          return;
        } else {
          logResponse(res, 200, toolResponse);
          res.json(toolResponse);
          return;
        }
      }
    }

    if (req.body.stream) {
      console.log('Simulating streaming...');
      await simulateStream(aiResponse, res, {
        chunkSize: parseInt(process.env.STREAM_CHUNK_SIZE) || 15,
        delay: parseInt(process.env.STREAM_DELAY_MS) || 80,
      });

      const responseTime = Date.now() - startTime;
      console.log(`[Request Complete] ${requestId} - ${responseTime}ms - Streaming response`);

      return;
    } else {
      const response = formatChatCompletionResponse(straicoResponse.data, model);

      logResponse(res, 200, response);
      res.json(response);

      const responseTime = Date.now() - startTime;
      console.log(`[Request Complete] ${requestId} - ${responseTime}ms - Non-streaming response`);
    }

  } catch (error) {
    console.error(`[Error Processing Request] ${requestId}`);

    const errorContext = {
      requestId,
      method: req.method,
      path: req.path,
    };

    logError(error, errorContext);

    if (error.response) {
      logResponse(res, error.response.status, error.response.data);
      res.status(error.response.status).json(error.response.data);
    } else {
      const errorResponse = {
        error: {
          message: error.message,
          type: 'internal_error',
        },
      };
      logResponse(res, 500, errorResponse);
      res.status(500).json(errorResponse);
    }
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Straico Proxy running on http://localhost:${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 API endpoint: http://localhost:${PORT}/v1/chat/completions\n`);
});
