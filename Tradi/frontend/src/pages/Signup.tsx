import { Link, useNavigate } from "react-router";
import { useState, type FormEvent } from "react";
import { ArrowRight, Mail, Lock, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth-store";

export function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { signUp, loading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    const { error: authError, needsConfirmation } = await signUp(email, password);
    if (authError) {
      setError(authError);
    } else if (needsConfirmation) {
      setSuccess(true);
    } else {
      navigate("/dashboard", { replace: true });
    }
  };

  return (
    <div className="grid min-h-[calc(100vh-3.5rem)] grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      {/* ─── Left value-prop panel ─── */}
      <aside className="relative hidden overflow-hidden border-r border-border bg-[#080D1A] lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="pointer-events-none absolute -top-20 -left-20 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl float-y" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-blue-600/8 blur-3xl float-y-slow" />
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />

        <div className="relative">
          <Link to="/" className="inline-flex items-baseline gap-1 text-2xl font-bold gradient-text glow-gradient">
            H~Mltd
          </Link>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Skip the setup. Start researching.
          </h2>
          <ul className="mt-8 space-y-4">
            {[
              { t: "No Python setup",       d: "Skip venvs, keys, and dependencies. Ready in seconds." },
              { t: "462 alphas, 8 engines", d: "The same quant toolkit institutions run — one prompt away." },
              { t: "Money-safe research",   d: "We never touch your broker. Analysis only." },
            ].map(({ t, d }) => (
              <li key={t} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <div className="text-sm font-semibold text-foreground">{t}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">{d}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative border-t border-border/40 pt-6 text-xs text-muted-foreground">
          Plans from <span className="font-mono font-semibold text-foreground">₦70,000/month</span> · cancel anytime
        </div>
      </aside>

      {/* ─── Right form panel ─── */}
      <main className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm space-y-8 msg-enter">
          <Link to="/" className="inline-flex items-baseline gap-1 text-2xl font-bold gradient-text glow-gradient lg:hidden">
            H~Mltd
          </Link>

          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Create your account</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Get set up in under a minute.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="signup-email" className="text-xs font-medium text-muted-foreground">
                EMAIL
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  id="signup-email"
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
              <label htmlFor="signup-password" className="text-xs font-medium text-muted-foreground">
                PASSWORD
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  id="signup-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-lg border border-border bg-[#05060F] px-3 py-2.5 pl-10 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="signup-confirm" className="text-xs font-medium text-muted-foreground">
                CONFIRM PASSWORD
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  id="signup-confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  className="w-full rounded-lg border border-border bg-[#05060F] px-3 py-2.5 pl-10 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                />
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            {success && (
              <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-success">
                  <CheckCircle2 className="h-4 w-4" /> Check your email
                </p>
                <p className="mt-1.5 text-xs text-success/80">
                  We sent a confirmation link to <strong className="font-mono">{email}</strong>. Click it to activate your account.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || success}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-lg gradient-bg glow-gradient py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? "Creating account…" : success ? "Email sent ✓" : (
                <>
                  Create account
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>

            <p className="text-center text-xs text-muted-foreground">
              By signing up, you agree to our{" "}
              <Link to="/terms" className="underline hover:text-foreground">Terms</Link>{" "}
              and{" "}
              <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
            </p>
          </form>

          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
