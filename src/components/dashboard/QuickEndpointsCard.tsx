import { ServerCog } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

type Endpoint = { method: "GET" | "POST"; path: string; note: string };

/** Static reference list — hoisted out of the component so it is built once. */
const ENDPOINTS: Endpoint[] = [
  { method: "POST", path: "/api/sessions", note: "Create a session" },
  { method: "GET", path: "/api/sessions/:id/qr", note: "Pairing QR code" },
  { method: "POST", path: "/api/sessions/:id/pair-code", note: "Pairing code by phone" },
  { method: "POST", path: "/api/sessions/:id/messages", note: "Send a message" },
  { method: "GET", path: "/api/sessions/:id/groups", note: "Joined groups" },
  { method: "GET", path: "/api/events", note: "Live event stream (SSE)" },
];

/** Read-only cheat sheet of the most-used endpoints. */
export function QuickEndpointsCard() {
  return (
    <Card>
      <CardHeader
        icon={<ServerCog className="h-4 w-4 text-slate-500" />}
        title="Quick endpoints"
      />

      <div className="grid gap-2 font-mono text-xs sm:grid-cols-2">
        {ENDPOINTS.map((endpoint) => (
          <div
            key={`${endpoint.method} ${endpoint.path}`}
            className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2"
          >
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-bold",
                endpoint.method === "GET"
                  ? "bg-sky-100 text-sky-700"
                  : "bg-brand-100 text-brand-700",
              )}
            >
              {endpoint.method}
            </span>
            <code className="truncate text-slate-700">{endpoint.path}</code>
            <span className="ml-auto hidden truncate text-[10px] text-slate-400 sm:block">
              {endpoint.note}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
