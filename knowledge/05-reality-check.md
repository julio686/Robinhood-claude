# 05 — Reality Check (read this when tempted)

The single most honest sentence: **decades of research across multiple markets show 90%+ of active retail traders lose money after costs; the highest-probability way to grow money in stocks is buy-and-hold indexing, and beating that benchmark is something <1% of retail traders do.**

## The evidence
- **Barber & Odean (US brokerage data):** <1% of active retail traders earn predictable positive returns net of fees.
- **Brazil (2013–2015):** 97% of persistent day traders lost money; ~1% earned above minimum wage. No evidence of learning — longer persistence, larger losses.
- **Taiwan:** >80% of day traders lost money *before* costs.
- Our own NVDA backtest: momentum strategy **−2.6% vs buy-and-hold +75%** over 2 years. Holding won, decisively.

## Why backtests lie (guard against each)
- **Overfitting:** tuning rules to past noise. We keep parameters few and simple.
- **Look-ahead bias:** using data you wouldn't have had. The backtester fills at the *next* bar's open and pads indicators with `null` warm-ups.
- **Survivorship bias:** the "next NVDA" is obvious only in hindsight; thousands of look-alikes died.
- **Ignoring costs/slippage:** a 51% win-rate system can still lose after costs.
- **Regime change:** what worked 2019–2021 fails in a new regime. Forward-test, don't trust in-sample.

## How we measure success (non-negotiable)
1. **Benchmark every review against buy-and-hold** (SPY, and the underlying for single names). If the strategy doesn't beat holding over rolling windows after costs, it isn't adding value.
2. **Paper-trade first**, log every decision with rationale, for a meaningful sample (target ~30+ sessions / 40+ trades) before risking a dollar.
3. **Track win rate and profit factor** (target profit factor > 1.5); a few trades prove nothing.
4. **Go live only if the paper record earns it**, and even then start tiny.

## The honest contract with the user
This system is a **disciplined, risk-controlled, fully-logged process** — not a money printer and not a forecast engine. Its real value is keeping you out of falling knives, sizing so you survive losing streaks, and telling you the truth (including "holding would have beaten this"). The goal of $200→$2,000 is a high-variance moonshot whose most likely outcome is loss; we pursue any aggression only with eyes open and capital we can lose.
