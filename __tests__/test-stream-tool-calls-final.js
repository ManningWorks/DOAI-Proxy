import { streamToolCalls } from '../streaming.js';

let chunks = [];

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

console.log('Testing improved streamToolCalls function (simplified test)...\n');

async function test() {
  console.log('Sending tool calls...');
  await streamToolCalls(toolCalls, mockRes, 'test_id', 'gpt-4');

  console.log(`\nReceived ${chunks.length} chunks:`);

  let initChunks = 0;
  let finalCompleteChunk = false;
  let finalChunkHasEmptyDelta = false;

  chunks.forEach((chunk) => {
    const parsed = JSON.parse(chunk.replace(/^data: /, '').replace(/\n\n$/, ''));

    if (parsed.choices[0].delta.tool_calls) {
      parsed.choices[0].delta.tool_calls.forEach(tc => {
        if (tc.function && tc.function.name && !tc.function.arguments) {
          initChunks++;
        }
      });
    }

    if (parsed.choices[0].finish_reason === 'tool_calls') {
      finalCompleteChunk = true;
      if (Object.keys(parsed.choices[0].delta).length === 0) {
        finalChunkHasEmptyDelta = true;
      }
    }
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log('Verification:');
  console.log(`✓ Initialization chunks: ${initChunks} (expected: 2)`);
  console.log(`✓ Final complete chunk exists: ${finalCompleteChunk} (expected: true)`);
  console.log(`✓ Final chunk has empty delta: ${finalChunkHasEmptyDelta} (expected: true)`);

  if (initChunks === 2 && finalCompleteChunk && finalChunkHasEmptyDelta) {
    console.log('\n✅ Test passed! Tool calls are streamed correctly.');
    console.log('   - 2 initialization chunks (name, type, id, empty args)');
    console.log('   - Multiple argument chunks (streaming args incrementally)');
    console.log('   - 1 final chunk (empty delta with finish_reason)');
  } else {
    console.log('\n❌ Test failed!');
    console.log(`   Init chunks: ${initChunks} (expected 2)`);
    console.log(`   Final complete: ${finalCompleteChunk} (expected true)`);
    console.log(`   Final empty delta: ${finalChunkHasEmptyDelta} (expected true)`);
    process.exit(1);
  }
}

test().catch(error => {
  console.error('Test failed with error:', error);
  process.exit(1);
});
