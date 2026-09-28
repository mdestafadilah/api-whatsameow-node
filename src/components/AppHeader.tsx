import { Link, useRouter } from "@tanstack/react-router";
import { LayoutGrid, LogOut, MessageSquare } from "lucide-react";
import { useAuth } from "@/lib/auth/useAuth";
import { Button } from "@/components/ui/Button";

/**
 * Chrome for every signed-in page.
 *
 * Lives in the `_authenticated` layout rather than the root route, so the login
 * screen renders standalone instead of behind a nav bar the user cannot use yet.
 */
export function AppHeader() {
  const router = useRouter();
  const { session, signOut } = useAuth();

  const handleSignOut = async () => {
    signOut();

    // Leave the guarded area first, then drop the router's cached load results
    // so nothing from the previous session survives into the next sign-in.
    await router.navigate({ to: "/login", search: { redirect: undefined } });
    await router.invalidate();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500">
            <MessageSquare className="h-4.5 w-4.5 text-white" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-slate-900">
            whatsmeow<span className="text-brand-600">·api</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            activeProps={{ className: "bg-slate-100 text-slate-900" }}
            activeOptions={{ exact: true }}
          >
            <LayoutGrid className="h-4 w-4" />
            Sessions
          </Link>

          <a
            href="/api/name"
            target="_blank"
            rel="noreferrer"
            className="rounded-md px-3 py-1.5 font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            API
          </a>

          <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />

          <span className="hidden text-xs text-slate-400 sm:block" title="Signed in as">
            {session?.username}
          </span>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleSignOut()}
            icon={<LogOut className="h-3.5 w-3.5" />}
            title="Sign out"
          >
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </nav>
      </div>
    </header>
  );
}
