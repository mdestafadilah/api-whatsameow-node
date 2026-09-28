import { useEffect, type ReactNode } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "./Button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  /** Sentence explaining the consequence of confirming. */
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Destructive-action confirmation.
 *
 * Both the "delete session" and "unlink device" prompts were the same 30 lines
 * of markup copy-pasted; this is that markup once.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Batal",
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Escape closes the dialog, unless a request is in flight.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onCancel();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, pending, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </span>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        </div>

        <p className="text-sm leading-relaxed text-slate-500">{description}</p>

        <div className="mt-6 flex gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={pending} className="flex-1">
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            loading={pending}
            icon={<Trash2 className="h-4 w-4" />}
            className="flex-1"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
