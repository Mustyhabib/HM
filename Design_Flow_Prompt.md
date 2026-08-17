
Design prompt — full user + admin interaction workflow
Paste this whole block into Figma AI / Claude / v0 / whatever design tool you're using.

Brand identity
Product name: H~M Trading Institute (not "Vibe-Trading" — that's the
underlying open-source engine, never customer-facing).
A logo suite already exists (seal mark with an ascending price-line motif,
navy `#0C1F33` + gold `#B8862B`/`#D4A537` + paper `#F2F3F0`, serif wordmark +
tracked sans label — see the attached brand guide). Use it exactly as
supplied, don't redesign it — apply it consistently:
Header/nav: horizontal lockup (light or dark variant depending on the
page's background)
Favicon / browser tab: the supplied favicon set
Footer: icon mark + registrant contact block (see below)
Email templates: horizontal lockup in the header, icon mark only in the
footer signature
Admin panel: same lockup, denser placement — this isn't a separate brand

Ownership / contact footprint
Every surface needs to visibly and verifiably belong to the owner, not read
as an anonymous or borrowed template. Design (or account for) these
placements — content is a placeholder, the layout should reserve real space
for it:
Site footer (every page): business name, support email, business
phone, and a copyright line — `© [year] H~M Trading Institute`
Legal pages: Terms of Service and Privacy Policy need a registrant
block (legal business name, contact email, physical/mailing address if
operating as a registered entity — required in many jurisdictions for
ToS/Privacy enforceability, not just branding)
Invoices / receipts: business name + support email on every Paystack
receipt/invoice template, not just the generic provider branding
Transactional emails: sender name reads as the business, not a raw
domain or "no-reply@[random]"
Admin panel: an "about/system" screen showing registrant info,
support contact, and current environment — useful for admins, doubles as
an ownership record
Research/run confirmation: since this is a paid, financial-research
product, confirmation screens should show who operates the platform,
not just the action being taken

Product context
I'm designing a multi-user, multi-tenant SaaS that wraps an open-source
AI trading research agent (Vibe-Trading). Users describe a trading strategy
or research question in natural language, and the platform generates and
backtests it. This is research/backtesting only at MVP — live bot deployment
against a user's exchange account is DEFERRED (mandate-gated, off by default).
Billing is subscription-based in Naira (Starter / Pro / Premium), charged via
Paystack ONLY (the operator is a Nigerian entity; Stripe is parked for future
international expansion). Paystack hosted checkout + signed webhooks
(HMAC-SHA512). All tiers include UNLIMITED runs — users pay DeepSeek directly
for LLM tokens via BYOK.
The AI engine uses BYOK (Bring Your Own Key): users supply their own
DeepSeek API key, which is stored encrypted (Supabase Vault) and never shown
again.
This is a financial research product — the design needs to feel trustworthy,
not gamified. Risk and cost should always be visible before a user commits to
an action (upgrading a plan, starting a run, uploading files).
Two personas, two full flows. Design both, start to end, with every
screen state — not just the happy path.

Persona 1 — User (Starter / Pro / Premium)
Design every screen in this sequence, including empty, loading, error,
and success states for each:
Landing page — value prop, pricing teaser, CTA to sign up
Sign up — email, password, name, timezone (Supabase Auth)
Email verification — pending state, resend option, expired-token state
Plan selection — Starter / Pro / Premium comparison (₦20k / ₦35k / ₦75k)
Checkout (Pro/Premium only) — Paystack hosted checkout, with
  success + cancel return states
Dashboard — empty state (new user, no runs yet) AND populated
state (recent runs, active run count, quick stats)
Strategy generator
prompt input (NLP text box + exchange selector)
no-LLM-key state: the platform uses BYOK — if the user has not added a
  DeepSeek API key, show an inline banner + CTA to add one before generation
  is enabled (never a broken/generic error)
loading state (generation takes 10–30s — needs a real waiting state,
not a spinner that reads as broken)
generated result (strategy code, explanation, confidence/risk notes)
rate-limit state (30 runs/rolling hour/user soft limit — a safety net,
not a business quota; clear, not a dead end)
Backtest
configuration form (symbol, date range, capital, slippage)
running state (queued → running, with progress indication)
results view (equity curve, Sharpe, max drawdown, win rate)
failed-backtest state
Attachment analysis (Premium only)
upload state (CSV / XLSX / JSON, 50 MB limit), invalid-file error state,
attach-to-run flow
Bot deployment — DEFERRED (live trading is off at MVP; design later, off by
default). For future reference the flow includes: mandate form, an explicit
"you are about to use real funds" confirmation, active monitoring, kill
switch with confirm step, and an errored-bot state.
Billing — current plan, upgrade/downgrade, Paystack provider, invoice /
  receipt history, payment-failed banner state
Account settings — profile, notification prefs, and LLM / AI key management
(BYOK): add/remove a DeepSeek API key — the key is never displayed again
once saved
Cross-cutting states to design once, reuse everywhere: empty state,
loading state, error/toast pattern, rate-limit-reached pattern,
confirmation-before-destructive-action pattern, and the BYOK key-missing
pattern (used by strategy generation and any future LLM-powered feature).

Persona 2 — Admin
Admins are internal staff, not customers — this can be denser and more
utilitarian than the user-facing product. Design:
Admin login — email + password (TOTP 2FA is DEFERRED at MVP — when
enabled it becomes a hard gate, not optional)
Admin dashboard — MRR, active users, churn, active run count,
system health (queue depth, API error rate) at a glance
User management
searchable/filterable user table
individual user detail view (profile, plan, usage, recent activity)
suspend/unsuspend action (with confirmation + reason field)
manual plan override (bypass providers — needs to be clearly logged)
Billing overview — subscribers by plan, failed payments needing
attention, manual refund flow
Platform config — edit plan limits without a deploy
Monitoring — all active runs across all users, worker/queue health
Audit log — filterable table of every admin action + sensitive
user action, who did what and when

Design system constraints
Reuse one component library across both personas — don't design two
visual languages. Admin is denser/more tabular; user-facing is more
spacious — but same tokens (color, type, spacing, radius).
Financial data (P&L, returns) needs a consistent color convention:
pick once whether green/red means gain/loss or up/down, and apply it
everywhere without exception.
Every destructive or money-moving action (cancel subscription,
delete strategy, upgrade plan) gets a confirmation step. No silent
destructive actions anywhere in either flow.
Mobile breakpoint required for the user flow (dashboard, monitoring,
billing at minimum). Admin flow can be desktop-only.

What I want back
For each screen listed above: a wireframe or mid-fidelity mockup, plus
a one-line note on what state it represents (empty / loading / error /
success) and what the primary action is. If you can produce a flow
diagram connecting the screens in sequence (with branch points for
error states and plan-tier differences), include that too.
Don't design the marketing site beyond the landing page — focus depth
on the authenticated product flows.
