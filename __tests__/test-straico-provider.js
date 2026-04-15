import { StraicoProvider } from '../providers/straico-provider.js';

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

function makeConfig(overrides = {}) {
  return {
    STRAICO_API_KEY: 'test-api-key',
    STRAICO_API_URL: 'https://api.test.com/v2',
    STRAICO_API_TIMEOUT: '5000',
    ...overrides,
  };
}

console.log('=== Straico Provider Tests ===');

console.log('\n--- constructor ---');
const provider = new StraicoProvider(makeConfig());
assert(provider.config.apiKey === 'test-api-key', 'apiKey set from config');
assert(provider.config.apiUrl === 'https://api.test.com/v2', 'apiUrl set from config');
assert(provider.config.timeout === 5000, 'timeout set from config');

const defaultProvider = new StraicoProvider({ STRAICO_API_KEY: 'key' });
assert(defaultProvider.config.apiUrl === 'https://api.straico.com/v2', 'default apiUrl');
assert(defaultProvider.config.timeout === 60000, 'default timeout');

console.log('\n--- getType / getName ---');
assert(provider.getType() === 'straico', 'getType returns straico');
assert(provider.getName() === 'straico', 'getName returns straico');

console.log('\n--- supportsStreaming / supportsTools ---');
assert(provider.supportsStreaming() === false, 'does not support native streaming');
assert(provider.supportsTools() === false, 'does not support native tools');

console.log('\n--- validateConfig ---');
const validProvider = new StraicoProvider(makeConfig());
assert(validProvider.validateConfig() === true, 'valid config returns true');

assertThrows(
  () => new StraicoProvider({}).validateConfig(),
  'STRAICO_API_KEY is required',
  'missing API key throws'
);

console.log('\n--- transformRequest with smart selector (model=auto) ---');
resetEnv();
process.env.SUMMARIZATION_ENABLED = 'false';
const autoReq = await provider.transformRequest({
  model: 'auto',
  messages: [{ role: 'user', content: 'hello' }],
  isToolRequest: false,
});
assert(autoReq.smart_llm_selector !== undefined, 'smart_llm_selector present');
assert(autoReq.smart_llm_selector.pricing_method === 'balance', 'pricing_method is balance');
assert(autoReq.messages.length === 1, 'messages preserved');
assert(autoReq.model === undefined, 'model not set in smart selector mode');

console.log('\n--- transformRequest with smart selector (no model) ---');
const noModelReq = await provider.transformRequest({
  messages: [{ role: 'user', content: 'hello' }],
  isToolRequest: false,
});
assert(noModelReq.smart_llm_selector !== undefined, 'no model triggers smart selector');

console.log('\n--- transformRequest with specific model ---');
const specificReq = await provider.transformRequest({
  model: 'meta-llama/llama-3.1-8b-instruct',
  messages: [{ role: 'user', content: 'test' }],
  isToolRequest: false,
  temperature: 0.5,
  max_tokens: 100,
  replace_failed_models: true,
});
assert(specificReq.model === 'meta-llama/llama-3.1-8b-instruct', 'model set correctly');
assert(specificReq.temperature === 0.5, 'custom temperature passed through');
assert(specificReq.max_tokens === 100, 'max_tokens passed through');
assert(specificReq.replace_failed_models === true, 'replace_failed_models passed through');

console.log('\n--- transformRequest default temperature ---');
const defaultTempReq = await provider.transformRequest({
  model: 'test-model',
  messages: [{ role: 'user', content: 'test' }],
  isToolRequest: false,
});
assert(defaultTempReq.temperature === 0.7, 'default temperature is 0.7');

console.log('\n--- transformRequest tool message filtering ---');
const toolFiltered = await provider.transformRequest({
  model: 'test-model',
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'What is the weather?' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_weather', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: '{"temp": 22}' },
    { role: 'user', content: 'Thanks' },
  ],
  isToolRequest: true,
});
const toolRoles = toolFiltered.messages.map(m => m.role);
assert(!toolRoles.includes('tool'), 'tool role messages removed');
assert(toolRoles.includes('user'), 'user messages preserved');
assert(toolRoles.includes('system'), 'system messages preserved');
const toolResultMsg = toolFiltered.messages.find(m => typeof m.content === 'string' && m.content.includes('[Tool Result]'));
assert(toolResultMsg !== undefined, 'tool results converted to user messages with [Tool Result] prefix');
assert(toolResultMsg.role === 'user', 'tool result converted to user role');

console.log('\n--- transformRequest empty assistant filtering ---');
const emptyFiltered = await provider.transformRequest({
  model: 'test-model',
  messages: [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: '' },
    { role: 'assistant', content: '   ' },
    { role: 'user', content: 'world' },
  ],
  isToolRequest: true,
});
assert(emptyFiltered.messages.length === 2, 'empty assistant messages filtered out');
assert(emptyFiltered.messages[0].content === 'hello', 'user message preserved');
assert(emptyFiltered.messages[1].content === 'world', 'second user message preserved');

console.log('\n--- transformRequest TOOL_RESULT_MAX_LENGTH truncation ---');
process.env.TOOL_RESULT_MAX_LENGTH = '10';
const truncProvider = new StraicoProvider(makeConfig());
const truncated = await truncProvider.transformRequest({
  model: 'test-model',
  messages: [
    { role: 'user', content: 'run this' },
    { role: 'assistant', content: 'ok' },
    { role: 'tool', tool_call_id: 'c1', content: 'a'.repeat(100) },
  ],
  isToolRequest: true,
});
const truncMsg = truncated.messages.find(m => m.content.includes('[Tool Result]'));
assert(truncMsg !== undefined, 'truncated tool result exists');
assertIncludes(truncMsg.content, '[TRUNCATED:', 'truncation marker present');
delete process.env.TOOL_RESULT_MAX_LENGTH;

console.log('\n--- transformRequest no messages remaining error ---');
try {
  await provider.transformRequest({
    model: 'test-model',
    messages: [
      { role: 'tool', tool_call_id: 'c1', content: 'result' },
    ],
    isToolRequest: true,
  });
  console.log('  FAIL: should throw when no messages remain');
  failCount++;
} catch (e) {
  assert(e.statusCode === 400, 'statusCode is 400');
  assertIncludes(e.message, 'No messages remaining', 'error message descriptive');
}

console.log('\n--- transformResponse ---');
const mockProviderResponse = {
  data: {
    model: 'test-model',
    choices: [{ message: { content: 'response text' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  },
};
const transformed = provider.transformResponse(mockProviderResponse);
assert(transformed.object === 'chat.completion', 'transformResponse returns chat completion');
assert(transformed.model === 'test-model', 'model preserved in transformResponse');
assert(transformed.choices[0].message.content === 'response text', 'content preserved');

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
