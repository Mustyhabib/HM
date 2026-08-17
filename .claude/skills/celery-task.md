
---

## 5. `.claude/skills/celery-task.md`
```markdown
---
name: celery-task
description: Celery worker patterns — sync SQLAlchemy, blocking engine calls, and the SIGTERM kill switch.
---

# Celery Task Patterns

## Golden rules
- Celery workers are SYNCHRONOUS. Use sync SQLAlchemy sessions inside tasks,
  not `AsyncSession`.
- Vibe-Trading `BacktestRunner.run()` and `LiveAgent.run()` are BLOCKING —
  never call them in a FastAPI request thread. Always in a worker.
- Store `celery_task_id` on the DB row so you can revoke later.

## Backtest task shape
```python
@app.task(bind=True, max_retries=0)
def run_backtest(self, backtest_id: str):
    row = fetch(backtest_id)              # sync SQLAlchemy
    row.status = "running"; commit()
    try:
        key = decrypt_exchange_key(row.user_id, row.exchange)
        results = BacktestRunner(strategy_code=..., params=...).run()
        s3_key = upload_to_s3(results)
        row.status = "done"; row.results = {"s3_key": s3_key, "summary": ...}
    except Exception as e:
        row.status = "failed"; row.results = {"error": str(e)}
    commit()
