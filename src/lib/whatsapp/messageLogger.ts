import { messageService } from "@/api/messages/service";
import { bus } from "@/lib/whatsapp/eventBus";

/**
 * Persist inbound messages as they arrive.
 *
 * Lives in the gateway bootstrap rather than the HTTP layer because nothing in
 * the request path triggers it — WhatsApp pushes, the bus fans out, this writes.
 */
export function registerMessageLogger(): void {
  bus.onEvent("message", (payload) => {
    const info = payload.info as
      | { id: string; chat: string; sender: string; pushName?: string; isFromMe?: boolean }
      | undefined;

    // Outgoing messages are already recorded by the send path.
    if (!info || info.isFromMe) return;

    const message = payload.message as Record<string, unknown> | undefined;
    if (!message) return;

    void messageService
      .recordIncoming(payload.sessionId, info, message)
      .catch((error) => {
        console.error("[gateway] Failed to record incoming message:", error);
      });
  });
}
