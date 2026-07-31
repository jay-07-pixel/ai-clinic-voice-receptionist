const fs = require('fs');
const path = require('path');

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsvReport(report, outputDir) {
  const header = [
    'scenario_id',
    'scenario_name',
    'language',
    'category',
    'passed',
    'turns',
    'tool_calls',
    'redundant_questions',
    'total_ms',
    'booking_time_ms',
    'avg_tool_latency_ms',
    'avg_backend_latency_ms',
    'avg_retell_event_latency_ms',
    'cliniko_sync_time_ms',
    'failure_reason',
  ];

  const rows = [header.join(',')];

  for (const scenario of report.scenarios) {
    rows.push(
      [
        scenario.id,
        scenario.name,
        scenario.language,
        scenario.category,
        scenario.passed,
        scenario.metrics.turns,
        scenario.metrics.toolCalls,
        scenario.metrics.redundantQuestions,
        scenario.timing.totalMs,
        scenario.timing.bookingTimeMs ?? '',
        scenario.timing.avgToolLatencyMs,
        scenario.timing.avgBackendLatencyMs,
        scenario.timing.avgRetellEventLatencyMs,
        scenario.timing.clinikoSyncTimeMs ?? '',
        scenario.failureReason || '',
      ]
        .map(csvEscape)
        .join(','),
    );
  }

  const filePath = path.join(outputDir, 'evaluation-report.csv');
  fs.writeFileSync(filePath, `${rows.join('\n')}\n`, 'utf8');
  return filePath;
}

module.exports = {
  writeCsvReport,
};
