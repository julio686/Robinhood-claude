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

import { readFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadYaml } from "../toolkit/config.mjs";
import { computeSignals, evaluateEntry, atrStop } from "../toolkit/strategy.mjs";
import { positionSize } from "../toolkit/sizing.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const barsPath = process.argv[2];
if (!barsPath) {
  console.error("usage: node run_screen.mjs <bars.json> [equity]");
  process.exit(2);
}

const risk = loadYaml(join(ROOT, "config/risk_limits.yaml"));
const strat = loadYaml(join(ROOT, "config/strategy.yaml"));
const equity = Number(process.argv[3] ?? risk.start_equity_usd);

// Map YAML strategy params -> the cfg shape used by the toolkit.
const cfg = {
  trendFastPeriod: strat.indicators.trend_fast_period,
  trendSlowPeriod: strat.indicators.trend_slow_period,
  rsiPeriod: strat.indicators.rsi_period,
  atrPeriod: strat.indicators.atr_period,
  highLookback: strat.indicators.high_lookback,
  volAvgPeriod: strat.indicators.vol_avg_period,
  maxPctBelowHigh: strat.entry.max_pct_below_high,
  fallingKnifePctBelowHigh: strat.entry.falling_knife_pct_below_high,
  minVolumeMult: strat.entry.min_volume_mult,
  rsiMin: strat.entry.rsi_min,
  rsiMax: strat.entry.rsi_max,
  noEarningsWithinDays: strat.entry.no_earnings_within_days,
  atrStopMult: strat.exit.atr_stop_mult,
};

const data = JSON.parse(readFileSync(barsPath, "utf8"));
const earnings = data.__earnings || {}; // optional { SYMBOL: daysUntilEarnings }
const stamp = data.__asof || "unstamped";

const passing = [];
const rejected = [];

for (const [symbol, bars] of Object.entries(data)) {
  if (symbol.startsWith("__")) continue;
  if (!Array.isArray(bars) || bars.length < cfg.trendSlowPeriod + 5) {
    rejected.push({ symbol, reasons: [`insufficient bars (${bars?.length || 0})`] });
    continue;
  }
  const sig = computeSignals(bars, cfg);
  const i = bars.length - 1; // decide on the latest available bar
  const ev = evaluateEntry(sig, i, cfg, { earningsWithinDays: earnings[symbol] ?? 99 });
  if (!ev.pass) {
    rejected.push({ symbol, reasons: ev.reasons });
    continue;
  }
  const price = sig.close[i];
  const stop = atrStop(sig, i, cfg);
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
    distFromHigh: ev.distFromHigh,
    volMult: ev.volMult,
    rsi: round(sig.rsi14[i], 1),
    sizing: sz,
  });
}

passing.sort((a, b) => b.score - a.score);

// --- Present ---
console.log(`\nMomentum Hunter screen — as of ${stamp} — equity $${equity} — mode: ${risk.mode}`);
console.log(`Universe: ${Object.keys(data).filter((k) => !k.startsWith("__")).length} symbols | Passing: ${passing.length}\n`);

if (passing.length) {
  console.log("RANKED CANDIDATES (passed all filters):");
  console.log("  rank  symbol  score  price    stop    %offHigh  vol×   rsi   shares    notional  riskUsd  size?");
  passing.forEach((c, n) => {
    const s = c.sizing;
    console.log(
      `  ${String(n + 1).padEnd(4)}  ${c.symbol.padEnd(6)}  ${String(c.score).padEnd(5)}  ` +
        `${String(c.price).padEnd(7)}  ${String(c.stop).padEnd(6)}  ${(c.distFromHigh * 100).toFixed(1).padStart(6)}%  ` +
        `${String(c.volMult).padEnd(4)}  ${String(c.rsi).padEnd(4)}  ` +
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

function round(x, dp) {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
