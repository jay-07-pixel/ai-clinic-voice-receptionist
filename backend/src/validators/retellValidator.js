const { WEBHOOK_EVENTS } = require('../dto/retellDto');

function validateRetellWebhook(req) {
  const body = req.body;

  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object', value: null };
  }

  const event = typeof body.event === 'string' ? body.event.trim() : '';
  if (!event) {
    return { error: 'event is required', value: null };
  }

  // Unknown events are acknowledged (not rejected) by the service.
  if (!WEBHOOK_EVENTS.includes(event)) {
    // still pass through
  }

  return {
    error: null,
    value: body,
  };
}

module.exports = {
  validateRetellWebhook,
};
