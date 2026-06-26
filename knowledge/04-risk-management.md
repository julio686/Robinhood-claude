# 04 — Risk Management (the actual edge)

For a small account, risk control — not stock-picking — is what separates survivors from the 90% who blow up. All limits live in `config/risk_limits.yaml` and are enforced in `toolkit/sizing.mjs`.

## Fixed-fractional position sizing
- **Risk ≤ 1.5% of equity per trade** (~$3 on $200). Evidence: traders risking 1–2%/trade survive far longer than those risking 10%+.
- `shares = (equity × risk%) ÷ (entry − stop)`. The dollar risk is fixed; shares are derived, never guessed.
- **Position notional cap: 40% of equity** — no single name dominates the book.
- Stops are **ATR-based** (2.0×ATR), so volatility sets the stop distance, not a round number.

## Portfolio limits
- **Max 3 concurrent positions** ($200 can't meaningfully diversify beyond this).
- **Daily loss limit: 2%** — if down 2% on the day, stop opening new trades (kills revenge-trading).
- **Long-only, no margin, no shorts, no options, no extended hours** (account constraints + discipline).

## Risk-of-ruin intuition
Risking 1.5%/trade, even a 10-loss streak is ~−15% — survivable. Risking 20%/trade, a 5-loss streak is catastrophic. Small, consistent risk keeps you in the game long enough for any edge to show.

## The math of $200 (be honest)
- A +20% month on $200 is +$40. Real, but small in dollars — the point of the paper phase is to prove a *repeatable process*, not to get rich on $200.
- Over-trading is the killer: each rotation risks slippage and a settlement lock; few high-quality trades beat many marginal ones.

## Hard stops the machine will not cross
1. Never size a trade above the per-trade risk or position cap.
2. Never open a 4th concurrent position.
3. Never trade after hitting the daily loss limit.
4. Never place a **live** order without `review_equity_order` + explicit user approval (until/unless unattended live is explicitly enabled).
5. Never trade a name with earnings inside the blackout window.

See [[05-reality-check]] for why these matter and how we measure success.
