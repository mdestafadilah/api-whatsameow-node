import { useQuery } from "@tanstack/react-query";
import { messageService } from "@/services/apiService";
import { queryKeys } from "@/lib/queryKeys";
import type { Message } from "@/types/api";
import { Card, CardHeader } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

/** Colour + label for a message row's status pill. */
function statusBadge(message: Message): { label: string; className: string } {
  if (message.status === "failed") {
    return { label: "failed", className: "bg-red-100 text-red-700" };
  }
  if (message.direction === "incoming") {
    return { label: "incoming", className: "bg-sky-100 text-sky-700" };
  }
  return { label: message.direction, className: "bg-brand-100 text-brand-700" };
}

/** Read-only tail of the persisted message log. */
export function MessageLogPanel({ sessionId, enabled }: { sessionId: string; enabled: boolean }) {
  const { data: messages = [] } = useQuery({
    queryKey: queryKeys.messages.all(sessionId),
    queryFn: () => messageService.getMessages(sessionId),
    // Nothing to log until the session record has loaded.
    enabled,
    refetchInterval: 6_000,
  });

  return (
    <Card>
      <CardHeader
        title={
          <>
            Recent messages
            {messages.length > 0 && <span className="text-slate-400"> · {messages.length}</span>}
          </>
        }
      />

      {messages.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3.5 py-8 text-center text-xs text-slate-400">
          No messages recorded yet.
        </p>
      ) : (
        <div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
          {messages.map((message) => {
            const badge = statusBadge(message);

            return (
              <div
                key={message.id}
                className="rounded-lg border border-slate-100 bg-slate-50/60 px-3.5 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[11px] text-slate-500">
                    {message.chatJid}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                      badge.className,
                    )}
                  >
                    {badge.label}
                  </span>
                </div>
                <p className="mt-1 break-words text-xs leading-relaxed text-slate-700">
                  {message.body || <span className="italic text-slate-400">[{message.type}]</span>}
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  {new Date(message.createdAt).toLocaleString()}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
