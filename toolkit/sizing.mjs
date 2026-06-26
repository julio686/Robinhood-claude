// sizing.mjs — position sizing that enforces the hard risk limits.
// The whole point: never let conviction override the math. Given an entry and a
// stop, the dollar risk is fixed; shares are derived, never guessed.

/**
 * Compute a position size from fixed-fractional risk.
 *
 * @param {object} p
 * @param {number} p.equity          Account equity in USD.
 * @param {number} p.entry           Intended entry price.
 * @param {number} p.stop            Stop-loss price (must be below entry for longs).
 * @param {number} p.riskPct         Max % of equity to risk on this trade (e.g. 1.5).
 * @param {number} [p.minOrderUsd=1] Broker minimum order notional.
 * @param {number} [p.maxPositionPct=100] Cap on position notional as % of equity.
 * @param {boolean} [p.allowFractional=true]
 * @returns {{ok:boolean, reason?:string, shares?:number, notional?:number, riskUsd?:number, riskPerShare?:number}}
 */
export function positionSize({
  equity,
  entry,
  stop,
  riskPct,
  minOrderUsd = 1,
  maxPositionPct = 100,
  allowFractional = true,
}) {
  if (!(equity > 0)) return { ok: false, reason: "equity must be > 0" };
  if (!(entry > 0)) return { ok: false, reason: "entry must be > 0" };
  if (!(stop > 0)) return { ok: false, reason: "stop must be > 0" };
  if (stop >= entry) return { ok: false, reason: "stop must be below entry (long-only)" };

  const riskPerShare = entry - stop;
  const riskUsd = equity * (riskPct / 100);
  let shares = riskUsd / riskPerShare;

  // Cap notional so a single position can't exceed maxPositionPct of equity.
  const maxNotional = equity * (maxPositionPct / 100);
  if (shares * entry > maxNotional) shares = maxNotional / entry;

  if (!allowFractional) shares = Math.floor(shares);

  const notional = shares * entry;
  if (notional < minOrderUsd) {
    return {
      ok: false,
      reason: `sized notional $${notional.toFixed(2)} below broker min $${minOrderUsd}`,
      shares,
      notional,
      riskUsd,
      riskPerShare,
    };
  }

  return {
    ok: true,
    shares: round(shares, 6),
    notional: round(notional, 2),
    riskUsd: round(shares * riskPerShare, 2), // actual risk after any capping
    riskPerShare: round(riskPerShare, 4),
  };
}

function round(x, dp) {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
