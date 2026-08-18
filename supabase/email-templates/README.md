# Email templates — H~M Trading Institute

Branded, self-contained transactional email templates. Every file is a
static `.html` (inline CSS only — no `<style>` blocks except one `@media`
rule for mobile, no images, no external assets) paired with a `.subject`
file holding just the subject line text.

There is **no email-sending code in this repo**. `auth/` is meant to be
pasted straight into the Supabase Auth dashboard, which owns the send path
for signup/invite/magic-link/reset/change-email. `transactional/` has no
provider wired at all yet — it's ready to hand to whichever transactional
sender (Resend, Brevo, Postmark, …) gets picked later.

## Layout system

Every template shares the same structure:

1. **Preheader** — hidden one-line inbox preview text.
2. **Header band** (white) — the `H~Mltd` gradient-text lockup, left; muted
   tagline "Trading research platform", right.
3. **Body** (max-width 600px, centered) — greeting, message, one CTA button,
   small-print (expiry / security note).
4. **Footer band** (dark, `#0A0815`) — gradient "H~M" icon mark, business
   name, support line, phone placeholder, `©` line.

### Palette (the ONLY colors any template may use)

| Hex | Role |
|---|---|
| `#FFFFFF` | white surfaces, button text |
| `#FAF5FF` | light lavender tint, footer body text |
| `#F5F3FF` | page background behind the card |
| `#EDE9FE` | light border |
| `#0A0815` | footer band background |
| `#160E28` | dark surface (reserve) |
| `#2A1845` | dark border (reserve) |
| `#7C3AED` | primary brand violet — lockup fallback, primary CTA, icon mark |
| `#6D28D9`, `#C026D3`, `#A21CAF` | brand gradient reserves |
| `#D946EF`, `#F43F5E`, `#FB923C` | aurora-fire gradient stops |
| `#DC2626` | danger CTA (renewal-failed) |
| `#16A34A` | success CTA (subscription-activated) |
| `#D97706` | warning reserve |
| `#6B4D8A` | muted text |
| `#0F0A1E` | body text — the light-theme `--foreground` value from `Tradi/frontend/src/index.css` `:root[data-theme="light"]` |

New colors are rejected by `scripts/email-templates-check.mjs` — if a future
edit needs a color not on this list, it isn't a copy/paste fix, it's a
design-system decision. Update the palette in the design doc and the
validator together, deliberately.

## Auth templates — Supabase Dashboard setup

1. Go to **Supabase Dashboard → Authentication → Emails → Templates**.
2. For each of the 5 slots (Confirm signup, Invite user, Magic Link, Reset
   password, Change email), open the matching file in `auth/` and paste the
   full HTML into the template body box.
3. Paste the matching `.subject` file's contents into the **Subject**
   field for that slot.
4. Set the sender identity: **Authentication → Emails → SMTP Settings** →
   configure a custom SMTP provider (e.g. a transactional provider's SMTP
   relay) with:
   - Sender name: `H~M Trading Institute`
   - Sender email: `no-reply@hmtrade-business.com`

   A custom SMTP provider is recommended over Supabase's built-in mailer —
   the built-in mailer is rate-limited and not meant for production traffic,
   and some providers rewrite the sender name if it isn't explicitly
   configured on their side too. Check the provider's dashboard after
   setup to confirm the "From" name sticks.

Auth templates use **only** the exact Supabase Auth variable names:
`{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .TokenExpiration }}`,
`{{ .SiteURL }}`, `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .Data }}`. Anything
else silently renders empty in the dashboard — don't invent variable names.

The `©` line in `auth/` templates carries the literal year `2026` (these are
static HTML pasted once into a dashboard field, not re-rendered per send —
see "Copyright line update note" below).

## Transactional templates — not wired to a provider yet

`transactional/` (`subscription-activated`, `renewal-failed`,
`run-completed`) has **no sending code anywhere in this repo**. These are
ready to hand to a future transactional email integration. They use
`[square-bracket]` placeholders instead of Supabase template syntax, since
whichever provider sends them will have its own templating conventions.

### Placeholder inventory

| Placeholder | Meaning | Source when wired |
|---|---|---|
| `[plan_name]` | `starter` / `pro` / `premium` | `plans.name` |
| `[amount]` | Charged amount, formatted | Paystack webhook payload |
| `[renewal_date]` | Current period end | `subscriptions.current_period_end` |
| `[retry_date]` | Next payment retry attempt | Paystack webhook payload |
| `[payment_url]` | Paystack customer portal / update-payment link | Paystack API |
| `[dashboard_url]` | Link back into the app | `APP_URL` + `/dashboard` |
| `[run_name]` | Human label for a research run | `agent_runs` (or user-supplied label) |
| `[run_id]` | `agent_runs.id` | `agent_runs.id` |
| `[results_url]` | Link to `/run/:runId` | `APP_URL` + `/run/{id}` |
| `[year]` | Current year for the `©` line | rendered at send time by the provider |
| `support@hmtrade-business.com` | Support mailbox | **create this mailbox before launch** — it does not exist yet |
| `[+234 phone number]` | Support phone line | fill in once a business line exists |

### Copyright line update note

`auth/` templates are pasted once into the Supabase dashboard and are not
re-rendered per send, so they carry the literal year `2026` — remember to
refresh that year each January (or whenever the templates are next edited)
until Supabase supports a dynamic year variable. `transactional/` templates
carry `[year]` since whatever provider eventually sends them can render it
per-send.

## Design deviation from the design doc

Section 4 of the design doc describes the `subscription-activated`
"Go to dashboard" button as linking to `{{ .SiteURL }}` (a Supabase Auth
template variable). That conflicts with Acceptance Criterion 3
("transactional use `[brackets]` only") and with the fact that no Supabase
Auth flow ever sends this template — it's for a future transactional
provider, which won't have `{{ .SiteURL }}` available. The button links to
`[dashboard_url]` instead, consistent with every other transactional
placeholder. See `email-templates-check.mjs`'s per-template checks, which
enforce this split (auth templates require `{{ .ConfirmationURL }}` /
`{{ .Token }}`; transactional templates reject any `{{` at all).

## Validator

```bash
node scripts/email-templates-check.mjs
```

Zero-dependency Node (v22+, `.mjs`, no npm packages). Checks, per template:

- Both the `.html` and `.subject` file exist and the subject isn't empty.
- Brand elements: `H~Mltd` lockup, `H~M Trading Institute` footer text, a
  `©`/`&copy;` + "Trading Institute" line, the `support@hmtrade-business.com`
  placeholder, and at least one `<a>` CTA with an inline `background-color`.
- HTML tag balance (`a`, `div`, `span`, `table`, `tr`, `td`, `p`, `br` —
  `br` is void and exempt) via a stack-based scan of the raw markup.
- Auth templates only: every `{{ ... }}` is closed, and only the exact
  Supabase Auth variable names are used.
- Transactional templates only: no `{{` at all (bracket placeholders only).
- Color audit: every `#RRGGBB` and `rgba()`/`rgb()` value must resolve to a
  color in the approved palette above — anything else fails the build.
- No obvious secrets: rejects lines matching an `sk_`/`pk_`/`eyJ`-shaped
  token pattern.

Exit code is `0` only when all 8 templates pass; otherwise it prints a
per-file list of what's wrong and exits non-zero.
