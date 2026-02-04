export function delayMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatError(error, context = {}) {
  const errorData = {
    timestamp: new Date().toISOString(),
    type: error.constructor.name,
    message: error.message,
    code: error.code,
    stack: error.stack,
  };

  if (error.response) {
    errorData.statusCode = error.response.status;
    errorData.statusText = error.response.statusText;
    errorData.data = error.response.data;
  }

  if (Object.keys(context).length > 0) {
    errorData.context = context;
  }

  return errorData;
}

export function logRequest(req) {
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'authorization': req.headers['authorization'] ? '[REDACTED]' : undefined,
    },
    body: req.body,
  };

  const logEntry = JSON.stringify(logData, null, 2);
  console.log(logEntry);

  return logData;
}

export function logResponse(res, statusCode, responseData) {
  const logData = {
    timestamp: new Date().toISOString(),
    statusCode: statusCode,
    headers: {
      'content-type': res.get('content-type'),
    },
    body: responseData,
  };

  const logEntry = JSON.stringify(logData, null, 2);
  console.log(logEntry);

  return logData;
}

export function logRequestDetails(model, messages, hasTools) {
  const logData = {
    timestamp: new Date().toISOString(),
    model: model,
    messageCount: messages.length,
    hasTools: hasTools,
    messages: messages.map(m => ({
      role: m.role,
      contentLength: m.content?.length || 0,
    })),
  };

  const logEntry = JSON.stringify(logData, null, 2);
  console.log(logEntry);

  return logData;
}

export function logStraicoResponse(response) {
  const logData = {
    timestamp: new Date().toISOString(),
    statusCode: response.status,
    statusText: response.statusText,
    data: {
      model: response.data.model,
      choices: response.data.choices?.map(c => ({
        index: c.index,
        finishReason: c.finish_reason,
        contentLength: c.message?.content?.length || 0,
      })),
      usage: response.data.usage,
    },
  };

  const logEntry = JSON.stringify(logData, null, 2);
  console.log(logEntry);

  return logData;
}

export function logError(error, context = {}) {
  const logData = formatError(error, context);
  const logEntry = JSON.stringify(logData, null, 2);
  console.error(logEntry);

  return logData;
}

export function formatChatCompletionResponse(data, model) {
  const aiResponse = data.choices[0]?.message?.content || '';

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: data.model || model || 'gpt-3.5-turbo',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: aiResponse,
      },
      finish_reason: data.choices[0]?.finish_reason || 'stop',
    }],
    usage: data.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

export function formatSSEChunk(chunk, id, model, finishReason = null) {
  const sseData = {
    id: id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [{
      index: 0,
      delta: chunk,
      finish_reason: finishReason,
    }],
  };

  return `data: ${JSON.stringify(sseData)}\n\n`;
}

export function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function truncateString(str, maxLength = 100) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

export function sanitizeObject(obj, keysToRedact = ['password', 'token', 'api_key']) {
  if (!obj || typeof obj !== 'object') return obj;

  const sanitized = { ...obj };

  Object.keys(sanitized).forEach(key => {
    if (keysToRedact.some(redactKey => key.toLowerCase().includes(redactKey))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeObject(sanitized[key], keysToRedact);
    }
  });

  return sanitized;
}
