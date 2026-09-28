import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, QrCode } from "lucide-react";
import { sessionService } from "@/services/apiService";
import { queryKeys } from "@/lib/queryKeys";
import type { SessionStatusDetail } from "@/types/api";
import { Alert, errorMessage } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { Input, Label, FieldHint } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { QrCanvas } from "@/components/QrCanvas";

/**
 * Device pairing, both routes: scan a QR, or ask WhatsApp for an 8-character
 * code the user types on their phone.
 *
 * Self-contained — it owns its two mutations and only needs the session id and
 * the current status detail to know what to show.
 */
export function PairingPanel({
  sessionId,
  session,
}: {
  sessionId: string;
  session: SessionStatusDetail;
}) {
  const queryClient = useQueryClient();
  const [pairPhone, setPairPhone] = useState("");
  const autoRequested = useRef(false);

  const qrMutation = useMutation({
    mutationFn: () => sessionService.getQr(sessionId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.detail(sessionId) }),
  });

  const pairCodeMutation = useMutation({
    mutationFn: () => sessionService.requestPairCode(sessionId, pairPhone.trim()),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.detail(sessionId) }),
  });

  // `mutate` is a stable reference, unlike the rest of the mutation result — so
  // it is safe to depend on without re-running on every render.
  const { mutate: requestQr } = qrMutation;

  // Auto-load a QR the first time an unpaired session is opened. The ref keeps
  // this to a single request even if the status keeps flapping between polls.
  useEffect(() => {
    if (autoRequested.current || session.jid) return;
    if (session.status !== "pairing" && session.status !== "creating") return;

    autoRequested.current = true;
    requestQr();
  }, [session.status, session.jid, requestQr]);

  // A code from this session wins over one stored earlier — it is the freshest.
  const activePairCode = pairCodeMutation.data?.pairCode ?? session.pairCode;

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        icon={<QrCode className="h-4 w-4 text-brand-600" />}
        title="Link this device"
      />

      <div className="grid gap-8 md:grid-cols-2">
        {/* ── QR flow ─────────────────────────────────────────── */}
        <div className="flex flex-col items-center text-center">
          <p className="mb-4 text-xs font-medium text-slate-500">
            Scan with WhatsApp → Linked devices
          </p>

          {qrMutation.data ? (
            <QrCanvas value={qrMutation.data.qr} />
          ) : qrMutation.isPending ? (
            <div className="flex h-60 w-60 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
              <Spinner className="h-5 w-5 text-slate-400" />
            </div>
          ) : (
            <div className="flex h-60 w-60 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
              <QrCode className="h-6 w-6 text-slate-300" />
              <p className="text-xs text-slate-400">
                {qrMutation.isError
                  ? errorMessage(qrMutation.error, "Could not generate a code")
                  : "Generate a code to begin"}
              </p>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            loading={qrMutation.isPending}
            onClick={() => {
              qrMutation.reset();
              qrMutation.mutate();
            }}
          >
            {qrMutation.data ? "Refresh QR code" : "Generate QR code"}
          </Button>
        </div>

        {/* ── Pairing-code flow ───────────────────────────────── */}
        <div className="border-slate-100 md:border-l md:pl-8">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5 text-slate-500" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Or use a pairing code
            </h3>
          </div>

          <Label htmlFor="pair-phone">WhatsApp phone number</Label>
          <Input
            id="pair-phone"
            type="tel"
            placeholder="628123456789"
            value={pairPhone}
            onChange={(event) => setPairPhone(event.target.value)}
            className="font-mono"
          />
          <FieldHint>Include the country code, without a leading + or 0.</FieldHint>

          <Button
            variant="dark"
            fullWidth
            className="mt-3"
            loading={pairCodeMutation.isPending}
            disabled={pairPhone.trim().length < 7}
            onClick={() => pairCodeMutation.mutate()}
            icon={<KeyRound className="h-4 w-4" />}
          >
            Get pairing code
          </Button>

          {activePairCode && (
            <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wide text-brand-700">
                Enter this code on your phone
              </p>
              <p className="mt-1.5 font-mono text-2xl font-bold tracking-widest text-brand-800">
                {activePairCode}
              </p>
              <div className="mt-2 flex justify-center">
                <CopyButton value={activePairCode} label="Copy code" />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-brand-700">
                WhatsApp → Linked devices → Link a device → Link with phone number
              </p>
            </div>
          )}

          {pairCodeMutation.isError && (
            <Alert tone="error" className="mt-3">
              {errorMessage(pairCodeMutation.error)}
            </Alert>
          )}
        </div>
      </div>
    </Card>
  );
}
