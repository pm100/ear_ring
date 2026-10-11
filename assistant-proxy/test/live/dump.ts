// Prompt dump for the live suite: writes what is sent to the model as readable Markdown, so the
// prompt, schema and tools can be reviewed. Enabled by SAGE_DUMP=<dir> (see scripts/live-prompts.mjs).
//
//   <dir>/index.md              results by group, links to everything below
//   <dir>/system-prompt*.md     the fixed part of the prompt: rules, settings schema, tools
//   <dir>/cases/NN-name.md      per question: the per-user prompt part, the conversation, every answer
//
// For an OpenAI-compatible provider the request is captured from the real HTTP body; for others it
// is rebuilt from the same prompt and tool definitions.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { systemParts } from '../../src/prompt';
import { MAX_TOKENS, TOOL_SPECS } from '../../src/tools';
import type { Context, SettingInfo, Turn } from '../../src/types';

export interface CapturedRequest {
  model: string;
  temperature?: number;
  maxTokens?: number;
  system: string;
  messages: { role: string; content: string }[];
  tools: { name: string; description: string; parameters: unknown }[];
  /** True when parsed from the real HTTP body, false when rebuilt. */
  captured: boolean;
}

export interface RunRecord {
  reply: string;
  proposal: unknown;
  feedback: unknown;
  problems: string[];
  reasoning?: string;
  request?: CapturedRequest;
}

export interface CaseRecord {
  group: string;
  name: string;
  turns: Turn[];
  context: Context;
  runs: RunRecord[];
  good: number;
  need: number;
}

/** A fetch that remembers the body of each chat-completions request it forwards. */
export function capturingFetch(store: CapturedRequest[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const [system, ...rest] = body.messages ?? [];
      store.push({
        model: body.model,
        temperature: body.temperature,
        maxTokens: body.max_tokens ?? body.max_completion_tokens,
        system: system?.content ?? '',
        messages: rest,
        tools: (body.tools ?? []).map((t: { function: { name: string; description: string; parameters: unknown } }) => t.function),
        captured: true,
      });
    } catch {
      // Not JSON: nothing to record.
    }
    return fetch(input, init);
  }) as typeof fetch;
}

/** What the providers send, rebuilt from the prompt and tool definitions. */
export function rebuildRequest(model: string, context: Context, turns: Turn[]): CapturedRequest {
  const { stable, volatile } = systemParts(context);
  return {
    model,
    maxTokens: MAX_TOKENS,
    system: `${stable}\n\n${volatile}`,
    messages: turns.map((t) => ({ role: t.role, content: t.text })),
    tools: TOOL_SPECS.map((t) => ({ name: t.name, description: t.description, parameters: t.schema })),
    captured: false,
  };
}

const SCHEMA_MARK = '\n\nSETTINGS SCHEMA (JSON):\n';
const GUIDE_MARK = '\n\nAPP GUIDE\n';
const USER_MARK ='\n\nUSER STATE\n';

/** Splits the system message into the fixed rules, the schema JSON and the per-user part. */
function splitSystem(system: string): { rules: string; schema: string; guide: string; user: string } {
  const u = system.indexOf(USER_MARK);
  const head = u >= 0 ? system.slice(0, u) : system;
  const user = u >= 0 ? system.slice(u + 2) : '';
  const g = head.indexOf(GUIDE_MARK);
  const guide = g >= 0 ? head.slice(g + GUIDE_MARK.length) : '';
  const body = g >= 0 ? head.slice(0, g) : head;
  const s = body.indexOf(SCHEMA_MARK);
  return s >= 0
    ? { rules: body.slice(0, s), schema: body.slice(s + SCHEMA_MARK.length), guide, user }
    : { rules: body, schema: '', guide, user };
}

const fence = (text: string, lang = 'text') => '```' + lang + '\n' + text.replace(/\s+$/, '') + '\n```';
const cell = (v: unknown) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'case';

function schemaTable(json: string): string {
  let settings: SettingInfo[];
  try {
    settings = JSON.parse(json);
  } catch {
    return fence(json, 'json');
  }
  const rows = settings.map((s) => {
    const range = s.options
      ? s.options.map((o) => `${o.value}=${o.label}${o.premium ? ' (premium)' : ''}`).join('<br>')
      : s.type === 'bool'
        ? 'true / false'
        : `${s.min ?? ''} to ${s.max ?? ''}${s.step ? `, step ${s.step}` : ''}`;
    return `| \`${s.key}\` | ${cell(s.label)} | ${s.type} | ${range.replace(/\|/g, '\\|')} | ${cell(s.default)} | ${cell(s.description)} |`;
  });
  return ['| key | label | type | values | default | description |', '|---|---|---|---|---|---|', ...rows].join('\n');
}

function stableDoc(req: CapturedRequest, parts: ReturnType<typeof splitSystem>): string {
  const lines = [
    '# System prompt: the fixed part',
    '',
    `Sent first in every request. ${parts.rules.length + parts.schema.length + parts.guide.length} characters (rules ${parts.rules.length}, schema ${parts.schema.length}, guide ${parts.guide.length}), the same for every user on one app version.`,
    '',
    '## Rules (verbatim)',
    '',
    fence(parts.rules),
    '',
    '## Settings schema',
    '',
    'Sent as one line of JSON; shown here as a table. Current values are not part of it.',
    '',
    schemaTable(parts.schema),
    '',
    '<details><summary>Raw schema JSON as sent</summary>',
    '',
    fence(parts.schema, 'json'),
    '',
    '</details>',
    '',
    ...(parts.guide ? ['## App guide (verbatim)', '', fence(parts.guide), ''] : []),
    '## Tools offered to the model',
    '',
  ];
  for (const t of req.tools) {
    lines.push(`### \`${t.name}\``, '', t.description, '', fence(JSON.stringify(t.parameters, null, 2), 'json'), '');
  }
  return lines.join('\n');
}

