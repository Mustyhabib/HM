#!/usr/bin/env python3
"""Generate a deterministic sample broker trade journal for Shadow Account demos.

Pattern baked in (for the shadow-strategy extraction to find):
- scalper of BTC-USDT only
- entries clustered 07:30-09:30 UTC (morning momentum)
- holds < 6h; winners +0.2..+0.5%, losers cut at -0.15..-0.25%
- 18 winners / 4 losers / 2 breakeven-ish
- one overtrading blemish: two late-night (23:xx) entries that lost big
Columns follow the generic parser: datetime, symbol, name, side,
quantity, price, amount, fee.
"""
import csv
import random
from datetime import datetime, timedelta

random.seed(42)
base = datetime(2026, 7, 6, 7, 30)  # Monday morning
rows: list[list[str]] = []

def rnd_price(p: float, drift: float, spread: float = 0.0002) -> float:
    return round(p * (1 + drift + random.uniform(-spread, spread)), 2)

def add_roundtrip(day: int, buy_hour: int, buy_min: int, hold_h: float, win: float, qty: float = 0.5):
    b = base + timedelta(days=day, hours=buy_hour - 7.5, minutes=buy_min)
    s = b + timedelta(hours=hold_h)
    buy_px = rnd_price(61_500 + day * 90, 0.0)
    sell_px = rnd_price(buy_px, win)
    fee = 0.001
    rows.append([b.strftime("%Y-%m-%d %H:%M:%S"), "BTC-USDT", "Bitcoin",
                 "buy", f"{qty:.2f}", f"{buy_px:.2f}", f"{qty*buy_px:.2f}", f"{fee:.4f}"])
    rows.append([s.strftime("%Y-%m-%d %H:%M:%S"), "BTC-USDT", "Bitcoin",
                 "sell", f"{qty:.2f}", f"{sell_px:.2f}", f"{qty*sell_px:.2f}", f"{fee:.4f}"])

# 3 weeks, Mon-Fri, 2-3 roundtrips/day, mornings
for week in range(3):
    for dow in range(5):
        day = week * 7 + dow
        n = random.choice([2, 2, 3])
        for i in range(n):
            h = random.randint(7, 9)
            m = random.choice([0, 10, 20, 35, 45])
            win = random.choice([0.002, 0.003, 0.004, 0.002, 0.005]) if (week * 5 + dow + i) % 6 else -0.0018
            add_roundtrip(day, h, m, random.uniform(1.0, 5.5), win)
# the blemish: two late-night overtrades on the last Friday
add_roundtrip(14, 23, 10, 2.0, -0.004, qty=1.0)
add_roundtrip(14, 23, 55, 1.5, -0.0035, qty=1.0)

with open("shadow_journal_sample.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["datetime", "symbol", "name", "side", "quantity", "price", "amount", "fee"])
    w.writerows(rows)
print(f"rows={len(rows)} roundtrips={len(rows)//2}")
