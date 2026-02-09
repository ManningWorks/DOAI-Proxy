import { streamToolCalls } from '../streaming.js';

let chunks = [];

const mockRes = {
  write: function(data) {
    chunks.push(data);
  },
};

const toolCalls = [
  {
    id: 'call_1',
    type: 'function',
    function: {
      name: 'read',
      arguments: '{"filePath": "/path/to/file.txt"}',
    },
  },
  {
    id: 'call_2',
    type: 'function',
    function: {
      name: 'bash',
      arguments: '{"command": "ls -la"}',
    },
  },
  {
    id: 'call_3',
    type: 'function',
    function: {
      name: 'write',
      arguments: '{"filePath": "/path/to/output.txt", "content": "hello"}',
    },
  },
];

console.log('Testing tool call index consistency...\n');

async function test() {
  console.log('Streaming 3 tool calls...');
  await streamToolCalls(toolCalls, mockRes, 'test_id', 'gpt-4');

  console.log(`\nReceived ${chunks.length} chunks\n`);

  console.log(`\n${'='.repeat(60)}`);
  console.log('Analyzing index consistency...\n');

  const indicesByTool = new Map();
  const indexChunks = new Map();
  let hasError = false;

  chunks.forEach((chunk, chunkIndex) => {
    try {
      const parsed = JSON.parse(chunk.replace(/^data: /, '').replace(/\n\n$/, ''));
      const delta = parsed.choices[0].delta;

      if (delta.tool_calls) {
        delta.tool_calls.forEach(tc => {
          const index = tc.index;

          if (!indexChunks.has(index)) {
            indexChunks.set(index, []);
          }
          indexChunks.get(index).push(chunkIndex + 1);

          if (tc.id) {
            const toolId = tc.id;

            if (indicesByTool.has(toolId)) {
              const existingIndex = indicesByTool.get(toolId);
              if (existingIndex !== index) {
                console.error(`❌ ERROR: Tool ${toolId} index mismatch!`);
                console.error(`   Previous chunks had index: ${existingIndex}`);
                console.error(`   Chunk ${chunkIndex + 1} has index: ${index}`);
                hasError = true;
              }
            } else {
              indicesByTool.set(toolId, index);
            }
          }
        });
      }
    } catch (error) {
      console.error(`Failed to parse chunk ${chunkIndex}:`, error.message);
      hasError = true;
    }
  });

  console.log('\nTool ID to Index Mapping:');
  indicesByTool.forEach((index, toolId) => {
    console.log(`  ${toolId}: index = ${index}`);
  });

  console.log('\nChunk Distribution by Index:');
  indexChunks.forEach((chunkNums, idx) => {
    console.log(`  Index ${idx}: ${chunkNums.length} chunk(s) [${chunkNums.join(', ')}]`);
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log('Verification:');

  const uniqueIndices = new Set(indexChunks.keys());
  const expectedIndices = [0, 1, 2];

  console.log(`✓ Number of unique tool IDs: ${indicesByTool.size} (expected: 3)`);
  console.log(`✓ Number of unique indices: ${uniqueIndices.size} (expected: 3)`);
  console.log(`✓ Unique indices found: [${Array.from(uniqueIndices).sort().join(', ')}]`);
  console.log(`✓ Expected indices: [${expectedIndices.join(', ')}]`);

  const allExpectedIndicesPresent = expectedIndices.every(idx => uniqueIndices.has(idx));
  console.log(`✓ All expected indices present: ${allExpectedIndicesPresent}`);

  const allIndicesHaveChunks = expectedIndices.every(idx => indexChunks.has(idx) && indexChunks.get(idx).length > 0);
  console.log(`✓ All indices have associated chunks: ${allIndicesHaveChunks}`);

  if (!hasError && indicesByTool.size === 3 && allExpectedIndicesPresent && allIndicesHaveChunks) {
    console.log('\n✅ Index consistency test passed!');
    console.log('   - All 3 tool calls have consistent indices');
    console.log('   - Indices are unique: 0, 1, 2');
    console.log('   - No index mismatches across chunks');
  } else {
    console.log('\n❌ Index consistency test failed!');
    process.exit(1);
  }
}

test().catch(error => {
  console.error('Test failed with error:', error);
  process.exit(1);
});
