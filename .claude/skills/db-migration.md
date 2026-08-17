---
name: db-migration
description: SQLAlchemy model conventions and the safe Alembic migration workflow.
---

# Database Models + Migrations

## Model conventions (app/models/)
- One file per model; import all in `__init__.py`.
- All PKs: `mapped_column(UUID, primary_key=True, default=uuid4)`.
- `created_at` auto-timestamp on every table.
- EVERY table with a `user_id` FK gets:
  `__table_args__ = (Index("ix_user_id", "user_id"),)` — critical for perf.
- Match the "DB models" section of CLAUDE.md exactly. Do not invent columns.

## Alembic workflow (never hand-edit migration files)
1. Change the model.
2. `alembic revision --autogenerate -m "<description>"`
3. OPEN the generated file and verify the SQL before applying.
4. `alembic upgrade head`
5. If autogenerate misses something (enum changes, index drops), edit the
   migration manually — but only the generated file, never a prior one.

## Async engine note
Alembic `env.py` must be configured for the async engine from `app/core/config`.
