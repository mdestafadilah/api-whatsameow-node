import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { messageService } from "@/services/apiService";
import { queryKeys } from "@/lib/queryKeys";
import type { PacingOptions, PacingPresetName } from "@/types/api";
import { Alert, errorMessage } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Field";
import { PacingPicker } from "./PacingPicker";

/** Recipient + body + pacing controls, and the send itself. */
export function MessageComposer({
  sessionId,
  isPaired,
  pacingOptions,
}: {
  sessionId: string;
  isPaired: boolean;
  pacingOptions: PacingOptions | undefined;
}) {
  const queryClient = useQueryClient();

  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  // `null` means "let the server pick", so the UI does not fight the default.
  const [pacingPreset, setPacingPreset] = useState<PacingPresetName | null>(null);

  const sendMutation = useMutation({
    mutationFn: () =>
      messageService.send(sessionId, {
        to: to.trim(),
        text: text.trim(),
        // Omit the field entirely unless the user picked something, so the
        // server default stays authoritative.
        ...(pacingPreset ? { pacing: { preset: pacingPreset } } : {}),
      }),
    onSuccess: () => {
      setText("");
      // A send either enqueues or invalidates the chat cache, so every view
      // that could have changed is refreshed.
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages.all(sessionId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.pacing.options });
      void queryClient.invalidateQueries({ queryKey: queryKeys.queue.session(sessionId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.chats.all(sessionId) });
    },
  });

  const canSend = to.trim().length > 0 && text.trim().length > 0 && !sendMutation.isPending;

  return (
    <Card>
      <CardHeader icon={<Send className="h-4 w-4 text-brand-600" />} title="Send a message" />

      {!isPaired ? (
        <p className="rounded-lg bg-slate-50 px-3.5 py-3 text-xs text-slate-500">
          Link a device first — messages can only be sent from a paired session.
        </p>
      ) : (
        <div className="space-y-3">
          <Input
            type="text"
            placeholder="Recipient — 628123456789 or 1234@g.us"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="font-mono"
          />
          <Textarea
            rows={4}
            placeholder="Message text…"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />

          {pacingOptions && (
            <PacingPicker
              options={pacingOptions}
              value={pacingPreset}
              onChange={setPacingPreset}
              charCount={text.trim().length}
            />
          )}

          <Button
            fullWidth
            disabled={!canSend}
            loading={sendMutation.isPending}
            onClick={() => sendMutation.mutate()}
            icon={<Send className="h-4 w-4" />}
          >
            Send
          </Button>

          {sendMutation.isError && <Alert tone="error">{errorMessage(sendMutation.error)}</Alert>}

          {sendMutation.isSuccess && (
            <Alert tone="success">
              {sendMutation.data?.queued
                ? `Queued — position ${sendMutation.data.queuePosition ?? "?"}`
                : `Sent — id ${sendMutation.data?.waMessageId ?? "unknown"}`}
            </Alert>
          )}
        </div>
      )}
    </Card>
  );
}
