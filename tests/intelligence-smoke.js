/**
 * Intelligence Service Smoke Test
 * Catches runtime errors (like const/let bugs) before deploy.
 * Run: node tests/intelligence-smoke.js
 */
const { buildPrompt } = require('../src/services/intelligenceQueryService');

const scenarios = [
  {
    label: 'existing_customer',
    ctx: { account: { type: 'Existing Customer', name: 'TestCo' }, opportunities: [{ isWon: true, isClosed: true }], contracts: [{ status: 'Activated' }] }
  },
  {
    label: 'active_pipeline',
    ctx: { account: { type: '', name: 'PipelineCo' }, opportunities: [{ isClosed: false }], contracts: [] }
  },
  {
    label: 'historical',
    ctx: { account: { type: '', name: 'OldCo' }, opportunities: [{ isClosed: true, isWon: false }], contracts: [] }
  },
  {
    label: 'cold',
    ctx: { account: { type: '', name: 'ColdCo' }, opportunities: [], contracts: [] }
  },
  {
    label: 'no_account',
    ctx: { opportunities: [] }
  }
];

let passed = 0;
let failed = 0;

for (const s of scenarios) {
  try {
    const result = buildPrompt({ intent: 'GENERAL', query: 'What is the deal status?', context: s.ctx });
    if (!result.systemPrompt || !result.userPrompt) throw new Error('Missing prompt output');
    if (result.systemPrompt.length < 100) throw new Error('System prompt too short');
    passed++;
    console.log(`  PASS: ${s.label}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL: ${s.label} - ${e.message}`);
  }
}

console.log(`\n${passed}/${passed + failed} scenarios passed`);
if (failed > 0) {
  process.exit(1);
}
