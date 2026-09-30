import { storeFeedback } from './feedback';
import { limitFor, readQuota, recordUse } from './quota';
import type { Env, ModelProvider } from './types';
import { isInstallId, MAX_BODY_BYTES, parseAsk } from './validate';

export interface Deps {
  provider: ModelProvider;
  now: () => Date;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * POST /v1/ask. The model is asked before the question is counted, so an upstream failure
 * costs the user nothing. Feedback storage failures never fail the request.
 */
export async function handleAsk(request: Request, env: Env, deps: Deps): Promise<Response> {
  const installId = request.headers.get('X-Install-Id');
  if (!isInstallId(installId)) return json(400, { error: 'bad_install_id' });

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json(413, { error: 'too_large' });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return json(400, { error: 'bad_request' });
  }
  const parsed = parseAsk(raw);
  if (!parsed.ok) return json(400, { error: 'bad_request', detail: parsed.error });
  const { body } = parsed;

  const now = deps.now();
  const limit = limitFor(env, body.context.premium);
  const { used, quota } = await readQuota(env.QUOTA, installId, limit, now);
  if (used >= limit) return json(429, { error: 'quota_exceeded', quota });

  let result;
  try {
    result = await deps.provider.ask(body);
  } catch (error) {
    // Log only the class, status and (for misconfiguration) our own message: never the prompt,
    // the user's text or a key.
    const { name, message, status } = error as { name?: string; message?: string; status?: number };
    const detail = message?.startsWith('provider misconfigured') ? ` ${message}` : '';
    console.error(`model call failed: ${name ?? 'Error'} status=${status ?? 'n/a'}${detail}`);
    return json(502, { error: 'upstream' });
  }

  await recordUse(env.QUOTA, installId, used, now);

  let stored = 0;
  for (const item of result.feedback) {
    try {
      await storeFeedback(env.FEEDBACK, {
        at: now.toISOString(),
        installId,
        platform: body.context.platform,
        category: item.category,
        summary: item.summary,
      });
      stored++;
    } catch (error) {
      console.error(`feedback store failed: ${(error as Error).name}`);
    }
  }

  return json(200, {
    reply: result.reply,
    proposal: result.proposal,
    feedbackSent: stored > 0,
    quota: { remaining: Math.max(0, limit - (used + 1)), resetsAt: quota.resetsAt },
  });
}
