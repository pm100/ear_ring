// Runs example questions against a deployed proxy and checks each lands on the right outcome
// (setting change, plain advice, feedback or a refusal). The model is not deterministic, so a
// failure is a prompt to read the reply, not proof of a bug: re-run, then adjust RULES in
// src/prompt.ts if it keeps happening.
//
//   node scripts/examples.mjs https://ear-ring-assistant.<account>.workers.dev
//
// Each question uses a fresh install id, so it does not consume one install's daily quota.
// It does spend real model tokens, and feedback examples are stored and appear in the digest.
import { readFileSync } from 'node:fs';

const base = process.argv[2];
if (!base) {
  console.error('usage: node scripts/examples.mjs <proxy base url>');
  process.exit(2);
}
const context = JSON.parse(readFileSync(new URL('../test/fixtures/context.json', import.meta.url), 'utf8'));

const proposes = (r, key) => (r.proposal ?? []).some((p) => p.setting === key);
const examples = [
  { ask: 'I want a chance to correct a wrong note', expect: 'proposes noteRetries', ok: (r) => proposes(r, 'noteRetries') },
  { ask: 'It misses my quiet notes', expect: 'proposes micSensitivity', ok: (r) => proposes(r, 'micSensitivity') },
  { ask: 'I would like to use different colors', expect: 'feedback, no proposal', ok: (r) => r.feedbackSent && !r.proposal },
  { ask: 'What is the weather like today?', expect: 'declines, no proposal, no feedback', ok: (r) => !r.proposal && !r.feedbackSent },
  {
    ask: 'Switch me to soprano voice',
    expect: 'free user: no instrument proposal, mentions premium',
    ok: (r) => !proposes(r, 'instrumentIndex') && /premium/i.test(r.reply),
  },
  { ask: 'I keep rushing the notes, any tips?', expect: 'plain advice (a reply)', ok: (r) => r.reply.length > 0 },
];

let failed = 0;
for (const example of examples) {
  const body = { messages: [{ role: 'user', text: example.ask }], context };
  const res = await fetch(`${base}/v1/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Install-Id': crypto.randomUUID(), 'X-Client': 'desktop' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  const pass = res.status === 200 && example.ok(json);
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  "${example.ask}"  (want: ${example.expect})`);
  console.log(`      status ${res.status}  reply: ${json.reply ?? JSON.stringify(json)}`);
  if (json.proposal) console.log(`      proposal: ${JSON.stringify(json.proposal)}`);
  if (json.feedbackSent) console.log('      feedback stored');
}
console.log(failed === 0 ? '\nAll examples passed.' : `\n${failed} example(s) need a look.`);
process.exit(failed === 0 ? 0 : 1);
