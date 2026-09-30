import { describe, expect, it } from 'vitest';
import fixtureJson from './fixtures/context.json';
import { handleAsk } from '../src/handler';
import { systemParts } from '../src/prompt';
import type { Context } from '../src/types';
import { MAX_BODY_BYTES, parseAsk } from '../src/validate';
import { askRequest, makeEnv, stubProvider } from './helpers';

// test/fixtures/context.json is the Rust core's own `context_json` output for the default
// settings (regenerate with `cargo test -p ear_ring_core write_context_fixture -- --ignored`).
// These tests keep the proxy's validator and prompt in step with what the apps really send.
const fixture = fixtureJson as unknown as Context;
const body = { messages: [{ role: 'user', text: 'I want a chance to correct a wrong note' }], context: fixture };

describe('contract with the Rust core', () => {
  it("accepts the core's real context unchanged", () => {
    const parsed = parseAsk(body);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.body.context.settings).toHaveLength(fixture.settings.length);
  });

  it('fits comfortably inside the body size limit', () => {
    expect(JSON.stringify(body).length).toBeLessThan(MAX_BODY_BYTES / 2);
  });

  it('puts every setting, with its options, into the cached prompt block', () => {
    const { stable } = systemParts(fixture);
    for (const setting of fixture.settings) expect(stable).toContain(`"key":"${setting.key}"`);
    expect(stable).toContain('Retry Same Note');
    expect(stable).toContain('Soprano Voice');
  });

  it('runs through the handler end to end with a stubbed model', async () => {
    const { provider } = stubProvider({ reply: 'Try Retry Same Note.' });
    const response = await handleAsk(askRequest(body), makeEnv(), { provider, now: () => new Date('2026-10-01T12:00:00Z') });
    expect(response.status).toBe(200);
  });
});
