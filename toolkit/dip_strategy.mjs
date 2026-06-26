// dip_strategy.mjs — "Dip Buyer": buy a sharp short-term pullback, but ONLY inside
// a confirmed uptrend (Larry Connors RSI(2) mean-reversion + trend filter). The
// opposite entry timing from momentum.mjs (which buys breakouts at highs).
//
// Thesis: stocks in uptrends bounce a few days after a panic dip. The 200-day-SMA
// + EMA-stack filter keeps us out of falling knives (don't buy dips in downtrends).
// Like everything here, the rules are pure functions; look-ahead safety is the
// caller's job (only pass data through bar i; fills happen at i+1's open).

import { ema, sma, rsi, atr, rollingHigh } from "./indicators.mjs";

export const DIP_CFG = {
  smaTrend: 200, // long-term uptrend gate
  emaFast: 50,
  emaSlow: 200,
  rsiShort: 2, // Connors RSI(2)
  rsiLong: 14,
  atrPeriod: 14,
  sma5: 5, // bounce exit reference
  rsi2Max: 10, // entry: sharp oversold dip
  ema50TolerancePct: 0.03, // don't buy if >3% below the 50-EMA (breakdown, not a dip)
  // --- exit / sell discipline (from professional-exit research) ---
  atrStopMult: 2.0, // initial protective stop = entry - 2*ATR
  exitRsi2: 65, // sell into strength when the bounce has run
  chandelierLookback: 10, // trailing stop lookback (fast, for 3-5 day bounces)
  chandelierMult: 2.5, // trailing stop = highHigh(10) - 2.5*ATR
  breakevenR: 1.0, // once +1R, never let it go red (stop -> breakeven)
  timeStopBars: 5, // mean reversion works fast or not at all
  noEarningsWithinDays: 3,
};

export function computeDipSignals(bars, cfg = DIP_CFG) {
  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  return {
    close,
    high,
    low,
    sma200: sma(close, cfg.smaTrend),
    ema50: ema(close, cfg.emaFast),
    ema200: ema(close, cfg.emaSlow),
    sma5: sma(close, cfg.sma5),
    rsi2: rsi(close, cfg.rsiShort),
    rsi14: rsi(close, cfg.rsiLong),
    atr14: atr(high, low, close, cfg.atrPeriod),
    chHigh: rollingHigh(high, cfg.chandelierLookback),
  };
}

// evaluateDipExit — the "seller". Pure function shared by the backtester and the
// live MANAGEMENT run. Given the latest bar signals and an open position, decide:
// close (with reason) or hold (with a possibly-raised trailing stop). This encodes
// the professional sell discipline: hard stop, breakeven-after-+1R (anti round-trip),
// Chandelier trail, sell-into-strength bounce exit, trend break, and a time stop.
//
// position: {entry, stop, entryIdx, r_unit, high_water}
// Returns: {action:'close'|'hold', reason, fill, newStop, newHighWater}
//   fill = suggested exit price (for stop = the stop level; else the current close/price).
export function evaluateDipExit(sig, i, position, cfg = DIP_CFG) {
  const price = sig.close[i];
  const atrNow = sig.atr14[i] ?? position.r_unit / cfg.atrStopMult;
  const newHighWater = Math.max(position.high_water ?? position.entry, sig.high[i]);

  // Raise the stop: breakeven once +1R, then Chandelier trail. Never lower it.
  let newStop = position.stop;
  if (price >= position.entry + cfg.breakevenR * position.r_unit) {
    newStop = Math.max(newStop, position.entry); // anti round-trip
  }
  if (sig.chHigh[i] != null) {
    const chandelier = sig.chHigh[i] - cfg.chandelierMult * atrNow;
    if (chandelier > newStop) newStop = chandelier;
  }

  // Exit priority: hard stop, then sell-into-strength, then trend break, then time.
  if (sig.low[i] <= newStop) {
    return { action: "close", reason: newStop > position.entry ? "trail" : "stop", fill: newStop, newStop, newHighWater };
  }
  const bounceDone = (sig.sma5[i] != null && price > sig.sma5[i]) || (sig.rsi2[i] != null && sig.rsi2[i] > cfg.exitRsi2);
  if (bounceDone && i - position.entryIdx >= 1) {
    return { action: "close", reason: "bounce", fill: price, newStop, newHighWater };
  }
  if (sig.sma200[i] != null && price < sig.sma200[i]) {
    return { action: "close", reason: "trend-break", fill: price, newStop, newHighWater };
  }
  if (i - position.entryIdx >= cfg.timeStopBars) {
    return { action: "close", reason: "timeStop", fill: price, newStop, newHighWater };
  }
  return { action: "hold", reason: "hold", fill: price, newStop, newHighWater };
}

