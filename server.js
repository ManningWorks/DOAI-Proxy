import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PROXY_PORT || 8000;
const STRAICO_API_KEY = process.env.STRAICO_API_KEY;
const STRAICO_API_URL = process.env.STRAICO_API_URL || 'https://api.straico.com/v1';

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'straico-proxy' });
});

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { messages, model, ...otherParams } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'messages is required and must be a non-empty array',
          type: 'invalid_request_error',
        },
      });
    }

    if (!model) {
      return res.status(400).json({
        error: {
          message: 'model is required',
          type: 'invalid_request_error',
        },
      });
    }

    console.log(`Request details: model=${model}, messages=${messages.length}`);

    const straicoRequest = {
      model: model,
      messages: messages,
      ...otherParams,
    };

    if (!straicoRequest.temperature) {
      straicoRequest.temperature = 0.7;
    }

    console.log('Forwarding to Straico API...');

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

    console.log('Received Straico response');

    const response = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: straicoResponse.data.model || model,
      choices: straicoResponse.data.choices || [{
        index: 0,
        message: {
          role: 'assistant',
          content: straicoResponse.data.choices[0]?.message?.content || '',
        },
        finish_reason: straicoResponse.data.choices[0]?.finish_reason || 'stop',
      }],
      usage: straicoResponse.data.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };

    console.log('Returning formatted response');
    res.json(response);

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

app.listen(PORT, () => {
  console.log(`\n🚀 Straico Proxy running on http://localhost:${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 API endpoint: http://localhost:${PORT}/v1/chat/completions\n`);
});
