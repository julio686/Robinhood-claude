// indicators.mjs — pure-function technical indicators over OHLCV bars.
// Zero dependencies. All functions take plain arrays of numbers (oldest -> newest)
// and return arrays aligned to the input length, using `null` for warm-up periods
// where the indicator is not yet defined. This null-padding is what keeps the
// backtester honest: a null means "not enough history yet, do not trade".

/** Simple moving average. Returns array aligned to input; null until `period` bars exist. */
export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average (Wilder-style seed = SMA of first `period`). */
export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  // Seed with SMA of the first `period` values.
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** True Range series. tr[0] = high-low; thereafter includes prior close gaps. */
export function trueRange(high, low, close) {
  const out = new Array(close.length).fill(null);
  for (let i = 0; i < close.length; i++) {
    if (i === 0) {
      out[i] = high[i] - low[i];
    } else {
      out[i] = Math.max(
        high[i] - low[i],
        Math.abs(high[i] - close[i - 1]),
        Math.abs(low[i] - close[i - 1])
      );
    }
  }
  return out;
}

/** Average True Range, Wilder smoothing. null until `period` bars exist. */
export function atr(high, low, close, period = 14) {
  const tr = trueRange(high, low, close);
  const out = new Array(close.length).fill(null);
  if (tr.length < period) return out;
  // Seed = simple average of first `period` TRs.
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < tr.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period; // Wilder smoothing
    out[i] = prev;
  }
  return out;
}

/** RSI, Wilder smoothing. Returns 0..100; null until `period` gains/losses exist. */
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const ch = values[i] - values[i - 1];
    if (ch >= 0) gainSum += ch;
    else lossSum -= ch;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1];
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** MACD. Returns {macd, signal, histogram}, each aligned to input (null warm-up). */
export function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_, i) =>
    emaFast[i] === null || emaSlow[i] === null ? null : emaFast[i] - emaSlow[i]
  );
  // Build the signal line over the defined portion of the MACD line.
  const firstDefined = macdLine.findIndex((v) => v !== null);
  const signal = new Array(values.length).fill(null);
  const histogram = new Array(values.length).fill(null);
  if (firstDefined !== -1) {
    const defined = macdLine.slice(firstDefined);
    const sig = ema(defined, signalPeriod);
    for (let i = 0; i < sig.length; i++) {
      const idx = firstDefined + i;
      signal[idx] = sig[i];
      if (sig[i] !== null && macdLine[idx] !== null) histogram[idx] = macdLine[idx] - sig[i];
    }
  }
  return { macd: macdLine, signal, histogram };
}

/** Highest high over a trailing window ending at each index (null until window fills). */
export function rollingHigh(values, period) {
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (i >= period - 1) {
      let hi = -Infinity;
      for (let j = i - period + 1; j <= i; j++) hi = Math.max(hi, values[j]);
      out[i] = hi;
    }
  }
  return out;
}

/** Last non-null value of a series (the "current" reading). */
export function last(series) {
  for (let i = series.length - 1; i >= 0; i--) if (series[i] !== null) return series[i];
  return null;
}
