import type { SettingsAction } from './settingsStore';

// The setup assistant's network round trip. Every rule (request body, status handling, which
// proposed changes are valid) lives in the Rust core (rust/src/assistant.rs); this file only
// moves strings between Rust and the proxy, so it takes both as injected dependencies.

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AssistantCardItem {
  key: string;
  label: string;
  from: string;
  to: string;
  action: SettingsAction;
}

export interface AssistantCard {
  items: AssistantCardItem[];
  rejected: { key: string; reason: string }[];
}

/** What the chat shows for one round trip (the core's `resolve_outcome_json`). */
export interface AssistantView {
  reply: string;
  card: AssistantCard | null;
  /** Kept so the proposal can be re-validated against current settings when Apply is tapped. */
  proposal: unknown[] | null;
  feedbackSent: boolean;
  quota: { remaining: number; resetsAt: string } | null;
  isError: boolean;
}

export interface AssistantCore {
  endpoint(): Promise<string>;
  request(historyJson: string, settingsJson: string, isPremium: boolean): Promise<string>;
  resolveOutcome(status: number, body: string, settingsJson: string, isPremium: boolean): Promise<string>;
  resolveProposal(proposalJson: string, settingsJson: string, isPremium: boolean): Promise<string>;
}

export interface Transport {
  /** Rejects if the request never reached the server. */
  post(url: string, headers: Record<string, string>, body: string): Promise<{ status: number; body: string }>;
}

/** Sends the conversation to the proxy and returns what to show. Never rejects. */
export async function askAssistant(
  core: AssistantCore,
  transport: Transport,
  installId: string,
  history: Turn[],
  settingsJson: string,
  isPremium: boolean,
): Promise<AssistantView> {
  let status = 0;
  let body = '';
  try {
    const requestBody = await core.request(JSON.stringify(history), settingsJson, isPremium);
    const url = await core.endpoint();
    const headers = { 'Content-Type': 'application/json', 'X-Install-Id': installId, 'X-Client': 'desktop' };
    ({ status, body } = await transport.post(url, headers, requestBody));
  } catch {
    status = 0; // the core reads 0 as "couldn't reach the assistant"
  }
  return JSON.parse(await core.resolveOutcome(status, body, settingsJson, isPremium)) as AssistantView;
}

/**
 * Applies a proposal: re-validates it against the settings as they are now (they may have
 * changed since it was proposed), then dispatches each resulting action in order. Returns the
 * card that was applied; it has no items if everything is already in effect.
 */
export async function applyProposal(
  core: AssistantCore,
  proposal: unknown[],
  settingsJson: string,
  isPremium: boolean,
  dispatch: (action: SettingsAction) => void,
): Promise<AssistantCard> {
  const card = JSON.parse(await core.resolveProposal(JSON.stringify(proposal), settingsJson, isPremium)) as AssistantCard;
  for (const item of card.items) dispatch(item.action);
  return card;
}

const INSTALL_ID_KEY = 'ear_ring_install_id';

/** A random id, created on first use, that lets the proxy count questions per install. */
export function getInstallId(storage: Pick<Storage, 'getItem' | 'setItem'>, makeId: () => string = () => crypto.randomUUID()): string {
  try {
    const existing = storage.getItem(INSTALL_ID_KEY);
    if (existing) return existing;
    const created = makeId();
    storage.setItem(INSTALL_ID_KEY, created);
    return created;
  } catch {
    return makeId(); // storage blocked: a per-session id still works, it just isn't remembered
  }
}
