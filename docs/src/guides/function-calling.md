---
title: Function Calling
description: Use function calling and tool use with DOAI Proxy, including providers without native support.
---

# Function Calling

DOAI Proxy supports function calling even when the underlying provider doesn't support it natively. For providers without native function calling (like Straico), the proxy uses prompt injection to enable tool use.

## How It Works

For providers without native function calling:

1. **Request Processing**: Proxy detects if request includes `tools` parameter
2. **Tool Injection**: Converts tool definitions into system prompt instructions via `injectToolsIntoSystem()`
3. **Prompt Formatting**: Tells AI to use format: `TOOL_CALL: name\nARGUMENTS: {json}`
4. **Response Parsing**: `parseToolCall()` checks AI response for tool call patterns using 4 parsers
5. **Tool Call Detection**: Extracts tool name and arguments from response
6. **Response Formatting**: Returns tool call object with `finish_reason: 'tool_calls'`
7. **Multi-turn Support**: Client can execute tool and send result back as `role: 'tool'` message

## Tool Definition Format

```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": { "type": "string", "description": "City name" }
          },
          "required": ["location"]
        }
      }
    }
  ]
}
```

## AI Response Format

When the AI decides to use a tool, it responds in this text format:

```
I can help you check the weather. Let me get that information for you.
TOOL_CALL: get_weather
ARGUMENTS: {"location": "Tokyo"}
```

## Tool Call Response Object

The proxy parses this and returns a proper OpenAI tool call object:

```json
{
  "id": "call_1234567890",
  "type": "function",
  "function": {
    "name": "get_weather",
    "arguments": "{\"location\":\"Tokyo\"}"
  }
}
```

With `finish_reason: "tool_calls"`.

## Parsers

`parseToolCall()` tries four parsers in order. The first non-empty result wins:

1. **Minimax XML** (`parseMinimaxXML`): Matches `<minimax:tool_call><invoke ...>` with attribute-style or `<parameter>` children
2. **Claude XML** (`parseClaudeXML`): Matches `<invoke name="..."><parameter_list><parameter name="...">...</parameter></parameter_list></invoke>`
3. **OpenAI Native** (`parseOpenAIToolCalls`): Looks for `"tool_calls": [...]` JSON fragments inside response text
4. **Text Format** (`parseTextFormat`): Matches `TOOL_CALL: <name>\nARGUMENTS: {json}`

Parsed tool calls are validated against the client-provided tool list. Unknown tool names are filtered.

## Message Normalization

The proxy normalizes messages for compatibility:

| Input Form | Transformation |
|------------|----------------|
| Array `content` (multimodal) | Joined to plain text; `<system-reminder>` blocks stripped |
| `role: "tool"` messages | Converted to `role: "user"` with `[Tool Result]:` prefix, or dropped |
| `role: "assistant"` with `tool_calls` | Serialized to `TOOL_CALL: <name>\nARGUMENTS: <json>` text |
| Empty assistant messages | Dropped to avoid provider API errors |

## Tool Result Truncation

When `TOOL_RESULT_MAX_LENGTH` is set, tool result messages longer than the limit are truncated. Set to `-1` or leave unset to disable truncation.

## Limitations

- **Format dependency**: AI must follow exact format for tool calls to be detected (for providers without native support)
- **Prompt-instructed single call**: The system prompt instructs the AI to make one tool call at a time, though the parser can handle multiple sequential calls
- **No tool execution**: Proxy doesn't execute tools, just formats tool call objects
- **Requires AI compliance**: If AI doesn't follow format, tool calls won't be detected
- **Multi-turn conversations with tools**: Currently only one turn (user → tool → assistant) is supported
- **Large tool definitions**: Very large tool schemas may not fit in provider's context window

## Next Steps

- [Function Calling Examples](/examples/function-calling) — complete working examples of function calling
- [API Endpoints](/api/endpoints) — reference for available API endpoints
