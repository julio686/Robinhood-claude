# 02 — Account Rules & Mechanics (the structural walls)

Account in use: **••••2964** — individual **cash** account, **$200**, equities only, `agentic_allowed=true`, no options enrollment. These rules shape everything the machine can do.

## Settlement: T+1 (since 2024-05-28)
- Sell proceeds settle the **next business day**; only then are they reusable in a cash account.
- **Good-Faith Violation (GFV):** selling a security bought with *unsettled* funds before settlement. **3 GFVs in 12 months → 90-day restriction** (settled-cash-only).
- **Free-riding:** selling before ever paying for the buy → **1 violation → 90-day restriction**.
- **Practical ceiling: ~1–2 capital rotations per week.** This is structurally a swing/position account, not a day-trading account. The machine must wait for settlement before recycling proceeds.

## Pattern Day Trader (PDT)
- Does **not** apply to cash accounts (never did). No $25k constraint here. The limiter is settlement, not PDT.

## Fractional shares (essential at $200)
- Dollar-based or fractional share orders; **$1 minimum**, down to 0.000001 shares.
- **Regular hours only**; market/limit. Not available in extended/overnight sessions.
- Eligible: NMS-listed, price > $1, market cap > $25M.

## Fees (2026)
- **$0 commission** on stocks/ETFs.
- SEC fee on **sells only**, **waived ≤ $500** notional (so effectively waived here).
- TAF on sells **> 50 shares**, waived below (effectively waived here).
- Robinhood Gold ($5/mo): **not worth it** on $200.

## Extended / 24-hour market
- Whole-share limit orders only; **no fractionals** → not usable for this account. Avoid.

## Implications for the machine
- Long-only, regular-hours, fractional, equities.
- Budget for settlement: don't plan same-day re-entries with sale proceeds.
- Keep position count low (max 3) — $200 / 3 ≈ $66 per position is already the practical floor for meaningful sizing.

_Sources: Robinhood Help (T+1, fractional, fees), FINRA/SEC, Fidelity/Schwab/E*TRADE cash-account guides — see plan research._
