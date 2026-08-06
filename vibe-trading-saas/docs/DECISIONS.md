# Decision Log

Format:

```text
[YYYY-MM-DD] Decision: ...
Reason: ...
Alternatives considered: ...
```

---

```text
[2026-08-05] Decision: The worker invokes Tradi as a subprocess per run
  (`vibe-trading run -p "<prompt>" --json --max-iter N`), not as an
  in-process Python import and not as a full container-per-run at MVP.

Reason:
  - Tradi's own config layer is process-global, not multi-tenant-aware:
    `agent/src/config/accessor.py` caches a single `EnvConfig` singleton
    per process (`get_env_config()`), and persistent memory
    (`agent/src/memory/persistent.py: MEMORY_BASE = Path.home() /
    ".vibe-trading" / "memory"`) resolves from the OS `HOME` env var at
    import/call time. Importing Tradi in-process inside a long-lived
    worker would mean every tenant's run shares that process's global
    state unless we serialize execution and reset the singleton between
    every single call — fragile, and an easy way to leak one user's
    memory/session data into another user's run.
  - Running each use as its own OS subprocess gets real isolation for
    free: setting `HOME` (and/or `VIBE_TRADING_HOME`) per subprocess
    redirects config, sessions, runs, uploads, and persistent memory to
    an isolated per-run temp directory with zero engine code changes.
    A crashed or runaway run can't take the worker process down or
    affect a concurrent tenant's run.
  - `vibe-trading run -p "..." --json --max-iter N` already exists as a
    non-interactive, single-shot, machine-readable entry point
    (`agent/cli/_legacy.py` run subparser) — no engine patching needed
    to get a clean worker integration point.
  - Full container-per-run (Docker sibling containers on the worker
    host) would add a stronger sandbox (network egress control,
    filesystem jail, cgroup resource limits) but is more DevOps surface
    than a solo dev needs to stand up before validating the product.
    `CLAUDE.md` explicitly says to avoid heavy DevOps burden at MVP and
    upgrade only when real usage justifies it.

Alternatives considered:
  - In-process import of Tradi's agent loop into the worker. Rejected:
    the global-singleton/`Path.home()` behavior above makes this unsafe
    for concurrent multi-tenant execution without invasive changes to
    Tradi itself, which we've committed to treating as a vendored
    dependency we patch minimally, not rewrite.
  - Container-per-run (Docker) from day one. Rejected for MVP only on
    cost/complexity grounds, not safety — it's the documented upgrade
    path once usage or abuse risk justifies the extra ops burden (see
    `docs/ARCHITECTURE.md` "Future hardening").
  - Reusing Tradi's own `vibe-trading serve` FastAPI server as a shared
    multi-tenant backend. Rejected: it's built around the same
    process-global state and a single local user's session/run history,
    not per-tenant scoping — using it directly would require the same
    isolation problem solved twice (once for it, once for our own API).
```

---

```text
[2026-08-05] Decision: Vendor Tradi (the engine) directly into the HM repo
  as tracked files under `Tradi/`, not as a separate sibling repo pulled at
  build time.

Reason:
  - The original `.gitignore` (commit e943c08) excluded `/Vibe-Trading/`
    and described the engine as a sibling checkout pinned to a commit/tag,
    pulled at worker build time. This was reversed in the same session
    (commit f78487a) to a full vendor: the engine's 2,050 files are tracked
    directly under `Tradi/`, the exclusion rule was dropped, and all
    downstream docs (`PROJECT_BRIEF.md`, `ARCHITECTURE.md`, `CLAUDE.md`)
    were written assuming the vendored layout.
  - Full vendoring is the simpler model for a solo dev: one repo, one
    clone, one `git log`, no build-time fetch step that can break, no
    pinned-commit coordination between two repos. The worker Dockerfile /
    deploy script can just `COPY Tradi/ /app/Tradi/` — no git-clone-at-
    build-time, no deploy key, no submodule.
  - MIT license permits this; the only obligation is keeping
    `Tradi/LICENSE` and `Tradi/NOTICE` intact (verified present).
  - Trade-off: every clone pulls ~13 MB of binary marketing assets
    (`Tradi/assets/`, `Tradi/wiki/assets/`). Acceptable at this scale;
    if clone size becomes a problem later, those assets can be moved to
    LFS or stripped without affecting the engine's runtime code.

Alternatives considered:
  - Sibling-repo with gitignored local checkout, pinned at build time
    (the original plan from commit e943c08). Rejected: adds a second repo
    to coordinate, a deploy-key or PAT for the worker's build step, and a
    pinned-commit file to keep in sync — none of which is justified when
    the engine is MIT and the SaaS wrapper is the only consumer.
  - Git submodule. Rejected: submodules add cognitive overhead and CI
    complexity disproportionate to the benefit for a solo-dev project with
    one consumer of one dependency.
```

