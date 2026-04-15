import {
  truncateString,
  sanitizeObject,
  formatChatCompletionResponse,
  formatSSEChunk,
  generateRequestId,
  formatError,
  delayMs,
} from '../utils.js';

let passCount = 0;
let failCount = 0;

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
    console.log(`  FAIL: ${testName} - "${needle}" not found in "${String(haystack).substring(0, 100)}"`);
    failCount++;
  }
}

console.log('=== Utils Tests ===');

console.log('\n--- truncateString ---');
assert(truncateString(null) === '', 'null returns empty string');
assert(truncateString(undefined) === '', 'undefined returns empty string');
assert(truncateString('') === '', 'empty string returns empty string');
assert(truncateString('hello') === 'hello', 'short string unchanged');
assert(truncateString('a'.repeat(100)) === 'a'.repeat(100), 'string at maxLength unchanged');
assert(truncateString('a'.repeat(101)) === 'a'.repeat(100) + '...', 'string over maxLength truncated with ...');
assert(truncateString('a'.repeat(50), 10) === 'a'.repeat(10) + '...', 'custom maxLength works');

console.log('\n--- sanitizeObject ---');
assert(sanitizeObject(null) === null, 'null returned as-is');
assert(sanitizeObject(undefined) === undefined, 'undefined returned as-is');
assert(sanitizeObject('hello') === 'hello', 'string returned as-is');
assert(sanitizeObject(42) === 42, 'number returned as-is');
const withPassword = sanitizeObject({ password: 'secret', name: 'test' });
assert(withPassword.password === '[REDACTED]', 'password redacted');
assert(withPassword.name === 'test', 'non-sensitive key preserved');
const withApiKey = sanitizeObject({ my_api_key: 'sk-123', token: 'abc' });
assert(withApiKey.my_api_key === '[REDACTED]', 'api_key redacted (substring match)');
assert(withApiKey.token === '[REDACTED]', 'token redacted');
const longContent = sanitizeObject({ content: 'a'.repeat(300) });
assert(longContent.content.endsWith('...[TRUNCATED]'), 'long content truncated');
assert(longContent.content.length < 250, 'truncated content shorter than original');
const nested = sanitizeObject({ outer: { password: 'nested-secret', safe: 'value' } });
assert(nested.outer.password === '[REDACTED]', 'nested password redacted');
assert(nested.outer.safe === 'value', 'nested safe value preserved');
const customRedact = sanitizeObject({ secret: 'x', ok: 'y' }, ['secret']);
assert(customRedact.secret === '[REDACTED]', 'custom keysToRedact works');
assert(customRedact.ok === 'y', 'non-custom key preserved');

console.log('\n--- formatChatCompletionResponse ---');
const fullData = {
  choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
  model: 'gpt-4',
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};
const fullResp = formatChatCompletionResponse(fullData, 'fallback-model');
assert(fullResp.object === 'chat.completion', 'object type correct');
assert(fullResp.model === 'gpt-4', 'model from data used');
assert(fullResp.choices[0].message.content === 'Hello!', 'content preserved');
assert(fullResp.choices[0].finish_reason === 'stop', 'finish_reason preserved');
assert(fullResp.usage.total_tokens === 15, 'usage preserved');
assert(fullResp.id.startsWith('chatcmpl-'), 'id has chatcmpl prefix');

const noModel = { choices: [{ message: { content: 'Hi' }, finish_reason: null }] };
const fallbackResp = formatChatCompletionResponse(noModel, 'fallback-model');
assert(fallbackResp.model === 'fallback-model', 'falls back to model param');
assert(fallbackResp.choices[0].finish_reason === 'stop', 'null finish_reason defaults to stop');
assert(fallbackResp.usage.prompt_tokens === 0, 'missing usage defaults to zeros');

const noContent = formatChatCompletionResponse({ choices: [{ message: { content: null } }] });
assert(noContent.choices[0].message.content === '', 'null content defaults to empty string');
assert(noContent.model === 'gpt-3.5-turbo', 'ultimate model fallback is gpt-3.5-turbo');

console.log('\n--- formatSSEChunk ---');
const sseChunk = formatSSEChunk({ content: 'test' }, 'chatcmpl-123', 'gpt-4', null);
assertIncludes(sseChunk, '"id":"chatcmpl-123"', 'SSE has correct id');
assertIncludes(sseChunk, '"model":"gpt-4"', 'SSE has correct model');
assertIncludes(sseChunk, '"content":"test"', 'SSE has content delta');
assertIncludes(sseChunk, '"finish_reason":null', 'null finish_reason');
assert(sseChunk.endsWith('\n\n'), 'SSE chunk ends with double newline');

const sseStop = formatSSEChunk({}, 'chatcmpl-456', 'gpt-4', 'stop');
assertIncludes(sseStop, '"finish_reason":"stop"', 'stop finish_reason');
assert(sseStop.startsWith('data: '), 'SSE chunk starts with "data: "');

console.log('\n--- generateRequestId ---');
const id1 = generateRequestId();
const id2 = generateRequestId();
assert(id1.startsWith('req_'), 'id starts with req_');
assert(id1 !== id2, 'ids are unique');
assert(id1.split('_').length >= 3, 'id has timestamp and random parts');

console.log('\n--- formatError ---');
const plainErr = new Error('something broke');
plainErr.code = 'ETIMEDOUT';
const plainFormatted = formatError(plainErr);
assert(plainFormatted.message === 'something broke', 'error message preserved');
assert(plainFormatted.type === 'Error', 'error type is constructor name');
assert(plainFormatted.code === 'ETIMEDOUT', 'error code preserved');
assertIncludes(plainFormatted.stack, 'something broke', 'stack trace included');

const httpErr = new Error('bad gateway');
httpErr.response = { status: 502, statusText: 'Bad Gateway', data: { error: 'upstream' } };
const httpFormatted = formatError(httpErr);
assert(httpFormatted.statusCode === 502, 'HTTP status code extracted');
assert(httpFormatted.statusText === 'Bad Gateway', 'HTTP status text extracted');
assert(httpFormatted.data.error === 'upstream', 'response data preserved');

const withCtx = formatError(plainErr, { requestId: 'req_123' });
assert(withCtx.context.requestId === 'req_123', 'context preserved');
const noCtx = formatError(plainErr);
assert(noCtx.context === undefined, 'no context when not provided');

console.log('\n--- delayMs ---');
const delayStart = Date.now();
await delayMs(50);
const delayElapsed = Date.now() - delayStart;
assert(delayElapsed >= 40, `delayMs resolves after ~50ms (actual: ${delayElapsed}ms)`);

console.log('\n--- shouldLog ---');
const logUtil = await import('../utils.js?cachebust=' + Date.now());
assert(logUtil.shouldLog('error') === true, 'error always passes');
assert(logUtil.shouldLog('warn') === true, 'warn passes at default info level');
assert(logUtil.shouldLog('info') === true, 'info passes at default info level');
assert(logUtil.shouldLog('debug') === false, 'debug filtered at default info level');

console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);
if (failCount > 0) process.exit(1);
