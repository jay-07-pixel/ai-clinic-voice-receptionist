const {
  ERROR_CODES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_BASE_BACKOFF_MS,
} = require('../../dto/clinikoDto');
const logger = require('../../utils/logger');

class ClinikoApiError extends Error {
  /**
   * @param {string} message
   * @param {object} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'ClinikoApiError';
    this.code = options.code || ERROR_CODES.UNKNOWN_ERROR;
    this.statusCode = options.statusCode || null;
    this.retryable = options.retryable === true;
    this.details = options.details || null;
    this.retryAfterMs = options.retryAfterMs || null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoffMs(attempt, baseMs, retryAfterMs) {
  if (retryAfterMs && retryAfterMs > 0) {
    return retryAfterMs;
  }
  const exp = Math.min(baseMs * 2 ** attempt, 60_000);
  const jitter = Math.floor(Math.random() * Math.min(250, exp * 0.2));
  return exp + jitter;
}

function parseRetryAfterMs(headers) {
  if (!headers) {
    return null;
  }

  const retryAfter = headers.get?.('retry-after') || headers['retry-after'];
  if (retryAfter) {
    const asInt = Number.parseInt(String(retryAfter), 10);
    if (Number.isFinite(asInt)) {
      return asInt * 1000;
    }
    const dateMs = Date.parse(String(retryAfter));
    if (!Number.isNaN(dateMs)) {
      return Math.max(0, dateMs - Date.now());
    }
  }

  const reset =
    headers.get?.('x-ratelimit-reset') ||
    headers['x-ratelimit-reset'] ||
    headers.get?.('X-RateLimit-Reset');
  if (reset) {
    const resetUnix = Number.parseInt(String(reset), 10);
    if (Number.isFinite(resetUnix)) {
      // Cliniko docs: UNIX timestamp (seconds)
      const resetMs = resetUnix > 1e12 ? resetUnix : resetUnix * 1000;
      return Math.max(0, resetMs - Date.now());
    }
  }

  return null;
}

function normalizeHttpError(statusCode, body, headers) {
  const message =
    body?.message ||
    body?.error ||
    (typeof body === 'string' ? body : null) ||
    `Cliniko API error (${statusCode})`;

  if (statusCode === 401 || statusCode === 403) {
    return new ClinikoApiError(message, {
      code: ERROR_CODES.AUTH_ERROR,
      statusCode,
      retryable: false,
      details: body,
    });
  }

  if (statusCode === 429) {
    return new ClinikoApiError(message, {
      code: ERROR_CODES.RATE_LIMITED,
      statusCode,
      retryable: true,
      retryAfterMs: parseRetryAfterMs(headers),
      details: body,
    });
  }

  if (statusCode === 400 || statusCode === 404 || statusCode === 422) {
    return new ClinikoApiError(message, {
      code: ERROR_CODES.VALIDATION_ERROR,
      statusCode,
      retryable: false,
      details: body,
    });
  }

  if (statusCode >= 500) {
    return new ClinikoApiError(message, {
      code: ERROR_CODES.SERVER_ERROR,
      statusCode,
      retryable: true,
      details: body,
    });
  }

  return new ClinikoApiError(message, {
    code: ERROR_CODES.UNKNOWN_ERROR,
    statusCode,
    retryable: statusCode >= 500,
    details: body,
  });
}

/**
 * Reusable Cliniko REST client (HTTP Basic with API key).
 * No Prisma. No domain logic.
 */
class ClinikoClient {
  /**
   * @param {object} [options]
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || '';
    this.baseUrl = String(options.baseUrl || '').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseBackoffMs = options.baseBackoffMs || DEFAULT_BASE_BACKOFF_MS;
    this.userAgent =
      options.userAgent || 'ClinicVoiceAI (ops@clinic-voice-ai.local)';
    this.dryRun = options.dryRun === true;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
  }

  #assertConfigured() {
    if (this.dryRun) {
      return;
    }
    if (!this.apiKey) {
      throw new ClinikoApiError('CLINIKO_API_KEY is not configured', {
        code: ERROR_CODES.AUTH_ERROR,
        retryable: false,
      });
    }
    if (!this.baseUrl) {
      throw new ClinikoApiError('CLINIKO_BASE_URL is not configured', {
        code: ERROR_CODES.VALIDATION_ERROR,
        retryable: false,
      });
    }
    if (typeof this.fetchImpl !== 'function') {
      throw new ClinikoApiError('fetch is not available in this runtime', {
        code: ERROR_CODES.NETWORK_ERROR,
        retryable: false,
      });
    }
  }

  #authHeader() {
    const token = Buffer.from(`${this.apiKey}:`, 'utf8').toString('base64');
    return `Basic ${token}`;
  }

  #buildUrl(path, query) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalizedPath}`);
    if (query && typeof query === 'object') {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) {
          continue;
        }
        if (Array.isArray(value)) {
          for (const item of value) {
            url.searchParams.append(key, String(item));
          }
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  async request(method, path, { body, query, idempotent = false } = {}) {
    this.#assertConfigured();

    if (this.dryRun) {
      logger.info('Cliniko dry-run request', { method, path, body, query });
      return {
        dryRun: true,
        method,
        path,
        body: body || null,
        id: `dryrun_${Date.now()}`,
      };
    }

    const url = this.#buildUrl(path, query);
    let attempt = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        logger.debug('Cliniko request', { method, path, attempt });

        const response = await this.fetchImpl(url, {
          method,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: this.#authHeader(),
            'User-Agent': this.userAgent,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });

        const text = await response.text();
        let parsed = null;
        if (text) {
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
        }

        if (!response.ok) {
          const error = normalizeHttpError(response.status, parsed, response.headers);
          const canRetry =
            error.retryable &&
            attempt < this.maxRetries &&
            (idempotent || method === 'GET' || error.code === ERROR_CODES.RATE_LIMITED);

          if (canRetry) {
            const waitMs = computeBackoffMs(
              attempt,
              this.baseBackoffMs,
              error.retryAfterMs,
            );
            logger.warn('Cliniko retrying request', {
              method,
              path,
              attempt,
              waitMs,
              code: error.code,
              statusCode: error.statusCode,
            });
            await sleep(waitMs);
            attempt += 1;
            continue;
          }

          throw error;
        }

        return parsed;
      } catch (error) {
        if (error instanceof ClinikoApiError) {
          throw error;
        }

        const isAbort = error?.name === 'AbortError';
        const networkError = new ClinikoApiError(
          isAbort ? 'Cliniko request timed out' : error?.message || 'Cliniko network error',
          {
            code: ERROR_CODES.NETWORK_ERROR,
            retryable: true,
            details: { name: error?.name || null },
          },
        );

        if (attempt < this.maxRetries) {
          const waitMs = computeBackoffMs(attempt, this.baseBackoffMs, null);
          logger.warn('Cliniko network retry', { method, path, attempt, waitMs });
          await sleep(waitMs);
          attempt += 1;
          continue;
        }

        throw networkError;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  createPatient(payload) {
    return this.request('POST', '/patients', { body: payload });
  }

  updatePatient(clinikoPatientId, payload) {
    return this.request('PATCH', `/patients/${clinikoPatientId}`, {
      body: payload,
      idempotent: true,
    });
  }

  getPatient(clinikoPatientId) {
    return this.request('GET', `/patients/${clinikoPatientId}`, { idempotent: true });
  }

  createIndividualAppointment(payload) {
    return this.request('POST', '/individual_appointments', { body: payload });
  }

  updateIndividualAppointment(clinikoAppointmentId, payload) {
    return this.request('PATCH', `/individual_appointments/${clinikoAppointmentId}`, {
      body: payload,
      idempotent: true,
    });
  }

  getIndividualAppointment(clinikoAppointmentId) {
    return this.request('GET', `/individual_appointments/${clinikoAppointmentId}`, {
      idempotent: true,
    });
  }

  /**
   * Cancel by patching cancellation fields (Cliniko individual appointments).
   */
  cancelIndividualAppointment(clinikoAppointmentId, payload) {
    return this.request('PATCH', `/individual_appointments/${clinikoAppointmentId}`, {
      body: payload,
      idempotent: true,
    });
  }
}

module.exports = {
  ClinikoClient,
  ClinikoApiError,
  normalizeHttpError,
  computeBackoffMs,
  parseRetryAfterMs,
};
