import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import {
    NotFoundError,
    ConflictError,
} from '../../shared/globals/helpers/error-handler.js';

const log = new Logger('TopicService');

class TopicService {
    async getAllTopics(queryParams = {}) {
        const page = parseInt(queryParams.page) || 1;
        const limit = Math.min(parseInt(queryParams.limit) || 50, 100);
        const skip = (page - 1) * limit;

        const where = {};

        if (queryParams.search) {
            where.name = {
                contains: queryParams.search,
                mode: 'insensitive'
            };
        }

        const orderBy = {};
        const sortField = queryParams.sortBy || 'name';
        const sortOrder = queryParams.sortOrder === 'desc' ? 'desc' : 'asc';
        orderBy[sortField] = sortOrder;

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
        const existingTopic = await prisma.topic.findFirst({
            where: {
                name: {
                    equals: data.name,
                    mode: 'insensitive',
                },
            },
        });

        if (existingTopic) {
            throw new ConflictError(`Topic "${data.name}" already exists`);
        }

        const topic = await prisma.topic.create({
            data: {
                name: data.name.trim(),
            },
        });

        log.info(`Topic created: ${topic.id} — "${topic.name}"`);
        return topic;
    }

    async updateTopic(id, data) {
        const topic = await prisma.topic.findUnique({
            where: { id },
        });

        if (!topic) {
            throw new NotFoundError('Topic not found');
        }

        if (data.name && data.name !== topic.name) {
            const existingTopic = await prisma.topic.findFirst({
                where: {
                    name: {
                        equals: data.name,
                        mode: 'insensitive',
                    },
                    NOT: { id }
                },
            });

            if (existingTopic) {
                throw new ConflictError(`Topic "${data.name}" already exists`);
            }
        }

        const updated = await prisma.topic.update({
            where: { id },
            data: {
                name: data.name?.trim(),
            },
        });

        log.info(`Topic updated: ${id} — "${updated.name}"`);
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
            message: `Topic "${topic.name}" deleted successfully`,
        };
    }
}

export const topicService = new TopicService();