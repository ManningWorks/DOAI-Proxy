export function injectToolsIntoSystem(messages, tools) {
  if (!tools || tools.length === 0) {
    return normalizeMessages(messages);
  }

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

  const result = normalizeMessages(messages);

  const systemIndex = result.findIndex(m => m.role === 'system');
  if (systemIndex !== -1) {
    result[systemIndex] = {
      role: 'system',
      content: `${result[systemIndex].content}\n\n${toolInstruction}`
    };
  } else {
    result.unshift({ role: 'system', content: toolInstruction });
  }

  return result;
}

function normalizeMessages(messages) {
  return messages.map(msg => {
    const normalized = { role: msg.role };
    
    if (msg.role === 'assistant' && msg.tool_calls) {
      normalized.content = msg.tool_calls.map(tc => 
        `TOOL_CALL: ${tc.function.name}\nARGUMENTS: ${tc.function.arguments}`
      ).join('\n\n');
    } else if (typeof msg.content === 'string') {
      normalized.content = msg.content;
    } else if (Array.isArray(msg.content)) {
      const textParts = msg.content.filter(c => c.type === 'text' && !c.text.includes('<system-reminder>')).map(c => c.text);
      normalized.content = textParts.join('\n');
    } else if (msg.content) {
      normalized.content = msg.content;
    }
    
    return normalized;
  });
}

export function parseToolCall(responseText) {
  if (!responseText || typeof responseText !== 'string') {
    return null;
  }

  const parsers = [
    { name: 'Minimax XML', parser: parseMinimaxXML },
    { name: 'Claude XML', parser: parseClaudeXML },
    { name: 'OpenAI Native', parser: parseOpenAIToolCalls },
    { name: 'Text Format', parser: parseTextFormat },
  ];

  const triedParsers = [];

  for (const { name, parser } of parsers) {
    try {
      const toolCalls = parser(responseText);
      if (toolCalls && toolCalls.length > 0) {
        console.log(`[Tool Parsing] Successfully parsed tool calls using ${name}`);
        return toolCalls;
      }
      triedParsers.push(name);
    } catch (error) {
      console.warn(`[Tool Parsing] ${name} parser failed: ${error.message}`);
      triedParsers.push(name + ' (failed)');
    }
  }

  console.warn(`[Tool Parsing] No tool calls detected. Tried parsers: ${triedParsers.join(', ')}`);
  console.debug(`[Tool Parsing] Response snippet: ${responseText.substring(0, 200)}...`);
  return null;
}

function parseMinimaxXML(responseText) {
  const minimaxMatch = responseText.match(/<minimax:tool_call>(.*?)<\/minimax:tool_call>/s);
  if (!minimaxMatch) return [];

  const toolCalls = [];
  const invokeMatches = minimaxMatch[1].matchAll(/<invoke\s+([^>]+)>(.*?)<\/invoke>/gs);
  
  for (const invokeMatch of invokeMatches) {
    const attrs = invokeMatch[1];
    const innerContent = invokeMatch[2];
    
    let toolName = '';
    const args = {};
    
    const attrPairs = attrs.matchAll(/(\w+):\s*"([^"]*)"/g);
    for (const attrPair of attrPairs) {
      const [, attrName, attrValue] = attrPair;
      if (!toolName) {
        toolName = extractToolName(attrName);
      }
      
      const mappedName = mapToolAttribute(attrName);
      if (mappedName) {
        args[mappedName] = attrValue;
      }
    }
    
    const paramMatches = innerContent.matchAll(/<parameter\s+name="([^"]+)">([^<]*)<\/parameter>/g);
    for (const paramMatch of paramMatches) {
      args[paramMatch[1]] = paramMatch[2].trim();
    }
    
    if (toolName && Object.keys(args).length > 0) {
      toolCalls.push(createToolCallObject(toolName, args, toolCalls.length));
    }
  }
  
  return toolCalls;
}

function parseClaudeXML(responseText) {
  const toolCalls = [];
  const functionCallMatches = responseText.matchAll(/<invoke\s+name="([^"]+)">\s*<parameter_list>\s*(.*?)\s*<\/parameter_list>\s*<\/invoke>/gs);
  
  for (const match of functionCallMatches) {
    const [, toolName, parametersXml] = match;
    const args = {};
    
    const paramMatches = parametersXml.matchAll(/<parameter\s+name="([^"]+)">(.*?)<\/parameter>/gs);
    for (const paramMatch of paramMatches) {
      const [, paramName, paramValue] = paramMatch;
      args[paramName] = paramValue.trim();
    }
    
    if (toolName && Object.keys(args).length > 0) {
      toolCalls.push(createToolCallObject(toolName, args, toolCalls.length));
    }
  }
  
  return toolCalls;
}

function parseOpenAIToolCalls(responseText) {
  const toolCalls = [];
  
  try {
    const toolCallMatch = responseText.match(/"tool_calls"\s*:\s*\[(.*?)\]/s);
    if (!toolCallMatch) return [];
    
    const toolCallArray = `[${toolCallMatch[1]}]`;
    const parsedToolCalls = JSON.parse(toolCallArray);
    
    for (const toolCall of parsedToolCalls) {
      if (toolCall.function && toolCall.function.name) {
        toolCalls.push({
          id: toolCall.id || createToolCallId(toolCalls.length),
          type: toolCall.type || 'function',
          function: {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments || JSON.stringify(toolCall.function.parameters || {}),
          },
        });
      }
    }
  } catch (error) {
    return [];
  }
  
  return toolCalls;
}

function parseTextFormat(responseText) {
  const pattern = /TOOL_CALL:\s*(\w+)\s*\n?\s*ARGUMENTS:\s*(\{(?:[^{}]|\{[^{}]*\})*\})(?:\n|$)/g;
  const toolCalls = [];
  
  for (const match of responseText.matchAll(pattern)) {
    const [, toolName, argsString] = match;
    if (!toolName || !argsString) continue;
    
    try {
      const args = JSON.parse(argsString);
      toolCalls.push(createToolCallObject(toolName, args, toolCalls.length));
    } catch (error) {
      console.error('Failed to parse tool call arguments:', error);
    }
  }
  
  return toolCalls;
}

function mapToolAttribute(attrName) {
  const mappings = {
    'readfilePath': 'filePath',
    'bashcommand': 'command',
  };
  return mappings[attrName] || attrName;
}

function extractToolName(attrName) {
  if (attrName === 'bash') return 'bash';
  if (attrName === 'read') return 'read';
  if (attrName === 'readfilePath') return 'read';
  if (attrName === 'bashcommand') return 'bash';
  return attrName;
}

function createToolCallObject(toolName, args, index) {
  return {
    id: createToolCallId(index),
    type: 'function',
    function: {
      name: toolName,
      arguments: JSON.stringify(args),
    },
  };
}

function createToolCallId(index) {
  return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${index}`;
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
