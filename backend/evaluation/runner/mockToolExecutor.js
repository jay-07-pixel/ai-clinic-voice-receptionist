/**
 * Simulates Retell tool execution for offline evaluation.
 * Uses scenario expected responses; optionally can wire a live dispatcher later.
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

class MockToolExecutor {
  /**
   * @param {object} [options]
   */
  constructor(options = {}) {
    this.toolLatencyMsMin = options.toolLatencyMsMin ?? 20;
    this.toolLatencyMsMax = options.toolLatencyMsMax ?? 80;
    this.backendLatencyMsMin = options.backendLatencyMsMin ?? 15;
    this.backendLatencyMsMax = options.backendLatencyMsMax ?? 60;
    this.retellEventLatencyMsMin = options.retellEventLatencyMsMin ?? 10;
    this.retellEventLatencyMsMax = options.retellEventLatencyMsMax ?? 40;
    this.clinikoSyncMsMin = options.clinikoSyncMsMin ?? 30;
    this.clinikoSyncMsMax = options.clinikoSyncMsMax ?? 120;
  }

  async execute(toolCall) {
    const toolLatencyMs = randomBetween(this.toolLatencyMsMin, this.toolLatencyMsMax);
    const backendLatencyMs = randomBetween(this.backendLatencyMsMin, this.backendLatencyMsMax);
    await sleep(toolLatencyMs);

    const response = toolCall.expectedResponse || { ok: true };

    return {
      name: toolCall.name,
      args: toolCall.args || {},
      response,
      latencies: {
        toolLatencyMs: Number(toolLatencyMs.toFixed(2)),
        backendLatencyMs: Number(backendLatencyMs.toFixed(2)),
      },
    };
  }

  async simulateRetellEvent() {
    const ms = randomBetween(this.retellEventLatencyMsMin, this.retellEventLatencyMsMax);
    await sleep(ms);
    return Number(ms.toFixed(2));
  }

  async simulateClinikoSync(shouldSync) {
    if (!shouldSync) {
      return null;
    }
    const ms = randomBetween(this.clinikoSyncMsMin, this.clinikoSyncMsMax);
    await sleep(ms);
    return Number(ms.toFixed(2));
  }
}

module.exports = MockToolExecutor;
