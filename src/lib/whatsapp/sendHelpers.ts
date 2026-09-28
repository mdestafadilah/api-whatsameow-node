import type { WhatsmeowClient } from "@whatsmeow-node/whatsmeow-node";
import { computeTypingDelay, sleep, type PacingConfig } from "./pacing";

/**
 * Simulate a human: mark the chat as typing, wait a plausible amount of time,
 * then stop typing so the message lands.
 *
 * Both presence calls are best-effort. A chat that silently drops the typing
 * receipt, or a client that is briefly mid-reconnect, must not fail the send —
 * the indicator is a courtesy, the message is the point.
 */
export async function applyTypingPacing(
  client: WhatsmeowClient,
  jid: string,
  preview: string,
  pacing: PacingConfig,
): Promise<void> {
  if (!pacing.typing) return;

  // Media arrives with no typed text, so `preview` (a caption, filename, or
  // the text itself) is what the pause should be proportionate to.
  const delay = computeTypingDelay(preview, pacing);

  try {
    await client.sendChatPresence(jid, "composing");
  } catch {
    // Typing indicator is optional; continue to the send regardless.
  }

  try {
    if (delay > 0) await sleep(delay);
  } finally {
    try {
      await client.sendChatPresence(jid, "paused");
    } catch {
      // As above — a swallowed `paused` must not block the message.
    }
  }
}