export class PromptDump {
  private cases: (CaseRecord & { file: string; stable: string })[] = [];
  private stables = new Map<string, string>();

  constructor(
    private dir: string,
    private meta: { provider: string; model: string; temperature?: string; runs: number; thinking?: string },
  ) {
    mkdirSync(join(dir, 'cases'), { recursive: true });
  }

  private stableFile(req: CapturedRequest, parts: ReturnType<typeof splitSystem>): string {
    const hash = createHash('sha1').update(parts.rules + parts.schema + parts.guide + JSON.stringify(req.tools)).digest('hex').slice(0, 8);
    let file = this.stables.get(hash);
    if (!file) {
      file = this.stables.size === 0 ? 'system-prompt.md' : `system-prompt-${this.stables.size + 1}.md`;
      this.stables.set(hash, file);
      writeFileSync(join(this.dir, file), stableDoc(req, parts));
    }
    return file;
  }

  record(c: CaseRecord): void {
    const req = c.runs.find((r) => r.request)?.request ?? rebuildRequest(this.meta.model, c.context, c.turns);
    const parts = splitSystem(req.system);
    const stable = this.stableFile(req, parts);
    const n = String(this.cases.length + 1).padStart(2, '0');
    const file = `cases/${n}-${slug(c.name)}.md`;

    const md: string[] = [
      `# ${c.name}`,
      '',
      `**${c.good}/${c.runs.length} good answers** (need ${c.need}): ${c.good >= c.need ? 'PASS' : 'FAIL'}  `,
      `Group: ${c.group}  `,
      `Model: \`${req.model}\`${req.temperature !== undefined ? `, temperature ${req.temperature}` : ''}${req.maxTokens ? `, max tokens ${req.maxTokens}` : ''}, tool choice auto  `,
      `Request ${req.captured ? 'captured from the HTTP body' : 'rebuilt from the prompt and tool definitions'}.`,
      '',
      '## What was sent',
      '',
      `1. **System message**: the fixed part ([${stable}](../${stable}): rules, settings schema, tools), then the per-user part below.`,
      '2. **Conversation**: the turns below.',
      `3. **Tools**: ${req.tools.map((t) => `\`${t.name}\``).join(', ')} (definitions in [${stable}](../${stable})).`,
      '',
      '### Per-user part of the system message',
      '',
      fence(parts.user),
      '',
      '### Conversation',
      '',
      ...req.messages.flatMap((m) => [`**${m.role}**`, '', fence(m.content), '']),
      '## Answers',
      '',
    ];
    c.runs.forEach((r, i) => {
      md.push(
        `### Run ${i + 1}: ${r.problems.length ? 'FAIL' : 'ok'}`,
        '',
        ...(r.problems.length ? r.problems.map((p) => `- Problem: ${p}`).concat('') : []),
        ...(r.reasoning ? ['**Thinking**', '', fence(r.reasoning), ''] : []),
        '**Reply**',
        '',
        fence(r.reply || '(empty)'),
        '',
        `**Proposal**: \`${JSON.stringify(r.proposal)}\`  `,
        `**Feedback**: \`${JSON.stringify(r.feedback)}\``,
        '',
      );
    });
    writeFileSync(join(this.dir, file), md.join('\n'));
    this.cases.push({ ...c, file, stable });
  }

  finish(): void {
    const pass = this.cases.filter((c) => c.good >= c.need).length;
    const lines = [
      '# Sage live run: prompts and answers',
      '',
      `- Provider \`${this.meta.provider}\`, model \`${this.meta.model}\`${this.meta.temperature ? `, temperature ${this.meta.temperature}` : ''}`,
      ...(this.meta.thinking ? [`- **Extended thinking on (${this.meta.thinking} token budget)**: this changes the model's behaviour, so results are not comparable with a normal run`] : []),
      `- ${this.meta.runs} runs per question; **${pass} of ${this.cases.length} questions passed**`,
      `- System prompt (fixed part): ${[...this.stables.values()].map((f) => `[${f}](${f})`).join(', ')}`,
      '',
    ];
    const groups = [...new Set(this.cases.map((c) => c.group))];
    for (const g of groups) {
      lines.push(`## ${g}`, '', '| result | good | question | why it failed |', '|---|---|---|---|');
      for (const c of this.cases.filter((x) => x.group === g)) {
        const pass = c.good >= c.need;
        // Distinct problems across the failed runs, so the index says why without opening the case.
        const why = pass ? '' : [...new Set(c.runs.flatMap((r) => r.problems))].join('; ');
        lines.push(`| ${pass ? 'PASS' : '**FAIL**'} | ${c.good}/${c.runs.length} | [${cell(c.name)}](${c.file}) | ${cell(why)} |`);
      }
      lines.push('');
    }
    writeFileSync(join(this.dir, 'index.md'), lines.join('\n'));
  }
}
