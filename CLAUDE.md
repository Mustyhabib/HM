# HM — Root CLAUDE.md

This is the umbrella repo for the H~M Trading Platform.

## Sub-projects

- `Tradi/` — vendored Vibe-Trading engine (see `Tradi/CLAUDE.md`)
- `vibe-trading-saas/` — SaaS layer docs and config (see `vibe-trading-saas/CLAUDE.md`)

## LLM Wiki — Auto-Update Rules

A project wiki lives at `.wiki/`. It tracks key decisions, active file paths, and current tasks — and grows as we work.

### ALWAYS update the wiki when:

1. **A key decision is made** → update `[[architecture-decisions]]` in `.wiki/pages/architecture-decisions.md`
2. **A new file/page/route is created** → update `[[active-file-paths]]` in `.wiki/pages/active-file-paths.md`
3. **A task is completed or a new one starts** → update `[[current-tasks]]` in `.wiki/pages/current-tasks.md`
4. **A new concept worth remembering appears** → create a new page in `.wiki/pages/`

### ALWAYS check the wiki when:

- Starting a new session → read `.wiki/pages/current-tasks.md` for context
- Looking for a file → check `.wiki/pages/active-file-paths.md`
- Making an architecture decision → check `.wiki/pages/architecture-decisions.md` for precedent

### Wiki page format:

Every page in `.wiki/pages/` needs YAML frontmatter:

```yaml
---
title: "Page Title"
type: concept|status|rules|config|reference|memory
confidence: low|medium|high
sources: []
related:
  - "[[other-page-slug]]"
created: YYYY-MM-DD
updated: YYYY-MM-DD
freshness_tier: live|fast|moderate|standard|permanent
tags: [tag1, tag2]
---
```

### Key wiki pages:

| Page | What it tracks |
|------|---------------|
| `current-tasks` | Sprint status, completed/next/blocked items |
| `active-file-paths` | Every important file with its purpose |
| `architecture-decisions` | ADR-style decision log |
| `tech-stack` | Stack choices and reasoning |
| `design-system` | H~M palette, CSS utilities, patterns |
| `safety-rules` | Security hard rules (never violate) |
| `pricing-model` | Tier config and billing rules |

## Dev Commands

```bash
cd Tradi/frontend && npm run dev    # SPA dev server on :5899
cd Tradi/frontend && npx tsc --noEmit  # type-check
cd Tradi/frontend && npm run build  # production build
```
