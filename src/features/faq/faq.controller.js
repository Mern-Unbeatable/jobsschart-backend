import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { faqService } from './faq.service.js';
import { Logger } from '../../config/logger.js';

const log = new Logger('FaqController');

class FaqController {
  // Admin only: Create FAQ
  createFaq = catchAsync(async (req, res) => {
    log.info(`Creating FAQ by admin: ${req.user.id}`);
    const faq = await faqService.createFaq(req.body);
    ResponseHandler.created(res, {
      message: 'FAQ created successfully',
      data: { faq },
    });
  });

  // Public: Get all FAQs
  getAllFaqs = catchAsync(async (req, res) => {
    const result = await faqService.getAllFaqs(req.query);
    ResponseHandler.success(res, {
      message: 'FAQs fetched successfully',
      data: result,
    });
  });

  // Public: Get single FAQ
  getFaqById = catchAsync(async (req, res) => {
    const { id } = req.params;
    const faq = await faqService.getFaqById(id);
    ResponseHandler.success(res, {
      message: 'FAQ fetched successfully',
      data: { faq },
    });
  });

  // Admin only: Update FAQ
  updateFaq = catchAsync(async (req, res) => {
    const { id } = req.params;
    log.info(`Updating FAQ: ${id} by admin: ${req.user.id}`);
    const faq = await faqService.updateFaq(id, req.body);
    ResponseHandler.success(res, {
      message: 'FAQ updated successfully',
      data: { faq },
    });
  });

  // Admin only: Delete FAQ
  deleteFaq = catchAsync(async (req, res) => {
    const { id } = req.params;
    log.info(`Deleting FAQ: ${id} by admin: ${req.user.id}`);
    const result = await faqService.deleteFaq(id);
    ResponseHandler.success(res, {
      message: result.message,
      data: { deletedAt: new Date().toISOString() },
    });
  });
}

export const faqController = new FaqController();