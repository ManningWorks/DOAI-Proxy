import { BaseProvider } from '../providers/base-provider.js';

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

function assertIncludes(haystack, needle, testName) {
  if (typeof haystack === 'string' && haystack.includes(needle)) {
    console.log(`  PASS: ${testName}`);
    passCount++;
  } else {
    console.log(`  FAIL: ${testName} - "${needle}" not found in "${String(haystack).substring(0, 100)}"`);
    failCount++;
  }
}

class TestProvider extends BaseProvider {
  constructor(config, mockFn) {
    super(config);
    this._mockRequest = mockFn || (() => Promise.resolve({ data: { ok: true } }));
  }
  getType() { return 'test'; }
  getName() { return 'test'; }
  validateConfig() { return true; }
  transformRequest(r) { return r; }
  transformResponse(r) { return r; }
  async makeRequest(request) { return this._mockRequest(request); }
  supportsStreaming() { return false; }
  supportsTools() { return false; }
}

console.log('=== Base Provider Tests ===');

console.log('\n--- Abstract class enforcement ---');
assertThrows(() => new BaseProvider({}), 'abstract', 'cannot instantiate BaseProvider directly');

const provider = new TestProvider({});
assert(provider.config !== undefined, 'config is set on instance');

console.log('\n--- Abstract method enforcement ---');
const abstractProvider = new TestProvider({});
abstractProvider.getType = BaseProvider.prototype.getType;
assertThrows(() => abstractProvider.getType(), 'must be implemented', 'getType throws');
abstractProvider.getName = BaseProvider.prototype.getName;
assertThrows(() => abstractProvider.getName(), 'must be implemented', 'getName throws');
abstractProvider.validateConfig = BaseProvider.prototype.validateConfig;
assertThrows(() => abstractProvider.validateConfig(), 'must be implemented', 'validateConfig throws');
abstractProvider.transformRequest = BaseProvider.prototype.transformRequest;
assertThrows(() => abstractProvider.transformRequest({}), 'must be implemented', 'transformRequest throws');
abstractProvider.transformResponse = BaseProvider.prototype.transformResponse;
assertThrows(() => abstractProvider.transformResponse({}), 'must be implemented', 'transformResponse throws');
abstractProvider.makeRequest = BaseProvider.prototype.makeRequest;
try {
  await abstractProvider.makeRequest({});
  console.log('  FAIL: makeRequest throws (async) - no error thrown');
  failCount++;
} catch (e) {
  assertIncludes(e.message, 'must be implemented', 'makeRequest throws (async)');
}
abstractProvider.supportsStreaming = BaseProvider.prototype.supportsStreaming;
assertThrows(() => abstractProvider.supportsStreaming(), 'must be implemented', 'supportsStreaming throws');
abstractProvider.supportsTools = BaseProvider.prototype.supportsTools;
assertThrows(() => abstractProvider.supportsTools(), 'must be implemented', 'supportsTools throws');

console.log('\n--- _isRetryableError ---');
const retryProvider = new TestProvider({});

assert(retryProvider._isRetryableError({ code: 'ECONNREFUSED' }) === true, 'ECONNREFUSED is retryable');
assert(retryProvider._isRetryableError({ code: 'ENOTFOUND' }) === true, 'ENOTFOUND is retryable');
assert(retryProvider._isRetryableError({ code: 'ECONNRESET' }) === true, 'ECONNRESET is retryable');
assert(retryProvider._isRetryableError({ code: 'ETIMEDOUT' }) === true, 'ETIMEDOUT is retryable');
assert(retryProvider._isRetryableError({ code: 'ECONNABORTED' }) === true, 'ECONNABORTED is retryable');
assert(retryProvider._isRetryableError({ code: 'EINVAL' }) === false, 'EINVAL is not retryable');
assert(retryProvider._isRetryableError({ response: { status: 429 } }) === true, '429 is retryable');
assert(retryProvider._isRetryableError({ response: { status: 500 } }) === true, '500 is retryable');
assert(retryProvider._isRetryableError({ response: { status: 502 } }) === true, '502 is retryable');
assert(retryProvider._isRetryableError({ response: { status: 503 } }) === true, '503 is retryable');
assert(retryProvider._isRetryableError({ response: { status: 504 } }) === true, '504 is retryable');
assert(retryProvider._isRetryableError({ response: { status: 400 } }) === false, '400 is not retryable');
assert(retryProvider._isRetryableError({ response: { status: 401 } }) === false, '401 is not retryable');
assert(retryProvider._isRetryableError({ response: { status: 404 } }) === false, '404 is not retryable');
assert(retryProvider._isRetryableError({}) === false, 'empty error is not retryable');
assert(retryProvider._isRetryableError({ code: 'ECONNREFUSED', response: { status: 400 } }) === true, 'code takes precedence');

console.log('\n--- makeRequestWithRetry (success) ---');
const successProvider = new TestProvider({}, () => Promise.resolve({ data: { ok: true } }));
const successResult = await successProvider.makeRequestWithRetry({ test: true });
assert(successResult.data.ok === true, 'returns result on first attempt');

console.log('\n--- makeRequestWithRetry (retryable then success) ---');
let callCount = 0;
const retryThenSuccess = new TestProvider({}, () => {
  callCount++;
  if (callCount === 1) {
    const err = new Error('rate limited');
    err.code = 'ECONNREFUSED';
    return Promise.reject(err);
  }
  return Promise.resolve({ data: { attempt: callCount } });
});
const origRetryDelay = process.env.RETRY_BASE_DELAY_MS;
process.env.RETRY_BASE_DELAY_MS = '1';
const retryResult = await retryThenSuccess.makeRequestWithRetry({});
assert(retryResult.data.attempt === 2, 'succeeds on second attempt after retryable error');
process.env.RETRY_BASE_DELAY_MS = origRetryDelay;

console.log('\n--- makeRequestWithRetry (non-retryable fails immediately) ---');
let nonRetryCalls = 0;
const nonRetryProvider = new TestProvider({}, () => {
  nonRetryCalls++;
  const err = new Error('bad request');
  err.response = { status: 400, data: { error: 'invalid' } };
  return Promise.reject(err);
});
try {
  await nonRetryProvider.makeRequestWithRetry({});
  console.log('  FAIL: non-retryable should throw');
  failCount++;
} catch (e) {
  assert(nonRetryCalls === 1, 'non-retryable error fails immediately without retry');
  assert(e.message === 'bad request', 'original error message preserved');
}

console.log('\n--- makeRequestWithRetry (all attempts exhausted) ---');
let exhaustCalls = 0;
const exhaustProvider = new TestProvider({}, () => {
  exhaustCalls++;
  const err = new Error('server error');
  err.response = { status: 500 };
  return Promise.reject(err);
});
process.env.RETRY_BASE_DELAY_MS = '1';
process.env.RETRY_MAX_ATTEMPTS = '2';
try {
  await exhaustProvider.makeRequestWithRetry({});
  console.log('  FAIL: exhausted retries should throw');
  failCount++;
} catch (e) {
  assert(exhaustCalls === 2, `exhausts all 2 attempts (actual: ${exhaustCalls})`);
  assert(e.message === 'server error', 'last error thrown');
}
delete process.env.RETRY_BASE_DELAY_MS;
delete process.env.RETRY_MAX_ATTEMPTS;

console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);
if (failCount > 0) process.exit(1);
