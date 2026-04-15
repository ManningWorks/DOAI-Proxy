import { ProviderFactory } from '../providers/provider-factory.js';
import { StraicoProvider } from '../providers/straico-provider.js';

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

function assertThrows(fn, expectedSubstring, testName) {
  try {
    fn();
    console.log(`  FAIL: ${testName} - no error thrown`);
    failCount++;
  } catch (e) {
    if (e.message.includes(expectedSubstring)) {
      console.log(`  PASS: ${testName}`);
      passCount++;
    } else {
      console.log(`  FAIL: ${testName} - expected "${expectedSubstring}" in "${e.message}"`);
      failCount++;
    }
  }
}

const mockEnv = { STRAICO_API_KEY: 'test-key' };

console.log('=== Provider Factory Tests ===');

console.log('\n--- straico type ---');
const straico = ProviderFactory.create('straico', mockEnv);
assert(straico instanceof StraicoProvider, 'returns StraicoProvider instance');
assert(straico.getType() === 'straico', 'type is straico');

console.log('\n--- case insensitive ---');
const upperStraico = ProviderFactory.create('STRAICO', mockEnv);
assert(upperStraico instanceof StraicoProvider, 'STRAICO (uppercase) returns StraicoProvider');
const mixedStraico = ProviderFactory.create('Straico', mockEnv);
assert(mixedStraico instanceof StraicoProvider, 'Straico (mixed) returns StraicoProvider');

console.log('\n--- null/undefined defaults to straico ---');
const nullProvider = ProviderFactory.create(null, mockEnv);
assert(nullProvider instanceof StraicoProvider, 'null defaults to StraicoProvider');
const undefProvider = ProviderFactory.create(undefined, mockEnv);
assert(undefProvider instanceof StraicoProvider, 'undefined defaults to StraicoProvider');

console.log('\n--- openai (not implemented) ---');
assertThrows(() => ProviderFactory.create('openai', mockEnv), 'not implemented', 'openai throws not implemented');

console.log('\n--- anthropic (not implemented) ---');
assertThrows(() => ProviderFactory.create('anthropic', mockEnv), 'not implemented', 'anthropic throws not implemented');

console.log('\n--- unknown type ---');
assertThrows(() => ProviderFactory.create('unknown', mockEnv), 'Unknown provider type', 'unknown type throws');
assertThrows(() => ProviderFactory.create('gemini', mockEnv), 'Unknown provider type', 'gemini throws');

console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);
if (failCount > 0) process.exit(1);
