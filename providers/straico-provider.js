import axios from 'axios';
import { injectToolsIntoSystem } from '../tools.js';
import { formatChatCompletionResponse } from '../utils.js';

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
export class StraicoProvider {
  constructor(config) {
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
   * @returns {Object} Straico-specific request object
   */
  transformRequest(openAIRequest) {
    const { messages, model, tools, isToolRequest, ...otherParams } = openAIRequest;

    const useSmartSelector = !model || model === 'auto';
    let processedMessages = injectToolsIntoSystem(messages, tools);

    if (isToolRequest) {
      processedMessages = processedMessages.filter(msg => msg.role !== 'tool');
      console.log(`[StraicoProvider] Filtered out tool messages. ${processedMessages.length} messages remaining`);
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

    const requestJson = JSON.stringify(request);
    console.log(`[StraicoProvider] Full request body:\n${requestJson}`);

    const response = await axios.post(
      url,
      request,
      {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: this.config.timeout,
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
