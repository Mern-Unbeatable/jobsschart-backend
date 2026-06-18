import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import { NotFoundError } from '../../shared/globals/helpers/error-handler.js';

const log = new Logger('FaqService');

class FaqService {
  // Admin: Create FAQ
  async createFaq(data) {
    const faq = await prisma.faq.create({
      data: {
        question: data.question,
        answer: data.answer,
        sortOrder: data.sortOrder || 0,
      },
    });

    log.info(`FAQ created: ${faq.id}`);
    return faq;
  }

  // Public: Get all FAQs (with pagination & search)
  async getAllFaqs(queryParams = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'sortOrder',
      sortOrder = 'asc',
      search,
    } = queryParams;

    const where = {};

    if (search) {
      where.OR = [
        { question: { contains: search, mode: 'insensitive' } },
        { answer: { contains: search, mode: 'insensitive' } },
      ];
    }

    const take = Math.min(parseInt(limit) || 20, 100);
    const skip = (parseInt(page) - 1) * take;

    const orderBy = [];
    const validSortFields = ['sortOrder', 'createdAt', 'updatedAt', 'question'];
    if (validSortFields.includes(sortBy)) {
      orderBy.push({ [sortBy]: sortOrder === 'asc' ? 'asc' : 'desc' });
    } else {
      orderBy.push({ sortOrder: 'asc' });
    }

    const [faqs, total] = await Promise.all([
      prisma.faq.findMany({
        where,
        orderBy,
        skip,
        take,
      }),
      prisma.faq.count({ where }),
    ]);

    return {
      meta: {
        page: parseInt(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
      faqs,
    };
  }

  // Public: Get single FAQ by ID
  async getFaqById(id) {
    const faq = await prisma.faq.findUnique({
      where: { id },
    });

    if (!faq) {
      throw new NotFoundError('FAQ not found');
    }

    return faq;
  }

  // Admin: Update FAQ
  async updateFaq(id, data) {
    const faq = await prisma.faq.findUnique({
      where: { id },
    });

    if (!faq) {
      throw new NotFoundError('FAQ not found');
    }

    const updatedFaq = await prisma.faq.update({
      where: { id },
      data: {
        question: data.question !== undefined ? data.question : undefined,
        answer: data.answer !== undefined ? data.answer : undefined,
        sortOrder: data.sortOrder !== undefined ? data.sortOrder : undefined,
      },
    });

    log.info(`FAQ updated: ${id}`);
    return updatedFaq;
  }

  // Admin: Delete FAQ
  async deleteFaq(id) {
    const faq = await prisma.faq.findUnique({
      where: { id },
    });

    if (!faq) {
      throw new NotFoundError('FAQ not found');
    }

    await prisma.faq.delete({
      where: { id },
    });

    log.info(`FAQ deleted: ${id}`);
    return { success: true, message: 'FAQ deleted successfully' };
  }
}

export const faqService = new FaqService();