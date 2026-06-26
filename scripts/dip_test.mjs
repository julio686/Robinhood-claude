// dip_test.mjs — unit tests for the Dip Buyer entry + sell-discipline exit logic.
// Run: node scripts/dip_test.mjs
import { evaluateDipEntry, evaluateDipExit, DIP_CFG } from "../toolkit/dip_strategy.mjs";

let pass = 0, fail = 0;
const ok = (n, c) => (c ? pass++ : (console.error("  ✗ " + n), fail++));

// Build a minimal single-index signal object for index i=10.
function sigAt(v) {
  const i = 10;
  const arr = (x) => Object.assign(Array(i + 1).fill(null), { [i]: x });
  return {
    close: arr(v.close), high: arr(v.high ?? v.close), low: arr(v.low ?? v.close),
    sma200: arr(v.sma200), ema50: arr(v.ema50), ema200: arr(v.ema200),
    sma5: arr(v.sma5), rsi2: arr(v.rsi2), rsi14: arr(v.rsi14 ?? 50),
    atr14: arr(v.atr14), chHigh: arr(v.chHigh ?? v.high ?? v.close),
  };
}
const I = 10;

console.log("dip entry:");
// Valid dip: uptrend (close>sma200, ema50>ema200), RSI(2)<10, near 50EMA.
{
  const s = sigAt({ close: 100, sma200: 90, ema50: 98, ema200: 92, rsi2: 5, atr14: 2 });
  const ev = evaluateDipEntry(s, I, DIP_CFG, { earningsWithinDays: 99 });
  ok("valid dip passes", ev.pass);
}
// Reject: below 200 SMA (downtrend) even if RSI(2) low.
{
  const s = sigAt({ close: 80, sma200: 90, ema50: 85, ema200: 92, rsi2: 3, atr14: 2 });
  const ev = evaluateDipEntry(s, I, DIP_CFG, { earningsWithinDays: 99 });
  ok("below 200SMA rejected", !ev.pass);
}
// Reject: RSI(2) not oversold.
{
  const s = sigAt({ close: 100, sma200: 90, ema50: 98, ema200: 92, rsi2: 40, atr14: 2 });
  ok("rsi2 not low rejected", !evaluateDipEntry(s, I, DIP_CFG).pass);
}
// Reject: breakdown far below 50EMA.
{
  const s = sigAt({ close: 90, sma200: 85, ema50: 100, ema200: 88, rsi2: 5, atr14: 2 });
  ok("breakdown below 50EMA rejected", !evaluateDipEntry(s, I, DIP_CFG).pass);
}

console.log("dip exit (sell discipline):");
const pos = (o) => ({ entry: 100, stop: 96, entryIdx: I - 1, r_unit: 4, high_water: 100, ...o });

// Hard stop: low pierces stop.
{
  const s = sigAt({ close: 97, high: 98, low: 95.5, sma200: 90, sma5: 99, rsi2: 20, atr14: 2 });
  const d = evaluateDipExit(s, I, pos(), DIP_CFG);
  ok("stop hit closes", d.action === "close" && d.reason === "stop");
}
// Breakeven after +1R: price up >1R -> stop raised to >= entry (anti round-trip).
{
  const s = sigAt({ close: 105, high: 105, low: 104, sma200: 90, sma5: 106, rsi2: 40, atr14: 2, chHigh: 104 });
  const d = evaluateDipExit(s, I, pos(), DIP_CFG);
  ok("breakeven raises stop to >= entry", d.newStop >= 100);
}
// Sell into strength: close > SMA5 -> bounce exit.
{
  const s = sigAt({ close: 103, high: 103, low: 102, sma200: 90, sma5: 101, rsi2: 55, atr14: 2, chHigh: 99 });
  const d = evaluateDipExit(s, I, pos({ entryIdx: I - 2 }), DIP_CFG);
  ok("close above SMA5 -> bounce exit", d.action === "close" && d.reason === "bounce");
}
// Trend break: close < 200SMA -> exit (SMA5 above close so no bounce; low above stop).
{
  const s = sigAt({ close: 89, high: 90, low: 88.5, sma200: 90, sma5: 92, rsi2: 20, atr14: 2, chHigh: 90 });
  const d = evaluateDipExit(s, I, pos({ stop: 80, entryIdx: I - 1 }), DIP_CFG);
  ok("below 200SMA -> trend-break exit", d.action === "close" && d.reason === "trend-break");
}
// Time stop: held >= timeStopBars with no other trigger.
{
  const s = sigAt({ close: 100.5, high: 100.6, low: 100.4, sma200: 90, sma5: 102, rsi2: 30, atr14: 2, chHigh: 96 });
  const d = evaluateDipExit(s, I, pos({ entryIdx: I - DIP_CFG.timeStopBars }), DIP_CFG);
  ok("time stop closes", d.action === "close" && d.reason === "timeStop");
}
// Hold + trail: in profit, no exit trigger -> hold with raised stop.
{
  const s = sigAt({ close: 102, high: 102, low: 101.5, sma200: 90, sma5: 103, rsi2: 30, atr14: 1, chHigh: 102 });
  const d = evaluateDipExit(s, I, pos({ entryIdx: I - 1 }), DIP_CFG);
  ok("profitable hold trails stop up", d.action === "hold" && d.newStop > 96);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
