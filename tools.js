export function injectToolsIntoSystem(messages, tools) {
  if (!tools || tools.length === 0) return messages;

  const toolDescriptions = tools
    .map(t => `- ${t.function.name}: ${t.function.description}`)
    .join('\n');

  const toolSchema = tools
    .map(t => `${t.function.name}: ${JSON.stringify(t.function.parameters)}`)
    .join('\n\n');

  const toolInstruction = `You have access to the following tools:
${toolDescriptions}

Tool schemas:
${toolSchema}

When you need to use a tool, format your response like this:
TOOL_CALL: <tool_name>
ARGUMENTS: <json_arguments>

For example:
TOOL_CALL: search_web
ARGUMENTS: {"query": "how to implement streaming in Node.js"}

Only make one tool call at a time. Wait for the result before making another tool call.`;

  const systemIndex = messages.findIndex(m => m.role === 'system');
  if (systemIndex !== -1) {
    messages[systemIndex].content = `${messages[systemIndex].content}\n\n${toolInstruction}`;
  } else {
    messages.unshift({ role: 'system', content: toolInstruction });
  }

  return messages;
}

export function parseToolCall(responseText) {
  const toolCallPattern = /TOOL_CALL:\s*(\w+)\s*\nARGUMENTS:\s*({.*})/s;

  const match = responseText.match(toolCallPattern);
  if (!match) return null;

  const [, toolName, argsString] = match;

  try {
    const args = JSON.parse(argsString);

    return [{
      id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'function',
      function: {
        name: toolName,
        arguments: JSON.stringify(args),
      },
    }];
  } catch (error) {
    console.error('Failed to parse tool call arguments:', error);
    return null;
  }
}

export function formatToolCallResponse(toolCalls) {
  if (!toolCalls || toolCalls.length === 0) {
    return null;
  }

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'straico-proxy',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        tool_calls: toolCalls,
        content: null,
      },
      finish_reason: 'tool_calls',
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

export function formatToolResultMessage(toolCallId, result) {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content: typeof result === 'string' ? result : JSON.stringify(result),
  };
}
