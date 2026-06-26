# 03 — Strategy Playbook: "Momentum Hunter"

Hunt the technical **fingerprint** explosive names share *before* a run. This reads the **present** (trend, breakout, volume, momentum) — it does **not** forecast the future. Parameters live in `config/strategy.yaml`; logic in `toolkit/strategy.mjs`.

## The thesis
Stocks that go on large runs tend to first: make new highs, hold an uptrend, and attract volume. We screen for that state and rank by strength. Most names that look like this still *don't* run — so risk management (doc 04) is what makes the edge survivable.

## Entry — ALL must be true
1. **Breakout zone:** price within **5%** of its ~1-year trailing high.
2. **Uptrend stack:** price > 50-day EMA **and** 50-day EMA > 200-day EMA.
3. **Volume surge:** today's volume ≥ **1.5×** the 20-day average (institutional accumulation).
4. **Momentum band:** RSI(14) between **50 and 80** — strong, not blow-off/exhausted.
5. **Falling-knife filter:** reject names far below their high (the "PLTR-at-52wk-low" screen-out).
6. **Earnings blackout:** no earnings within **3 days** (gap risk).

## Ranking
Composite score = relative strength (50%) + volume conviction (30%) + trend separation (20%). Trade the **top-ranked** passing names, up to the position cap.

## Sizing (see doc 04)
Risk 1.5% of equity; stop = entry − 2.0×ATR(14); shares = risk$ ÷ (entry − stop). Fractional OK.

## Exits
- **Scale 50% at +2R** (lock in once the trade pays 2× the risk).
- **Trail** the stop up by 2.0×ATR on the runner (let winners run — the entire point of momentum).
- **Hard exit** on a close back below the 50-day EMA.
- **Time stop** after ~10 sessions if it hasn't worked.

## Known weakness (measured, not theoretical)
Backtest on NVDA (2024–2026, $200): **strategy −2.6% vs buy-and-hold +75%.** Whipsaw stops repeatedly cut positions right before continuation. Lessons baked into the process:
- Momentum systems **underperform buy-and-hold in strong, choppy single names** — holding would have won.
- The strategy must be **judged against the SPY/underlying buy-and-hold benchmark every review** (doc 05). If it can't beat holding, it isn't adding value and we change or stop.
- This is *why* we paper-trade first.

## The "moonshot" sleeve (off by default)
At most 1 speculative small-cap (e.g. IONQ-type), capped at 10% of equity, sized so a total wipeout costs ≤ the normal per-trade risk. Explicitly a lottery ticket.
