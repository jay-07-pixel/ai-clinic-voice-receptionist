function average(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) {
    return 0;
  }
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function languageBucket(language) {
  if (language === 'hi' || language === 'hindi') return 'hindi';
  if (language === 'mixed') return 'mixed';
  return 'english';
}

/**
 * Aggregate scenario results into evaluation metrics.
 */
function computeMetrics(scenarioResults) {
  const total = scenarioResults.length;
  const passed = scenarioResults.filter((r) => r.passed).length;
  const failed = total - passed;

  const successRate = total === 0 ? 0 : passed / total;

  const turnsToCompletion = average(scenarioResults.map((r) => r.metrics?.turns || 0));
  const averageToolCalls = average(scenarioResults.map((r) => r.metrics?.toolCalls || 0));
  const averageBookingTime = average(
    scenarioResults
      .filter((r) => r.expectedFinalOutcome?.appointmentBooked)
      .map((r) => r.timing?.bookingTimeMs)
      .filter((v) => v != null),
  );
  const redundantQuestions = average(
    scenarioResults.map((r) => r.metrics?.redundantQuestions || 0),
  );
  const backendLatency = average(scenarioResults.map((r) => r.timing?.avgBackendLatencyMs || 0));
  const toolLatency = average(scenarioResults.map((r) => r.timing?.avgToolLatencyMs || 0));
  const retellEventLatency = average(
    scenarioResults.map((r) => r.timing?.avgRetellEventLatencyMs || 0),
  );
  const clinikoSyncTime = average(
    scenarioResults
      .map((r) => r.timing?.clinikoSyncTimeMs)
      .filter((v) => typeof v === 'number'),
  );

  const byLanguage = {
    english: emptyLangStats(),
    hindi: emptyLangStats(),
    mixed: emptyLangStats(),
  };

  for (const result of scenarioResults) {
    const key = languageBucket(result.language);
    const bucket = byLanguage[key];
    bucket.total += 1;
    if (result.passed) bucket.passed += 1;
    bucket.turns.push(result.metrics?.turns || 0);
    bucket.toolCalls.push(result.metrics?.toolCalls || 0);
    bucket.bookingTimes.push(result.timing?.bookingTimeMs);
    bucket.backendLatencies.push(result.timing?.avgBackendLatencyMs || 0);
    bucket.toolLatencies.push(result.timing?.avgToolLatencyMs || 0);
  }

  for (const key of Object.keys(byLanguage)) {
    const bucket = byLanguage[key];
    byLanguage[key] = {
      total: bucket.total,
      passed: bucket.passed,
      successRate: bucket.total === 0 ? 0 : round(bucket.passed / bucket.total, 4),
      avgTurns: round(average(bucket.turns)),
      avgToolCalls: round(average(bucket.toolCalls)),
      avgBookingTimeMs: round(average(bucket.bookingTimes.filter((v) => v != null))),
      avgBackendLatencyMs: round(average(bucket.backendLatencies)),
      avgToolLatencyMs: round(average(bucket.toolLatencies)),
    };
  }

  return {
    totals: {
      scenarios: total,
      passed,
      failed,
      successRate: round(successRate, 4),
    },
    metrics: {
      successRate: round(successRate, 4),
      turnsToCompletion: round(turnsToCompletion),
      averageToolCalls: round(averageToolCalls),
      averageBookingTimeMs: round(averageBookingTime),
      redundantQuestions: round(redundantQuestions),
      backendLatencyMs: round(backendLatency),
      toolLatencyMs: round(toolLatency),
      retellEventLatencyMs: round(retellEventLatency),
      clinikoSyncTimeMs: round(clinikoSyncTime),
    },
    perLanguage: byLanguage,
  };
}

function emptyLangStats() {
  return {
    total: 0,
    passed: 0,
    turns: [],
    toolCalls: [],
    bookingTimes: [],
    backendLatencies: [],
    toolLatencies: [],
  };
}

module.exports = {
  computeMetrics,
  average,
  round,
  languageBucket,
};
