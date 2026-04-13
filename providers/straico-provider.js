import axios from 'axios';
import { Agent } from 'https';
import { BaseProvider } from './base-provider.js';
import { injectToolsIntoSystem } from '../tools.js';
import { formatChatCompletionResponse } from '../utils.js';
import { summarizeIfNeeded } from '../summarizer.js';

const httpsAgent = new Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
});

/**
 * StraicoProvider - Straico API provider implementation
 * 
 * Straico is an AI API aggregator that provides access to multiple
 * models (including Claude, GPT, etc.) through a single API.
 * 
 * Features:
 * - No native streaming support (requires simulation)
 * - No native function calling support (requires prompt injection)
 * - OpenAI-compatible request/response format
 */
export class StraicoProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.config = {
      apiKey: config.STRAICO_API_KEY,
      apiUrl: config.STRAICO_API_URL || 'https://api.straico.com/v2',
      timeout: parseInt(config.STRAICO_API_TIMEOUT) || 60000,
    };
  }

  /**
   * Get provider type identifier
   * @returns {string} Provider type
   */
  getType() {
    return 'straico';
  }

  /**
   * Get provider instance name
   * @returns {string} Provider name
   */
  getName() {
    return 'straico';
  }

  /**
   * Validate provider configuration
   * @throws {Error} If required configuration is missing
   * @returns {boolean} True if configuration is valid
   */
  validateConfig() {
    if (!this.config.apiKey) {
      throw new Error('STRAICO_API_KEY is required');
    }
    return true;
  }

  /**
   * Transform OpenAI request to Straico format
   * @param {Object} openAIRequest - OpenAI-compatible request object
   * @param {boolean} openAIRequest.isToolRequest - Whether this is a tool request (should filter out tool messages)
   * @returns {Promise<Object>} Straico-specific request object
   */
  async transformRequest(openAIRequest) {
    const { messages, model, tools, isToolRequest, ...otherParams } = openAIRequest;
 
    const useSmartSelector = !model || model === 'auto';
    let processedMessages = injectToolsIntoSystem(messages, tools);

    const summarizationResult = await summarizeIfNeeded(processedMessages, model);
    processedMessages = summarizationResult.messages;

    const toolResultMaxLength = parseInt(process.env.TOOL_RESULT_MAX_LENGTH);
    const hasToolResultLimit = !isNaN(toolResultMaxLength) && toolResultMaxLength > 0;

    if (isToolRequest) {
      const beforeFilter = processedMessages.length;
      const enhancedMessages = [];
      
      for (let i = 0; i < processedMessages.length; i++) {
        const msg = processedMessages[i];
        const nextMsg = processedMessages[i + 1];
        
        if (msg.role === 'tool') {
          continue;
        }
        
        if (msg.role === 'assistant' && (!msg.content || msg.content.trim() === '')) {
          console.log('[StraicoProvider] Filtering empty assistant message');
          continue;
        }
        
        enhancedMessages.push(msg);
        
        if (nextMsg && nextMsg.role === 'tool') {
          const toolResult = typeof nextMsg.content === 'string' 
            ? nextMsg.content 
            : JSON.stringify(nextMsg.content);

          if (hasToolResultLimit && toolResult.length > toolResultMaxLength) {
            console.warn(`[StraicoProvider] Tool result truncated: ${toolResult.length} chars exceeds limit of ${toolResultMaxLength}`);
            enhancedMessages.push({
              role: 'user',
              content: `[Tool Result]: ${toolResult.substring(0, toolResultMaxLength)}\n[TRUNCATED: ${toolResult.length} chars total, showing ${toolResultMaxLength}]`
            });
          } else {
            enhancedMessages.push({
              role: 'user',
              content: `[Tool Result]: ${toolResult}`
            });
          }
        }
      }
      
      processedMessages = enhancedMessages;
      
      if (processedMessages.length === 0) {
        const error = new Error('No messages remaining after filtering tool and empty assistant messages');
        error.statusCode = 400;
        throw error;
      }
      
      console.log(`[StraicoProvider] Filtered ${beforeFilter - processedMessages.length} messages (tool + empty assistant). ${processedMessages.length} messages remaining`);
    }

    if (useSmartSelector) {
      console.log('[StraicoProvider] Using smart_llm_selector with pricing_method: balance');
      return {
        smart_llm_selector: {
          quantity: 1,
          pricing_method: 'balance'
        },
        messages: processedMessages
      };
    }

    const straicoRequest = {
      model: model,
      messages: processedMessages
    };

    if (otherParams.temperature !== undefined) {
      straicoRequest.temperature = otherParams.temperature;
    } else {
      straicoRequest.temperature = 0.7;
    }

    if (otherParams.max_tokens !== undefined) {
      straicoRequest.max_tokens = otherParams.max_tokens;
    }

    if (otherParams.replace_failed_models !== undefined) {
      straicoRequest.replace_failed_models = otherParams.replace_failed_models;
    }

    return straicoRequest;
  }

  /**
   * Make API call to Straico
   * @param {Object} request - Straico request object
   * @returns {Promise<Object>} Axios response object
   * @throws {Error} If API call fails
   */
  async makeRequest(request) {
    const url = `${this.config.apiUrl}/chat/completions`;
    const requestSize = JSON.stringify(request).length;
    const estimatedTokens = Math.ceil(requestSize / 4);

    console.log(`[StraicoProvider] Calling API: ${url} with model: ${request.model}`);
    console.log(`[StraicoProvider] Request size: ${requestSize} chars (~${estimatedTokens} tokens)`);

    const response = await axios.post(
      url,
      request,
      {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: this.config.timeout,
        httpsAgent,
      }
    );

    return response;
  }

  /**
   * Transform Straico response to OpenAI-compatible format
   * @param {Object} providerResponse - Straico response object
   * @returns {Object} OpenAI-compatible response object
   */
  transformResponse(providerResponse) {
    return formatChatCompletionResponse(providerResponse.data, providerResponse.data.model);
  }

  /**
   * Check if provider supports native streaming
   * @returns {boolean} False (Straico requires streaming simulation)
   */
  supportsStreaming() {
    return false;
  }

  /**
   * Check if provider supports native function calling
   * @returns {boolean} False (Straico requires prompt injection for tools)
   */
  supportsTools() {
    return false;
  }
}
