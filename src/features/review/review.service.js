import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import { NotFoundError, BadRequestError } from '../../shared/globals/helpers/error-handler.js';

class ReviewService {
    constructor() {
        this.log = new Logger('ReviewService');
    }

    async _resolveConsultant({ consultantId, consultantUserId }) {
        if (consultantId) {
            const byRecord = await prisma.consultant.findUnique({ where: { id: consultantId } });
            if (byRecord) return byRecord;

            const byUser = await prisma.consultant.findUnique({ where: { userId: consultantId } });
            if (byUser) return byUser;
        }

        if (consultantUserId) {
            const byUser = await prisma.consultant.findUnique({ where: { userId: consultantUserId } });
            if (byUser) return byUser;
        }

        return null;
    }

    async createReview(userId, data) {
        const { consultantId, consultantUserId, rating, comment } = data;

        const consultant = await this._resolveConsultant({ consultantId, consultantUserId });
        if (!consultant) {
            throw new NotFoundError('Consultant not found for review');
        }

        if (consultant.userId === userId) {
            throw new BadRequestError('You cannot review yourself');
        }

        const review = await prisma.review.create({
            data: {
                consultantId: consultant.id,
                userId,
                rating,
                comment: comment?.trim() || null,
            },
            include: {
                user: { select: { id: true, name: true, avatar: true } },
            },
        });

        return review;
    }
}

export const reviewService = new ReviewService();
