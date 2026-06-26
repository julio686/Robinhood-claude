// backtest.mjs — a small, look-ahead-safe backtester for the Momentum Hunter.
// Decisions at bar i use ONLY data through bar i; fills happen at bar i+1's open
// (you cannot trade on a close you haven't seen yet). This is the single most
// important guard against the inflated-backtest trap.

import { computeSignals, evaluateEntry, atrStop, DEFAULT_CFG } from "./strategy.mjs";
import { positionSize } from "./sizing.mjs";

/**
 * @param {Array<{date:string,open:number,high:number,low:number,close:number,volume:number}>} bars
 * @param {object} opts
 * @returns {{trades:Array, equityCurve:Array, stats:object, buyHold:object}}
 */
export function backtest(bars, opts = {}) {
  const cfg = { ...DEFAULT_CFG, ...(opts.cfg || {}) };
  const startEquity = opts.startEquity ?? 200;
  const riskPct = opts.riskPct ?? 1.5;
  const atrTrailMult = opts.atrTrailMult ?? cfg.atrStopMult;
  const takeProfitR = opts.takeProfitR ?? 2.0;
  const timeStopBars = opts.timeStopBars ?? 10;

  const sig = computeSignals(bars, cfg);
  let equity = startEquity;
  let cash = startEquity;
  let pos = null; // {shares, entry, stop, entryIdx, rUnit}
  const trades = [];
  const equityCurve = [];

  for (let i = 0; i < bars.length - 1; i++) {
    const next = bars[i + 1]; // fill bar
    const mark = bars[i].close;

    // Mark-to-market equity for the curve.
    equity = cash + (pos ? pos.shares * mark : 0);
    equityCurve.push({ date: bars[i].date, equity: round(equity, 2) });

    if (pos) {
      // --- Manage open position (exit logic evaluated on bar i, executed at next open) ---
      let exit = null;
      if (bars[i].low <= pos.stop) exit = { price: pos.stop, reason: "stop" };
      else if (mark >= pos.entry + takeProfitR * pos.rUnit) exit = { price: next.open, reason: "target" };
      else if (sig.ema50[i] != null && mark < sig.ema50[i]) exit = { price: next.open, reason: "below50EMA" };
      else if (i - pos.entryIdx >= timeStopBars) exit = { price: next.open, reason: "timeStop" };

      // Trail the stop up using ATR (never down).
      if (!exit && sig.atr14[i] != null) {
        const trail = mark - atrTrailMult * sig.atr14[i];
        if (trail > pos.stop) pos.stop = round(trail, 4);
      }

      if (exit) {
        const pnl = (exit.price - pos.entry) * pos.shares;
        cash += pos.shares * exit.price;
        trades.push({
          symbol: opts.symbol || "?",
          entryDate: bars[pos.entryIdx].date,
          exitDate: next.date,
          entry: round(pos.entry, 4),
          exit: round(exit.price, 4),
          shares: round(pos.shares, 6),
          pnl: round(pnl, 2),
          pnlPct: round((exit.price / pos.entry - 1) * 100, 2),
          reason: exit.reason,
          bars: i - pos.entryIdx + 1,
        });
        pos = null;
      }
    } else {
      // --- Look for an entry on bar i; fill at next open ---
      const ev = evaluateEntry(sig, i, cfg, { earningsWithinDays: 99 });
      if (ev.pass) {
        const entry = next.open;
        const stop = atrStop(sig, i, cfg);
        if (stop < entry) {
          const sz = positionSize({
            equity,
            entry,
            stop,
            riskPct,
            minOrderUsd: opts.minOrderUsd ?? 1,
            maxPositionPct: opts.maxPositionPct ?? 100,
          });
          if (sz.ok && sz.notional <= cash) {
            cash -= sz.notional;
            pos = { shares: sz.shares, entry, stop, entryIdx: i + 1, rUnit: entry - stop };
          }
        }
      }
    }
  }

  // Close any open position at the final bar.
  const lastBar = bars[bars.length - 1];
  if (pos) {
    const pnl = (lastBar.close - pos.entry) * pos.shares;
    cash += pos.shares * lastBar.close;
    trades.push({
      symbol: opts.symbol || "?",
      entryDate: bars[pos.entryIdx].date,
      exitDate: lastBar.date,
      entry: round(pos.entry, 4),
      exit: round(lastBar.close, 4),
      shares: round(pos.shares, 6),
      pnl: round(pnl, 2),
      pnlPct: round((lastBar.close / pos.entry - 1) * 100, 2),
      reason: "endOfData",
      bars: bars.length - 1 - pos.entryIdx,
    });
  }
  equity = cash;
  equityCurve.push({ date: lastBar.date, equity: round(equity, 2) });

  return {
    trades,
    equityCurve,
    stats: summarize(trades, startEquity, equity),
    buyHold: buyHoldBenchmark(bars, startEquity),
  };
}

function summarize(trades, startEquity, endEquity) {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? round((wins.length / trades.length) * 100, 1) : 0,
    profitFactor: grossLoss ? round(grossWin / grossLoss, 2) : (grossWin > 0 ? Infinity : 0),
    totalReturnPct: round((endEquity / startEquity - 1) * 100, 2),
    endEquity: round(endEquity, 2),
  };
}

function buyHoldBenchmark(bars, startEquity) {
  // Buy at first bar's open, hold to last close — the bar every strategy must beat.
  const first = bars.find((b) => b.open > 0);
  const entry = first.open;
  const exit = bars[bars.length - 1].close;
  return {
    entry: round(entry, 4),
    exit: round(exit, 4),
    returnPct: round((exit / entry - 1) * 100, 2),
    endEquity: round(startEquity * (exit / entry), 2),
  };
}

function round(x, dp) {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
