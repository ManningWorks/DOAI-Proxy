import { streamToolCalls } from '../streaming.js';

let chunks = [];
let finalChunks = [];

const mockRes = {
  write: function(data) {
    chunks.push(data);
  },
};

const toolCalls = [
  {
    id: 'call_test_1',
    type: 'function',
    function: {
      name: 'read',
      arguments: '{"filePath": "/path/to/file.txt"}',
    },
  },
  {
    id: 'call_test_2',
    type: 'function',
    function: {
      name: 'bash',
      arguments: '{"command": "ls -la"}',
    },
  },
];

console.log('Testing streamToolCalls function...\n');

async function test() {
  console.log('Sending tool calls...');
  await streamToolCalls(toolCalls, mockRes, 'test_id', 'gpt-4');

  console.log(`\nReceived ${chunks.length} chunks:`);

  chunks.forEach((chunk, index) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Chunk ${index + 1}:`);
    console.log(chunk);

    try {
      const parsed = chunk.replace(/^data: /, '').replace(/\n\n$/, '');
      const data = JSON.parse(parsed);
      finalChunks.push(data);
    } catch (e) {
      console.error(`Failed to parse chunk ${index}:`, e.message);
    }
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log('Parsed chunks:');
  finalChunks.forEach((data, index) => {
    console.log(`\nParsed chunk ${index + 1}:`);
    console.log(JSON.stringify(data, null, 2));
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log('Verification:');

  const initChunks = finalChunks.filter(c =>
    c.choices[0].delta.tool_calls &&
    c.choices[0].delta.tool_calls.some(tc => tc.function && tc.function.name && !tc.function.arguments)
  );
  console.log(`✓ Initialization chunks: ${initChunks.length} (expected: 2)`);

  const argsChunks = finalChunks.filter(c =>
    c.choices[0].delta.tool_calls &&
    c.choices[0].delta.tool_calls.some(tc => tc.function && tc.function.arguments && tc.function.arguments.length === 1)
  );
  console.log(`✓ Argument chunks: ${argsChunks.length}`);

  const finalCompleteChunks = finalChunks.filter(c =>
    c.choices[0].finish_reason === 'tool_calls' &&
    Object.keys(c.choices[0].delta).length === 0
  );
  console.log(`✓ Final complete chunks: ${finalCompleteChunks.length} (expected: 1)`);
  console.log(`✓ Final chunk has empty delta: ${finalCompleteChunks.length > 0 ? '✓' : '✗'}`);

  if (initChunks.length === 2 && finalCompleteChunks.length === 1) {
    console.log('\n✅ Test passed! Tool calls are streamed correctly as incremental deltas.');
  } else {
    console.log('\n❌ Test failed! Tool calls are not in correct format.');
    process.exit(1);
  }
}

test().catch(error => {
  console.error('Test failed with error:', error);
  process.exit(1);
});
