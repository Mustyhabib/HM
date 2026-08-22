/**
 * BillingCallback — post-payment landing page at /billing/callback
 *
 * Both Paystack and Stripe redirect here after checkout:
 *   Paystack: ?reference=REF&trxref=REF
 *   Stripe:   ?session_id=SESSION_ID
 *
 * The respective webhook Edge Function activates the subscription in the
 * background. We poll briefly and redirect to /dashboard.
 */

import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { pollSubscriptionActive } from "@/lib/billing";

type Phase = "verifying" | "success" | "timeout" | "no-ref";

export function BillingCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("verifying");
  const [countdown, setCountdown] = useState(5);

  // Detect which provider redirected us back.
  // Stripe uses session_id; Paystack uses reference/trxref.
  const reference =
    searchParams.get("reference") ??
    searchParams.get("trxref") ??
    searchParams.get("session_id");

  useEffect(() => {
    if (!reference) {
      setPhase("no-ref");
      return;
    }

    // Poll until the webhook handler activates the subscription (up to 15 s).
    // If it doesn't arrive in time, show a "check back" message.
    pollSubscriptionActive(15_000, 2_000).then((active) => {
      setPhase(active ? "success" : "timeout");
    });
  }, [reference]);

  // Countdown redirect on success
  useEffect(() => {
    if (phase !== "success") return;
    if (countdown === 0) {
      navigate("/dashboard");
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1_000);
    return () => clearTimeout(t);
  }, [phase, countdown, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#05060F] px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-10 text-center shadow-xl">
        {phase === "verifying" && (
          <>
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
            <h1 className="mt-5 text-xl font-bold text-foreground">
              Activating your subscription…
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This usually takes a few seconds.
            </p>
          </>
        )}

        {phase === "success" && (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
            <h1 className="mt-5 text-xl font-bold text-foreground">
              You&apos;re all set!
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your subscription is active. Redirecting to your dashboard in{" "}
              <span className="font-mono text-foreground">{countdown}s</span>…
            </p>
            <Link
              to="/dashboard"
              className="mt-6 inline-block rounded-lg gradient-bg glow-gradient px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition"
            >
              Go to Dashboard now
            </Link>
          </>
        )}

        {phase === "timeout" && (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
            <h1 className="mt-5 text-xl font-bold text-foreground">
              Payment received
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We&apos;re still processing your subscription. It should be active within
              a minute. Check your{" "}
              <Link to="/settings" className="text-primary underline underline-offset-2">
                billing settings
              </Link>{" "}
              for confirmation.
            </p>
            <div className="mt-6 flex gap-3 justify-center">
              <Link
                to="/dashboard"
                className="rounded-lg gradient-bg glow-gradient px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition"
              >
                Dashboard
              </Link>
              <Link
                to="/settings"
                className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-elevated transition"
              >
                Billing settings
              </Link>
            </div>
          </>
        )}

        {phase === "no-ref" && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-danger" />
            <h1 className="mt-5 text-xl font-bold text-foreground">
              Payment cancelled
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              No payment was completed. You can try again from the pricing page.
            </p>
            <Link
              to="/pricing"
              className="mt-6 inline-block rounded-lg border border-border px-6 py-2.5 text-sm font-semibold text-foreground hover:bg-elevated transition"
            >
              Back to Pricing
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
