import { Link, useNavigate, useLocation } from "react-router";
import { useState, type FormEvent } from "react";
import { ArrowRight, Mail, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth-store";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { signIn, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/dashboard";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const { error: authError } = await signIn(email, password);
    if (authError) {
      setError(authError);
    } else {
      navigate(from, { replace: true });
    }
  };

  return (
    <div className="grid min-h-[calc(100vh-3.5rem)] grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      {/* ─── Left brand panel (desktop only) ─── */}
      <aside className="relative hidden overflow-hidden border-r border-border bg-[#080D1A] lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        {/* Ambient gradient wash */}
        <div className="pointer-events-none absolute -top-20 -left-20 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl float-y" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-blue-600/8 blur-3xl float-y-slow" />
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />

        <div className="relative">
          <Link to="/" className="inline-flex items-baseline gap-1 text-2xl font-bold gradient-text glow-gradient">
            H~Mltd
          </Link>
        </div>

        <div className="relative max-w-md">
          <blockquote className="text-xl font-medium leading-relaxed tracking-tight text-foreground/95">
            "It's like having a quant desk that answers back in plain English — and never sleeps."
          </blockquote>
          <div className="mt-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full gradient-bg text-sm font-bold text-white">
              AK
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Adaeze K.</div>
              <div className="text-xs text-muted-foreground">Independent trader · Lagos</div>
            </div>
          </div>
        </div>

        <div className="relative grid grid-cols-3 gap-4 border-t border-border/40 pt-6">
          {[
            { v: "462",  l: "Alpha factors" },
            { v: "8",    l: "Backtest engines" },
            { v: "24",   l: "Data sources" },
          ].map(({ v, l }) => (
            <div key={l}>
              <div className="font-mono text-xl font-bold gradient-text">{v}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{l}</div>
            </div>
          ))}
        </div>
      </aside>

      {/* ─── Right form panel ─── */}
      <main className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm space-y-8 msg-enter">
          {/* Mobile logo (hidden on desktop where the aside carries it) */}
          <Link to="/" className="inline-flex items-baseline gap-1 text-2xl font-bold gradient-text glow-gradient lg:hidden">
            H~Mltd
          </Link>

          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome back</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Log in to continue your research.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-xs font-medium text-muted-foreground">
                EMAIL
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-border bg-[#05060F] px-3 py-2.5 pl-10 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="text-xs font-medium text-muted-foreground">
                  PASSWORD
                </label>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                >
                  Forgot?
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-border bg-[#05060F] px-3 py-2.5 pl-10 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                />
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-lg gradient-bg glow-gradient py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? "Signing in…" : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <p className="text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
