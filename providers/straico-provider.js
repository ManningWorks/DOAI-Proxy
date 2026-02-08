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
   * @returns {Object} Straico-specific request object
   */
  transformRequest(openAIRequest) {
    const { messages, model, tools, ...otherParams } = openAIRequest;

    // Inject tools into system message via prompt injection
    const processedMessages = injectToolsIntoSystem(messages, tools);

    // Build Straico request
    const straicoRequest = {
      model: model,
      messages: processedMessages,
      ...otherParams,
    };

    // Set default temperature if not provided
    if (!straicoRequest.temperature) {
      straicoRequest.temperature = 0.7;
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
    const response = await axios.post(
      `${this.config.apiUrl}/chat/completions`,
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
