import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Smartphone } from "lucide-react";
import { sessionService } from "@/services/apiService";
import { queryKeys } from "@/lib/queryKeys";
import { errorMessage } from "@/components/ui/Alert";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CreateSessionForm } from "@/components/dashboard/CreateSessionForm";
import { QuickEndpointsCard } from "@/components/dashboard/QuickEndpointsCard";
import { SessionCard } from "@/components/dashboard/SessionCard";

export const Route = createFileRoute("/_authenticated/")({
  component: SessionsPage,
});

type SessionToDelete = { id: string; label: string };

function SessionsPage() {
  const queryClient = useQueryClient();
  const [sessionToDelete, setSessionToDelete] = useState<SessionToDelete | null>(null);

  const { data: sessions = [], isLoading, isFetching, error } = useQuery({
    queryKey: queryKeys.sessions.all,
    queryFn: sessionService.getSessions,
    // Status changes on the server, so poll while the page is open.
    refetchInterval: 4_000,
  });

  const deleteMutation = useMutation({
    mutationFn: sessionService.deleteSession,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
      setSessionToDelete(null);
    },
  });

  const isBusy = deleteMutation.isPending;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">WhatsApp Sessions</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Each session is an independent WhatsApp account backed by its own{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">whatsmeow</code>{" "}
          process. Open one to pair a device and send messages.
        </p>
      </div>

      <CreateSessionForm />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Sessions
            {sessions.length > 0 && <span className="text-slate-400"> · {sessions.length}</span>}
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            {isFetching && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            Auto-refreshing
          </div>
        </div>

        {isLoading ? (
          <div className="card p-10 text-center text-sm text-slate-400">Loading sessions…</div>
        ) : error ? (
          <div className="card border-red-200 bg-red-50 p-6 text-sm text-red-700">
            Could not reach the API: {errorMessage(error)}
          </div>
        ) : sessions.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 border-dashed p-12 text-center">
            <Smartphone className="h-6 w-6 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No sessions yet</p>
            <p className="text-xs text-slate-400">
              Create one above, then pair it by scanning a QR code.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                disabled={isBusy}
                onRequestDelete={setSessionToDelete}
              />
            ))}
          </div>
        )}
      </section>

      <QuickEndpointsCard />

      <ConfirmDialog
        open={sessionToDelete !== null}
        title="Delete session"
        confirmLabel="Delete"
        pending={deleteMutation.isPending}
        description={
          sessionToDelete && (
            <>
              This permanently removes{" "}
              <strong className="text-slate-900">{sessionToDelete.label}</strong> together with its
              stored WhatsApp credentials. The number will need to be paired again.
            </>
          )
        }
        onConfirm={() => sessionToDelete && deleteMutation.mutate(sessionToDelete.id)}
        onCancel={() => setSessionToDelete(null)}
      />
    </div>
  );
}
