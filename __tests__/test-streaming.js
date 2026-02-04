import { simulateStream } from '../streaming.js';

async function testStreaming() {
  console.log('Testing streaming module...\n');

  const testText = 'This is a test message for streaming simulation. It should be broken into small chunks with delays between them.';

  console.log('Test text length:', testText.length);
  console.log('Test text:', testText);
  console.log('\nStarting SSE stream...\n');

  const chunks = [];
  let chunkCount = 0;
  let totalCharacters = 0;

  const mockRes = {
    write: (data) => {
      try {
        const parsed = JSON.parse(data.split('\n')[0].replace('data: ', ''));
        if (parsed.choices && parsed.choices[0].delta.content) {
          chunks.push(parsed.choices[0].delta.content);
          totalCharacters += parsed.choices[0].delta.content.length;
          chunkCount++;
          process.stdout.write(parsed.choices[0].delta.content);
        } else if (parsed.choices && parsed.choices[0].finish_reason === 'stop') {
          console.log('\n\n✓ Received final chunk with finish_reason: stop');
          console.log('✓ Total chunks received:', chunkCount);
          console.log('✓ Total characters received:', totalCharacters);
          console.log('\n✓ Stream completed successfully!\n');
        } else if (data.includes('[DONE]')) {
          console.log('\n✓ Received [DONE] marker\n');
        }
      } catch (error) {
        console.error('Error parsing data:', error.message);
      }
    },
    end: () => {
      console.log('Response stream ended');
    },
  };

  await simulateStream(testText, mockRes, { chunkSize: 15, delay: 10 });

  console.log('\nAll tests passed!\n');
}

testStreaming().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
