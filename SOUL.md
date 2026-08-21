# SOUL.md — Quant Research OS

## Mission
Build a research-first, data-first, AI-native quantitative trading platform that helps users move from:

**idea → research → reproducible experiment → validation → backtest → paper trading → controlled live deployment**.

The platform must optimize for **truth, reproducibility, reliability, and risk control**, not impressive demos or backtest vanity metrics.

## Non-Negotiable Principles

1. **Research validity before feature count.** A strategy that cannot survive realistic validation is not a success, regardless of how good its UI looks.
2. **Data is infrastructure.** Raw data, normalization, point-in-time correctness, timestamps, provenance, licensing, quality and versioning are first-class concerns.
3. **AI proposes; deterministic systems enforce.** LLMs and RL agents may research, generate hypotheses and propose decisions, but they must never bypass hard risk, execution, accounting, or reconciliation rules.
4. **Backtest != proof.** Every result must identify its data version, feature version, code commit, parameters, costs, slippage model, train/validation/test windows and random seed where applicable.
5. **No look-ahead. No survivorship shortcuts. No hidden leakage.** If historical information was unavailable at the time, the experiment must not see it.
6. **Paper trading before live automation.** Live execution is a promotion state, not a development shortcut.
7. **One canonical data model.** Historical research, backtesting, paper trading and live inference should use compatible definitions and feature semantics.
8. **Fail closed.** Uncertain broker state, stale data, reconciliation mismatch, risk breach or missing dependency should block unsafe actions rather than guess.
9. **Measure before optimizing.** Profile latency, compute, database load, data quality and costs before introducing complexity or a second programming language.
10. **Prefer modular monolith first.** Keep strong domain boundaries without prematurely creating dozens of distributed services.
11. **Reproducibility is a product feature.** A result should be rerunnable months later from recorded artifacts.
12. **Security is part of the design.** Secrets, broker credentials, personal data and tenant boundaries must never be treated as implementation details.

## Product Character

The product should feel like a **Quant Research Operating System**, not a chatbot and not a generic trading dashboard.

It combines:

- AI research agents and tool use
- market-data infrastructure
- deterministic quantitative research
- ML and RL experimentation
- backtesting and exchange simulation
- paper trading
- portfolio/risk management
- controlled execution
- observability, audit and billing

## What We Are Not

We are not building:

- a black-box “AI that guarantees profit”
- an LLM that directly submits unrestricted trades
- a collection of unrelated trading bots
- a huge microservice estate before product-market fit
- a system that optimizes itself endlessly on the same historical test set

## Quality Bar

Every important feature should answer:

- What problem does this solve?
- Which domain owns it?
- What is the source of truth?
- How is it tested?
- How is it observed?
- How does it fail?
- What does it cost at 10x usage?
- Can we reproduce its behavior?
