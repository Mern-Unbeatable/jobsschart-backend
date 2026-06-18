import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import { NotFoundError, ForbiddenError } from '../../shared/globals/helpers/error-handler.js';

const log = new Logger('CommunityQuestionService');

class CommunityQuestionService {
  // User/Consultant: Create a question
  async createQuestion(userId, userRole, data) {
    const questionType = userRole === 'CONSULTANT' ? 'CONSULTANT' : 'USER';
    
    const question = await prisma.communityQuestion.create({
      data: {
        userId,
        questionType,
        subject: data.subject,
        question: data.question,
        topic: data.topic || null,
        status: 'PENDING',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    log.info(`${questionType} question created: ${question.id} by user ${userId}`);
    return question;
  }

  // User/Consultant: Get their own questions
  async getMyQuestions(userId, userRole, queryParams = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
      topic,
      search,
    } = queryParams;

    const where = {
      userId,
    };

    if (status) where.status = status;
    if (topic) where.topic = { contains: topic, mode: 'insensitive' };
    
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { question: { contains: search, mode: 'insensitive' } },
        { answer: { contains: search, mode: 'insensitive' } },
        { topic: { contains: search, mode: 'insensitive' } },
      ];
    }

    const take = Math.min(parseInt(limit) || 20, 100);
    const skip = (parseInt(page) - 1) * take;

    const orderBy = [];
    const validSortFields = ['createdAt', 'updatedAt', 'status'];
    if (validSortFields.includes(sortBy)) {
      orderBy.push({ [sortBy]: sortOrder === 'asc' ? 'asc' : 'desc' });
    } else {
      orderBy.push({ createdAt: 'desc' });
    }

    const [questions, total] = await Promise.all([
      prisma.communityQuestion.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              role: true,
            },
          },
        },
      }),
      prisma.communityQuestion.count({ where }),
    ]);

    return {
      meta: {
        page: parseInt(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
      questions,
    };
  }

  // User/Consultant: Get single question (only their own)
  async getMyQuestionById(questionId, userId) {
    const question = await prisma.communityQuestion.findFirst({
      where: {
        id: questionId,
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    if (!question) {
      throw new NotFoundError('Question not found');
    }

    return question;
  }

  // Admin: Get all questions (with filters)
  async getAllQuestions(queryParams = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
      questionType,
      topic,
      search,
    } = queryParams;

    const where = {};

    if (status) where.status = status;
    if (questionType) where.questionType = questionType;
    if (topic) where.topic = { contains: topic, mode: 'insensitive' };
    
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { question: { contains: search, mode: 'insensitive' } },
        { answer: { contains: search, mode: 'insensitive' } },
        { topic: { contains: search, mode: 'insensitive' } },
      ];
    }

    const take = Math.min(parseInt(limit) || 20, 100);
    const skip = (parseInt(page) - 1) * take;

    const orderBy = [];
    const validSortFields = ['createdAt', 'updatedAt', 'status'];
    if (validSortFields.includes(sortBy)) {
      orderBy.push({ [sortBy]: sortOrder === 'asc' ? 'asc' : 'desc' });
    } else {
      orderBy.push({ createdAt: 'desc' });
    }

    const [questions, total] = await Promise.all([
      prisma.communityQuestion.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              role: true,
            },
          },
        },
      }),
      prisma.communityQuestion.count({ where }),
    ]);

    return {
      meta: {
        page: parseInt(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
      questions,
    };
  }

  // Admin: Answer a question
  async answerQuestion(questionId, adminId, answer) {
    const question = await prisma.communityQuestion.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      throw new NotFoundError('Question not found');
    }

    if (question.status === 'ANSWERED') {
      throw new ForbiddenError('This question has already been answered');
    }

    const updatedQuestion = await prisma.communityQuestion.update({
      where: { id: questionId },
      data: {
        answer,
        status: 'ANSWERED',
        answeredBy: adminId,
        answeredAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    log.info(`Question ${questionId} answered by admin ${adminId}`);
    return updatedQuestion;
  }

  // Admin: Update answer
  async updateAnswer(questionId, adminId, answer) {
    const question = await prisma.communityQuestion.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      throw new NotFoundError('Question not found');
    }

    const updatedQuestion = await prisma.communityQuestion.update({
      where: { id: questionId },
      data: {
        answer,
        answeredBy: adminId,
        answeredAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    log.info(`Question ${questionId} answer updated by admin ${adminId}`);
    return updatedQuestion;
  }



  // Admin: Change question status
  async updateQuestionStatus(questionId, status) {
    const question = await prisma.communityQuestion.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      throw new NotFoundError('Question not found');
    }

    const updatedQuestion = await prisma.communityQuestion.update({
      where: { id: questionId },
      data: { status },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    log.info(`Question ${questionId} status updated to ${status}`);
    return updatedQuestion;
  }

  // Admin: Delete question
  async deleteQuestion(questionId) {
    const question = await prisma.communityQuestion.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      throw new NotFoundError('Question not found');
    }

    await prisma.communityQuestion.delete({
      where: { id: questionId },
    });

    log.info(`Question ${questionId} deleted by admin`);
    return { success: true, message: 'Question deleted successfully' };
  }




}

export const communityQuestionService = new CommunityQuestionService();