import { StraicoProvider } from '../providers/straico-provider.js';

const provider = new StraicoProvider({
  STRAICO_API_KEY: 'test',
});

const mockRequest = {
  model: 'amazon/nova-lite-v1',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello' }
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'search',
        description: 'Search the web',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          }
        }
      }
    }
  ]
};

console.log('Original messages:', JSON.stringify(mockRequest.messages, null, 2));
console.log('\n---');

const transformed = provider.transformRequest(mockRequest);

console.log('Transformed request:', JSON.stringify(transformed, null, 2));
console.log('\n---');

console.log('Messages after transform:', JSON.stringify(mockRequest.messages, null, 2));
