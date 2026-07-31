/**
 * Latency helpers for evaluation timing measurements.
 */

function nowMs() {
  return Date.now();
}

function elapsedMs(startedAt) {
  return Date.now() - startedAt;
}

function summarizeLatencies(samples = []) {
  const values = samples.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, p95: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, n) => acc + n, 0);
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));

  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / sorted.length,
    p95: sorted[p95Index],
  };
}

module.exports = {
  nowMs,
  elapsedMs,
  summarizeLatencies,
};
