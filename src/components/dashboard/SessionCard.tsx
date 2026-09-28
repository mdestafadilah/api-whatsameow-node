import { Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import type { Session } from "@/types/api";
import { StatusBadge } from "@/components/StatusBadge";
import { CopyButton } from "@/components/ui/CopyButton";

/** One session tile in the dashboard grid. */
export function SessionCard({
  session,
  disabled,
  onRequestDelete,
}: {
  session: Session;
  disabled: boolean;
  onRequestDelete: (session: Pick<Session, "id" | "label">) => void;
}) {
  // Prefer the paired JID, then the number the user typed, then a short id —
  // so the tile always shows something identifying.
  const subtitle = session.jid ?? session.phoneNumber ?? session.id.slice(0, 8);

  return (
    <div className="card p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/sessions/$sessionId"
            params={{ sessionId: session.id }}
            className="block truncate text-sm font-semibold text-slate-900 hover:text-brand-700"
          >
            {session.label}
          </Link>
          <p className="mt-0.5 truncate font-mono text-xs text-slate-400">{subtitle}</p>
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
            type="button"
            onClick={() => onRequestDelete({ id: session.id, label: session.label })}
            disabled={disabled}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            title="Delete session"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
