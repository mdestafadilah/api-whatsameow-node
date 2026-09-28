import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  AlertTriangle,
  MessageSquarePlus,
  RefreshCw,
  Smartphone,
  ServerCog,
} from "lucide-react";
import { sessionService } from "@/services/apiService";
import { StatusBadge } from "@/components/StatusBadge";
import { CopyButton } from "@/components/QrCanvas";

export const Route = createFileRoute("/")({
  component: SessionsPage,
});

function SessionsPage() {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [sessionToDelete, setSessionToDelete] = useState<{ id: string; label: string } | null>(null);

  const {
    data: sessions = [],
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: ["sessions"],
    queryFn: sessionService.getSessions,
    // Status changes on the server, so poll while the page is open.
    refetchInterval: 4_000,
  });

  const createMutation = useMutation({
    mutationFn: sessionService.createSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setLabel("");
      setPhoneNumber("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: sessionService.deleteSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setSessionToDelete(null);
    },
  });

  const isBusy = createMutation.isPending || deleteMutation.isPending;

  const handleCreate = () => {
    createMutation.mutate({
      label: label.trim() || undefined,
      phoneNumber: phoneNumber.trim() || undefined,
    });
  };

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

      {/* ── Create ─────────────────────────────────── */}
      <section className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <MessageSquarePlus className="h-4 w-4 text-brand-600" />
          <h2 className="text-sm font-semibold text-slate-900">New session</h2>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            placeholder="Label, e.g. Support line"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && handleCreate()}
            disabled={isBusy}
            className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 disabled:bg-slate-50"
          />
          <input
            type="tel"
            placeholder="Phone (optional), 628123456789"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && handleCreate()}
            disabled={isBusy}
            className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 disabled:bg-slate-50"
          />
          <button
            onClick={handleCreate}
            disabled={isBusy}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Create
          </button>
        </div>

        {createMutation.isError && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {(createMutation.error as Error).message}
          </p>
        )}
      </section>

      {/* ── List ───────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Sessions{sessions.length > 0 && <span className="text-slate-400"> · {sessions.length}</span>}
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
            Could not reach the API: {(error as Error).message}
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
              <div key={session.id} className="card p-4 transition-shadow hover:shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to="/sessions/$sessionId"
                      params={{ sessionId: session.id }}
                      className="block truncate text-sm font-semibold text-slate-900 hover:text-brand-700"
                    >
                      {session.label}
                    </Link>
                    <p className="mt-0.5 truncate font-mono text-xs text-slate-400">
                      {session.jid ?? session.phoneNumber ?? session.id.slice(0, 8)}
                    </p>
                  </div>
                  <StatusBadge status={session.status} />
                </div>

                {session.lastError && (
                  <p className="mt-2.5 line-clamp-2 rounded-md bg-red-50 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-red-700">
                    {session.lastError}
                  </p>
                )}

                <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-3">
                  <CopyButton value={session.id} label="Copy ID" />
                  <div className="flex items-center gap-1">
                    <Link
                      to="/sessions/$sessionId"
                      params={{ sessionId: session.id }}
                      className="rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
                    >
                      Open
                    </Link>
                    <button
                      onClick={() =>
                        setSessionToDelete({ id: session.id, label: session.label })
                      }
                      disabled={isBusy}
                      className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      title="Delete session"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── API reference card ─────────────────────── */}
      <section className="card p-5">
        <div className="mb-3 flex items-center gap-2">
          <ServerCog className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Quick endpoints</h2>
        </div>
        <div className="grid gap-2 font-mono text-xs sm:grid-cols-2">
          {[
            ["POST", "/api/sessions", "Create a session"],
            ["GET", "/api/sessions/:id/qr", "Pairing QR code"],
            ["POST", "/api/sessions/:id/pair-code", "Pairing code by phone"],
            ["POST", "/api/sessions/:id/messages", "Send a message"],
            ["GET", "/api/sessions/:id/groups", "Joined groups"],
            ["GET", "/api/events", "Live event stream (SSE)"],
          ].map(([method, path, note]) => (
            <div key={path} className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  method === "GET"
                    ? "bg-sky-100 text-sky-700"
                    : "bg-brand-100 text-brand-700"
                }`}
              >
                {method}
              </span>
              <code className="truncate text-slate-700">{path}</code>
              <span className="ml-auto hidden truncate text-[10px] text-slate-400 sm:block">
                {note}
              </span>
            </div>
          ))}
        </div>
      </section>

      {sessionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </span>
              <h3 className="text-base font-semibold text-slate-900">Delete session</h3>
            </div>

            <p className="text-sm leading-relaxed text-slate-500">
              This permanently removes{" "}
              <strong className="text-slate-900">{sessionToDelete.label}</strong> together with its
              stored WhatsApp credentials. The number will need to be paired again.
            </p>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setSessionToDelete(null)}
                disabled={isBusy}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(sessionToDelete.id)}
                disabled={isBusy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
