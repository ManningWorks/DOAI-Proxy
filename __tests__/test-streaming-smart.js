import { simulateStream } from '../streaming.js';
import { EventEmitter } from 'events';

let passCount = 0;
let failCount = 0;

const origEnv = { ...process.env };

function resetEnv() {
  process.env = { ...origEnv };
}

function assert(condition, testName) {
  if (condition) {
    console.log(`  PASS: ${testName}`);
    passCount++;
  } else {
    console.log(`  FAIL: ${testName}`);
    failCount++;
  }
}

function createMockResponse() {
  const chunks = [];
  const emitter = new EventEmitter();
  return {
    write(data) { chunks.push(data); },
    end() { emitter.emit('end'); },
    on(event, handler) { emitter.on(event, handler); },
    getChunks() { return chunks; },
    getChunkStrings() { return chunks.map(c => c.toString()); },
  };
}

function parseSSEChunks(rawChunks) {
  const all = rawChunks.map(c => c.toString()).join('');
  return all.split('\n')
    .filter(line => line.startsWith('data: ') && line !== 'data: [DONE]')
    .map(line => JSON.parse(line.substring(6)));
}

console.log('=== Streaming Smart Mode Tests ===');

console.log('\n--- simulateStream with STREAM_MODE=smart ---');
process.env.STREAM_MODE = 'smart';

const smartRes = createMockResponse();
await simulateStream('Hello world', smartRes, { chunkSize: 5, delay: 1 });
const smartChunks = parseSSEChunks(smartRes.getChunkStrings());
assert(smartChunks.length >= 2, `smart mode produces multiple chunks (${smartChunks.length})`);
const smartContent = smartChunks.filter(c => c.choices[0].delta.content).map(c => c.choices[0].delta.content).join('');
assert(smartContent === 'Hello world', `smart mode content reassembles correctly: "${smartContent}"`);
const smartIds = [...new Set(smartChunks.map(c => c.id))];
assert(smartIds.length === 1, 'all chunks share same stream ID');
const smartFinish = smartChunks.find(c => c.choices[0].finish_reason === 'stop');
assert(smartFinish !== undefined, 'final chunk has finish_reason stop');
assert(smartFinish.choices[0].delta.content === undefined || Object.keys(smartFinish.choices[0].delta).length === 0, 'final chunk has empty delta');

console.log('\n--- simulateStream smart mode with empty string ---');
const emptyRes = createMockResponse();
await simulateStream('', emptyRes, { chunkSize: 5, delay: 1 });
const emptyChunks = parseSSEChunks(emptyRes.getChunkStrings());
assert(emptyChunks.length === 1, 'empty string produces single final chunk');
assert(emptyChunks[0].choices[0].finish_reason === 'stop', 'empty final chunk has stop');

console.log('\n--- simulateStream STREAM_MODE=none ---');
process.env.STREAM_MODE = 'none';

const noneRes = createMockResponse();
await simulateStream('Full response here', noneRes, { delay: 1 });
const noneChunks = parseSSEChunks(noneRes.getChunkStrings());
const noneContent = noneChunks.filter(c => c.choices[0].delta?.content).map(c => c.choices[0].delta.content).join('');
assert(noneContent === 'Full response here', 'none mode sends entire content in one chunk');
const noneIds = [...new Set(noneChunks.map(c => c.id))];
assert(noneIds.length === 1, 'none mode: all chunks share same ID');

console.log('\n--- simulateStream none mode empty string ---');
const noneEmptyRes = createMockResponse();
await simulateStream('', noneEmptyRes, { delay: 1 });
const noneEmptyChunks = parseSSEChunks(noneEmptyRes.getChunkStrings());
assert(noneEmptyChunks.length === 1, 'none mode empty produces single chunk');
assert(noneEmptyChunks[0].choices[0].finish_reason === 'stop', 'none mode empty has stop');

console.log('\n--- validateStreamMode: invalid mode ---');
process.env.STREAM_MODE = 'invalid';
try {
  await simulateStream('test', createMockResponse());
  console.log('  FAIL: invalid STREAM_MODE should throw');
  failCount++;
} catch (e) {
  assert(e.message.includes('Invalid STREAM_MODE'), 'invalid mode throws with descriptive message');
}

console.log('\n--- validateStreamMode: simple mode deprecation ---');
process.env.STREAM_MODE = 'simple';
try {
  await simulateStream('test', createMockResponse());
  console.log('  FAIL: simple mode should throw');
  failCount++;
} catch (e) {
  assert(e.message.includes('Invalid STREAM_MODE'), 'simple mode rejected as invalid');
}

console.log('\n--- validateStreamMode: case insensitive ---');
process.env.STREAM_MODE = 'SMART';
const upperRes = createMockResponse();
await simulateStream('test', upperRes, { chunkSize: 5, delay: 1 });
const upperChunks = parseSSEChunks(upperRes.getChunkStrings());
assert(upperChunks.length >= 2, 'SMART (uppercase) works');

process.env.STREAM_MODE = 'NONE';
const upperNoneRes = createMockResponse();
await simulateStream('test', upperNoneRes, { delay: 1 });
const upperNoneChunks = parseSSEChunks(upperNoneRes.getChunkStrings());
assert(upperNoneChunks.length >= 1, 'NONE (uppercase) works');

console.log('\n--- validateStreamMode: null/undefined defaults to none ---');
process.env.STREAM_MODE = '';
const defaultRes = createMockResponse();
await simulateStream('test', defaultRes, { delay: 1 });
const defaultChunks = parseSSEChunks(defaultRes.getChunkStrings());
assert(defaultChunks.length >= 1, 'empty STREAM_MODE defaults to none');

console.log('\n--- simulateStream with non-string input ---');
process.env.STREAM_MODE = 'smart';
try {
  await simulateStream(123, createMockResponse());
  console.log('  FAIL: non-string should throw');
  failCount++;
} catch (e) {
  assert(e.message.includes('must be a string'), 'non-string throws descriptive error');
}

resetEnv();

console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);
if (failCount > 0) process.exit(1);
