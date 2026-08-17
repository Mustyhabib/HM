
---

## 6. `.claude/skills/vibe-trading-wrapper.md`
```markdown
---
name: vibe-trading-wrapper
description: How to wrap StrategyAgent, BacktestRunner, and LiveAgent safely with quota + key handling.
---

# Vibe-Trading Integration

Always: quota check BEFORE the call · decrypt keys from DB · run blocking calls
in a worker. See CLAUDE.md "Vibe-Trading integration patterns".

## Strategy generation (StrategyAgent)
```python
from vibe_trading_ai import StrategyAgent
agent = StrategyAgent(llm_provider="anthropic", api_key=settings.ANTHROPIC_API_KEY)
result = await agent.generate(prompt=user_prompt, exchange=exchange)

