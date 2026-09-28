import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { requireAuth } from "@/lib/auth/guard";

/**
 * Pathless layout route guarding every dashboard page.
 *
 * `_authenticated` never appears in the URL — it exists purely so that `/` and
 * `/sessions/$sessionId` share one `beforeLoad` guard and one header. Adding a
 * new signed-in page means dropping a file in `src/routes/_authenticated/`.
 */
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: requireAuth,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
