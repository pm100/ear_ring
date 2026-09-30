import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_ANTHROPIC_MODEL, makeAnthropicProvider } from './providers/anthropic';
import { makeOpenAIProvider } from './providers/openai';
import type { Env, ModelProvider } from './types';

export const PROVIDERS = ['anthropic', 'openai'] as const;

/**
 * Picks the model backend from configuration, so switching provider or model never needs an app
 * release. Throws a descriptive error (no secrets) if the chosen provider is not fully configured;
 * the handler turns that into a 502 and a log line.
 */
export function makeProvider(env: Env, fetchFn: typeof fetch = fetch): ModelProvider {
  const provider = (env.PROVIDER || 'anthropic').toLowerCase();
  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) throw new Error('provider misconfigured: ANTHROPIC_API_KEY is not set');
    return makeAnthropicProvider(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }), env.MODEL || DEFAULT_ANTHROPIC_MODEL);
  }
  if (provider === 'openai') {
    const missing = (['OPENAI_BASE_URL', 'OPENAI_API_KEY', 'MODEL'] as const).filter((name) => !env[name]);
    if (missing.length > 0) throw new Error(`provider misconfigured: ${missing.join(', ')} not set`);
    return makeOpenAIProvider(
      {
        baseUrl: env.OPENAI_BASE_URL!,
        apiKey: env.OPENAI_API_KEY!,
        model: env.MODEL!,
        maxTokensField: env.OPENAI_MAX_TOKENS_FIELD || 'max_tokens',
      },
      fetchFn,
    );
  }
  throw new Error(`provider misconfigured: unknown PROVIDER "${provider}" (use ${PROVIDERS.join(' or ')})`);
}
