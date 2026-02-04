export async function simulateStream(responseText, res, config = {}) {
  const { chunkSize = 15, delay = 80 } = config;

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

function delayMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
