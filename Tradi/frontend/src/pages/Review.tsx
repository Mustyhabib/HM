/**
 * Review & Support page — three distinct sections (HM spec, 2026-08-23):
 *
 *   1. REVIEWS      — star rating + short comment. Stored locally per
 *                     browser until a reviews backend ships; the latest
 *                     local entries render immediately.
 *   2. COMPLAINTS   — issue report tied to an optional run id; composes a
 *                     mailto: to support with structured context so nothing
 *                     is lost (artifacts/run ids can be pasted in).
 *   3. SUGGESTIONS  — feature requests, same storage/mailto pattern.
 *
 * Each section is self-contained and separately scrollable on small screens.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Lightbulb,
  MessageSquareHeart,
  Send,
  Star,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SUPPORT_EMAIL } from "@/lib/company";

type SectionKey = "reviews" | "complaints" | "suggestions";

const STORE_KEY = "hm-review-entries-v1";

interface LocalEntry {
  kind: Exclude<SectionKey, "complaints">;
  rating?: number;
  text: string;
  at: string;
}

function loadLocal(): LocalEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]") as LocalEntry[];
  } catch {
    return [];
  }
}

function StarRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => onChange(n)}
          className="transition hover:scale-110"
        >
          <Star
            className={cn(
              "h-5 w-5",
              n <= value ? "fill-warning text-warning" : "text-muted-foreground/40",
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function ReviewPage() {
  const [section, setSection] = useState<SectionKey>("reviews");
  const [entries, setEntries] = useState<LocalEntry[]>([]);

  // Reviews state
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");

  // Suggestions state
  const [suggestion, setSuggestion] = useState("");

  // Complaints state
  const [runId, setRunId] = useState("");
  const [issue, setIssue] = useState("");

  useEffect(() => { setEntries(loadLocal()); }, []);

  const persist = useCallback((e: LocalEntry) => {
    const next = [...loadLocal(), e];
    localStorage.setItem(STORE_KEY, JSON.stringify(next.slice(-50)));
    setEntries(next);
  }, []);

  const submitReview = useCallback(() => {
    if (!rating || reviewText.trim().length < 3) {
      toast.error("Pick a star rating and write a few words");
      return;
    }
    persist({ kind: "reviews", rating, text: reviewText.trim(), at: new Date().toISOString() });
    setReviewText("");
    setRating(0);
    toast.success("Thanks — your review is saved");
  }, [rating, reviewText, persist]);

  const submitSuggestion = useCallback(() => {
    if (suggestion.trim().length < 8) {
      toast.error("Give us a little more detail");
      return;
    }
    persist({ kind: "suggestions", text: suggestion.trim(), at: new Date().toISOString() });
    const subject = encodeURIComponent("H~M feature suggestion");
    const body = encodeURIComponent(suggestion.trim());
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    setSuggestion("");
    toast.success("Opening your mail client to send it in");
  }, [suggestion, persist]);

  const complaintHref = useMemo(() => {
    const subject = encodeURIComponent(`H~M issue report${runId.trim() ? ` (run ${runId.trim()})` : ""}`);
    const body = encodeURIComponent(
      `Run ID: ${runId.trim() || "(not run-specific)"}\n\nWhat went wrong:\n${issue.trim()}\n\n— sent from hmtrade.business/review`,
    );
    return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }, [runId, issue]);

  const localReviews = entries.filter((e) => e.kind === "reviews").slice(-5).reverse();
  const localSuggestions = entries.filter((e) => e.kind === "suggestions").slice(-5).reverse();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* ── Section switcher ── */}
      <div className="flex gap-1.5">
        {(
          [
            ["reviews", "Reviews", MessageSquareHeart],
            ["complaints", "Report an issue", Wrench],
            ["suggestions", "Suggestions", Lightbulb],
          ] as Array<[SectionKey, string, typeof Star]>
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
              section === key
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ── REVIEWS ── */}
      {section === "reviews" && (
        <section aria-label="Reviews" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">Rate your experience</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              How is the research platform treating you?
            </p>
            <div className="mt-3"><StarRow value={rating} onChange={setRating} /></div>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              rows={3}
              placeholder="What's working well? What isn't?"
              className="mt-3 w-full resize-none rounded-lg border border-border bg-[var(--bg-input)] px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/60"
            />
            <button
              type="button"
              onClick={submitReview}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg gradient-bg glow-gradient px-3.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
            >
              <Send className="h-3 w-3" /> Submit review
            </button>
          </div>

          {localReviews.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Your recent reviews
              </h3>
              <ul className="space-y-3">
                {localReviews.map((e, i) => (
                  <li key={i} className="border-b border-border/40 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} className={cn("h-3 w-3", n <= (e.rating ?? 0) && "fill-warning text-warning")} />
                      ))}
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {new Date(e.at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-foreground">{e.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── COMPLAINTS ── */}
      {section === "complaints" && (
        <section aria-label="Report an issue" className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Something broken?</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Tell us what happened. If it's about a specific run, paste its Run ID
            (found on the run page URL) so we can pull its artifacts and logs.
          </p>
          <input
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
            placeholder="Run ID (optional) — e.g. a44cebd0-e67b…"
            className="mt-3 w-full rounded-lg border border-border bg-[var(--bg-input)] px-3 py-2 font-mono text-xs outline-none transition focus:border-primary/60"
          />
          <textarea
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
            rows={5}
            placeholder="Describe the problem: what you asked, what you expected, what happened instead…"
            className="mt-2 w-full resize-none rounded-lg border border-border bg-[var(--bg-input)] px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/60"
          />
          <a
            href={complaintHref}
            onClick={(e) => {
              if (issue.trim().length < 10) {
                e.preventDefault();
                toast.error("Describe the issue in a little more detail first");
              }
            }}
            className={cn(
              "mt-2 inline-flex items-center gap-1.5 rounded-lg gradient-bg glow-gradient px-3.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90",
              issue.trim().length < 10 && "pointer-events-none opacity-50",
            )}
          >
            <Send className="h-3 w-3" /> Send to support
          </a>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Goes straight to {SUPPORT_EMAIL} — include artifacts links from the run page for faster triage.
          </p>
        </section>
      )}

      {/* ── SUGGESTIONS ── */}
      {section === "suggestions" && (
        <section aria-label="Suggestions" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">Suggest a feature</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              What should H~M do that it doesn't? Roadmap-relevant ideas go straight to the founder inbox.
            </p>
            <textarea
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              rows={4}
              placeholder="I wish H~M could…"
              className="mt-3 w-full resize-none rounded-lg border border-border bg-[var(--bg-input)] px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/60"
            />
            <button
              type="button"
              onClick={submitSuggestion}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg gradient-bg glow-gradient px-3.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
            >
              <Lightbulb className="h-3 w-3" /> Send suggestion
            </button>
          </div>

          {localSuggestions.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Your recent suggestions
              </h3>
              <ul className="space-y-2">
                {localSuggestions.map((e, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                    <p className="text-xs text-foreground">{e.text}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {new Date(e.at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