export function evaluateDipEntry(sig, i, cfg = DIP_CFG, opts = {}) {
  const { earningsWithinDays = 99 } = opts;
  const defined =
    sig.sma200[i] != null &&
    sig.ema50[i] != null &&
    sig.ema200[i] != null &&
    sig.rsi2[i] != null &&
    sig.atr14[i] != null;
  if (!defined) return { pass: false, reasons: ["insufficient history"] };

  const price = sig.close[i];
  const checks = {};
  const reasons = [];

  // Uptrend gate: long-term up AND the EMA stack is bullish.
  checks.aboveSma200 = price > sig.sma200[i];
  if (!checks.aboveSma200) reasons.push("below 200-day SMA (no uptrend)");
  checks.emaStack = sig.ema50[i] > sig.ema200[i];
  if (!checks.emaStack) reasons.push("50-EMA not above 200-EMA");

  // The dip: sharp short-term oversold.
  checks.dip = sig.rsi2[i] < cfg.rsi2Max;
  if (!checks.dip) reasons.push(`RSI(2) ${sig.rsi2[i].toFixed(0)} not < ${cfg.rsi2Max}`);

  // Falling-knife guard: a dip, not a breakdown far below the 50-EMA.
  checks.notBreakdown = price >= sig.ema50[i] * (1 - cfg.ema50TolerancePct);
  if (!checks.notBreakdown) reasons.push(`>${cfg.ema50TolerancePct * 100}% below 50-EMA (breakdown)`);

  checks.earnings = earningsWithinDays > cfg.noEarningsWithinDays;
  if (!checks.earnings) reasons.push(`earnings within ${earningsWithinDays}d`);

  const pass = Object.values(checks).every(Boolean);
  // Score: deeper dip in a stronger uptrend ranks higher.
  const trendStrength = (price - sig.sma200[i]) / sig.sma200[i];
  const oversold = (cfg.rsi2Max - Math.min(sig.rsi2[i], cfg.rsi2Max)) / cfg.rsi2Max;
  const score = round(oversold * 0.6 + Math.min(Math.max(trendStrength, 0), 0.5) / 0.5 * 0.4, 4);
  return { pass, reasons, checks, score, rsi2: round(sig.rsi2[i], 1) };
}

export function dipStop(sig, i, cfg = DIP_CFG) {
  return sig.close[i] - cfg.atrStopMult * sig.atr14[i];
}

// Look-ahead-safe backtester for the Dip Buyer. Mirrors backtest.mjs but with the
// dip entry/exit rules. Fills at next bar's open; benchmark = buy-and-hold.
export function backtestDip(bars, opts = {}) {
  const cfg = { ...DIP_CFG, ...(opts.cfg || {}) };
  const startEquity = opts.startEquity ?? 200;
  const riskPct = opts.riskPct ?? 1.5;

  const sig = computeDipSignals(bars, cfg);
  let cash = startEquity;
  let pos = null;
  const trades = [];

  for (let i = 0; i < bars.length - 1; i++) {
    const next = bars[i + 1];
    const mark = bars[i].close;

    if (pos) {
      const dec = evaluateDipExit(sig, i, pos, cfg);
      pos.high_water = dec.newHighWater;
      if (dec.action === "close") {
        // Intrabar stop/trail fills at the stop level; signal exits fill at next open.
        const fill = dec.reason === "stop" || dec.reason === "trail" ? dec.fill : next.open;
        cash += pos.shares * fill;
        trades.push({
          symbol: opts.symbol || "?",
          entryDate: bars[pos.entryIdx].date,
          exitDate: next.date,
          entry: round(pos.entry, 4),
          exit: round(fill, 4),
          pnl: round((fill - pos.entry) * pos.shares, 2),
          pnlPct: round((fill / pos.entry - 1) * 100, 2),
          reason: dec.reason,
          bars: i - pos.entryIdx + 1,
        });
        pos = null;
      } else {
        pos.stop = dec.newStop; // trail up
      }
    } else {
      const ev = evaluateDipEntry(sig, i, cfg, { earningsWithinDays: 99 });
      if (ev.pass) {
        const entry = next.open;
        const stop = dipStop(sig, i, cfg);
        if (stop < entry) {
          const rps = entry - stop;
          let shares = (cash * (riskPct / 100)) / rps;
          if (shares * entry > cash) shares = cash / entry; // can't spend more than cash
          if (shares * entry >= 1) {
            cash -= shares * entry;
            pos = { shares, entry, stop, entryIdx: i + 1, r_unit: rps, high_water: entry };
          }
        }
      }
    }
  }

  const lastBar = bars[bars.length - 1];
  if (pos) {
    cash += pos.shares * lastBar.close;
    trades.push({
      symbol: opts.symbol || "?",
      entryDate: bars[pos.entryIdx].date,
      exitDate: lastBar.date,
      entry: round(pos.entry, 4),
      exit: round(lastBar.close, 4),
      pnl: round((lastBar.close - pos.entry) * pos.shares, 2),
      pnlPct: round((lastBar.close / pos.entry - 1) * 100, 2),
      reason: "endOfData",
      bars: bars.length - 1 - pos.entryIdx,
    });
  }

  const wins = trades.filter((t) => t.pnl > 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0));
  const first = bars.find((b) => b.open > 0);
  const bhEnd = round(startEquity * (lastBar.close / first.open), 2);

  return {
    trades,
    stats: {
      trades: trades.length,
      winRate: trades.length ? round((wins.length / trades.length) * 100, 1) : 0,
      profitFactor: grossLoss ? round(grossWin / grossLoss, 2) : grossWin > 0 ? Infinity : 0,
      totalReturnPct: round((cash / startEquity - 1) * 100, 2),
      endEquity: round(cash, 2),
    },
    buyHold: { returnPct: round((lastBar.close / first.open - 1) * 100, 2), endEquity: bhEnd },
  };
}

function round(x, dp = 2) {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
