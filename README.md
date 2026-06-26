# Trader — a disciplined, paper-first equity momentum machine

A risk-controlled, fully-logged trading system for Robinhood account ••••2964
($200, cash, equities-only), driven by the agent calling the Robinhood MCP connector.

> **Honest disclaimer.** This is **not** a money-making machine and **not** a forecast
> engine. 90%+ of active retail traders lose money after costs; a real backtest here
> showed the strategy losing −2.6% while buy-and-hold NVDA made +75%. The value is
> *process*: discipline, risk control, honest measurement against buy-and-hold. We
> **paper-trade first** and risk real money only if the paper record earns it. See
> [knowledge/05-reality-check.md](knowledge/05-reality-check.md).

## Layout
```
trader/
  knowledge/   # what we learned: connector, account rules, strategy, risk, reality
  config/      # risk_limits.yaml (hard guardrails) · strategy.yaml · watchlist.yaml
  toolkit/     # zero-dep JS: indicators, sizing, strategy, backtest, config loader, tests
  scripts/     # run_screen.mjs (loop runner) · convert_bars.mjs (MCP data -> bars)
  journal/     # paper_trades.csv · positions.json · decisions.log (the audit trail)
```

## Runtime
Pure Node (v20, bundled under `.local/runtimes`), zero npm dependencies. Load PATH with
`. .local/env.sh` from the workspace root (`/config/workspace`).

## How the loop runs (paper mode)
1. **Agent fetches** quotes / fundamentals / historicals via the Robinhood MCP tools.
2. Large bar pulls auto-save to a file → `node scripts/convert_bars.mjs <raw> bars.json`.
3. **Screen + size:** `node scripts/run_screen.mjs bars.json [equity]` → ranked candidates,
   ATR stops, risk-sized shares; appends to `journal/decisions.log`.
4. **Record (paper):** agent writes proposed/closed trades to `journal/paper_trades.csv`
   and updates `journal/positions.json`. **No real orders are placed in paper mode.**
5. **Review:** running win rate / profit factor vs the buy-and-hold benchmark.

## Cadence (evidence-based — see plan)
- **9:50 AM ET** — primary ENTRY run (after the opening whipsaw settles).
- **3:30 PM ET** — power-hour MANAGEMENT run (stops/targets/trails; next-day read).
- No runs during 9:30–9:45 (chaos) or 11:30–2:00 (midday lull). Tue–Thu cleanest.

## Going live (gated)
Flip `config/risk_limits.yaml: mode: live` **only** after the paper record beats buy-and-hold
and the user signs off. Every live order goes through `review_equity_order` + explicit
approval before `place_equity_order`.

## Verify
```
. .local/env.sh
node toolkit/test.mjs          # 28 unit tests (indicators, sizing, look-ahead safety)
```
