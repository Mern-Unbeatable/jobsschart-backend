import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import {
    NotFoundError,
    ConflictError,
} from '../../shared/globals/helpers/error-handler.js';
import { expandI18n, jsonLocaleSearch } from '../../shared/services/translate.service.js';

const log = new Logger('TopicService');

class TopicService {
    async getAllTopics(queryParams = {}) {
        const page = parseInt(queryParams.page) || 1;
        const limit = Math.min(parseInt(queryParams.limit) || 50, 100);
        const skip = (page - 1) * limit;

        const where = {};

        if (queryParams.search) {
            where.OR = jsonLocaleSearch(['name'], queryParams.search);
        }

        const sortField = queryParams.sortBy === 'name' ? 'createdAt' : (queryParams.sortBy || 'createdAt');
        const sortOrder = queryParams.sortOrder === 'desc' ? 'desc' : 'asc';
        const orderBy = { [sortField]: sortOrder };

        const [topics, total] = await Promise.all([
            prisma.topic.findMany({
                where,
                orderBy,
                skip,
                take: limit,
            }),
            prisma.topic.count({ where }),
        ]);

        return {
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
            topics,
        };
    }

    async getTopicById(id) {
        const topic = await prisma.topic.findUnique({
            where: { id },
        });

        if (!topic) {
            throw new NotFoundError('Topic not found');
        }

        return topic;
    }

    async createTopic(data) {
        const topic = await prisma.topic.create({
            data: {
                name: await expandI18n(data.name, { sourceLocale: data.sourceLang || 'en' }),
            },
        });

        log.info(`Topic created: ${topic.id}`);
        return topic;
    }

    async updateTopic(id, data) {
        const topic = await prisma.topic.findUnique({
            where: { id },
        });

        if (!topic) {
            throw new NotFoundError('Topic not found');
        }

        const updated = await prisma.topic.update({
            where: { id },
            data: {
                name: data.name
                    ? await expandI18n(data.name, { sourceLocale: data.sourceLang || 'en' })
                    : undefined,
            },
        });

        log.info(`Topic updated: ${id}`);
        return updated;
    }

    async deleteTopic(id) {
        const topic = await prisma.topic.findUnique({
            where: { id },
        });

        if (!topic) {
            throw new NotFoundError('Topic not found');
        }

        await prisma.topic.delete({
            where: { id },
        });

        log.info(`Topic deleted: ${id} — "${topic.name}"`);
        return {
            success: true,
            message: 'Topic deleted successfully',
        };
    }
}

export const topicService = new TopicService();