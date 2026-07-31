const fs = require('fs');
const path = require('path');

function pad(value, width) {
  const text = String(value ?? '');
  if (text.length >= width) return text;
  return text + ' '.repeat(width - text.length);
}

function writeMarkdownReport(report, outputDir) {
  const lines = [];
  const { summary, metrics, perLanguage, scenarios } = report;

  lines.push('# Clinic Voice AI Evaluation Report');
  lines.push('');
  lines.push(`- Generated at: \`${report.generatedAt}\``);
  lines.push(`- Mode: \`${report.mode}\``);
  lines.push(`- Success rate: **${(metrics.successRate * 100).toFixed(1)}%**`);
  lines.push(`- Passed: **${summary.passed}/${summary.scenarios}**`);
  lines.push('');
  lines.push('## Metrics');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | ---: |');
  lines.push(`| Success Rate | ${(metrics.successRate * 100).toFixed(2)}% |`);
  lines.push(`| Turns to Completion (avg) | ${metrics.turnsToCompletion} |`);
  lines.push(`| Average Tool Calls | ${metrics.averageToolCalls} |`);
  lines.push(`| Average Booking Time (ms) | ${metrics.averageBookingTimeMs} |`);
  lines.push(`| Redundant Questions (avg) | ${metrics.redundantQuestions} |`);
  lines.push(`| Backend Latency (ms) | ${metrics.backendLatencyMs} |`);
  lines.push(`| Tool Latency (ms) | ${metrics.toolLatencyMs} |`);
  lines.push(`| Retell Event Latency (ms) | ${metrics.retellEventLatencyMs} |`);
  lines.push(`| Cliniko Sync Time (ms) | ${metrics.clinikoSyncTimeMs} |`);
  lines.push('');
  lines.push('## Per-language Statistics');
  lines.push('');
  lines.push('| Language | Total | Passed | Success Rate | Avg Turns | Avg Tools | Avg Booking ms |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const [lang, stats] of Object.entries(perLanguage)) {
    lines.push(
      `| ${lang} | ${stats.total} | ${stats.passed} | ${(stats.successRate * 100).toFixed(1)}% | ${stats.avgTurns} | ${stats.avgToolCalls} | ${stats.avgBookingTimeMs} |`,
    );
  }
  lines.push('');
  lines.push('## Scenario Summary');
  lines.push('');
  lines.push('| Scenario | Language | Result | Turns | Tools | Total ms | Failure |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | --- |');

  for (const scenario of scenarios) {
    lines.push(
      `| ${scenario.name} | ${scenario.language} | ${scenario.passed ? 'PASS' : 'FAIL'} | ${scenario.metrics.turns} | ${scenario.metrics.toolCalls} | ${scenario.timing.totalMs} | ${scenario.failureReason || ''} |`,
    );
  }

  lines.push('');
  lines.push('## Console Table');
  lines.push('');
  lines.push('```');
  lines.push(
    `${pad('Scenario', 34)} ${pad('Lang', 8)} ${pad('Result', 6)} ${pad('Turns', 6)} ${pad('Tools', 6)} ${pad('ms', 8)} Failure`,
  );
  lines.push('-'.repeat(100));
  for (const scenario of scenarios) {
    lines.push(
      `${pad(scenario.name, 34)} ${pad(scenario.language, 8)} ${pad(scenario.passed ? 'PASS' : 'FAIL', 6)} ${pad(scenario.metrics.turns, 6)} ${pad(scenario.metrics.toolCalls, 6)} ${pad(scenario.timing.totalMs, 8)} ${scenario.failureReason || ''}`,
    );
  }
  lines.push('```');
  lines.push('');

  const filePath = path.join(outputDir, 'evaluation-report.md');
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
  return filePath;
}

module.exports = {
  writeMarkdownReport,
};
