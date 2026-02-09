import axios from 'axios';

const PROXY_URL = process.env.PROXY_URL || 'http://localhost:8000';
const PROXY_API_KEY = process.env.PROXY_API_KEY;

async function testMaxTokensValidation() {
  console.log('Testing max_tokens validation...\n');

  const testCases = [
    {
      name: 'Test 1: max_tokens exceeds model limit',
      model: 'openai/gpt-4o-mini',
      max_tokens: 32000,
      expectedStatus: 400,
      expectedError: 'exceeds limit (16384)',
    },
    {
      name: 'Test 2: Valid max_tokens',
      model: 'openai/gpt-4o-mini',
      max_tokens: 1000,
      expectedStatus: 200,
    },
    {
      name: 'Test 3: Unknown model (should skip validation)',
      model: 'unknown/model',
      max_tokens: 100000,
      expectedStatus: 422,
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n${testCase.name}`);
    console.log(`  Model: ${testCase.model}`);
    console.log(`  max_tokens: ${testCase.max_tokens}`);
    console.log(`  Expected: Status ${testCase.expectedStatus}`);

    try {
      const response = await axios.post(
        `${PROXY_URL}/v1/chat/completions`,
        {
          model: testCase.model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: testCase.max_tokens,
        },
        {
          headers: PROXY_API_KEY ? { 'Authorization': `Bearer ${PROXY_API_KEY}` } : {},
          validateStatus: function (status) {
            return status >= 200 && status < 300;
          },
        }
      );

      console.log(`  Actual: Status ${response.status}`);

      if (testCase.expectedError) {
        const errorMessage = response.data?.error?.message || '';
        const hasExpectedError = errorMessage.includes(testCase.expectedError);
        console.log(`  Error message: ${errorMessage}`);
        console.log(`  ${hasExpectedError ? 'PASS' : 'FAIL'} - Contains expected error`);
      }

      if (response.status === testCase.expectedStatus) {
        console.log('  PASS - Got expected status');
      } else {
        console.log(`  FAIL - Got status ${response.status}, expected ${testCase.expectedStatus}`);
      }
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        console.log(`  Actual: Status ${status}`);
        
        if (testCase.expectedError) {
          const errorMessage = error.response.data?.error?.message || '';
          const hasExpectedError = errorMessage.includes(testCase.expectedError);
          console.log(`  Error message: ${errorMessage}`);
          console.log(`  ${hasExpectedError ? 'PASS' : 'FAIL'} - Contains expected error`);
        }

        if (status === testCase.expectedStatus) {
          console.log('  PASS - Got expected status');
        } else {
          console.log(`  FAIL - Got status ${status}, expected ${testCase.expectedStatus}`);
        }
      } else {
        console.log(`  FAIL - Request error: ${error.message}`);
      }
    }
  }

  console.log('\n=== Test Complete ===');
}

testMaxTokensValidation();
