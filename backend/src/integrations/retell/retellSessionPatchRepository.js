const { prisma } = require('../../config/database');
const { SESSION_PATCH_SELECT } = require('../../dto/retellDto');

/**
 * Retell-owned CallSession patches for mid-call sync.
 * Does not own booking/patient business rules — only conversation persistence fields.
 */
class RetellSessionPatchRepository {
  /**
   * @param {import('@prisma/client').PrismaClient} [client]
   */
  constructor(client = prisma) {
    this.prisma = client;
  }

  async findByExternalCallId(externalCallId) {
    if (!externalCallId) {
      return null;
    }

    return this.prisma.callSession.findUnique({
      where: { externalCallId },
      select: SESSION_PATCH_SELECT,
    });
  }

  async findById(sessionId) {
    if (!sessionId) {
      return null;
    }

    return this.prisma.callSession.findUnique({
      where: { id: sessionId },
      select: SESSION_PATCH_SELECT,
    });
  }

  async patchById(sessionId, data) {
    return this.prisma.callSession.update({
      where: { id: sessionId },
      data: {
        ...data,
        lastActivityAt: data.lastActivityAt || new Date(),
      },
      select: SESSION_PATCH_SELECT,
    });
  }
}

module.exports = RetellSessionPatchRepository;
