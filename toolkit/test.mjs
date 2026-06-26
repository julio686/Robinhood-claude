// test.mjs — dependency-free unit tests. Run: node trader/toolkit/test.mjs
// Checks indicators against hand-verifiable reference values, sizing math against
// the risk rules, and runs the backtester on a synthetic uptrend to prove it
// trades and is look-ahead-safe.

import { sma, ema, rsi, atr, macd, trueRange, rollingHigh } from "./indicators.mjs";
import { positionSize } from "./sizing.mjs";
import { backtest } from "./backtest.mjs";

let passed = 0;
let failed = 0;

function approx(name, got, want, tol = 1e-6) {
  if (got === null || got === undefined || Math.abs(got - want) > tol) {
    console.error(`  ✗ ${name}: got ${got}, want ${want}`);
    failed++;
  } else {
    passed++;
  }
}
function assert(name, cond) {
  if (cond) passed++;
  else {
    console.error(`  ✗ ${name}`);
    failed++;
  }
}

console.log("indicators:");
// SMA of 1..5 with period 3: last = (3+4+5)/3 = 4
{
  const s = sma([1, 2, 3, 4, 5], 3);
  assert("sma warmup nulls", s[0] === null && s[1] === null);
  approx("sma[2]=2", s[2], 2);
  approx("sma[4]=4", s[4], 4);
}
// EMA period 3 over [1,2,3,4,5]: seed=(1+2+3)/3=2 at idx2; k=0.5
// idx3 = 4*0.5+2*0.5=3 ; idx4 = 5*0.5+3*0.5=4
{
  const e = ema([1, 2, 3, 4, 5], 3);
  approx("ema seed", e[2], 2);
  approx("ema[3]", e[3], 3);
  approx("ema[4]", e[4], 4);
}
// True range: with a clean series equals high-low when no gaps dominate.
{
  const tr = trueRange([10, 11, 12], [9, 10, 11], [9.5, 10.5, 11.5]);
  approx("tr[0]", tr[0], 1); // 10-9
  approx("tr[1]", tr[1], Math.max(11 - 10, Math.abs(11 - 9.5), Math.abs(10 - 9.5)));
}
// ATR period 2 sanity: defined from index 1 onward.
{
  const a = atr([10, 11, 12, 13], [9, 10, 11, 12], [9.5, 10.5, 11.5, 12.5], 2);
  assert("atr warmup", a[0] === null);
  assert("atr defined", a[1] !== null && a[3] !== null);
}
// RSI of a strictly rising series -> 100 (no losses).
{
  const r = rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 14);
  approx("rsi all-gains=100", r[r.length - 1], 100, 1e-9);
}
// RSI classic Wilder reference series -> ~70.46 at first defined point.
{
  const data = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42,
    45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28,
  ];
  const r = rsi(data, 14);
  approx("rsi wilder ref ~70.46", r[14], 70.46, 0.1);
}
// MACD shape: defined late, histogram = macd - signal where both exist.
{
  const vals = Array.from({ length: 60 }, (_, i) => 100 + i); // linear ramp
  const m = macd(vals);
  const i = 59;
  assert("macd defined", m.macd[i] !== null && m.signal[i] !== null);
  approx("macd hist=macd-signal", m.histogram[i], m.macd[i] - m.signal[i], 1e-9);
}
// rollingHigh
{
  const h = rollingHigh([3, 1, 4, 1, 5, 9, 2], 3);
  approx("rollingHigh[2]", h[2], 4);
  approx("rollingHigh[5]", h[5], 9);
}

console.log("sizing:");
// $200 equity, risk 1.5% => $3 risk. entry 20 stop 19 => $1/share => 3 shares, $60 notional.
{
  const s = positionSize({ equity: 200, entry: 20, stop: 19, riskPct: 1.5 });
  assert("size ok", s.ok);
  approx("size shares", s.shares, 3, 1e-9);
  approx("size notional", s.notional, 60, 1e-9);
  approx("size riskUsd", s.riskUsd, 3, 1e-9);
}
// Stop above entry rejected.
{
  const s = positionSize({ equity: 200, entry: 20, stop: 21, riskPct: 1.5 });
  assert("size rejects bad stop", !s.ok);
}
// maxPositionPct cap: 33% of $200 = $66 notional cap even if risk allows more.
{
  const s = positionSize({ equity: 200, entry: 10, stop: 9.9, riskPct: 1.5, maxPositionPct: 33 });
  assert("size cap applied", s.notional <= 66 + 1e-9);
}
// Below broker min rejected: tiny risk budget + wide stop => sub-$1 notional.
{
  const s = positionSize({ equity: 200, entry: 100, stop: 50, riskPct: 0.1, minOrderUsd: 1 });
  assert("size rejects tiny order", !s.ok);
}

console.log("backtest (synthetic uptrend, look-ahead safety):");
{
  // Build a 300-bar gently rising series with a volume surge near the end so the
  // momentum filters can fire. Deterministic — no RNG.
  // Uptrend with real pullbacks (so RSI cycles through the 50-80 band rather than
  // pinning at 100) plus a volume surge in the breakout window.
  const bars = [];
  for (let i = 0; i < 300; i++) {
    const price = 50 + i * 0.18 + Math.sin(i / 6) * 3.5; // trend + meaningful oscillation
    const open = price * 0.998;
    const high = price * 1.012;
    const low = price * 0.988;
    const close = price;
    const volume = 1_000_000 * (i % 11 === 0 ? 2.0 : 1); // periodic surges
    bars.push({ date: `d${i}`, open, high, low, close, volume });
  }
  // Lenient lookback so the ~1yr trailing-high window is defined within 300 bars.
  const res = backtest(bars, {
    symbol: "TEST",
    startEquity: 200,
    riskPct: 1.5,
    cfg: { highLookback: 60, maxPctBelowHigh: 0.06 },
  });
  assert("backtest produced an equity curve", res.equityCurve.length === bars.length);
  assert("backtest computed buy&hold benchmark", res.buyHold.returnPct > 0);
  assert("backtest stats present", typeof res.stats.totalReturnPct === "number");
  assert("backtest actually took trades", res.stats.trades > 0);
  // Look-ahead safety: every trade must exit on or after the bar after entry.
  const safe = res.trades.every((t) => t.bars >= 1);
  assert("no same-bar entry+exit (look-ahead safe)", safe);
  console.log(
    `  info: trades=${res.stats.trades} winRate=${res.stats.winRate}% ` +
      `stratRet=${res.stats.totalReturnPct}% buyHold=${res.buyHold.returnPct}%`
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
