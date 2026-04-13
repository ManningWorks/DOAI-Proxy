import { shouldSummarize, splitMessages, estimateTokens, summarizeIfNeeded } from '../summarizer.js';
import { MODEL_LIMITS } from '../utils/model-limits.js';

const originalEnv = { ...process.env };

function setEnv(updates) {
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function resetEnv() {
  process.env = { ...originalEnv };
}

function makeMessages(count, prefix = 'msg') {
  const messages = [{ role: 'system', content: 'You are a helpful assistant.' }];
  for (let i = 0; i < count; i++) {
    messages.push({ role: 'user', content: `${prefix} ${i}: This is a test message with enough content to be realistic. File: src/file${i}.js had a bug in function foo${i}().` });
    messages.push({ role: 'assistant', content: `Response ${i}: I looked at src/file${i}.js and the bug in foo${i}() is caused by a null pointer.` });
  }
  return messages;
}

const MOCK_MODEL = 'test/mock-model';

function setupMockModel() {
  MODEL_LIMITS[MOCK_MODEL] = {
    max_output: 4096,
    word_limit: 8000,
    name: 'Mock Model',
    model_type: 'chat',
  };
}

function cleanupMockModel() {
  delete MODEL_LIMITS[MOCK_MODEL];
}

let passCount = 0;
let failCount = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  PASS: ${testName}`);
    passCount++;
  } else {
    console.log(`  FAIL: ${testName}`);
    failCount++;
  }
}

async function testEstimateTokens() {
  console.log('\n--- estimateTokens ---');

  const messages = [
    { role: 'system', content: 'Hello' },
    { role: 'user', content: 'World' },
  ];
  const tokens = estimateTokens(messages);
  const jsonLen = JSON.stringify(messages).length;
  assert(tokens === Math.ceil(jsonLen / 4), `Returns ceil(jsonLen/4): ${tokens} === ${Math.ceil(jsonLen / 4)}`);

  const empty = estimateTokens([]);
  assert(empty === Math.ceil('[]'.length / 4), `Handles empty array: ${empty}`);
}

function testShouldSummarize() {
  console.log('\n--- shouldSummarize ---');

  setupMockModel();

  setEnv({ SUMMARIZATION_ENABLED: undefined });
  const result1 = shouldSummarize(makeMessages(5), MOCK_MODEL);
  assert(result1.shouldSummarize === false, 'Returns false when SUMMARIZATION_ENABLED is not set');
  assert(!result1.tokenEstimate, 'No tokenEstimate when disabled');

  setEnv({ SUMMARIZATION_ENABLED: 'false' });
  const result2 = shouldSummarize(makeMessages(5), MOCK_MODEL);
  assert(result2.shouldSummarize === false, 'Returns false when SUMMARIZATION_ENABLED=false');

  setEnv({ SUMMARIZATION_ENABLED: 'true' });
  const result3 = shouldSummarize(makeMessages(5), 'nonexistent/model');
  assert(result3.shouldSummarize === false, 'Returns false for unknown model');
  delete MODEL_LIMITS['nonexistent/model'];

  const smallMessages = [{ role: 'system', content: 'hi' }, { role: 'user', content: 'hello' }];
  const result4 = shouldSummarize(smallMessages, MOCK_MODEL);
  assert(result4.shouldSummarize === false, 'Returns false when under threshold (small messages)');

  const largeMessages = makeMessages(100);
  const result5 = shouldSummarize(largeMessages, MOCK_MODEL);
  const est = estimateTokens(largeMessages);
  const threshold = Math.floor(8000 * 0.7);
  console.log(`    (est: ${est}, threshold: ${threshold}, modelLimit: 8000)`);
  if (est >= threshold) {
    assert(result5.shouldSummarize === true, `Returns true when over threshold (est ${est} >= ${threshold})`);
    assert(result5.tokenEstimate === est, `tokenEstimate is correct: ${result5.tokenEstimate} === ${est}`);
    assert(result5.modelLimit === 8000, `modelLimit is correct: ${result5.modelLimit}`);
    assert(result5.candidateCount > 0, `candidateCount is positive: ${result5.candidateCount}`);
  } else {
    assert(result5.shouldSummarize === false, `Returns false - not enough tokens even with 100 msg pairs (est: ${est})`);
  }

  setEnv({ SUMMARIZATION_ENABLED: 'true', SUMMARIZATION_KEEP_MESSAGES: '99' });
  const marginalMessages = makeMessages(50);
  const result6 = shouldSummarize(marginalMessages, MOCK_MODEL);
  assert(result6.shouldSummarize === false, 'Returns false with marginal savings (keep 99 of ~101 non-system)');
  setEnv({ SUMMARIZATION_KEEP_MESSAGES: undefined });

  setEnv({ SUMMARIZATION_ENABLED: 'true', SUMMARIZATION_KEEP_MESSAGES: '10' });
  const tinyMessages = makeMessages(2);
  const result7 = shouldSummarize(tinyMessages, MOCK_MODEL);
  assert(result7.shouldSummarize === false, 'Returns false when fewer than 3 candidates');

  cleanupMockModel();
  resetEnv();
}

function testSplitMessages() {
  console.log('\n--- splitMessages ---');

  const messages = [
    { role: 'system', content: 'sys1' },
    { role: 'user', content: 'u1' },
    { role: 'assistant', content: 'a1' },
    { role: 'system', content: 'sys2' },
    { role: 'user', content: 'u2' },
    { role: 'assistant', content: 'a2' },
    { role: 'user', content: 'u3' },
    { role: 'assistant', content: 'a3' },
  ];

  const result = splitMessages(messages, 2);
  assert(result.systemMessages.length === 2, `System messages: ${result.systemMessages.length} === 2`);
  assert(result.candidates.length === 4, `Candidates: ${result.candidates.length} === 4 (u1, a1, u2, a2)`);
  assert(result.recentMessages.length === 2, `Recent: ${result.recentMessages.length} === 2 (u3, a3)`);
  assert(result.systemMessages[0].content === 'sys1', 'First system message preserved');
  assert(result.systemMessages[1].content === 'sys2', 'Second system message preserved');
  assert(result.candidates[0].content === 'u1', 'First candidate is u1');
  assert(result.candidates[1].content === 'a1', 'Second candidate is a1');
  assert(result.recentMessages[0].content === 'u3', 'First recent is u3');

  const allSystem = [
    { role: 'system', content: 's1' },
    { role: 'system', content: 's2' },
  ];
  const result2 = splitMessages(allSystem, 5);
  assert(result2.systemMessages.length === 2, 'All-system: system messages correct');
  assert(result2.candidates.length === 0, 'All-system: no candidates');
  assert(result2.recentMessages.length === 0, 'All-system: no recent');

  const fewMessages = [
    { role: 'system', content: 's1' },
    { role: 'user', content: 'u1' },
  ];
  const result3 = splitMessages(fewMessages, 10);
  assert(result3.systemMessages.length === 1, 'Few messages: system preserved');
  assert(result3.candidates.length === 0, 'Few messages: no candidates');
  assert(result3.recentMessages.length === 1, 'Few messages: 1 recent');
}

async function testSummarizeIfNeeded() {
  console.log('\n--- summarizeIfNeeded ---');

  setupMockModel();

  setEnv({ SUMMARIZATION_ENABLED: undefined });
  const result1 = await summarizeIfNeeded(makeMessages(5), MOCK_MODEL);
  assert(result1.wasSummarized === false, 'No-op when disabled');
  assert(result1.messages.length === makeMessages(5).length, 'Messages unchanged when disabled');

  setEnv({ SUMMARIZATION_ENABLED: 'true' });
  const smallMsgs = [{ role: 'system', content: 'hi' }, { role: 'user', content: 'hello' }];
  const result2 = await summarizeIfNeeded(smallMsgs, MOCK_MODEL);
  assert(result2.wasSummarized === false, 'No-op when under threshold');
  assert(result2.messages.length === 2, 'Small messages unchanged');

  setEnv({ SUMMARIZATION_ENABLED: 'true', STRAICO_API_KEY: 'test-key' });
  const largeMessages = makeMessages(100);
  const est = estimateTokens(largeMessages);
  const threshold = Math.floor(8000 * 0.7);
  console.log(`    (est: ${est}, threshold: ${threshold})`);

  if (est >= threshold) {
    const originalAxiosPost = (await import('axios')).default.post;
    let summaryCallMade = false;
    (await import('axios')).default.post = async () => {
      summaryCallMade = true;
      return {
        data: {
          choices: [{ message: { content: 'Summary: User worked on multiple files including src/file0.js through src/file99.js. Key bugs were null pointers in foo functions.' } }],
        },
      };
    };

    const result3 = await summarizeIfNeeded(largeMessages, MOCK_MODEL);
    assert(summaryCallMade, 'Summary API call was made');
    assert(result3.wasSummarized === true, 'wasSummarized is true');
    assert(result3.messages.length < largeMessages.length, `Messages reduced: ${result3.messages.length} < ${largeMessages.length}`);
    assert(result3.messages[0].role === 'system', 'System message preserved');
    assert(result3.messages[1].content.includes('[Conversation Summary'), 'Summary message has correct prefix');
    assert(result3.messages[1].role === 'user', 'Summary message is user role');

    (await import('axios')).default.post = originalAxiosPost;
  } else {
    console.log('    (Skipping API mock test - not enough tokens with mock model limit of 8000)');
  }

  setEnv({ SUMMARIZATION_ENABLED: 'true', STRAICO_API_KEY: 'test-key' });
  const largeMessages2 = makeMessages(100);
  const est2 = estimateTokens(largeMessages2);
  if (est2 >= Math.floor(8000 * 0.7)) {
    const originalAxiosPost2 = (await import('axios')).default.post;
    (await import('axios')).default.post = async () => {
      throw new Error('Simulated API failure');
    };

    const result4 = await summarizeIfNeeded(largeMessages2, MOCK_MODEL);
    assert(result4.wasSummarized === false, 'wasSummarized is false on API failure');
    assert(result4.messages.length === largeMessages2.length, 'Original messages returned on failure');

    (await import('axios')).default.post = originalAxiosPost2;
  }

  cleanupMockModel();
  resetEnv();
}

async function runTests() {
  console.log('=== Summarizer Tests ===');

  await testEstimateTokens();
  testShouldSummarize();
  testSplitMessages();
  await testSummarizeIfNeeded();

  console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);
  process.exit(failCount > 0 ? 1 : 0);
}

runTests();
