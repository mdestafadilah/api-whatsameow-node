import { EventEmitter } from "node:events";

export type GatewayEvent =
  | "session:status"
  | "session:qr"
  | "session:pair-code"
  | "session:connected"
  | "session:disconnected"
  | "session:logged-out"
  | "session:error"
  | "message"
  | "message:receipt"
  | "presence"
  | "call";

export type GatewayEventPayload = Record<string, unknown> & {
  sessionId: string;
  at: string;
};

/**
 * In-process fan-out from the WhatsApp clients to every interested consumer:
 * the SSE endpoint, the webhook dispatcher, and the message logger.
 *
 * Deliberately not a global singleton on `globalThis` — one bus per process,
 * exported once, so tests can construct an isolated one.
 */
class GatewayEventBus extends EventEmitter {
  /**
   * Fan an event out to typed listeners and wildcard subscribers.
   *
   * `sessionId` is required — every gateway event is scoped to a session, and
   * the SSE and webhook filters both key off it.
   */
  emitEvent(
    event: GatewayEvent,
    payload: { sessionId: string; at?: string } & Record<string, unknown>,
  ) {
    const enriched: GatewayEventPayload = {
      ...payload,
      at: payload.at ?? new Date().toISOString(),
    };
    super.emit(event, enriched);
    // Wildcard listeners (webhooks, dashboards that want everything).
    super.emit("*", { event, ...enriched });
    return enriched;
  }

  onEvent(
    events: GatewayEvent | GatewayEvent[] | "*",
    listener: (payload: GatewayEventPayload & { event?: GatewayEvent }) => void,
  ) {
    const list = Array.isArray(events) ? events : [events];
    for (const name of list) {
      this.on(name, listener as (...args: unknown[]) => void);
    }
    return () => {
      for (const name of list) {
        this.off(name, listener as (...args: unknown[]) => void);
      }
    };
  }
}

export const bus = new GatewayEventBus();

// SSE streams and webhook listeners are attached per request; keep the default
// listener cap out of the way without leaking warnings into the logs.
bus.setMaxListeners(100);

export type { GatewayEventBus };
