// run_screen.mjs — the bridge between fetched market data and trade decisions.
//
// Usage:
//   node trader/scripts/run_screen.mjs <bars.json> [equity]
//
// <bars.json> is { "SYMBOL": [ {date,open,high,low,close,volume}, ... ], ... }
// produced from the Robinhood MCP get_equity_historicals output. The agent fetches
// the data (only it can call MCP), writes this file, then runs this script.
//
// Output: a ranked table of candidates that PASS all entry filters, each with an
// ATR stop and a risk-sized share count; plus every name's pass/fail reasons.
// Appends a line per decision to journal/decisions.log. Places NO orders.

import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadYaml } from "../toolkit/config.mjs";
import { computeSignals, evaluateEntry, atrStop } from "../toolkit/strategy.mjs";
import { computeDipSignals, evaluateDipEntry, dipStop } from "../toolkit/dip_strategy.mjs";
import { positionSize } from "../toolkit/sizing.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const barsPath = process.argv[2];
if (!barsPath) {
  console.error("usage: node run_screen.mjs <bars.json> [equity] [out.json]");
  process.exit(2);
}
const outJsonPath = process.argv[4]; // optional machine-readable output for paper_book.mjs

const risk = loadYaml(join(ROOT, "config/risk_limits.yaml"));
const strat = loadYaml(join(ROOT, "config/strategy.yaml"));
const equity = Number(process.argv[3] ?? risk.start_equity_usd);

const active = strat.active || "momentum";

// Strategy adapter: each maps YAML -> cfg and exposes signal/entry/stop fns + a
// minimum-bars requirement and a per-candidate detail extractor for the table.
let S;
if (active === "dip") {
  const dp = strat.dip;
  const cfg = {
    smaTrend: dp.sma_trend, emaFast: dp.ema_fast, emaSlow: dp.ema_slow,
    rsiShort: dp.rsi_short, rsiLong: dp.rsi_long, atrPeriod: dp.atr_period, sma5: dp.sma5,
    rsi2Max: dp.entry.rsi2_max, ema50TolerancePct: dp.entry.ema50_tolerance_pct,
    noEarningsWithinDays: dp.entry.no_earnings_within_days,
    atrStopMult: dp.exit.atr_stop_mult, chandelierLookback: dp.exit.chandelier_lookback,
    chandelierMult: dp.exit.chandelier_mult, exitRsi2: dp.exit.exit_rsi2,
    breakevenR: dp.exit.breakeven_r, timeStopBars: dp.exit.time_stop_bars,
  };
  S = {
    cfg, minBars: dp.sma_trend + 5,
    signals: (b) => computeDipSignals(b, cfg),
    entry: (sig, i, ew) => evaluateDipEntry(sig, i, cfg, { earningsWithinDays: ew }),
    stop: (sig, i) => dipStop(sig, i, cfg),
    detail: (sig, i, ev) => ({ rsi2: ev.rsi2, distFromHigh: null, volMult: null, rsi: round(sig.rsi14[i], 1) }),
  };
} else {
  const cfg = {
    trendFastPeriod: strat.indicators.trend_fast_period, trendSlowPeriod: strat.indicators.trend_slow_period,
    rsiPeriod: strat.indicators.rsi_period, atrPeriod: strat.indicators.atr_period,
    highLookback: strat.indicators.high_lookback, volAvgPeriod: strat.indicators.vol_avg_period,
    maxPctBelowHigh: strat.entry.max_pct_below_high, fallingKnifePctBelowHigh: strat.entry.falling_knife_pct_below_high,
    minVolumeMult: strat.entry.min_volume_mult, rsiMin: strat.entry.rsi_min, rsiMax: strat.entry.rsi_max,
    noEarningsWithinDays: strat.entry.no_earnings_within_days, atrStopMult: strat.exit.atr_stop_mult,
  };
  S = {
    cfg, minBars: cfg.trendSlowPeriod + 5,
    signals: (b) => computeSignals(b, cfg),
    entry: (sig, i, ew) => evaluateEntry(sig, i, cfg, { earningsWithinDays: ew }),
    stop: (sig, i) => atrStop(sig, i, cfg),
    detail: (sig, i, ev) => ({ rsi2: null, distFromHigh: ev.distFromHigh, volMult: ev.volMult, rsi: round(sig.rsi14[i], 1) }),
  };
}

const data = JSON.parse(readFileSync(barsPath, "utf8"));
const earnings = data.__earnings || {}; // optional { SYMBOL: daysUntilEarnings }
const stamp = data.__asof || "unstamped";

