
import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/globals/helpers/error-handler.js';

const log = new Logger('AdCampaignService');

class AdCampaignService {
    async getAllCampaigns(queryParams = {}) {
        const page = parseInt(queryParams.page) || 1;
        const limit = Math.min(parseInt(queryParams.limit) || 20, 100);
        const skip = (page - 1) * limit;

        const where = {};
        if (queryParams.status) where.status = queryParams.status;
        if (queryParams.isActive !== undefined) {
            where.isActive = queryParams.isActive === 'true';
        }
        if (queryParams.donorId) where.donorId = queryParams.donorId;

        if (queryParams.search) {
            where.OR = [
                { title: { contains: queryParams.search, mode: 'insensitive' } },
                { description: { contains: queryParams.search, mode: 'insensitive' } },
                { donor: { name: { contains: queryParams.search, mode: 'insensitive' } } },
            ];
        }

        const [campaigns, total] = await Promise.all([
            prisma.adCampaign.findMany({
                where,
                include: {
                    donor: { select: { id: true, name: true, email: true } },
                    donation: {
                        select: {
                            id: true, amount: true, benefit: true,
                            donorType: true, name: true, email: true, phone: true,
                            createdAt: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.adCampaign.count({ where }),
        ]);

        return { meta: { page, limit, total, totalPages: Math.ceil(total / limit) }, campaigns };
    }


    async getCampaignById(id) {
        const campaign = await prisma.adCampaign.findUnique({
            where: { id },
            include: {
                donor: { select: { id: true, name: true, email: true } },
                donation: true,
            },
        });
        if (!campaign) throw new NotFoundError('Campaign not found');
        return campaign;
    }

    async publishCampaign(id, data) {
        const campaign = await prisma.adCampaign.findUnique({ where: { id } });
        if (!campaign) throw new NotFoundError('Campaign not found');

        if (campaign.status === 'ACTIVE' && campaign.isActive) {
            throw new ConflictError('Campaign is already published');
        }

        const updateData = {
            status: 'ACTIVE',
            isActive: true,
            startDate: data?.startDate ? new Date(data.startDate) : campaign.startDate || new Date(),
            endDate: data?.endDate ? new Date(data.endDate) : campaign.endDate || null,
        };

        if (data?.placements && data.placements.length > 0) {
            updateData.placements = data.placements;
        }

        const updated = await prisma.adCampaign.update({
            where: { id },
            data: updateData,
            include: {
                donor: { select: { id: true, name: true, email: true } },
                donation: { select: { id: true, benefit: true, amount: true } },
            },
        });

        log.info(`Campaign published: ${id}`);
        return updated;
    }

    async unpublishCampaign(id) {
        const campaign = await prisma.adCampaign.findUnique({ where: { id } });
        if (!campaign) throw new NotFoundError('Campaign not found');

        if (!campaign.isActive) {
            throw new ConflictError('Campaign is already unpublished');
        }

        const updated = await prisma.adCampaign.update({
            where: { id },
            data: { status: 'PAUSED', isActive: false },
            include: {
                donor: { select: { id: true, name: true, email: true } },
                donation: { select: { id: true, benefit: true, amount: true } },
            },
        });

        log.info(`Campaign unpublished: ${id}`);
        return updated;
    }


    async updateCampaignSettings(id, data) {
        const campaign = await prisma.adCampaign.findUnique({ where: { id } });
        if (!campaign) throw new NotFoundError('Campaign not found');

        const updateData = {};

        if (data.title !== undefined) updateData.title = data.title;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.image !== undefined) updateData.image = data.image;
        if (data.linkUrl !== undefined) updateData.linkUrl = data.linkUrl;
        if (data.placements !== undefined) updateData.placements = data.placements;
        if (data.startDate !== undefined) {
            updateData.startDate = data.startDate ? new Date(data.startDate) : null;
        }
        if (data.endDate !== undefined) {
            updateData.endDate = data.endDate ? new Date(data.endDate) : null;
        }

        const updated = await prisma.adCampaign.update({
            where: { id },
            data: updateData,
            include: {
                donor: { select: { id: true, name: true, email: true } },
                donation: { select: { id: true, benefit: true, amount: true } },
            },
        });

        log.info(`Campaign settings updated: ${id}`);
        return updated;
    }

    async deleteCampaign(id) {
        const campaign = await prisma.adCampaign.findUnique({ where: { id } });
        if (!campaign) throw new NotFoundError('Campaign not found');
        if (campaign.status === 'ACTIVE' && campaign.isActive) {
            throw new ConflictError('Cannot delete an active/published campaign. Unpublish it first.');
        }

        await prisma.adCampaign.delete({ where: { id } });
        log.info(`Campaign deleted: ${id}`);
        return { success: true, message: 'Campaign deleted successfully' };
    }
    async getActiveCampaigns(placement) {
        const now = new Date();

        const where = {
            status: 'ACTIVE',
            isActive: true,
            OR: [
                { startDate: null },
                { startDate: { lte: now } }
            ],
            AND: [
                {
                    OR: [
                        { endDate: null },
                        { endDate: { gte: now } }
                    ]
                }
            ]
        };

        if (placement) {
            where.placements = { has: placement };
        }

        const campaigns = await prisma.adCampaign.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 10,
        });

        // Increment impression count
        if (campaigns.length > 0) {
            await prisma.adCampaign.updateMany({
                where: { id: { in: campaigns.map((c) => c.id) } },
                data: { impressions: { increment: 1 } },
            });
        }

        return campaigns;
    }

    async trackClick(id) {
        const campaign = await prisma.adCampaign.findUnique({
            where: { id },
            select: { id: true }
        });

        if (!campaign) throw new NotFoundError('Campaign not found');

        return prisma.adCampaign.update({
            where: { id },
            data: { clicks: { increment: 1 } }
        });
    }

}

export const adCampaignService = new AdCampaignService();