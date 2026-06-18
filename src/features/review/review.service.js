import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';

class ReviewService {
    constructor() {
        this.log = new Logger('ReviewService');
    }

    async createReview(userId, data) {
        const { consultantId, rating, comment } = data;

        const review = await prisma.review.create({
            data: {
                consultantId,
                userId,
                rating,
                comment,
            },

        });
        return review;
    }




}

export const reviewService = new ReviewService();