const passing = [];
const rejected = [];

for (const [symbol, bars] of Object.entries(data)) {
  if (symbol.startsWith("__")) continue;
  if (!Array.isArray(bars) || bars.length < S.minBars) {
    rejected.push({ symbol, reasons: [`insufficient bars (${bars?.length || 0})`] });
    continue;
  }
  const sig = S.signals(bars);
  const i = bars.length - 1; // decide on the latest available bar
  const ev = S.entry(sig, i, earnings[symbol] ?? 99);
  if (!ev.pass) {
    rejected.push({ symbol, reasons: ev.reasons });
    continue;
  }
  const price = sig.close[i];
  const stop = S.stop(sig, i);
  const sz = positionSize({
    equity,
    entry: price,
    stop,
    riskPct: risk.max_risk_per_trade_pct,
    minOrderUsd: risk.min_order_usd,
    maxPositionPct: risk.max_position_pct,
  });
  passing.push({
    symbol,
    score: ev.score,
    price: round(price, 2),
    stop: round(stop, 2),
    ...S.detail(sig, i, ev),
    sizing: sz,
  });
}

passing.sort((a, b) => b.score - a.score);

// --- Present ---
const title = active === "dip" ? "Dip Buyer" : "Momentum Hunter";
console.log(`\n${title} screen — as of ${stamp} — equity $${equity} — mode: ${risk.mode}`);
console.log(`Universe: ${Object.keys(data).filter((k) => !k.startsWith("__")).length} symbols | Passing: ${passing.length}\n`);

if (passing.length) {
  console.log("RANKED CANDIDATES (passed all filters):");
  const sigCol = active === "dip" ? "RSI2" : "%offHi/vol×";
  console.log(`  rank  symbol  score  price    stop    ${sigCol.padEnd(11)}  shares    notional  riskUsd  size?`);
  passing.forEach((c, n) => {
    const s = c.sizing;
    const sigStr =
      active === "dip"
        ? String(c.rsi2).padEnd(11)
        : `${(c.distFromHigh * 100).toFixed(1)}% ${c.volMult}x`.padEnd(11);
    console.log(
      `  ${String(n + 1).padEnd(4)}  ${c.symbol.padEnd(6)}  ${String(c.score).padEnd(5)}  ` +
        `${String(c.price).padEnd(7)}  ${String(c.stop).padEnd(6)}  ${sigStr}  ` +
        `${s.ok ? String(s.shares).padEnd(8) : "-".padEnd(8)}  ${s.ok ? ("$" + s.notional).padEnd(8) : "-".padEnd(8)}  ` +
        `${s.ok ? ("$" + s.riskUsd).padEnd(7) : "-".padEnd(7)}  ${s.ok ? "yes" : "NO:" + s.reason}`
    );
  });
} else {
  console.log("No candidates passed the filters. Sitting in cash is a position — and often the right one.");
}

console.log(`\nRejected (${rejected.length}): ` + rejected.map((r) => `${r.symbol}(${r.reasons[0]})`).join(", "));

// --- Log decisions ---
const logPath = join(ROOT, "journal/decisions.log");
const top = passing.map((c) => `${c.symbol}:${c.score}`).join(",") || "none";
appendFileSync(
  logPath,
  `${new Date().toISOString()} | asof=${stamp} | mode=${risk.mode} | equity=${equity} | ` +
    `passing=${passing.length} [${top}] | rejected=${rejected.length}\n`
);
console.log(`\nLogged to journal/decisions.log`);

// --- Machine-readable output (for paper_book.mjs) ---
if (outJsonPath) {
  const payload = {
    asof: stamp,
    equity,
    passing: passing.map((c) => ({
      symbol: c.symbol,
      score: c.score,
      price: c.price,
      stop: c.stop,
      strategy: active,
      rsi2: c.rsi2,
      distFromHigh: c.distFromHigh,
      volMult: c.volMult,
      rsi: c.rsi,
      shares: c.sizing.ok ? c.sizing.shares : null,
      notional: c.sizing.ok ? c.sizing.notional : null,
      riskUsd: c.sizing.ok ? c.sizing.riskUsd : null,
      sizeOk: c.sizing.ok,
      sizeReason: c.sizing.ok ? null : c.sizing.reason,
    })),
    rejected: rejected.map((r) => ({ symbol: r.symbol, reason: r.reasons[0] })),
  };
  writeFileSync(outJsonPath, JSON.stringify(payload, null, 2));
  console.log(`Wrote machine-readable screen to ${outJsonPath}`);
}

function round(x, dp) {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
