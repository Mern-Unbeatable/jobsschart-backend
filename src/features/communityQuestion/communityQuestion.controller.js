import { catchAsync } from '../../shared/globals/decorators/catch-async.js';
import { ResponseHandler } from '../../shared/globals/helpers/response.handler.js';
import { communityQuestionService } from './communityQuestion.service.js';
import { Logger } from '../../config/logger.js';

const log = new Logger('CommunityQuestionController');

class CommunityQuestionController {
  // ==================== USER/CONSULTANT ROUTES ====================
  
  // Create a question (User or Consultant)
  createQuestion = catchAsync(async (req, res) => {
    log.info(`Creating question by ${req.user.role}: ${req.user.id}`);
    const question = await communityQuestionService.createQuestion(
      req.user.id,
      req.user.role,
      req.body
    );
    ResponseHandler.created(res, {
      message: 'Question submitted successfully. Our team will answer shortly.',
      data: { question },
    });
  });

  // Get my own questions (User or Consultant)
  getMyQuestions = catchAsync(async (req, res) => {
    const result = await communityQuestionService.getMyQuestions(
      req.user.id,
      req.user.role,
      req.query
    );
    ResponseHandler.success(res, {
      message: 'Your questions fetched successfully',
      data: result,
    });
  });

  // Get single question (only my own)
  getMyQuestionById = catchAsync(async (req, res) => {
    const { id } = req.params;
    const question = await communityQuestionService.getMyQuestionById(id, req.user.id);
    ResponseHandler.success(res, {
      message: 'Question fetched successfully',
      data: { question },
    });
  });

  // ==================== ADMIN ONLY ROUTES ====================

  // Get all questions (Admin)
  getAllQuestions = catchAsync(async (req, res) => {
    const result = await communityQuestionService.getAllQuestions(req.query);
    ResponseHandler.success(res, {
      message: 'All questions fetched successfully',
      data: result,
    });
  });



  // Answer a question (Admin)
  answerQuestion = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { answer } = req.body;
    log.info(`Admin ${req.user.id} answering question: ${id}`);
    const question = await communityQuestionService.answerQuestion(id, req.user.id, answer);
    ResponseHandler.success(res, {
      message: 'Question answered successfully',
      data: { question },
    });
  });

  // Update answer (Admin)
  updateAnswer = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { answer } = req.body;
    log.info(`Admin ${req.user.id} updating answer for question: ${id}`);
    const question = await communityQuestionService.updateAnswer(id, req.user.id, answer);
    ResponseHandler.success(res, {
      message: 'Answer updated successfully',
      data: { question },
    });
  });


  // Update question status (Admin)
  updateQuestionStatus = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const question = await communityQuestionService.updateQuestionStatus(id, status);
    ResponseHandler.success(res, {
      message: 'Question status updated successfully',
      data: { question },
    });
  });

  // Delete question (Admin)
  deleteQuestion = catchAsync(async (req, res) => {
    const { id } = req.params;
    log.info(`Admin ${req.user.id} deleting question: ${id}`);
    const result = await communityQuestionService.deleteQuestion(id);
    ResponseHandler.success(res, {
      message: result.message,
      data: { deletedAt: new Date().toISOString() },
    });
  });




}


export const communityQuestionController = new CommunityQuestionController();