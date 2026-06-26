// strategy.mjs — the "Momentum Hunter" rules, expressed as pure functions over
// precomputed indicator series. Look-ahead safety is the caller's job: only ever
// pass data up to and including the decision bar (index `i`), never future bars.

import { ema, rsi, atr, rollingHigh } from "./indicators.mjs";

/**
 * Compute the full indicator set the strategy needs from OHLCV arrays.
 * Returns aligned series so the backtester can index any bar `i`.
 */
export function computeSignals(bars, cfg = DEFAULT_CFG) {
  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const volume = bars.map((b) => b.volume);
  return {
    close,
    high,
    low,
    volume,
    ema50: ema(close, cfg.trendFastPeriod),
    ema200: ema(close, cfg.trendSlowPeriod),
    rsi14: rsi(close, cfg.rsiPeriod),
    atr14: atr(high, low, close, cfg.atrPeriod),
    high52: rollingHigh(high, cfg.highLookback), // trailing N-bar high (proxy for 52wk on daily)
    volAvg20: sma20(volume, cfg.volAvgPeriod),
  };
}

function sma20(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Evaluate the entry filters at bar `i`. Returns {pass, score, checks, reasons}.
 * Every filter is reported (pass/fail) so the decision log can show WHY.
 */
export function evaluateEntry(sig, i, cfg = DEFAULT_CFG, opts = {}) {
  const { earningsWithinDays = 99 } = opts; // caller supplies from earnings calendar
  const price = sig.close[i];
  const checks = {};
  const reasons = [];

  // Warm-up guard: refuse to trade until every series is defined.
  const defined =
    sig.ema50[i] != null &&
    sig.ema200[i] != null &&
    sig.rsi14[i] != null &&
    sig.atr14[i] != null &&
    sig.high52[i] != null &&
    sig.volAvg20[i] != null;
  if (!defined) return { pass: false, score: 0, checks: { warmup: false }, reasons: ["insufficient history"] };

  // 1. Within breakout zone of the trailing high.
  const distFromHigh = (sig.high52[i] - price) / sig.high52[i];
  checks.nearHigh = distFromHigh <= cfg.maxPctBelowHigh;
  if (!checks.nearHigh) reasons.push(`${(distFromHigh * 100).toFixed(1)}% below high (>${cfg.maxPctBelowHigh * 100}%)`);

  // 2. Uptrend stack: price > 50EMA > 200EMA.
  checks.uptrend = price > sig.ema50[i] && sig.ema50[i] > sig.ema200[i];
  if (!checks.uptrend) reasons.push("not in uptrend stack (price>50EMA>200EMA)");

  // 3. Volume surge vs 20-day average.
  const volMult = sig.volume[i] / sig.volAvg20[i];
  checks.volume = volMult >= cfg.minVolumeMult;
  if (!checks.volume) reasons.push(`volume ${volMult.toFixed(2)}x avg (<${cfg.minVolumeMult}x)`);

  // 4. RSI strong but not blow-off.
  checks.rsi = sig.rsi14[i] >= cfg.rsiMin && sig.rsi14[i] <= cfg.rsiMax;
  if (!checks.rsi) reasons.push(`RSI ${sig.rsi14[i].toFixed(0)} outside ${cfg.rsiMin}-${cfg.rsiMax}`);

  // 5. Falling-knife filter: reject anything at/near its trailing low.
  checks.notNewLow = distFromHigh < cfg.fallingKnifePctBelowHigh;
  if (!checks.notNewLow) reasons.push("too far below high (falling knife)");

  // 6. Earnings blackout.
  checks.earnings = earningsWithinDays > cfg.noEarningsWithinDays;
  if (!checks.earnings) reasons.push(`earnings within ${earningsWithinDays}d`);

  const pass = Object.values(checks).every(Boolean);

  // Ranking score (only meaningful for passing names): reward relative strength,
  // volume conviction, and trend separation.
  const rsScore = 1 - distFromHigh; // closer to high = stronger
  const trendScore = (price - sig.ema200[i]) / sig.ema200[i]; // distance above long trend
  const score = round(rsScore * 0.5 + Math.min(volMult / 3, 1) * 0.3 + Math.min(trendScore, 1) * 0.2, 4);

  return { pass, score, checks, reasons, distFromHigh: round(distFromHigh, 4), volMult: round(volMult, 2) };
}

/** Stop price from ATR at bar i. */
export function atrStop(sig, i, cfg = DEFAULT_CFG) {
  return sig.close[i] - cfg.atrStopMult * sig.atr14[i];
}

function round(x, dp) {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

// Defaults mirror trader/config/strategy.yaml. The YAML is the source of truth for
// the live loop; these defaults keep the toolkit runnable/testable standalone.
export const DEFAULT_CFG = {
  trendFastPeriod: 50,
  trendSlowPeriod: 200,
  rsiPeriod: 14,
  atrPeriod: 14,
  highLookback: 252, // ~1 trading year
  volAvgPeriod: 20,
  maxPctBelowHigh: 0.05,
  fallingKnifePctBelowHigh: 0.5,
  minVolumeMult: 1.5,
  rsiMin: 50,
  rsiMax: 80,
  noEarningsWithinDays: 3,
  atrStopMult: 2.0,
};
