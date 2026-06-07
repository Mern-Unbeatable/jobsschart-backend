
import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../shared/globals/helpers/error-handler.js';

class DonationService {
    constructor() {
        this.log = new Logger('DonationService');
    }
    async getMyDonations(userId, queryParams = {}) {
        const page = parseInt(queryParams.page) || 1;
        const limit = Math.min(parseInt(queryParams.limit) || 20, 100);
        const skip = (page - 1) * limit;

        const [donations, total] = await Promise.all([
            prisma.donation.findMany({
                where: { donorId: userId },
                include: {
                    ads: {
                        select: {
                            id: true, status: true, isActive: true,
                            startDate: true, endDate: true,
                            impressions: true, clicks: true,
                        },
                    },
                    payments: {
                        where: { status: 'SUCCESS' },
                        select: { id: true, amount: true, status: true, createdAt: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.donation.count({ where: { donorId: userId } }),
        ]);

        return { meta: { page, limit, total, totalPages: Math.ceil(total / limit) }, donations };
    }


    async getAllDonations(queryParams = {}) {
        const page = parseInt(queryParams.page) || 1;
        const limit = Math.min(parseInt(queryParams.limit) || 20, 100);
        const skip = (page - 1) * limit;

        const where = {};
        if (queryParams.donorType) where.donorType = queryParams.donorType;
        if (queryParams.search) {
            where.OR = [
                { name: { contains: queryParams.search, mode: 'insensitive' } },
                { email: { contains: queryParams.search, mode: 'insensitive' } },
                { benefit: { contains: queryParams.search, mode: 'insensitive' } },
            ];
        }

        const sortField = queryParams.sortBy || 'createdAt';
        const sortOrder = queryParams.sortOrder === 'asc' ? 'asc' : 'desc';

        const [donations, total] = await Promise.all([
            prisma.donation.findMany({
                where,
                include: {
                    donor: { select: { id: true, name: true, email: true } },
                    ads: {
                        select: {
                            id: true, status: true, isActive: true,
                            startDate: true, endDate: true,
                            impressions: true, clicks: true,
                        },
                    },
                    payments: {
                        where: { status: 'SUCCESS' },
                        select: { id: true, amount: true, createdAt: true },
                    },
                },
                orderBy: { [sortField]: sortOrder },
                skip,
                take: limit,
            }),
            prisma.donation.count({ where }),
        ]);

        return { meta: { page, limit, total, totalPages: Math.ceil(total / limit) }, donations };
    }


    async getDonationById(id) {
        const donation = await prisma.donation.findUnique({
            where: { id },
            include: {
                donor: { select: { id: true, name: true, email: true, phone: true } },
                ads: {
                    select: {
                        id: true,
                        title: true,
                        description: true,
                        image: true,
                        budget: true,
                        spentAmount: true,
                        status: true,
                        isActive: true,
                        startDate: true,
                        endDate: true,
                        impressions: true,
                        clicks: true,
                        createdAt: true,
                        updatedAt: true
                    }
                },
                payments: {
                    select: {
                        id: true,
                        amount: true,
                        status: true,
                        createdAt: true
                    }
                }
            },
        });
        if (!donation) throw new NotFoundError('Donation not found');
        return donation;
    }



    async deleteDonation(id, userId, userRole) {
        const donation = await prisma.donation.findUnique({
            where: { id },
            include: { payments: true, ads: true },
        });
        if (!donation) throw new NotFoundError('Donation not found');
        if (donation.donorId !== userId && userRole !== 'ADMIN') {
            throw new ForbiddenError('You can only delete your own donations');
        }
        if (donation.payments.length > 0) {
            throw new ConflictError('Cannot delete a donation that has payments');
        }

        if (donation.ads.length > 0) {
            const campaignIds = donation.ads.map((a) => a.id);
            await prisma.adPlacementConfig.deleteMany({ where: { campaignId: { in: campaignIds } } });
            await prisma.adCampaign.deleteMany({ where: { id: { in: campaignIds } } });
        }

        await prisma.donation.delete({ where: { id } });
        this.log.info(`Donation ${id} deleted`);
        return { success: true, message: 'Donation deleted successfully' };
    }


async getDonationStats() {
    const [totalDonations, totalAmount, byType, uniqueDonors] = await Promise.all([
        prisma.donation.count(),
        prisma.donation.aggregate({ _sum: { amount: true } }),
        prisma.donation.groupBy({
            by: ['donorType'],
            _count: { id: true },
            _sum: { amount: true },
        }),
        // Get unique donors count (distinct donorId)
        prisma.donation.groupBy({
            by: ['donorId'],
            _count: { id: true },
        }),
    ]);

    // Calculate total unique donors
    const totalDonors = uniqueDonors.length;

    // Get business donors count (distinct donorId where donorType is BUSINESS)
    const businessDonorsData = await prisma.donation.groupBy({
        by: ['donorId'],
        where: { donorType: 'BUSINESS' },
        _count: { id: true },
    });
    const businessDonors = businessDonorsData.length;

    // Get individual donors count (distinct donorId where donorType is INDIVIDUAL)
    const individualDonorsData = await prisma.donation.groupBy({
        by: ['donorId'],
        where: { donorType: 'INDIVIDUAL' },
        _count: { id: true },
    });
    const individualDonors = individualDonorsData.length;




    return {
        summary: {
            totalDonations: totalDonations || 0,
            totalAmount: totalAmount._sum.amount || 0,
            totalDonors: totalDonors || 0,
            businessDonors: businessDonors || 0,
            individualDonors: individualDonors || 0,
        },
        
   
   
    };
}
}

export const donationService = new DonationService();