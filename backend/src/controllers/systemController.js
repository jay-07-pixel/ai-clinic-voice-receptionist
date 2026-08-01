const asyncHandler = require('../utils/asyncHandler');

const TIMEZONE = 'Asia/Kolkata';

function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

/**
 * Builds a Kolkata-local clock snapshot from the server's current time.
 * @param {Date} [now]
 */
function buildKolkataClock(now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'long',
  }).format(now);

  const timeParts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(now);

  const part = (type) => timeParts.find((p) => p.type === type)?.value || '';
  const time = `${part('hour').padStart(2, '0')}:${part('minute').padStart(2, '0')}:${part('second').padStart(2, '0')} ${part('dayPeriod')}`;

  return {
    date,
    day,
    time,
    timezone: TIMEZONE,
    iso: now.toISOString(),
  };
}

const getTime = asyncHandler(async (_req, res) => {
  return sendSuccess(res, buildKolkataClock());
});

module.exports = {
  getTime,
  buildKolkataClock,
};
