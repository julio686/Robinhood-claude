// build_bars.mjs — merge MANY raw Robinhood MCP get_equity_historicals payloads
// (one per symbol, fetched individually to stay under the MCP output cap) into a
// single bars.json the toolkit understands.
//
// Why per-symbol: a single multi-symbol / multi-year get_equity_historicals call
// returns >100K chars and exceeds the MCP tool-output ceiling (~25K tokens). The
// oversized result is truncated/buffered and NOT reliably recoverable in a headless
// cloud run. Fetching ONE symbol of ~18 months (~66K chars) stays under the cap and
// returns inline, so the agent can Write it to a file. This script then merges them.
//
// Usage:
//   node scripts/build_bars.mjs <out_bars.json> <raw1.json> [raw2.json ...]
// Each rawN.json is the raw MCP payload ({data:{results:[...]}} or {results:[...]}),
// typically containing one symbol. Shell globs (e.g. /tmp/raw_*.json) are fine.

import { readFileSync, writeFileSync } from "node:fs";

const [outPath, ...inPaths] = process.argv.slice(2);
if (!outPath || inPaths.length === 0) {
  console.error("usage: node build_bars.mjs <out_bars.json> <raw1.json> [raw2.json ...]");
  process.exit(2);
}

const out = {};
let mergedSymbols = 0;

for (const p of inPaths) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    console.error(`skip ${p}: ${e.message}`);
    continue;
  }
  const results = raw?.data?.results ?? raw?.results ?? [];
  for (const r of results) {
    if (!r?.symbol || !Array.isArray(r.bars)) continue;
    out[r.symbol] = r.bars
      .filter((b) => b.session !== "interp" && !b.interpolated)
      .map((b) => ({
        date: String(b.begins_at).slice(0, 10),
        open: Number(b.open_price),
        high: Number(b.high_price),
        low: Number(b.low_price),
        close: Number(b.close_price),
        volume: Number(b.volume),
      }));
    mergedSymbols++;
  }
}

writeFileSync(outPath, JSON.stringify(out));
const counts = Object.entries(out)
  .map(([s, b]) => `${s}:${b.length}`)
  .join(" ");
console.log(`wrote ${outPath} — ${mergedSymbols} symbol(s): ${counts}`);
