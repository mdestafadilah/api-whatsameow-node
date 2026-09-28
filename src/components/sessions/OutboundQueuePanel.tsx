import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListOrdered, Play } from "lucide-react";
import { queueService } from "@/services/apiService";
import { queryKeys } from "@/lib/queryKeys";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";

/**
 * Outbound queue for one session.
 *
 * Redis is optional, so an empty queue is the normal case, not an error state —
 * messages send as soon as they are accepted when there is no queue configured.
 */
export function OutboundQueuePanel({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient();

  const { data: sessionQueue } = useQuery({
    queryKey: queryKeys.queue.session(sessionId),
    queryFn: () => queueService.getSession(sessionId),
    refetchInterval: 4_000,
  });

  const drainMutation = useMutation({
    mutationFn: () => queueService.drain(sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.queue.session(sessionId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages.all(sessionId) });
    },
  });

  const depth = sessionQueue?.depth ?? 0;
  const entries = sessionQueue?.entries ?? [];

  return (
    <Card>
      <CardHeader
        icon={<ListOrdered className="h-4 w-4 text-brand-600" />}
        title={
          <>
            Outbound queue
            {depth > 0 && (
              <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                {depth} pending
              </span>
            )}
          </>
        }
        action={
          <Button
            variant="outline"
            size="xs"
            loading={drainMutation.isPending}
            disabled={depth === 0}
            onClick={() => drainMutation.mutate()}
            icon={<Play className="h-3 w-3" />}
          >
            Drain now
          </Button>
        }
      />

      {drainMutation.isSuccess && (
        <Alert tone="muted" className="mb-3">
          Drained — {drainMutation.data.sent} sent, {drainMutation.data.failed} failed,{" "}
          {drainMutation.data.retried} retried
        </Alert>
      )}

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3.5 py-6 text-center text-xs text-slate-400">
          Queue is empty — messages send as soon as they are accepted.
        </p>
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {entries.map((entry, index) => (
            <div
              key={`${entry.id}-${index}`}
              className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[11px] text-slate-500">{entry.jid}</span>
                <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                  {entry.status}
                </span>
              </div>
              <p className="mt-1 break-words text-xs leading-relaxed text-slate-700">
                {entry.preview || <span className="italic text-slate-400">[{entry.type}]</span>}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                queued {new Date(entry.enqueuedAt).toLocaleTimeString()}
                {entry.attempts > 0 && ` · ${entry.attempts} attempt(s)`}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
