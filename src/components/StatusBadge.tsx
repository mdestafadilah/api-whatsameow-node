import type { SessionStatus } from "@/types/api";

const STYLES: Record<SessionStatus, { label: string; className: string; dot: string }> = {
  creating: {
    label: "Starting",
    className: "bg-slate-100 text-slate-700 border-slate-200",
    dot: "bg-slate-400 animate-pulse",
  },
  pairing: {
    label: "Pairing",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500 animate-pulse",
  },
  connected: {
    label: "Connected",
    className: "bg-brand-50 text-brand-700 border-brand-200",
    dot: "bg-brand-500",
  },
  disconnected: {
    label: "Reconnecting",
    className: "bg-orange-50 text-orange-700 border-orange-200",
    dot: "bg-orange-500 animate-pulse",
  },
  logged_out: {
    label: "Logged out",
    className: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
  error: {
    label: "Error",
    className: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500",
  },
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  const style = STYLES[status] ?? STYLES.error;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

export function statusLabel(status: SessionStatus): string {
  return STYLES[status]?.label ?? status;
}
