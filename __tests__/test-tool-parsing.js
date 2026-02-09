import { parseToolCall, formatToolCallResponse } from '../tools.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEquals(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(message || `Expected ${expectedStr}, got ${actualStr}`);
  }
}

console.log('Testing format-based tool call parsing...\n');

test('Minimax XML format - single tool call', () => {
  const response = '<minimax:tool_call><invoke readfilePath: "/path/to/file.txt"></invoke></minimax:tool_call>';
  const toolCalls = parseToolCall(response);
  
  assert(toolCalls && toolCalls.length === 1, 'Should parse one tool call');
  assert(toolCalls[0].function.name === 'read', 'Tool name should be "read"');
  const args = JSON.parse(toolCalls[0].function.arguments);
  assertEquals(args.filePath, '/path/to/file.txt', 'Should extract filePath');
});

test('Minimax XML format - multiple tool calls', () => {
  const response = '<minimax:tool_call><invoke readfilePath: "/file1.txt"></invoke><invoke bashcommand: "ls -la"></invoke></minimax:tool_call>';
  const toolCalls = parseToolCall(response);
  
  assert(toolCalls && toolCalls.length === 2, 'Should parse two tool calls');
  assert(toolCalls[0].function.name === 'read', 'First tool should be read');
  assert(toolCalls[1].function.name === 'bash', 'Second tool should be bash');
});

test('Minimax XML format - with parameters', () => {
  const response = '<minimax:tool_call><invoke bashcommand: "ls"><parameter name="description">List files</parameter></invoke></minimax:tool_call>';
  const toolCalls = parseToolCall(response);
  
  assert(toolCalls && toolCalls.length === 1, 'Should parse one tool call');
  const args = JSON.parse(toolCalls[0].function.arguments);
  assertEquals(args.command, 'ls', 'Should extract command');
  assertEquals(args.description, 'List files', 'Should extract description parameter');
});

test('Claude XML format - single tool call', () => {
  const response = '<invoke name="search_web"><parameter_list><parameter name="query">how to code in JavaScript</parameter></parameter_list></invoke>';
  const toolCalls = parseToolCall(response);
  
  assert(toolCalls && toolCalls.length === 1, 'Should parse one tool call');
  assert(toolCalls[0].function.name === 'search_web', 'Tool name should be "search_web"');
  const args = JSON.parse(toolCalls[0].function.arguments);
  assertEquals(args.query, 'how to code in JavaScript', 'Should extract query parameter');
});

test('Claude XML format - multiple parameters', () => {
  const response = '<invoke name="get_weather"><parameter_list><parameter name="location">Tokyo</parameter><parameter name="unit">celsius</parameter></parameter_list></invoke>';
  const toolCalls = parseToolCall(response);
  
  assert(toolCalls && toolCalls.length === 1, 'Should parse one tool call');
  const args = JSON.parse(toolCalls[0].function.arguments);
  assertEquals(args.location, 'Tokyo', 'Should extract location');
  assertEquals(args.unit, 'celsius', 'Should extract unit');
});

test('OpenAI native format - single tool call', () => {
  const response = 'Here\'s what I found: "tool_calls": [{"id": "call_123", "type": "function", "function": {"name": "get_weather", "arguments": "{\\"location\\": \\"New York\\"}"}}]';
  const toolCalls = parseToolCall(response);
  
  assert(toolCalls && toolCalls.length === 1, 'Should parse one tool call');
  assert(toolCalls[0].function.name === 'get_weather', 'Tool name should be "get_weather"');
  const args = JSON.parse(toolCalls[0].function.arguments);
  assertEquals(args.location, 'New York', 'Should extract location');
});

test('OpenAI native format - multiple tool calls', () => {
  const response = '"tool_calls": [{"id": "call_1", "function": {"name": "search", "arguments": "{\\"query\\": \\"test\\"}"}}, {"id": "call_2", "function": {"name": "calculate", "arguments": "{\\"expression\\": \\"1+1\\"}"}}]';
  const toolCalls = parseToolCall(response);
  
  assert(toolCalls && toolCalls.length === 2, 'Should parse two tool calls');
  assert(toolCalls[0].function.name === 'search', 'First tool should be search');
  assert(toolCalls[1].function.name === 'calculate', 'Second tool should be calculate');
});

