// paper_book.mjs — deterministic paper-trading ledger. The cloud routines fetch
// data and call this; ALL state mutation lives here (tested), not in agent prose.
//
// State JSON shape (stored in Google Drive as robinhood_paper_journal.json):
// {
//   schema, mode, started, cash_usd,
//   open_positions: [{symbol, shares, entry, stop, r_unit, opened_date, high_water}],
//   closed_trades:  [{symbol, shares, entry, exit, opened_date, closed_date, pnl_usd, pnl_pct, reason}],
//   benchmark: {symbol, start_price, start_date, start_equity},
//   history: [{date, equity}],
//   last_run
// }
//
// Subcommands:
//   init   <asofDate> <startEquity> <spyPrice>
//   enter  <state.json> <screen.json> <asofDate>            (opens positions from passing screen)
//   manage <state.json> <quotes.json> <asofDate> [spyPrice] (stops/targets/trails/time-stop + mark)
//
// quotes.json for manage: { "SYMBOL": <currentPrice>, ... }  (plus optional "SPY").
// Exits use the ATR implied by entry's r_unit (stop = entry - 2*ATR => ATR = r_unit/2),
// so the trailing stop needs no bar history at management time.

import { readFileSync, writeFileSync } from "node:fs";

const TAKE_PROFIT_R = 2.0; // exit at +2R
const TIME_STOP_DAYS = 14; // ~10 trading days in calendar terms
const MAX_POSITIONS_DEFAULT = 3;

const argv = process.argv.slice(2);
// Optional "--out <path>" writes the resulting state JSON to a file (for the routines).
let outStatePath = null;
const outIdx = argv.indexOf("--out");
if (outIdx !== -1) {
  outStatePath = argv[outIdx + 1];
  argv.splice(outIdx, 2);
}
const [cmd, ...rest] = argv;
const saveState = (state) => {
  if (outStatePath) writeFileSync(outStatePath, JSON.stringify(state, null, 2));
};

function round(x, dp = 2) {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
function equityOf(state, prices = {}) {
  let v = state.cash_usd;
  for (const p of state.open_positions) {
    const px = prices[p.symbol] ?? p.entry;
    v += p.shares * px;
  }
  return round(v, 2);
}
function benchmarkEquity(state, spyPrice) {
  if (!state.benchmark || !spyPrice) return null;
  return round(state.benchmark.start_equity * (spyPrice / state.benchmark.start_price), 2);
}

if (cmd === "init") {
  const [asof, startEquity, spyPrice] = rest;
  const eq = Number(startEquity);
  const state = {
    schema: 1,
    mode: "paper",
    started: asof,
    cash_usd: eq,
    open_positions: [],
    closed_trades: [],
    benchmark: spyPrice
      ? { symbol: "SPY", start_price: Number(spyPrice), start_date: asof, start_equity: eq }
      : null,
    history: [{ date: asof, equity: eq }],
    last_run: asof,
  };
  console.log(JSON.stringify(state, null, 2));
  process.exit(0);
}

if (cmd === "enter") {
  const [statePath, screenPath, asof] = rest;
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const screen = JSON.parse(readFileSync(screenPath, "utf8"));
  const maxPos = MAX_POSITIONS_DEFAULT;
  const opened = [];
  const held = new Set(state.open_positions.map((p) => p.symbol));

  for (const c of screen.passing || []) {
    if (state.open_positions.length >= maxPos) break;
    if (!c.sizeOk || held.has(c.symbol)) continue;
    if (c.notional > state.cash_usd) continue;
    const pos = {
      symbol: c.symbol,
      shares: c.shares,
      entry: c.price,
      stop: c.stop,
      r_unit: round(c.price - c.stop, 4),
      opened_date: asof,
      high_water: c.price,
    };
    state.open_positions.push(pos);
    state.cash_usd = round(state.cash_usd - c.notional, 2);
    held.add(c.symbol);
    opened.push({ symbol: pos.symbol, shares: pos.shares, entry: pos.entry, stop: pos.stop, cost: c.notional });
  }
  state.last_run = asof;
  saveState(state);
  console.log(JSON.stringify({ state, opened, equity: equityOf(state) }, null, 2));
  process.exit(0);
}

if (cmd === "manage") {
  const [statePath, quotesPath, asof, spyPriceArg] = rest;
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const quotes = JSON.parse(readFileSync(quotesPath, "utf8"));
  const spyPrice = spyPriceArg ? Number(spyPriceArg) : quotes.SPY;
  const actions = [];
  const stillOpen = [];

  for (const p of state.open_positions) {
    const px = quotes[p.symbol];
    if (px == null) {
      stillOpen.push(p); // no quote -> leave untouched
      actions.push({ symbol: p.symbol, action: "hold", note: "no quote available" });
      continue;
    }
    p.high_water = Math.max(p.high_water ?? p.entry, px);

    let exit = null;
    if (px <= p.stop) exit = { price: p.stop, reason: "stop" };
    else if (px >= p.entry + TAKE_PROFIT_R * p.r_unit) exit = { price: px, reason: "target+2R" };
    else if (daysBetween(p.opened_date, asof) >= TIME_STOP_DAYS) exit = { price: px, reason: "timeStop" };

    if (exit) {
      const pnl = round((exit.price - p.entry) * p.shares, 2);
      state.cash_usd = round(state.cash_usd + p.shares * exit.price, 2);
      state.closed_trades.push({
        symbol: p.symbol,
        shares: p.shares,
        entry: p.entry,
        exit: round(exit.price, 4),
        opened_date: p.opened_date,
        closed_date: asof,
        pnl_usd: pnl,
        pnl_pct: round((exit.price / p.entry - 1) * 100, 2),
        reason: exit.reason,
      });
      actions.push({ symbol: p.symbol, action: "close", reason: exit.reason, price: round(exit.price, 4), pnl_usd: pnl });
    } else {
      // Trail the stop up using the entry-implied ATR (r_unit = 2*ATR).
      const trail = round(p.high_water - p.r_unit, 4);
      if (trail > p.stop) {
        actions.push({ symbol: p.symbol, action: "trail", from: p.stop, to: trail });
        p.stop = trail;
      } else {
        actions.push({ symbol: p.symbol, action: "hold", price: round(px, 4), stop: p.stop });
      }
      stillOpen.push(p);
    }
  }
  state.open_positions = stillOpen;

  const equity = equityOf(state, quotes);
  state.history = state.history || [];
  state.history.push({ date: asof, equity });
  state.last_run = asof;

  const benchEq = benchmarkEquity(state, spyPrice);
  const out = {
    state,
    actions,
    equity,
    benchmark_equity: benchEq,
    vs_benchmark: benchEq ? round(equity - benchEq, 2) : null,
    realized_pnl: round(state.closed_trades.reduce((s, t) => s + t.pnl_usd, 0), 2),
    open_count: state.open_positions.length,
  };
  saveState(state);
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

console.error("usage: node paper_book.mjs <init|enter|manage> ...");
process.exit(2);
