import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Link } from "@tanstack/react-router";
import { MessageSquare, LayoutGrid } from "lucide-react";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
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
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>

      <TanStackRouterDevtools />
      <ReactQueryDevtools initialIsOpen={false} />
    </div>
  );
}
