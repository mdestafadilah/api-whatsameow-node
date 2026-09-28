import { Link } from "@tanstack/react-router";
import { ArrowLeft, LogOut, Power, PowerOff } from "lucide-react";
import type { SessionStatusDetail } from "@/types/api";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";

/**
 * Title block for the session page: identity on the left, lifecycle actions on
 * the right. Only the actions differ from the dashboard list, so this stays a
 * presentational component — every handler is passed in.
 */
export function SessionHeader({
  session,
  onConnect,
  onDisconnect,
  onUnlink,
  connectPending,
  disconnectPending,
}: {
  session: SessionStatusDetail;
  onConnect: () => void;
  onDisconnect: () => void;
  onUnlink: () => void;
  connectPending: boolean;
  disconnectPending: boolean;
}) {
  const isConnected = session.status === "connected";
  const isPaired = Boolean(session.jid);

  return (
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
          <Button
            variant="outline"
            size="sm"
            loading={disconnectPending}
            onClick={onDisconnect}
            icon={<PowerOff className="h-3.5 w-3.5" />}
          >
            Disconnect
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            loading={connectPending}
            onClick={onConnect}
            icon={<Power className="h-3.5 w-3.5" />}
          >
            Reconnect
          </Button>
        )}

        {isPaired && (
          <Button
            variant="dangerOutline"
            size="sm"
            onClick={onUnlink}
            icon={<LogOut className="h-3.5 w-3.5" />}
          >
            Unlink device
          </Button>
        )}
      </div>
    </div>
  );
}
