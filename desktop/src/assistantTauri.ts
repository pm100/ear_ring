import { invoke } from '@tauri-apps/api/tauri';
import { Body, fetch as tauriFetch, ResponseType } from '@tauri-apps/api/http';
import type { AssistantCore, Transport } from './assistantClient';

/** The Rust core's assistant functions, via Tauri commands. */
export const tauriCore: AssistantCore = {
  endpoint: () => invoke<string>('cmd_assistant_endpoint'),
  request: (historyJson, settingsJson, isPremium) =>
    invoke<string>('cmd_assistant_request', { history: historyJson, settings: settingsJson, isPremium }),
  resolveOutcome: (status, body, settingsJson, isPremium) =>
    invoke<string>('cmd_assistant_resolve_outcome', { status, body, settings: settingsJson, isPremium }),
  resolveProposal: (proposalJson, settingsJson, isPremium) =>
    invoke<string>('cmd_assistant_resolve_proposal', { proposal: proposalJson, settings: settingsJson, isPremium }),
};

/** POSTs through Tauri's HTTP client (bypasses webview CORS; scope set in tauri.conf.json). */
export const tauriTransport: Transport = {
  async post(url, headers, body) {
    const response = await tauriFetch<string>(url, {
      method: 'POST',
      headers,
      body: Body.text(body),
      responseType: ResponseType.Text,
      timeout: 30,
    });
    return { status: response.status, body: response.data };
  },
};
