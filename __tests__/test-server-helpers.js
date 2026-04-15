import {
  validateRequestBody,
  validateProviderResponse,
  extractToolCalls,
  handleUpstreamError,
  setSSEHeaders,
  writeStreamError,
} from '../request-handlers.js';
import { MODEL_LIMITS } from '../utils/model-limits.js';

import fs from 'fs/promises';

let passCount = 0;
let failCount = 0;

await fs.mkdir('logs', { recursive: true });

function assert(condition, testName) {
  if (condition) {
    console.log(`  PASS: ${testName}`);
    passCount++;
  } else {
    console.log(`  FAIL: ${testName}`);
    failCount++;
  }
}

function assertIncludes(haystack, needle, testName) {
  if (typeof haystack === 'string' && haystack.includes(needle)) {
    console.log(`  PASS: ${testName}`);
    passCount++;
  } else {
    console.log(`  FAIL: ${testName} - "${needle}" not found`);
    failCount++;
  }
}

function assertThrows(fn, expectedSubstring, testName) {
  try {
    fn();
    console.log(`  FAIL: ${testName} - no error thrown`);
    failCount++;
  } catch (e) {
    if (e.message.includes(expectedSubstring)) {
      console.log(`  PASS: ${testName}`);
      passCount++;
    } else {
      console.log(`  FAIL: ${testName} - expected "${expectedSubstring}" in "${e.message}"`);
      failCount++;
    }
  }
}

function createMockRes() {
  const res = {
    headers: {},
    statusCode: 200,
    jsonData: null,
    ended: false,
    written: [],
    setHeader(key, val) { res.headers[key.toLowerCase()] = val; },
    get(key) { return res.headers[key.toLowerCase()]; },
    status(code) { res.statusCode = code; return res; },
    json(data) { res.jsonData = data; },
    write(data) { res.written.push(data); },
    end() { res.ended = true; },
  };
  return res;
}

console.log('=== Server Helper Tests ===');

console.log('\n--- setSSEHeaders ---');
const sseRes = createMockRes();
setSSEHeaders(sseRes);
assert(sseRes.headers['content-type'] === 'text/event-stream', 'Content-Type set');
assert(sseRes.headers['cache-control'] === 'no-cache', 'Cache-Control set');
assert(sseRes.headers['connection'] === 'keep-alive', 'Connection set');

console.log('\n--- writeStreamError ---');
const errRes = createMockRes();
writeStreamError(errRes, 'test-model');
const written = errRes.written.map(w => w.toString());
assert(written.length === 2, 'writes 2 chunks (error + DONE)');
assertIncludes(written[0], '"finish_reason":"error"', 'error chunk has finish_reason error');
assertIncludes(written[0], '"model":"test-model"', 'error chunk has correct model');
assertIncludes(written[0], '"object":"chat.completion.chunk"', 'error chunk has correct object type');
assert(written[1] === 'data: [DONE]\n\n', 'second chunk is [DONE]');
assert(errRes.ended === true, 'response ended');

console.log('\n--- validateRequestBody: missing messages ---');
const noMsgs = validateRequestBody({ model: 'gpt-4' });
assert(noMsgs !== null, 'missing messages returns error');
assert(noMsgs.status === 400, 'status is 400');
assertIncludes(noMsgs.error.error.message, 'messages is required', 'error message mentions messages');

console.log('\n--- validateRequestBody: empty messages ---');
const emptyMsgs = validateRequestBody({ model: 'gpt-4', messages: [] });
assert(emptyMsgs !== null, 'empty messages returns error');
assert(emptyMsgs.status === 400, 'status 400');

console.log('\n--- validateRequestBody: non-array messages ---');
const badMsgs = validateRequestBody({ model: 'gpt-4', messages: 'hello' });
assert(badMsgs !== null, 'non-array messages returns error');

console.log('\n--- validateRequestBody: missing model ---');
const noModel = validateRequestBody({ messages: [{ role: 'user', content: 'hi' }] });
assert(noModel !== null, 'missing model returns error');
assertIncludes(noModel.error.error.message, 'model is required', 'error message mentions model');

console.log('\n--- validateRequestBody: valid body ---');
const valid = validateRequestBody({ model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] });
assert(valid === null, 'valid body returns null');

console.log('\n--- validateRequestBody: context limit exceeded ---');
const TEST_CTX_MODEL = 'test/ctx-model';
MODEL_LIMITS[TEST_CTX_MODEL] = { max_output: 100, word_limit: 200, name: 'Test', model_type: 'chat' };
const ctxExceeded = validateRequestBody({
  model: TEST_CTX_MODEL,
  messages: [{ role: 'user', content: 'a'.repeat(1000) }],
  max_tokens: 100,
});
assert(ctxExceeded !== null, 'context exceeded returns error');
assert(ctxExceeded.status === 400, 'status is 400');
delete MODEL_LIMITS[TEST_CTX_MODEL];

