# CLAUDE.md — Operating Rules (READ FIRST, OBEY EXACTLY)

**This is a real-money-adjacent financial system. Precision over speed. No improvisation.**
Before doing ANYTHING, complete Step 1. These rules override any instinct to be helpful,
fast, or clever. When a rule and a task conflict, the rule wins — stop and report.

## STEP 1 — Orient before acting (mandatory, every run)
1. Read this entire file.
2. Read `README.md` and ALL of `knowledge/` (01–05): connector, account rules, strategy
   playbook, risk management, reality-check.
3. Read `config/strategy.yaml` (note `active:`), `config/risk_limits.yaml`, `config/watchlist.yaml`.
4. Only then execute the run's task, step by step, in order. Do not skip or reorder steps.

## ANTI-HALLUCINATION — the cardinal rules
- **NEVER invent data.** Every price, quote, RSI, ATR, fundamental, earnings date, fill, or
  P&L number MUST come from a tool call (Robinhood MCP) or a script you actually ran. If you
  did not get it from a tool/script in THIS run, you do not know it — do not state it.
- **NEVER hand-compute signals or trades.** All indicator math, screening, sizing, entries,
  and exits are done by the tested scripts (`toolkit/*`, `scripts/*`). You fetch data and RUN
  the scripts. You do not eyeball charts, estimate RSI, or decide trades yourself.
- **NEVER guess to fill a gap.** If a tool fails, returns nothing, or data is missing: STOP that
  branch and report the failure plainly. Do not approximate, do not substitute, do not proceed
  as if it worked. A missing number is reported as missing — never fabricated.
- **Quote real outputs only.** Numbers in your email/report must be copied from actual script
  output or tool responses. If you cannot point to where a number came from, omit it.

## DETERMINISM — the code is the source of truth
- The strategy is defined ENTIRELY by `config/*.yaml` + `toolkit/strategy.mjs` /
  `toolkit/dip_strategy.mjs` + `scripts/run_screen.mjs` + `scripts/paper_book.mjs`.
- Run `node toolkit/test.mjs` as a sanity check FIRST. If it does not end with `0 failed`,
  STOP and report a BUILD ERROR. Do not continue on a broken toolkit.
- Use the scripts' output verbatim. Do not override, "correct," or second-guess their
  decisions. If a script says 0 candidates, the answer is 0 — buying nothing is valid.
- Do not invent new parameters, thresholds, or strategies inline. Changes happen in config +
  code + tests, not in a run.

## HARD PROHIBITIONS (never, under any circumstance)
- **NEVER place, review, modify, or cancel a REAL order.** No `place_equity_order`,
  `review_equity_order`, `place_option_order`, or `cancel_*`. This system is PAPER-only here;
  it simulates via `paper_book.mjs`. Real-money trading is a separate, human-gated decision.
- **NEVER** trade outside account `857202964`, use margin, short, options, or extended hours.
- **NEVER** exceed the risk limits in `config/risk_limits.yaml` (max 3 positions, 1.5%/trade,
  daily loss limit). The scripts enforce these; do not work around them.

## DATA HANDLING
- `get_equity_historicals`: fetch ONE symbol at a time. Multi-symbol calls exceed the MCP
  output cap (~25K tokens) and silently lose data. Write each raw payload to a file, then merge
  with `scripts/build_bars.mjs`.
- State lives in Google Drive (`robinhood_paper_journal.json`). Always load the file with the
  MOST RECENT `createdTime`. Save the EXACT bytes the script produced — never edit state by hand.

## REPORTING — honesty is non-negotiable
- Report what actually happened, including failures, skipped steps, and missing data.
- Never claim a success, a position, a price, or a fill that did not come from a tool/script.
- If the run could not complete a step, say so explicitly and what you did instead (usually:
  stopped and reported). A truthful failure report is a SUCCESS; a fabricated result is the
  worst possible outcome.

## THE ONE-LINE STANDARD
> If you cannot trace a number to a tool call or a script you ran in this session, you must not
> say it. When unsure, stop and report — never improvise.
