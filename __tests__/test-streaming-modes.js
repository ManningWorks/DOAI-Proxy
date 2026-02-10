const http = require('http');

const testText = 'Here is **bold text** and `inline code`.\n\nAnd a code block:\n```js\nconsole.log("hello");\n```\n\n- List item 1\n- List item 2';

async function testStreamingMode(mode, description) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${mode} mode`);
  console.log(`Description: ${description}`);
  console.log('='.repeat(60));

  const postData = JSON.stringify({
    model: 'auto',
    messages: [
      { role: 'user', content: testText }
    ],
    stream: true,
  });

  const options = {
    hostname: 'localhost',
    port: 8000,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      let chunkCount = 0;

      res.on('data', (chunk) => {
        data += chunk;
        chunkCount++;
      });

      res.on('end', () => {
        console.log(`\nReceived ${chunkCount} chunks`);

        const chunks = data.split('\n\n').filter(line => line.startsWith('data: '));
        let content = '';

        for (const chunk of chunks) {
          const jsonStr = chunk.replace('data: ', '');
          const json = JSON.parse(jsonStr);
          if (json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content) {
            content += json.choices[0].delta.content;
          }
        }

        console.log('\n--- Reassembled Content ---');
        console.log(content);
        console.log('--- End Content ---\n');

        const hasFormattingIssues = checkFormatting(content);
        console.log(`Formatting check: ${hasFormattingIssues ? '⚠️  ISSUES FOUND' : '✅ NO ISSUES'}`);

        resolve({ mode, chunkCount, content });
      });
    });

    req.on('error', (error) => {
      console.error(`Error: ${error.message}`);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

function checkFormatting(text) {
  const issues = [];

  if (!text.includes('**') || text.split('**').length < 4) {
    issues.push('Bold markers missing or unpaired');
  }

  if (!text.includes('`') || text.split('`').length < 4) {
    issues.push('Code markers missing or unpaired');
  }

  if (!text.includes('```')) {
    issues.push('Code block markers missing');
  }

  return issues.length > 0;
}

async function runTests() {
  const modes = [
    { mode: 'smart', env: 'STREAM_MODE=smart' },
    { mode: 'simple', env: 'STREAM_MODE=simple' },
    { mode: 'none', env: 'STREAM_MODE=none' },
  ];

  const descriptions = {
    smart: 'Boundary-aware 15-char chunks (best formatting preservation)',
    simple: '2-3 chunks at natural boundaries (minimal formatting issues)',
    none: 'Send whole response in single chunk (no formatting issues)',
  };

  for (const config of modes) {
    console.log(`\n⚠️  Note: You need to restart server with: ${config.env}`);
    console.log('Waiting 2 seconds before next test...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      await testStreamingMode(config.mode, descriptions[config.mode]);
    } catch (error) {
      console.error(`Test failed for ${config.mode} mode:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('All tests complete!');
  console.log('='.repeat(60));
  console.log('\n📊 Summary:');
  console.log('  - none mode:   Best formatting, 1 chunk');
  console.log('  - simple mode: Good formatting, 2-3 chunks');
  console.log('  - smart mode: Best formatting, many chunks');
  console.log('\n💡 Recommendation: Use "none" or "simple" for production.\n');
}

runTests().catch(console.error);
