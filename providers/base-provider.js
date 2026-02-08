/**
 * BaseProvider - Abstract base class for all AI providers
 * 
 * All provider implementations must extend this class and implement
 * the required methods to provide OpenAI-compatible API functionality.
 * 
 * @abstract
 */
export class BaseProvider {
  /**
   * Constructor
   * @param {Object} config - Provider configuration (env vars)
   */
  constructor(config) {
    if (new.target === BaseProvider) {
      throw new Error('BaseProvider is abstract and cannot be instantiated directly');
    }
    this.config = config;
  }

  /**
   * Get provider type identifier
   * @returns {string} Provider type (e.g., "straico", "openai")
   */
  getType() {
    throw new Error('getType() must be implemented by subclass');
  }

  /**
   * Get provider instance name
   * @returns {string} Provider instance name
   */
  getName() {
    throw new Error('getName() must be implemented by subclass');
  }

  /**
   * Validate provider configuration
   * @throws {Error} If required configuration is missing
   * @returns {boolean} True if configuration is valid
   */
  validateConfig() {
    throw new Error('validateConfig() must be implemented by subclass');
  }

  /**
   * Transform OpenAI request to provider-specific format
   * @param {Object} openAIRequest - OpenAI-compatible request object
   * @returns {Object} Provider-specific request object
   */
  // eslint-disable-next-line no-unused-vars
  transformRequest(openAIRequest) {
    throw new Error('transformRequest() must be implemented by subclass');
  }

  /**
   * Transform provider response to OpenAI-compatible format
   * @param {Object} providerResponse - Provider-specific response object
   * @returns {Object} OpenAI-compatible response object
   */
  // eslint-disable-next-line no-unused-vars
  transformResponse(providerResponse) {
    throw new Error('transformResponse() must be implemented by subclass');
  }

  /**
   * Make API call to provider
   * @param {Object} request - Provider-specific request object
   * @returns {Promise<Object>} Axios response object
   */
  // eslint-disable-next-line no-unused-vars
  async makeRequest(request) {
    throw new Error('makeRequest() must be implemented by subclass');
  }

  /**
   * Check if provider supports native streaming
   * @returns {boolean} True if provider has native streaming support
   */
  supportsStreaming() {
    throw new Error('supportsStreaming() must be implemented by subclass');
  }

  /**
   * Check if provider supports native function calling
   * @returns {boolean} True if provider has native function calling support
   */
  supportsTools() {
    throw new Error('supportsTools() must be implemented by subclass');
  }
}
