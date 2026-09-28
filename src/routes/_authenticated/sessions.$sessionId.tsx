import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { pacingService, sessionService } from "@/services/apiService";
import { queryKeys } from "@/lib/queryKeys";
import { Alert } from "@/components/ui/Alert";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import { MessageComposer } from "@/components/sessions/MessageComposer";
import { MessageLogPanel } from "@/components/sessions/MessageLogPanel";
import { OutboundQueuePanel } from "@/components/sessions/OutboundQueuePanel";
import { PairingPanel } from "@/components/sessions/PairingPanel";
import { SessionHeader } from "@/components/sessions/SessionHeader";

export const Route = createFileRoute("/_authenticated/sessions/$sessionId")({
  component: SessionDetailPage,
});

/**
 * Page shell for one session.
 *
 * It owns only what is genuinely page-level — the session query, the lifecycle
 * mutations, and the unlink confirmation. Each panel below fetches and mutates
 * on its own, so adding a panel does not grow this file.
 */
function SessionDetailPage() {
  const { sessionId } = Route.useParams();
  const queryClient = useQueryClient();
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  const { data: session, isLoading } = useQuery({
    queryKey: queryKeys.sessions.detail(sessionId),
    queryFn: () => sessionService.getStatus(sessionId),
    refetchInterval: 4_000,
  });

  const { data: pacingOptions } = useQuery({
    queryKey: queryKeys.pacing.options,
    queryFn: () => pacingService.getOptions(),
    refetchInterval: 15_000,
  });

  const invalidateSession = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.detail(sessionId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
  };

  const connectMutation = useMutation({
    mutationFn: () => sessionService.connect(sessionId),
    onSuccess: invalidateSession,
  });

  const disconnectMutation = useMutation({
    mutationFn: () => sessionService.disconnect(sessionId),
    onSuccess: invalidateSession,
  });

  const unlinkMutation = useMutation({
    mutationFn: () => sessionService.logout(sessionId),
    onSuccess: () => {
      invalidateSession();
      setConfirmUnlink(false);
    },
  });

  if (isLoading) {
    return (
      <div className="card flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
        <Spinner />
        Loading session…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="card p-10 text-center text-sm text-slate-500">
        Session not found.{" "}
        <Link to="/" className="font-medium text-brand-700 hover:underline">
          Back to sessions
        </Link>
      </div>
    );
  }

  const isPaired = Boolean(session.jid);

  return (
    <div className="space-y-6">
      <SessionHeader
        session={session}
        connectPending={connectMutation.isPending}
        disconnectPending={disconnectMutation.isPending}
        onConnect={() => connectMutation.mutate()}
        onDisconnect={() => disconnectMutation.mutate()}
        onUnlink={() => setConfirmUnlink(true)}
      />

      {session.lastError && (
        <Alert tone="error" className="flex items-start gap-2.5 font-mono">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="leading-relaxed">{session.lastError}</span>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {!isPaired && <PairingPanel sessionId={sessionId} session={session} />}

        <MessageComposer sessionId={sessionId} isPaired={isPaired} pacingOptions={pacingOptions} />

        <OutboundQueuePanel sessionId={sessionId} />

        <MessageLogPanel sessionId={sessionId} enabled />
      </div>

      <ConfirmDialog
        open={confirmUnlink}
        title="Unlink device"
        confirmLabel="Unlink"
        pending={unlinkMutation.isPending}
        description={
          <>
            This removes the linked device from WhatsApp and deletes the stored credentials for{" "}
            <strong className="text-slate-900">{session.label}</strong>. You will need to pair again.
          </>
        }
        onConfirm={() => unlinkMutation.mutate()}
        onCancel={() => setConfirmUnlink(false)}
      />
    </div>
  );
}