---

```text
[2026-08-05] Decision: Billing will use Flutterwave, not Stripe. No billing
  code has been written yet, so this replaces the intended provider before
  any integration exists — CLAUDE.md's "PREFERRED STACK" (Stripe Checkout /
  Customer Portal / webhooks) is superseded for payments only.

Reason:
  - Stripe onboarding/payouts are not reliably available for the operator's
    region — "network connectivity of Stripe" — so Stripe cannot be the
    merchant of record here regardless of how clean its API is.
  - Flutterwave supports the region, settles in local currency, and offers
    recurring billing via Payment Plans (tokenized card charging) plus
    hosted checkout and webhooks — enough to cover the three subscription
    tiers (Starter/Pro/Premium) without building card handling ourselves.
  - The rest of CLAUDE.md's billing *principles* still hold and are
    provider-agnostic: Postgres is the source of truth, webhook processing
    must be idempotent, quota logic stays transactional, usage events stay
    immutable. Only the vendor changes.

Implications (not yet actioned — billing is post-signup work):
  - The schema was created with Stripe-specific column names that will need
    generalizing (or a rename migration): `profiles.stripe_customer_id`,
    `subscriptions.stripe_subscription_id`, `plans.stripe_price_id`,
    `webhook_events.stripe_event_id`. Prefer neutral names
    (`billing_customer_id`, `billing_subscription_id`, `provider_plan_id`,
    `provider_event_id`) so we're not locked to one vendor again.
  - Webhook authenticity differs: Flutterwave sends a `verif-hash` header
    to compare against a shared secret, rather than Stripe's signed-payload
    scheme. Idempotency on `webhook_events` is unchanged.
  - Pricing currency is an open question — tiers are defined in USD
    ($20/$35/$50) but settlement may be in local currency.
  - No Stripe/production keys were ever added; nothing to revoke.

Alternatives considered:
  - Stripe (original plan). Rejected: not reliably usable from the
    operator's region.
  - Paystack (also strong in the same region). Not chosen now, but the
    provider-neutral column renaming above keeps it a low-cost switch if
    Flutterwave disappoints.
```

---

```text
[2026-08-06] Decision: Billing provider is Paystack (NGN), superseding the
  Flutterwave choice above. Stripe stays parked for later. Pricing stays in
  Naira (₦70,000 / ₦120,000 / ₦200,000).

Context:
  - The Flutterwave decision (above) was made when Stripe looked unreachable
    from the operator's region. The real constraint is now clearer: the
    operator is a Nigerian entity with no US/UK company, so Stripe cannot
    onboard the business at all — Stripe registers merchants by country of
    entity, not by bank account, and a Grey/virtual USD account does not
    satisfy that requirement.
  - Customers are Nigerian-focused (crypto/forex/indices retail traders)
    paying with naira cards, which mostly decline USD charges.

Reason for Paystack over Flutterwave:
  - Both work for a Nigerian entity and settle to a Nigerian bank in NGN.
  - Paystack (Stripe-owned) has the better API, docs, reliability, and
    compliance handling. Flutterwave is kept only as a fallback if Paystack
    rejects the business category at KYC.
  - Subscriptions via Paystack Plans; hosted checkout; webhooks authenticated
    by the `x-paystack-signature` header (HMAC-SHA512 of the raw body), then
    re-verified via `/transaction/verify/{reference}` before acting on money.

DB: No migration needed. The live schema already has provider-neutral columns
  (`billing_customer_id`, `provider_price_id`, `provider_subscription_id`,
  `provider_event_id`) and `plans.price_ngn` (NGN) — exactly what this decision
  wants. Neutral names are kept (Stripe-compatible, cheap to add a second
  provider later).

Compliance: crypto/forex/"trading" businesses are restricted by both Paystack
  and Flutterwave. Present the product as AI research/education software (a SaaS
  subscription) — not a trading, brokerage, or signals service — in the merchant
  application and marketing. This matches the product reality (`CLAUDE.md`:
  "analysis/research only, not live trading").

Stripe (parked): revisit only if a US/UK entity is formed to serve the
  international slice in USD — at which point Stripe (USD, international) runs
  alongside Paystack (NGN, Nigeria) as a deliberate two-provider setup, which
  the neutral columns already support. `stripe-billing.md` is kept as a parked
  reference.

Alternatives considered:
  - Stripe now. Not possible — no supported-country entity; Grey/virtual
    accounts don't satisfy Stripe's entity requirement.
  - Stay on Flutterwave. Rejected: Paystack is the better-built option for the
    same market; Flutterwave kept only as a category-rejection fallback.
  - Keep USD pricing. Rejected: naira cards don't reliably charge in USD.
```
