// convert_bars.mjs — transform raw Robinhood MCP get_equity_historicals output
// into the toolkit's bars format: { SYMBOL: [{date,open,high,low,close,volume}], ... }
//
// Usage: node convert_bars.mjs <raw_mcp.json> <out_bars.json>
// Accepts either the full {data:{results:[...]}} envelope or a bare {results:[...]}.

import { readFileSync, writeFileSync } from "node:fs";

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath || !outPath) {
  console.error("usage: node convert_bars.mjs <raw_mcp.json> <out_bars.json>");
  process.exit(2);
}

const raw = JSON.parse(readFileSync(inPath, "utf8"));
const results = raw?.data?.results ?? raw?.results ?? [];
const out = {};

for (const r of results) {
  const sym = r.symbol;
  out[sym] = (r.bars || [])
    .filter((b) => b.session !== "interp" && !b.interpolated)
    .map((b) => ({
      date: String(b.begins_at).slice(0, 10),
      open: Number(b.open_price),
      high: Number(b.high_price),
      low: Number(b.low_price),
      close: Number(b.close_price),
      volume: Number(b.volume),
    }));
}

writeFileSync(outPath, JSON.stringify(out));
const counts = Object.entries(out)
  .map(([s, b]) => `${s}:${b.length}`)
  .join(" ");
console.log(`wrote ${outPath} — ${counts}`);
