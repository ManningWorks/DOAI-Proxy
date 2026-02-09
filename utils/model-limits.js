import axios from 'axios';

/**
 * Promise-based lock to prevent duplicate fetches
 */
let fetchPromise = null;

/**
 * Model limits cache
 * Stores full model information fetched from Straico API
 * Format: { modelId: { max_output, word_limit, name, model_type, metadata } }
 */
export let MODEL_LIMITS = {};

/**
 * Fetch model limits from Straico v2 API
 * This should be called at proxy startup to populate MODEL_LIMITS cache
 * 
 * @throws {Error} If STRAICO_API_KEY is not set
 */
export async function fetchModelLimits() {
  const { STRAICO_API_KEY, STRAICO_API_URL } = process.env;
  
  if (!STRAICO_API_KEY) {
    console.warn('[Startup] STRAICO_API_KEY not set - model validation disabled');
    return;
  }

  if (Object.keys(MODEL_LIMITS).length > 0) {
    console.log('[Startup] Model limits already loaded, skipping fetch');
    return;
  }

  if (fetchPromise) {
    console.log('[Startup] Model limits fetch already in progress - reusing in-progress fetch');
    return fetchPromise;
  }

  const apiUrl = STRAICO_API_URL || 'https://api.straico.com/v2';
  console.log(`[Startup] Fetching model limits from ${apiUrl}/models...`);
  
  fetchPromise = (async () => {
    try {
      const response = await axios.get(`${apiUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${STRAICO_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000,
      });

      MODEL_LIMITS = response.data.data.reduce((acc, model) => {
        if (model.object === 'model') {
          acc[model.id] = {
            max_output: model.max_output,
            word_limit: model.word_limit,
            name: model.name,
            model_type: model.model_type,
            metadata: model.metadata,
          };
        }
        return acc;
      }, {});

      console.log(`[Startup] Loaded ${Object.keys(MODEL_LIMITS).length} model limits`);
    } catch (error) {
      console.warn('[Startup] Failed to fetch model limits:', error.message);
      console.warn('[Startup] Model validation will not work until fixed');
      console.warn('[Startup] Proxy will start without model validation (requests may fail with 500 errors)');
    } finally {
      fetchPromise = null;
    }
  })();
}

/**
 * Get model limits by model ID
 * 
 * @param {string} modelId - Model identifier (e.g., 'openai/gpt-4o-mini')
 * @returns {Object|null} Model info object or null if not found
 */
export function getModelLimits(modelId) {
  return MODEL_LIMITS[modelId] || null;
}

/**
 * Validate total context (input tokens + max_tokens) against model's word_limit
 * 
 * @param {number} inputTokens - Estimated input tokens
 * @param {number} maxTokens - The max_tokens value from request (or undefined)
 * @param {string} modelId - Model identifier
 * @returns {Object|null} Error response object or null if valid
 */
export function validateTotalContext(inputTokens, maxTokens, modelId) {
  const modelInfo = MODEL_LIMITS[modelId];
  if (!modelInfo) {
    return null;
  }

  const outputTokens = maxTokens || modelInfo.max_output;
  const totalTokens = inputTokens + outputTokens;

  if (totalTokens > modelInfo.word_limit) {
    return {
      error: {
        message: `Total tokens (${totalTokens}) exceeds model context limit (${modelInfo.word_limit}) for ${modelId}`,
        type: 'invalid_request_error',
      },
    };
  }

  return null;
}
