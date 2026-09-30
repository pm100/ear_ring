import { describe, expect, it } from 'vitest';
import { RULES, systemParts } from '../src/prompt';
import { CONTEXT } from './helpers';

describe('systemParts', () => {
  it('puts rules and schema in the stable part and per-user state in the volatile part', () => {
    const { stable, volatile } = systemParts(CONTEXT);
    expect(stable).toContain(RULES);
    expect(stable).toContain('noteRetries');
    expect(stable).not.toContain('currentLabel');
    expect(volatile).toContain('Premium user: no');
    expect(volatile).toContain('Platform: android');
    expect(volatile).toContain('noteRetries (Retry Same Note): 2');
  });

  it('keeps the stable part identical when only current values or premium state change', () => {
    const changed = {
      ...CONTEXT,
      premium: true,
      settings: CONTEXT.settings.map((s) => ({ ...s, current: 99, currentLabel: 'changed' })),
    };
    expect(systemParts(changed).stable).toBe(systemParts(CONTEXT).stable);
    expect(systemParts(changed).volatile).not.toBe(systemParts(CONTEXT).volatile);
  });

  it('tells the model to use the tools and to respect premium', () => {
    expect(RULES).toContain('propose_settings_changes');
    expect(RULES).toContain('submit_feedback');
    expect(RULES).toContain('premium');
  });
});
