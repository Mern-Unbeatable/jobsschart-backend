import { Logger } from '../../config/logger.js';
import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { reviewService } from './review.service.js';
import { createReviewSchema } from './review.validation.js';

class ReviewController {
    constructor() {
        this.log = new Logger('ReviewController');
    }

    createReview = catchAsync(async (req, res) => {
        const userId = req.user.id;
        const data = createReviewSchema.parse(req.body);

        const review = await reviewService.createReview(userId, data);

        ResponseHandler.created(res, {
            message: 'Review created successfully',
            data: { review },
        });
    });



}

export const reviewController = new ReviewController();