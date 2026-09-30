import { describe, expect, it } from 'vitest';
import { interpret, TOOL_SPECS } from '../src/tools';

const propose = (changes: unknown) => ({ name: 'propose_settings_changes', input: { changes } });
const feedback = (category: unknown, summary: unknown) => ({ name: 'submit_feedback', input: { category, summary } });

describe('tool specs', () => {
  it('declares both tools with required fields, as plain JSON Schema', () => {
    expect(TOOL_SPECS.map((t) => t.name)).toEqual(['propose_settings_changes', 'submit_feedback']);
    expect(TOOL_SPECS[0]?.schema.required).toEqual(['changes']);
    expect(TOOL_SPECS[1]?.schema.required).toEqual(['category', 'summary']);
  });

  it('leaves the change value untyped, because providers disagree on unions', () => {
    const items = ((TOOL_SPECS[0]?.schema.properties as any).changes.items.properties) as Record<string, any>;
    expect(items.value.type).toBeUndefined();
    expect(items.value.description).toContain('number');
  });
});

describe('interpret', () => {
  it('returns plain text with no proposal', () => {
    expect(interpret(['Try a slower tempo.'], [])).toEqual({ reply: 'Try a slower tempo.', proposal: null, feedback: [] });
  });

  it('joins several text blocks and ignores unknown tools', () => {
    expect(interpret(['One.', 'Two.'], [{ name: 'rm_rf', input: { path: '/' } }])).toEqual({
      reply: 'One.\nTwo.',
      proposal: null,
      feedback: [],
    });
  });

  it('reads a settings proposal from the tool call, alongside text', () => {
    const result = interpret(
      ['Give yourself more tries.'],
      [propose([{ setting: 'noteRetries', value: 5 }, { setting: 'showTestNotes', value: true }])],
    );
    expect(result.reply).toBe('Give yourself more tries.');
    expect(result.proposal).toEqual([
      { setting: 'noteRetries', value: 5 },
      { setting: 'showTestNotes', value: true },
    ]);
  });

  it('merges proposals from several calls in order', () => {
    const result = interpret([], [propose([{ setting: 'a', value: 1 }]), propose([{ setting: 'b', value: 2 }])]);
    expect(result.proposal?.map((p) => p.setting)).toEqual(['a', 'b']);
  });

  it('accepts numbers and booleans sent as text, because some models do that', () => {
    const result = interpret([], [propose([
      { setting: 'noteRetries', value: '5' },
      { setting: 'tempoBpm', value: ' 120 ' },
      { setting: 'showTestNotes', value: 'TRUE' },
      { setting: 'octaveCorrection', value: 'false' },
      { setting: 'yinThreshold', value: '0.2' },
    ])]);
    expect(result.proposal).toEqual([
      { setting: 'noteRetries', value: 5 },
      { setting: 'tempoBpm', value: 120 },
      { setting: 'showTestNotes', value: true },
      { setting: 'octaveCorrection', value: false },
      { setting: 'yinThreshold', value: 0.2 },
    ]);
  });

  it('drops malformed changes but keeps the good ones', () => {
    const result = interpret([], [propose([
      { setting: 5, value: 1 },
      { setting: 'x', value: 'loud' },
      { setting: 'y', value: null },
      { setting: 'z' },
      { setting: 'w', value: '' },
      null,
      { setting: 'noteRetries', value: 5 },
    ])]);
    expect(result.proposal).toEqual([{ setting: 'noteRetries', value: 5 }]);
    expect(interpret([], [propose('nope')]).proposal).toBeNull();
    expect(interpret([], [{ name: 'propose_settings_changes', input: null }]).proposal).toBeNull();
  });

  it('reads feedback and validates its category and summary', () => {
    const result = interpret(['Noted, thanks.'], [
      feedback('feature_request', '  Wants a dark theme.  '),
      feedback('nonsense', 'bad category'),
      feedback('bug', '   '),
      feedback('bug', 42),
    ]);
    expect(result.feedback).toEqual([{ category: 'feature_request', summary: 'Wants a dark theme.' }]);
  });

  it('caps feedback items per turn and their length', () => {
    const many = Array.from({ length: 5 }, () => feedback('other', 'y'.repeat(900)));
    const result = interpret([], many);
    expect(result.feedback).toHaveLength(3);
    expect(result.feedback[0]?.summary).toHaveLength(500);
  });
});
