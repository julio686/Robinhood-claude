# Account Snapshot

_Masked for display; full number lives only in `config/risk_limits.yaml` for tool calls._

## Tradable account (the machine)
- **••••2964** — Individual **cash** account, nickname "Agentic"
- `agentic_allowed`: **true** (only account this agent can trade)
- `option_level`: **none** (equities only)
- **Value: $200** — all cash, no open positions (as of 2026-06-25)
- Buying power: **$200**

## Other accounts (read-only to this agent — cannot trade)
- ••••3848 — Individual **margin**, default, option level 2 — `agentic_allowed: false`
- ••••9504 — **Roth IRA** (cash) — `agentic_allowed: false`

## What this means
- Trade universe: **equities/ETFs only**, long-only, regular-hours, fractional shares.
- Settlement **T+1**; ~1–2 capital rotations/week before good-faith-violation risk.
- To unlock options or trade the margin account, the user must enroll/enable on
  Robinhood's side — not something the agent can change.

_Refresh with `get_portfolio` + `get_equity_positions` at the start of each live session._
