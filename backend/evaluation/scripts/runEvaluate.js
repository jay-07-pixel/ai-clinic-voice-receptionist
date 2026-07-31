#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const { scenarios, getScenarioById } = require('../scenarios');
const ScenarioRunner = require('../runner/scenarioRunner');
const { computeMetrics } = require('../metrics/computeMetrics');
const { writeJsonReport } = require('../reports/reportJson');
const { writeMarkdownReport } = require('../reports/reportMarkdown');
const { writeCsvReport } = require('../reports/reportCsv');

function parseArgs(argv) {
  const args = {
    scenarioId: null,
    outputDir: path.join(__dirname, '..', 'reports', 'latest'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--scenario' || arg === '-s') {
      args.scenarioId = argv[i + 1];
      i += 1;
    } else if (arg === '--out' || arg === '-o') {
      args.outputDir = path.resolve(argv[i + 1]);
      i += 1;
    }
  }

  return args;
}

function printSummaryTable(results) {
  const col = {
    name: 34,
    lang: 8,
    result: 6,
    turns: 6,
    tools: 6,
    ms: 8,
  };

  const pad = (value, width) => {
    const text = String(value ?? '');
    return text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length);
  };

  console.log('');
  console.log(
    `${pad('Scenario', col.name)} ${pad('Lang', col.lang)} ${pad('Result', col.result)} ${pad('Turns', col.turns)} ${pad('Tools', col.tools)} ${pad('ms', col.ms)} Failure`,
  );
  console.log('-'.repeat(110));

  for (const result of results) {
    console.log(
      `${pad(result.name, col.name)} ${pad(result.language, col.lang)} ${pad(result.passed ? 'PASS' : 'FAIL', col.result)} ${pad(result.metrics.turns, col.turns)} ${pad(result.metrics.toolCalls, col.tools)} ${pad(result.timing.totalMs, col.ms)} ${result.failureReason || ''}`,
    );
  }
  console.log('');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const selected = args.scenarioId
    ? [getScenarioById(args.scenarioId)].filter(Boolean)
    : scenarios;

  if (args.scenarioId && selected.length === 0) {
    console.error(`Unknown scenario id: ${args.scenarioId}`);
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(args.outputDir, { recursive: true });

  const runner = new ScenarioRunner();
  const results = [];

  console.log(`Running ${selected.length} evaluation scenario(s)...`);

  for (const scenario of selected) {
    // eslint-disable-next-line no-await-in-loop
    const result = await runner.runScenario(scenario);
    results.push(result);
    const mark = result.passed ? 'PASS' : 'FAIL';
    console.log(`- [${mark}] ${scenario.name} (${result.timing.totalMs} ms)`);
    if (!result.passed) {
      console.log(`  reason: ${result.failureReason}`);
    }
  }

  const aggregated = computeMetrics(results);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'offline-simulation',
    summary: aggregated.totals,
    metrics: aggregated.metrics,
    perLanguage: aggregated.perLanguage,
    scenarios: results,
  };

  const jsonPath = writeJsonReport(report, args.outputDir);
  const mdPath = writeMarkdownReport(report, args.outputDir);
  const csvPath = writeCsvReport(report, args.outputDir);

  printSummaryTable(results);

  console.log('Aggregate metrics');
  console.log(`  Success Rate:           ${(aggregated.metrics.successRate * 100).toFixed(1)}%`);
  console.log(`  Turns to Completion:    ${aggregated.metrics.turnsToCompletion}`);
  console.log(`  Average Tool Calls:     ${aggregated.metrics.averageToolCalls}`);
  console.log(`  Average Booking Time:   ${aggregated.metrics.averageBookingTimeMs} ms`);
  console.log(`  Redundant Questions:    ${aggregated.metrics.redundantQuestions}`);
  console.log(`  Backend Latency:        ${aggregated.metrics.backendLatencyMs} ms`);
  console.log(`  Tool Latency:           ${aggregated.metrics.toolLatencyMs} ms`);
  console.log(`  Retell Event Latency:   ${aggregated.metrics.retellEventLatencyMs} ms`);
  console.log(`  Cliniko Sync Time:      ${aggregated.metrics.clinikoSyncTimeMs} ms`);
  console.log('');
  console.log('Reports written:');
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  MD:   ${mdPath}`);
  console.log(`  CSV:  ${csvPath}`);

  if (aggregated.totals.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Evaluation harness failed:', error);
  process.exitCode = 1;
});
