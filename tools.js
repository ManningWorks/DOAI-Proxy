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
