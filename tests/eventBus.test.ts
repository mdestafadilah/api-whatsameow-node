import { describe, expect, it } from "vitest";
import { bus } from "@/lib/whatsapp/eventBus";

describe("GatewayEventBus", () => {
  it("delivers an event to a typed listener", () => {
    const received: string[] = [];
    const off = bus.onEvent("session:qr", (payload) => {
      received.push(payload.sessionId as string);
    });

    bus.emitEvent("session:qr", { sessionId: "s-1", code: "abc" });
    off();

    expect(received).toEqual(["s-1"]);
  });

  it("stamps every payload with a timestamp", () => {
    let captured: Record<string, unknown> | null = null;
    const off = bus.onEvent("message", (payload) => {
      captured = payload;
    });

    bus.emitEvent("message", { sessionId: "s-2" });
    off();

    expect(captured).not.toBeNull();
    expect(typeof (captured as unknown as { at: string }).at).toBe("string");
  });

  it("fans out to wildcard listeners with the event name attached", () => {
    const seen: string[] = [];
    const off = bus.onEvent("*", (payload) => {
      seen.push((payload as { event?: string }).event ?? "unknown");
    });

    bus.emitEvent("session:connected", { sessionId: "s-3" });
    bus.emitEvent("message", { sessionId: "s-3" });
    off();

    expect(seen).toEqual(["session:connected", "message"]);
  });

  it("stops delivering after unsubscribe", () => {
    const received: unknown[] = [];
    const off = bus.onEvent("session:status", (payload) => received.push(payload));

    bus.emitEvent("session:status", { sessionId: "s-4" });
    off();
    bus.emitEvent("session:status", { sessionId: "s-4" });

    expect(received).toHaveLength(1);
  });
});
