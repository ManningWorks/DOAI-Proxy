import { delayMs, formatSSEChunk } from './utils.js';

export async function simulateStream(responseText, res, config = {}) {
  const { chunkSize = 15, delay = 80 } = config;

  if (typeof responseText !== 'string') {
    throw new Error('responseText must be a string');
  }

  if (!responseText) {
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
    return;
  }

  const chunks = responseText.match(new RegExp(`.{1,${chunkSize}}`, 'g')) || [responseText];

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

export async function streamToolCalls(toolCalls, res, id, model) {
  if (!toolCalls || toolCalls.length === 0) {
    return;
  }

  console.log(`[StreamToolCalls] Starting to stream ${toolCalls.length} tool call(s)`);

  const initDelay = 20;
  const argsDelay = 10;
  const finalDelay = 20;

  for (let i = 0; i < toolCalls.length; i++) {
    const toolCall = toolCalls[i];
    console.log(`[StreamToolCalls] Tool ${i}: ${toolCall.function.name} (args length: ${toolCall.function.arguments.length})`);

    const initChunk = {
      tool_calls: [{
        index: i,
        id: toolCall.id,
        type: toolCall.type || 'function',
        function: {
          name: toolCall.function.name,
          arguments: '',
        },
      }],
    };

    await delayMs(initDelay);
    res.write(formatSSEChunk(initChunk, id, model, null));

    const args = toolCall.function.arguments;

    if (args.length > 0) {
      const chunkSize = Math.max(20, Math.floor(args.length / 2));
      let chunkCount = 0;

      for (let offset = 0; offset < args.length; offset += chunkSize) {
        const chunkEnd = Math.min(offset + chunkSize, args.length);
        const argsChunk = {
          tool_calls: [{
            index: i,
            function: {
              arguments: args.substring(offset, chunkEnd),
            },
          }],
        };

        await delayMs(argsDelay);
        res.write(formatSSEChunk(argsChunk, id, model, null));
        chunkCount++;
      }

      console.log(`[StreamToolCalls] Sent ${chunkCount} argument chunk(s) for tool ${i}`);
    }
  }

  console.log('[StreamToolCalls] Sending final chunk with finish_reason: \'tool_calls\'');

  const finalChunkData = {
    id: id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [{
      index: 0,
      delta: {},
      finish_reason: 'tool_calls',
    }],
  };

  await delayMs(finalDelay);
  res.write(`data: ${JSON.stringify(finalChunkData)}\n\n`);
}
