# 01 — Robinhood Connector (MCP) Surface

Execution and data come from the **Robinhood MCP connector** (interactively authenticated). We do **not** use `robin_stocks` or the raw Robinhood API — the MCP replaces that layer. A standalone script cannot reach Robinhood; only the agent can call these tools.

## Read tools (safe — no money moves)
| Tool | Use |
|---|---|
| `get_accounts` | List accounts; find `agentic_allowed` + `option_level`. |
| `get_portfolio` | Buying power, cash, value breakdown. |
| `get_equity_positions` | Open equity holdings (live source of truth for live mode). |
| `get_equity_quotes` | Real-time quotes + official prior close. |
| `get_equity_historicals` | OHLCV bars (charting, backtesting). Large pulls auto-save to a file. |
| `get_equity_fundamentals` | PE, market cap, 52wk range, volume averages, dividends. |
| `get_earnings_calendar` / `get_earnings_results` | Earnings dates (blackout filter). |
| `get_realized_pnl` | Post-trade realized P&L buckets. |
| `search` | Resolve names → symbols / instrument ids. |
| `get_scans` / `run_scan` | Saved Robinhood screeners (none saved yet). |

## Trade tools (real money — gated)
| Tool | Notes |
|---|---|
| `review_equity_order` | Simulate; returns quote + pre-trade alerts (buying power, PDT, halts). **Call first.** |
| `place_equity_order` | Places a REAL order. Requires `agentic_allowed=true`. Pass a fresh `ref_id` (UUID) per logical order; resend same on retry. |
| `cancel_equity_order` | Cancel by `order_id` (from `get_equity_orders`). |
| `place_option_order` / `review_option_order` | **Unavailable** — account not options-enrolled. |

## Order workflow (live mode)
1. `review_equity_order` → present cost + alerts → get explicit user confirmation.
2. `place_equity_order` with a UUID `ref_id`.
3. Never skip review unless the user *very explicitly* says to.

## Data-size gotcha
Multi-symbol / multi-year `get_equity_historicals` exceeds the inline token cap and auto-saves to a `tool-results/*.txt` file. Pipeline: pull → `scripts/convert_bars.mjs <raw> <out.json>` → toolkit. This keeps big data out of context.

## Bar schema (from `get_equity_historicals`)
`bars[]`: `begins_at` (UTC, left-edge), `open_price`, `high_price`, `low_price`, `close_price`, `volume`, `session`. The most recent bar's `close_price` is **not** the official settled close — use `get_equity_quotes` for that.
