import { formatToolResultMessage, injectToolsIntoSystem, parseToolCall, formatToolCallResponse } from '../tools.js';

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

console.log('=== Tools Advanced Tests ===');

console.log('\n--- formatToolResultMessage ---');
const stringResult = formatToolResultMessage('call_123', 'file contents here');
assert(stringResult.role === 'tool', 'role is tool');
assert(stringResult.tool_call_id === 'call_123', 'tool_call_id preserved');
assert(stringResult.content === 'file contents here', 'string content preserved');

const objectResult = formatToolCallMessage('call_456', { temperature: 22, condition: 'sunny' });
assert(typeof objectResult.content === 'string', 'object result JSON stringified');
const parsed = JSON.parse(objectResult.content);
assert(parsed.temperature === 22, 'object content parseable');

console.log('\n--- injectToolsIntoSystem with empty/null tools ---');
const messages = [
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'hello' },
];

const emptyTools = injectToolsIntoSystem(messages, []);
assert(emptyTools.length === 2, 'empty tools array returns normalized messages');
assert(emptyTools[0].content === 'You are helpful.', 'system message unchanged with empty tools');

const nullTools = injectToolsIntoSystem(messages, null);
assert(nullTools.length === 2, 'null tools returns normalized messages');

const noTools = injectToolsIntoSystem(messages);
assert(noTools.length === 2, 'undefined tools returns normalized messages');

console.log('\n--- injectToolsIntoSystem sentinel prevents double injection ---');
const tools = [{ type: 'function', function: { name: 'test', description: 'A test tool', parameters: {} } }];
const firstInjection = injectToolsIntoSystem(messages, tools);
assert(firstInjection[0].content.includes('test'), 'first injection adds tool instructions');
const secondInjection = injectToolsIntoSystem(firstInjection, tools);
assert(secondInjection[0].content === firstInjection[0].content, 'second injection is no-op (sentinel)');
assert(!secondInjection[0].content.includes('test\ntest'), 'no duplicate injection');

console.log('\n--- injectToolsIntoSystem without system message ---');
const noSystemMsg = [
  { role: 'user', content: 'hello' },
];
const injected = injectToolsIntoSystem(noSystemMsg, tools);
assert(injected[0].role === 'system', 'prepends system message');
assert(injected[0].content.includes('test'), 'system message has tool instructions');
assert(injected[1].role === 'user', 'user message preserved');

console.log('\n--- formatToolCallResponse edge cases ---');
const nullResponse = formatToolCallResponse(null);
assert(nullResponse === null, 'null input returns null');

const emptyResponse = formatToolCallResponse([]);
assert(emptyResponse === null, 'empty array returns null');

console.log('\n--- normalizeMessages edge cases (via injectToolsIntoSystem) ---');
const multimodal = [
  { role: 'system', content: 'sys' },
  { role: 'user', content: [{ type: 'text', text: 'hello' }, { type: 'text', text: '<system-reminder>hidden</system-reminder>' }] },
  { role: 'user', content: [{ type: 'image', url: 'http://example.com/img.png' }] },
  { role: 'user', content: 42 },
];
const normalized = injectToolsIntoSystem(multimodal);
assert(normalized[1].content === 'hello', 'multimodal text parts joined, system-reminder stripped');
assert(normalized[2].content === '', 'non-text content parts produce empty string');
assert(normalized[3].content === 42, 'non-string non-array content preserved');

const assistantWithToolCalls = [
  { role: 'system', content: 'sys' },
  { role: 'assistant', content: 'text', tool_calls: [
    { function: { name: 'bash', arguments: '{"command":"ls"}' } },
  ]},
];
const toolCallNorm = injectToolsIntoSystem(assistantWithToolCalls);
assertIncludes(toolCallNorm[1].content, 'TOOL_CALL: bash', 'assistant tool_calls serialized');
assertIncludes(toolCallNorm[1].content, '"command":"ls"', 'assistant tool_calls args included');

console.log('\n--- parseToolCall incomplete JSON edge case ---');
const incomplete = 'TOOL_CALL: bash\nARGUMENTS: {"command": "ls -la"';
const incompleteResult = parseToolCall(incomplete);
assert(incompleteResult === null, 'incomplete JSON returns null (no crash)');

console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);
if (failCount > 0) process.exit(1);

function formatToolCallMessage(id, result) {
  return formatToolResultMessage(id, result);
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
