import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  KeyRound,
  LogOut,
  Power,
  PowerOff,
  QrCode,
  Send,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { messageService, sessionService } from "@/services/apiService";
import { StatusBadge } from "@/components/StatusBadge";
import { CopyButton, QrCanvas } from "@/components/QrCanvas";
import type { Message } from "@/types/api";

export const Route = createFileRoute("/sessions/$sessionId")({
  component: SessionDetailPage,
});

function SessionDetailPage() {
  const { sessionId } = Route.useParams();
  const queryClient = useQueryClient();

  const [pairPhone, setPairPhone] = useState("");
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [confirmLogout, setConfirmLogout] = useState(false);

  const { data: session, isLoading } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => sessionService.getStatus(sessionId),
    refetchInterval: 4_000,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", sessionId],
    queryFn: () => messageService.getMessages(sessionId),
    enabled: Boolean(session),
    refetchInterval: 6_000,
  });

  const isPaired = Boolean(session?.jid);
  const isConnected = session?.status === "connected";

  // ── Pairing ──────────────────────────────────────
  const qrMutation = useMutation({
    mutationFn: () => sessionService.getQr(sessionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session", sessionId] }),
  });

  const pairCodeMutation = useMutation({
    mutationFn: () => sessionService.requestPairCode(sessionId, pairPhone.trim()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session", sessionId] }),
  });

  // ── Lifecycle ────────────────────────────────────
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
  };

  const connectMutation = useMutation({ mutationFn: () => sessionService.connect(sessionId), onSuccess: invalidate });
  const disconnectMutation = useMutation({ mutationFn: () => sessionService.disconnect(sessionId), onSuccess: invalidate });
  const logoutMutation = useMutation({
    mutationFn: () => sessionService.logout(sessionId),
    onSuccess: () => {
      invalidate();
      setConfirmLogout(false);
    },
  });

  // ── Messaging ────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: () => messageService.send(sessionId, { to: to.trim(), text: text.trim() }),
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["messages", sessionId] });
    },
  });

  // Auto-load a QR the first time an unpaired session is opened.
  useEffect(() => {
    if (!session || isPaired || qrMutation.isPending || qrMutation.data) return;
    if (session.status === "pairing" || session.status === "creating") {
      qrMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status, isPaired]);

  if (isLoading) {
    return (
      <div className="card flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
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

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/"
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Sessions
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-900">
              {session.label}
            </h1>
            <StatusBadge status={session.status} />
          </div>
          <p className="mt-1 flex items-center gap-1.5 font-mono text-xs text-slate-400">
            {session.jid ?? "not paired"}
            <CopyButton value={session.jid ?? session.id} />
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <button
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              <PowerOff className="h-3.5 w-3.5" />
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              <Power className="h-3.5 w-3.5" />
              Reconnect
            </button>
          )}

          {isPaired && (
            <button
              onClick={() => setConfirmLogout(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3.5 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              Unlink device
            </button>
          )}
        </div>
      </div>

      {session.lastError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="font-mono text-xs leading-relaxed text-red-700">{session.lastError}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Pairing ──────────────────────────────── */}
        {!isPaired && (
          <section className="card p-5 lg:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <QrCode className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-semibold text-slate-900">Link this device</h2>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              {/* QR flow */}
              <div className="flex flex-col items-center text-center">
                <p className="mb-4 text-xs font-medium text-slate-500">
                  Scan with WhatsApp → Linked devices
                </p>

                {qrMutation.data ? (
                  <QrCanvas value={qrMutation.data.qr} />
                ) : qrMutation.isPending ? (
                  <div className="flex h-60 w-60 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                ) : (
                  <div className="flex h-60 w-60 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                    <QrCode className="h-6 w-6 text-slate-300" />
                    <p className="text-xs text-slate-400">
                      {qrMutation.isError
                        ? (qrMutation.error as Error).message
                        : "Generate a code to begin"}
                    </p>
                  </div>
                )}

                <button
                  onClick={() => {
                    qrMutation.reset();
                    qrMutation.mutate();
                  }}
                  disabled={qrMutation.isPending}
                  className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
                >
                  {qrMutation.data ? "Refresh QR code" : "Generate QR code"}
                </button>
              </div>

              {/* Pairing-code flow */}
              <div className="border-slate-100 md:border-l md:pl-8">
                <div className="mb-4 flex items-center gap-2">
                  <KeyRound className="h-3.5 w-3.5 text-slate-500" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Or use a pairing code
                  </h3>
                </div>

                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  WhatsApp phone number
                </label>
                <input
                  type="tel"
                  placeholder="628123456789"
                  value={pairPhone}
                  onChange={(event) => setPairPhone(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                />
                <p className="mt-1.5 text-[11px] text-slate-400">
                  Include the country code, without a leading + or 0.
                </p>

                <button
                  onClick={() => pairCodeMutation.mutate()}
                  disabled={pairPhone.trim().length < 7 || pairCodeMutation.isPending}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pairCodeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  Get pairing code
                </button>

                {(pairCodeMutation.data || session.pairCode) && (
                  <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4 text-center">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-brand-700">
                      Enter this code on your phone
                    </p>
                    <p className="mt-1.5 font-mono text-2xl font-bold tracking-widest text-brand-800">
                      {pairCodeMutation.data?.pairCode ?? session.pairCode}
                    </p>
                    <div className="mt-2 flex justify-center">
                      <CopyButton
                        value={pairCodeMutation.data?.pairCode ?? session.pairCode ?? ""}
                        label="Copy code"
                      />
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-brand-700">
                      WhatsApp → Linked devices → Link a device → Link with phone number
                    </p>
                  </div>
                )}

                {pairCodeMutation.isError && (
                  <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    {(pairCodeMutation.error as Error).message}
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Composer ─────────────────────────────── */}
        <section className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Send className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-slate-900">Send a message</h2>
          </div>

          {!isPaired ? (
            <p className="rounded-lg bg-slate-50 px-3.5 py-3 text-xs text-slate-500">
              Link a device first — messages can only be sent from a paired session.
            </p>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Recipient — 628123456789 or 1234@g.us"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              />
              <textarea
                rows={4}
                placeholder="Message text…"
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="w-full resize-none rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              />
              <button
                onClick={() => sendMutation.mutate()}
                disabled={!to.trim() || !text.trim() || sendMutation.isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sendMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send
              </button>

              {sendMutation.isError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  {(sendMutation.error as Error).message}
                </p>
              )}
              {sendMutation.isSuccess && (
                <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
                  Sent — id {sendMutation.data?.waMessageId ?? "unknown"}
                </p>
              )}
            </div>
          )}
        </section>

        {/* ── Message log ──────────────────────────── */}
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">
            Recent messages{messages.length > 0 && <span className="text-slate-400"> · {messages.length}</span>}
          </h2>

          {messages.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-3.5 py-8 text-center text-xs text-slate-400">
              No messages recorded yet.
            </p>
          ) : (
            <div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
              {messages.map((message: Message) => (
                <div
                  key={message.id}
                  className="rounded-lg border border-slate-100 bg-slate-50/60 px-3.5 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px] text-slate-500">
                      {message.chatJid}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        message.direction === "incoming"
                          ? "bg-sky-100 text-sky-700"
                          : message.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : "bg-brand-100 text-brand-700"
                      }`}
                    >
                      {message.status === "failed" ? "failed" : message.direction}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-xs leading-relaxed text-slate-700">
                    {message.body || <span className="italic text-slate-400">[{message.type}]</span>}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {new Date(message.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {confirmLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                <Trash2 className="h-5 w-5 text-red-600" />
              </span>
              <h3 className="text-base font-semibold text-slate-900">Unlink device</h3>
            </div>

            <p className="text-sm leading-relaxed text-slate-500">
              This removes the linked device from WhatsApp and deletes the stored credentials for{" "}
              <strong className="text-slate-900">{session.label}</strong>. You will need to pair
              again.
            </p>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setConfirmLogout(false)}
                disabled={logoutMutation.isPending}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {logoutMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Unlink
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
