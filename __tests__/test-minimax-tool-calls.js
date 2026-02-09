import { parseToolCall, formatToolCallResponse } from '../tools.js';

const testResponse = '<minimax:tool_call><invoke readfilePath: "/home/luke/opencode_projects/StraicoProxy/server.js"offset: "0"limit: "100"></invoke><invoke readfilePath: "/home/luke/opencode_projects/StraicoProxy/providers/straico-provider.js"offset: "0"limit: "50"></invoke><invoke bashcommand: "ls -la providers/"><parameter name="description">List provider files to understand architecture</parameter></invoke></minimax:tool_call>';

console.log('Testing parseToolCall with minimax format...\n');
console.log('Input:', testResponse.substring(0, 100) + '...\n');

const toolCalls = parseToolCall(testResponse);

if (!toolCalls) {
  console.error('❌ Failed to parse tool calls');
  process.exit(1);
}

console.log(`✅ Parsed ${toolCalls.length} tool calls:\n`);

toolCalls.forEach((call, index) => {
  console.log(`${index + 1}. Tool: ${call.function.name}`);
  console.log(`   ID: ${call.id}`);
  console.log(`   Arguments: ${call.function.arguments}`);
  console.log();
});

const formattedResponse = formatToolCallResponse(toolCalls);
console.log('Formatted Response:', JSON.stringify(formattedResponse, null, 2));

console.log('\n✅ Test passed!');