test('Text format - single tool call', () => {
  const response = 'Let me check that for you.\n\nTOOL_CALL: get_weather\nARGUMENTS: {"location": "Paris"}';
  const toolCalls = parseToolCall(response);
  
  assert(toolCalls && toolCalls.length === 1, 'Should parse one tool call');
  assert(toolCalls[0].function.name === 'get_weather', 'Tool name should be "get_weather"');
  const args = JSON.parse(toolCalls[0].function.arguments);
  assertEquals(args.location, 'Paris', 'Should extract location');
});

test('Text format - multiple tool calls', () => {
  const response = 'I\'ll help with both.\n\nTOOL_CALL: search_web\nARGUMENTS: {"query": "JavaScript tutorials"}\n\nTOOL_CALL: get_weather\nARGUMENTS: {"location": "London"}';
  const toolCalls = parseToolCall(response);
  
  assert(toolCalls && toolCalls.length === 2, 'Should parse two tool calls');
  assert(toolCalls[0].function.name === 'search_web', 'First tool should be search_web');
  assert(toolCalls[1].function.name === 'get_weather', 'Second tool should be get_weather');
});

test('No tool calls in response', () => {
  const response = 'Hello! How can I help you today? I\'m just a regular assistant response.';
  const toolCalls = parseToolCall(response);
  
  assert(toolCalls === null, 'Should return null for non-tool response');
});

test('Empty response', () => {
  const toolCalls = parseToolCall('');
  assert(toolCalls === null, 'Should return null for empty response');
});

test('Null response', () => {
  const toolCalls = parseToolCall(null);
  assert(toolCalls === null, 'Should return null for null response');
});

test('Non-string response', () => {
  const toolCalls = parseToolCall(12345);
  assert(toolCalls === null, 'Should return null for non-string response');
});

test('Format detection priority - Minimax over Text', () => {
  const response = 'Some text\n<minimax:tool_call><invoke readfilePath: "/file.txt"></invoke></minimax:tool_call>\nTOOL_CALL: other_tool';
  const toolCalls = parseToolCall(response);
  
  assert(toolCalls && toolCalls.length === 1, 'Should parse Minimax format');
  assert(toolCalls[0].function.name === 'read', 'Should be read tool, not other_tool');
});

test('Malformed format - should skip and continue', () => {
  const response = 'TOOL_CALL: valid_tool\nARGUMENTS: {"valid": true}';
  const toolCalls = parseToolCall(response);
  
  assert(toolCalls && toolCalls.length === 1, 'Should parse valid format despite malformed content elsewhere');
});

test('Tool call with complex arguments', () => {
  const response = 'TOOL_CALL: create_user\nARGUMENTS: {"name": "John", "age": 30, "email": "john@example.com", "active": true, "roles": ["admin", "user"]}';
  const toolCalls = parseToolCall(response);
  
  assert(toolCalls && toolCalls.length === 1, 'Should parse tool with complex args');
  const args = JSON.parse(toolCalls[0].function.arguments);
  assertEquals(args.name, 'John', 'Should extract name');
  assertEquals(args.age, 30, 'Should extract age');
  assertEquals(args.email, 'john@example.com', 'Should extract email');
  assertEquals(args.active, true, 'Should extract active');
  assertEquals(args.roles.length, 2, 'Should extract roles array');
});

test('formatToolCallResponse - formats correctly', () => {
  const toolCalls = [
    {
      id: 'call_test_1',
      type: 'function',
      function: {
        name: 'test_tool',
        arguments: '{"param": "value"}',
      },
    },
  ];
  
  const response = formatToolCallResponse(toolCalls);
  
  assert(response.object === 'chat.completion', 'Should have correct object type');
  assert(response.choices[0].message.tool_calls.length === 1, 'Should have one tool call');
  assert(response.choices[0].finish_reason === 'tool_calls', 'Should have tool_calls finish reason');
});

console.log(`\n${'='.repeat(50)}`);
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) {
  process.exit(1);
}

console.log('\n✅ All tests passed!');
