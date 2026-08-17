
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
Invoices / receipts: business name + support email on every Stripe
invoice AND Paystack receipt/invoice template, not just the generic
provider branding
Transactional emails: sender name reads as the business, not a raw
domain or "no-reply@[random]"
Admin panel: an "about/system" screen showing registrant info,
support contact, and current environment — useful for admins, doubles as
an ownership record
Bot deployment confirmation: since this touches real funds, the
confirmation screen should show who operates the platform, not just the
trade mandate

Product context
I'm designing a multi-user, multi-tenant SaaS that wraps an open-source
AI trading agent (Vibe-Trading). Users describe a trading strategy in
natural language, the platform generates and backtests it, then they can
optionally deploy it as a live bot against their own exchange account.
Billing is subscription-based (Free / Pro $29 / Business $99) and supports
TWO payment providers depending on region: Stripe (international, USD) and
Paystack (Nigeria, NGN). Both use hosted checkout and signed webhooks.
The AI engine uses BYOK (Bring Your Own Key): users supply their own
DeepSeek API key, which is stored encrypted and never shown again.
This is a financial product handling real (or paper) money — the design
needs to feel trustworthy, not gamified. Risk and cost should always be
visible before a user commits to an action (deploying a bot, upgrading a
plan, spending exchange funds).
Two personas, two full flows. Design both, start to end, with every
screen state — not just the happy path.

Persona 1 — User (Free / Pro / Business)
Design every screen in this sequence, including empty, loading, error,
and success states for each:
Landing page — value prop, pricing teaser, CTA to sign up
Sign up — email, password, name, timezone (Supabase Auth)
Email verification — pending state, resend option, expired-token state
Plan selection — Free / Pro / Business comparison, "start free" vs "start trial"
Checkout (Pro/Business only) — provider-hosted (Stripe Checkout OR Paystack
  Inline/Standard depending on the user's selected/region provider), with
  success + cancel return states for BOTH providers
Dashboard — empty state (new user, no strategies yet) AND populated
state (usage meter, active bots, recent strategies, P&L snapshot)
Strategy generator
prompt input (NLP text box + exchange selector)
no-LLM-key state: the platform uses BYOK — if the user has not added a
  DeepSeek API key, show an inline banner + CTA to add one before generation
  is enabled (never a broken/generic error)
loading state (generation takes 10–30s — needs a real waiting state,
not a spinner that reads as broken)
generated result (strategy code, explanation, confidence/risk notes)
quota-exceeded state (free tier hits run limit — needs an upsell,
not a dead end)
Backtest
configuration form (symbol, date range, capital, slippage)
running state (queued → running, with progress indication)
results view (equity curve, Sharpe, max drawdown, win rate)
failed-backtest state
Bot deployment
mandate form (symbol universe, order size, max exposure, daily loss cap)
explicit confirmation step — this uses real funds, needs a clear
"you are about to..." summary before the final deploy action
active bot monitoring (live P&L, fill log, status)
kill switch (stop button — needs a confirm step, not a silent action)
errored-bot state (what does the user see when a bot fails?)
Billing — current plan, usage vs limits, upgrade/downgrade, payment
  provider indicator (Stripe or Paystack), invoice history, payment-failed
  banner state, and a provider-switch note (switching provider may start a
  new subscription)
Account settings — profile, exchange API key management
(add/remove — never displays the key once saved), notification prefs,
and LLM / AI key management (BYOK): add/remove a DeepSeek API key — the
key is never displayed again once saved (same pattern as exchange keys)
Cross-cutting states to design once, reuse everywhere: empty state,
loading state, error/toast pattern, quota-limit-reached pattern,
confirmation-before-destructive-action pattern, and the BYOK key-missing
pattern (used by strategy generation and any future LLM-powered feature).

Persona 2 — Admin
Admins are internal staff, not customers — this can be denser and more
utilitarian than the user-facing product. Design:
Admin login — email + password + TOTP 2FA step (this is a hard
gate, not optional)
Admin dashboard — MRR, active users, churn, active bots count,
system health (queue depth, API error rate) at a glance
User management
searchable/filterable user table
individual user detail view (profile, plan, usage, active bots,
recent activity)
suspend/unsuspend action (with confirmation + reason field)
manual plan override (bypass providers — needs to be clearly logged)
Billing overview — subscribers by plan, failed payments needing
attention, manual refund flow
Platform config — edit plan limits (run/bot/backtest caps) without
a deploy
Monitoring — all active bots across all users, worker/queue health
Audit log — filterable table of every admin action + sensitive
user action, who did what and when

Design system constraints
Reuse one component library across both personas — don't design two
visual languages. Admin is denser/more tabular; user-facing is more
spacious — but same tokens (color, type, spacing, radius).
Financial data (P&L, returns) needs a consistent color convention:
pick once whether green/red means gain/loss or up/down, and apply it
everywhere without exception.
Every destructive or money-moving action (stop bot, cancel subscription,
deploy bot, delete strategy) gets a confirmation step. No silent
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
