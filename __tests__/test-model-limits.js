import { validateTotalContext, getModelLimits, MODEL_LIMITS, fetchModelLimits } from '../utils/model-limits.js';

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

const TEST_MODEL = 'test/validation-model';
const origLimits = { ...MODEL_LIMITS };
const origEnv = { ...process.env };

function setupModel() {
  MODEL_LIMITS[TEST_MODEL] = {
    max_output: 4096,
    word_limit: 8192,
    name: 'Test Model',
    model_type: 'chat',
  };
}

function cleanupModel() {
  for (const key of Object.keys(MODEL_LIMITS)) {
    if (!(key in origLimits)) delete MODEL_LIMITS[key];
  }
}

function resetEnv() {
  process.env = { ...origEnv };
}

console.log('=== Model Limits Tests ===');

console.log('\n--- validateTotalContext ---');
setupModel();

assert(validateTotalContext(1000, 1000, TEST_MODEL) === null, 'total under limit returns null');
assert(validateTotalContext(4000, 5000, TEST_MODEL) !== null, 'total exceeds limit returns error');
const overError = validateTotalContext(4000, 5000, TEST_MODEL);
assert(overError.error.type === 'invalid_request_error', 'error type correct');
assertIncludes(overError.error.message, '8192', 'error message includes word_limit');
assertIncludes(overError.error.message, TEST_MODEL, 'error message includes model name');
assert(validateTotalContext(4096, 4096, TEST_MODEL) === null, 'exactly at limit returns null');
assert(validateTotalContext(4096, 4097, TEST_MODEL) !== null, 'one over limit returns error');
assert(validateTotalContext(100, undefined, TEST_MODEL) === null, 'undefined maxTokens defaults to max_output');
assert(validateTotalContext(5000, undefined, TEST_MODEL) !== null, 'undefined maxTokens can still exceed with input');
assert(validateTotalContext(1000, 1000, 'nonexistent/model') === null, 'unknown model returns null');

cleanupModel();

console.log('\n--- getModelLimits ---');
setupModel();

const info = getModelLimits(TEST_MODEL);
assert(info !== null, 'known model returns info');
assert(info.word_limit === 8192, 'word_limit correct');
assert(info.max_output === 4096, 'max_output correct');
assert(info.name === 'Test Model', 'name correct');

assert(getModelLimits('nonexistent/model') === null, 'unknown model returns null');

cleanupModel();

console.log('\n--- fetchModelLimits (no API key) ---');
const origApiKey = process.env.STRAICO_API_KEY;
delete process.env.STRAICO_API_KEY;

const noKeyResult = await fetchModelLimits();
assert(noKeyResult.success === false, 'returns success:false without API key');
assertIncludes(noKeyResult.error, 'STRAICO_API_KEY', 'error mentions missing key');

process.env.STRAICO_API_KEY = origApiKey;

console.log('\n--- fetchModelLimits (already loaded, no force) ---');
setupModel();
const cachedResult = await fetchModelLimits();
assert(cachedResult.success === true, 'returns cached result when already loaded');
assert(typeof cachedResult.count === 'number', 'count is a number');
cleanupModel();
resetEnv();

console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);
if (failCount > 0) process.exit(1);

function assertIncludes(haystack, needle, testName) {
  if (typeof haystack === 'string' && haystack.includes(needle)) {
    console.log(`  PASS: ${testName}`);
    passCount++;
  } else {
    console.log(`  FAIL: ${testName} - "${needle}" not found`);
    failCount++;
  }
}
