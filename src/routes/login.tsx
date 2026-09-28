import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { KeyRound, MessageSquare, ShieldAlert } from "lucide-react";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { authStore, isUsingDefaultCredentials } from "@/lib/auth/store";
import { useAuth } from "@/lib/auth/useAuth";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirectPath(search.redirect),
  }),

  // Someone who is already signed in has no business on the login screen.
  beforeLoad: ({ search }) => {
    if (authStore.isAuthenticated()) {
      throw redirect({ href: search.redirect ?? "/" });
    }
  },

  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const { redirect } = Route.useSearch();
  const { signIn } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);

    const result = signIn(username, password);

    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }

    // The guard on `_authenticated` already ran and threw; invalidating makes
    // the router forget that redirect before we head back to the target.
    await router.invalidate();
    await router.navigate({ href: redirect ?? "/" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500">
            <MessageSquare className="h-5 w-5 text-white" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">
              whatsmeow<span className="text-brand-600">·api</span>
            </h1>
            <p className="mt-1 text-sm text-slate-500">Masuk untuk membuka dashboard.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="admin"
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <Alert tone="error">{error}</Alert>}

          <Button
            type="submit"
            loading={pending}
            fullWidth
            icon={<KeyRound className="h-4 w-4" />}
          >
            Masuk
          </Button>
        </form>

        {isUsingDefaultCredentials && (
          <Alert tone="info" className="mt-4 flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Kredensial default aktif (<code className="font-mono">admin</code> /{" "}
              <code className="font-mono">admin</code>). Set{" "}
              <code className="font-mono">VITE_DASHBOARD_USERNAME</code> dan{" "}
              <code className="font-mono">VITE_DASHBOARD_PASSWORD</code> sebelum dipakai di luar
              localhost.
            </span>
          </Alert>
        )}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-400">
          Halaman ini hanya gerbang sisi klien. REST API tetap dilindungi{" "}
          <code className="font-mono">API_KEY</code>, bukan oleh login ini.
        </p>
      </div>
    </div>
  );
}
