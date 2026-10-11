// Runs the live suite and writes the prompts and answers as Markdown for review.
//
//   npm run test:prompts                 current model from wrangler.toml / .dev.vars
//   npm run test:prompts -- <outDir>     choose the output folder
//
// Output goes to prompt-dumps/<time>-<model>/ (git-ignored); open index.md first. Environment
// variables override the config as in `npm run test:live` (PROVIDER, MODEL, OPENAI_BASE_URL,
// OPENAI_API_KEY, SAGE_RUNS, SAGE_MIN_PASS). It spends model tokens.
//
// Thinking: each answer also shows the model's reasoning when the provider returns it (local
// reasoning models via `reasoning_content`). For Anthropic set THINKING_BUDGET=<tokens, min 1024>
// to turn on extended thinking; that changes the model's behaviour, so it is for reading only.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return ''; } };
const model = process.env.MODEL || (read('wrangler.toml').match(/^MODEL\s*=\s*"([^"]+)"/m) || [])[1] || 'default';
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
const dir = process.argv[2] || join(root, 'prompt-dumps', `${stamp}-${model.replace(/[^\w.-]+/g, '_')}`);

const res = spawnSync(process.execPath, ['./node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.live.config.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, SAGE_DUMP: dir },
});
console.log(`\nPrompts and answers: ${join(dir, 'index.md')}`);
process.exit(res.status ?? 1);
