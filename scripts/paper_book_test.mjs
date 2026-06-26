// paper_book_test.mjs — deterministic tests for the paper ledger.
// Run: node scripts/paper_book_test.mjs
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "pb-"));
const SELF = new URL("./paper_book.mjs", import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (n, c) => (c ? pass++ : (console.error("  ✗ " + n), fail++));
const run = (args) => JSON.parse(execFileSync("node", [SELF, ...args], { encoding: "utf8" }));
const write = (name, obj) => {
  const p = join(dir, name);
  writeFileSync(p, JSON.stringify(obj));
  return p;
};

console.log("paper_book:");

// init
const state0 = run(["init", "2026-01-02", "200", "600"]);
ok("init equity", state0.cash_usd === 200);
ok("init benchmark anchor", state0.benchmark.start_price === 600 && state0.benchmark.start_equity === 200);

// enter: one passing candidate, entry 20 / stop 19 / 3 shares ($60)
const statePath = write("state.json", state0);
const screenPath = write("screen.json", {
  passing: [{ symbol: "ABC", price: 20, stop: 19, shares: 3, notional: 60, riskUsd: 3, sizeOk: true }],
});
const afterEnter = run(["enter", statePath, screenPath, "2026-01-02"]);
ok("enter opened 1", afterEnter.opened.length === 1 && afterEnter.state.open_positions.length === 1);
ok("enter deducted cash", afterEnter.state.cash_usd === 140);
ok("enter recorded r_unit", afterEnter.state.open_positions[0].r_unit === 1);

// manage A: price rises to 21 -> below +2R target(22), trails stop up to high_water - r_unit = 21-1 = 20
const sA = write("sA.json", afterEnter.state);
const qA = write("qA.json", { ABC: 21, SPY: 660 });
const mgA = run(["manage", sA, qA, "2026-01-05"]);
ok("manage trails stop to 20", mgA.state.open_positions[0].stop === 20);
ok("manage marks equity (140 + 3*21 = 203)", mgA.equity === 203);
ok("manage benchmark (200 * 660/600 = 220)", mgA.benchmark_equity === 220);
ok("manage vs_benchmark negative", mgA.vs_benchmark === round(203 - 220));

// manage B: price hits +2R target (22) -> close at 22, pnl = (22-20)*3 = 6
const sB = write("sB.json", afterEnter.state);
const qB = write("qB.json", { ABC: 22, SPY: 600 });
const mgB = run(["manage", sB, qB, "2026-01-06"]);
ok("manage target closes position", mgB.open_count === 0 && mgB.state.closed_trades.length === 1);
ok("manage target reason", mgB.state.closed_trades[0].reason === "target+2R");
ok("manage realized pnl +6", mgB.realized_pnl === 6);
ok("manage cash back (140 + 3*22 = 206)", mgB.state.cash_usd === 206);

// manage C: price gaps below stop (18 < 19) -> stop out at 19, pnl = (19-20)*3 = -3
const sC = write("sC.json", afterEnter.state);
const qC = write("qC.json", { ABC: 18, SPY: 600 });
const mgC = run(["manage", sC, qC, "2026-01-07"]);
ok("manage stop closes", mgC.open_count === 0 && mgC.state.closed_trades[0].reason === "stop");
ok("manage stop pnl -3", mgC.realized_pnl === -3);

// manage D: time stop after >14 days, price flat at 20 -> close reason timeStop
const sD = write("sD.json", afterEnter.state);
const qD = write("qD.json", { ABC: 20, SPY: 600 });
const mgD = run(["manage", sD, qD, "2026-02-01"]);
ok("manage time-stop closes", mgD.state.closed_trades[0].reason === "timeStop");

console.log(`\n${pass} passed, ${fail} failed`);
function round(x) { return Math.round(x * 100) / 100; }
process.exit(fail ? 1 : 0);