console.log('\n--- validateProviderResponse: no data ---');
assertThrows(() => validateProviderResponse({}), 'No data', 'no data throws');

console.log('\n--- validateProviderResponse: no choices ---');
assertThrows(() => validateProviderResponse({ data: {} }), 'No choices', 'no choices throws');
assertThrows(() => validateProviderResponse({ data: { choices: [] } }), 'No choices', 'empty choices throws');

console.log('\n--- validateProviderResponse: no message ---');
assertThrows(
  () => validateProviderResponse({ data: { choices: [{ finish_reason: 'stop' }] } }),
  'No message', 'no message throws'
);

console.log('\n--- validateProviderResponse: valid ---');
let validThrew = false;
try {
  validateProviderResponse({ data: { choices: [{ message: { content: 'hi' } }] } });
} catch { validThrew = true; }
assert(!validThrew, 'valid response does not throw');

console.log('\n--- extractToolCalls: no tools ---');
assert(extractToolCalls('response', null) === null, 'null tools returns null');
assert(extractToolCalls('response', undefined) === null, 'undefined tools returns null');

console.log('\n--- extractToolCalls: no tool calls detected ---');
const tools = [{ type: 'function', function: { name: 'bash', description: 'run', parameters: {} } }];
assert(extractToolCalls('just regular text', tools) === null, 'no tool calls in text returns null');

console.log('\n--- extractToolCalls: valid tool calls ---');
const validCalls = extractToolCalls('TOOL_CALL: bash\nARGUMENTS: {"command":"ls"}', tools);
assert(validCalls !== null, 'valid tool calls returned');
assert(validCalls.length === 1, 'one tool call returned');
assert(validCalls[0].function.name === 'bash', 'tool name correct');

console.log('\n--- extractToolCalls: invalid tool names filtered ---');
const filtered = extractToolCalls('TOOL_CALL: unknown_tool\nARGUMENTS: {}', tools);
assert(filtered === null, 'unknown tool name returns null');

console.log('\n--- extractToolCalls: mixed valid/invalid ---');
const mixedInput = 'TOOL_CALL: unknown\nARGUMENTS: {}\n\nTOOL_CALL: bash\nARGUMENTS: {"command":"ls"}';
const mixed = extractToolCalls(mixedInput, tools);
assert(mixed !== null, 'mixed result not null');
assert(mixed.length === 1, 'only valid tool call kept');
assert(mixed[0].function.name === 'bash', 'valid tool name is bash');

console.log('\n--- handleUpstreamError: upstream HTTP error ---');
const httpErr = new Error('bad gateway');
httpErr.response = { status: 502, data: { error: { message: 'upstream error' } } };
const httpRes = createMockRes();
await handleUpstreamError(httpErr, httpRes, 100);
assert(httpRes.statusCode === 502, 'upstream error: status 502');
assert(httpRes.jsonData.error.message === 'upstream error', 'upstream error data forwarded');

console.log('\n--- handleUpstreamError: custom statusCode ---');
const customErr = new Error('custom error');
customErr.statusCode = 422;
const customRes = createMockRes();
await handleUpstreamError(customErr, customRes, 50);
assert(customRes.statusCode === 422, 'custom statusCode: status 422');
assert(customRes.jsonData.error.type === 'invalid_request_error', 'custom statusCode error type');

console.log('\n--- handleUpstreamError: ECONNREFUSED ---');
const connErr = new Error('connection refused');
connErr.code = 'ECONNREFUSED';
const connRes = createMockRes();
await handleUpstreamError(connErr, connRes, 200);
assert(connRes.statusCode === 502, 'ECONNREFUSED: status 502');
assert(connRes.jsonData.error.type === 'upstream_error', 'ECONNREFUSED: upstream_error type');

console.log('\n--- handleUpstreamError: ETIMEDOUT ---');
const timeoutErr = new Error('timed out');
timeoutErr.code = 'ETIMEDOUT';
const timeoutRes = createMockRes();
await handleUpstreamError(timeoutErr, timeoutRes, 5000);
assert(timeoutRes.statusCode === 504, 'ETIMEDOUT: status 504');
assert(timeoutRes.jsonData.error.type === 'upstream_error', 'ETIMEDOUT: upstream_error type');

console.log('\n--- handleUpstreamError: unknown error ---');
const unknownErr = new Error('something unexpected');
const unknownRes = createMockRes();
await handleUpstreamError(unknownErr, unknownRes, 10);
assert(unknownRes.statusCode === 500, 'unknown error: status 500');
assert(unknownRes.jsonData.error.type === 'internal_error', 'unknown error: internal_error type');
assert(unknownRes.jsonData.error.message === 'something unexpected', 'unknown error: message preserved');

console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);
if (failCount > 0) process.exit(1);
