const logger = require('../../utils/logger');
const { AppError } = require('../../middleware/errorHandler');
const RetellToolDispatcher = require('./retellToolDispatcher');
const RetellSessionSyncService = require('./retellSessionSyncService');
const {
  extractExternalCallId,
  pickCall,
  toWebhookAck,
  asObject,
} = require('./retellMapper');

class RetellWebhookService {
  /**
   * @param {object} [deps]
   */
  constructor({
    sessionSyncService = new RetellSessionSyncService(),
    toolDispatcher = new RetellToolDispatcher({ sessionSyncService }),
  } = {}) {
    this.sessionSyncService = sessionSyncService;
    this.toolDispatcher = toolDispatcher;
  }

  /**
   * @param {object} payload Parsed Retell webhook JSON
   */
  async handleEvent(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new AppError('Webhook body must be a JSON object', 400, {
        code: 'VALIDATION_ERROR',
      });
    }

    const event = String(payload.event || payload.type || '').trim();
    const externalCallId = extractExternalCallId(payload);

    if (!event) {
      throw new AppError('event is required', 400, { code: 'VALIDATION_ERROR' });
    }

    logger.info('Retell webhook received', { event, externalCallId });

    switch (event) {
      case 'call_started':
        return this.#wrap(event, externalCallId, () =>
          this.sessionSyncService.onCallStarted(payload),
        );

      case 'transcript_updated':
        return this.#wrap(event, externalCallId, () =>
          this.sessionSyncService.onTranscriptUpdated(payload),
        );

      case 'call_analyzed':
        return this.#wrap(event, externalCallId, () =>
          this.sessionSyncService.onCallAnalyzed(payload),
        );

      case 'call_ended':
        return this.#wrap(event, externalCallId, () =>
          this.sessionSyncService.onCallEnded(payload),
        );

      case 'tool_call':
        return this.#handleToolCall(event, externalCallId, payload);

      case 'tool_result':
        return this.#handleToolResult(event, externalCallId, payload);

      default:
        logger.warn('Unhandled Retell webhook event', { event, externalCallId });
        return toWebhookAck({
          event,
          externalCallId,
          handled: false,
          result: { ignored: true },
        });
    }
  }

  async #wrap(event, externalCallId, fn) {
    const result = await fn();
    return toWebhookAck({
      event,
      externalCallId,
      handled: true,
      sessionId: result?.sessionId || null,
      result,
    });
  }

  async #handleToolCall(event, externalCallId, payload) {
    const toolCall = this.#extractToolCall(payload);
    const toolName = toolCall.name || toolCall.tool_name || toolCall.toolName;
    const toolCallId = toolCall.tool_call_id || toolCall.toolCallId || toolCall.id;
    const args = asObject(toolCall.args || toolCall.arguments || toolCall.parameters);

    if (!toolName) {
      throw new AppError('tool_call.name is required', 400, {
        code: 'VALIDATION_ERROR',
      });
    }

    const session = await this.sessionSyncService.resolveSession({
      sessionId: args.callSessionId || payload.callSessionId,
      externalCallId,
    });

    await this.sessionSyncService.recordToolCall({
      sessionId: session?.id,
      externalCallId,
      toolName,
      toolCallId,
      args,
    });

    const toolResult = await this.toolDispatcher.dispatch(toolName, args, {
      callSessionId: session?.id,
      externalCallId,
    });

    await this.sessionSyncService.recordToolResult({
      sessionId: session?.id,
      externalCallId,
      toolName,
      toolCallId,
      result: toolResult,
      ok: toolResult?.ok !== false,
    });

    return toWebhookAck({
      event,
      externalCallId,
      handled: true,
      sessionId: session?.id || null,
      result: {
        toolName,
        toolCallId: toolCallId || null,
        toolResult,
      },
    });
  }

  async #handleToolResult(event, externalCallId, payload) {
    const toolResultPayload = asObject(
      payload.tool_result || payload.toolResult || payload.data,
    );
    const toolName =
      toolResultPayload.name ||
      toolResultPayload.tool_name ||
      toolResultPayload.toolName ||
      payload.tool_name;
    const toolCallId =
      toolResultPayload.tool_call_id ||
      toolResultPayload.toolCallId ||
      toolResultPayload.id;

    const session = await this.sessionSyncService.resolveSession({
      sessionId: payload.callSessionId,
      externalCallId,
    });

    const recorded = await this.sessionSyncService.recordToolResult({
      sessionId: session?.id,
      externalCallId,
      toolName,
      toolCallId,
      result: toolResultPayload.result ?? toolResultPayload,
      ok: toolResultPayload.ok !== false,
    });

    return toWebhookAck({
      event,
      externalCallId,
      handled: true,
      sessionId: recorded?.sessionId || session?.id || null,
      result: {
        toolName: toolName || null,
        toolCallId: toolCallId || null,
        recorded: Boolean(recorded),
      },
    });
  }

  #extractToolCall(payload) {
    const call = pickCall(payload);
    return asObject(
      payload.tool_call ||
        payload.toolCall ||
        payload.function_call ||
        call.tool_call ||
        payload.data?.tool_call ||
        {},
    );
  }
}

module.exports = RetellWebhookService;
