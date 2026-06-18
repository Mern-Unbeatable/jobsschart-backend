// src/modules/payout/payout.service.js
import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import {
    NotFoundError,
    BadRequestError,
    ConflictError,
} from '../../shared/globals/helpers/error-handler.js';

const log = new Logger('PayoutService');

const MIN_PAYOUT_AMOUNT = 10;

class PayoutService {

    // ─────────────────────────────────────────────────────────────────
    // CONSULTANT: Get balance
    // ─────────────────────────────────────────────────────────────────
    async getConsultantBalance(userId) {
        const consultant = await prisma.consultant.findUnique({
            where: { userId },
            select: { id: true },
        });

        if (!consultant) throw new NotFoundError('Consultant profile not found');

        const unpaidEarnings = await prisma.consultantEarning.aggregate({
            where: { consultantId: consultant.id, isPaidOut: false },
            _sum: { consultantShare: true },
            _count: { id: true },
        });

        const paidEarnings = await prisma.consultantEarning.aggregate({
            where: { consultantId: consultant.id, isPaidOut: true },
            _sum: { consultantShare: true },
        });

        const pendingPayouts = await prisma.payout.aggregate({
            where: {
                consultantId: consultant.id,
                status: { in: ['PENDING', 'APPROVED', 'PROCESSING'] },
            },
            _sum: { amount: true },
        });

        const availableBalance   = Number(unpaidEarnings._sum?.consultantShare || 0);
        const pendingPayoutAmount = Number(pendingPayouts._sum?.amount || 0);
        const withdrawableBalance = Math.max(0, availableBalance - pendingPayoutAmount);

        return {
            availableBalance,
            withdrawableBalance,
            pendingPayoutAmount,
            totalEarned:
                Number(unpaidEarnings._sum?.consultantShare || 0) +
                Number(paidEarnings._sum?.consultantShare || 0),
            totalPaidOut:    Number(paidEarnings._sum?.consultantShare || 0),
            unpaidCallCount: unpaidEarnings._count?.id || 0,
            minimumPayout:   MIN_PAYOUT_AMOUNT,
        };
    }

    // ─────────────────────────────────────────────────────────────────
    // CONSULTANT: Request payout — bank details submitted with request
    // ─────────────────────────────────────────────────────────────────
    async requestPayout(userId, { amount, organisationName, routingNumber, accountNumber }) {
        const consultant = await prisma.consultant.findUnique({
            where: { userId },
            select: { id: true },
        });

        if (!consultant) throw new NotFoundError('Consultant profile not found');

        if (!amount || amount < MIN_PAYOUT_AMOUNT) {
            throw new BadRequestError(`Minimum payout amount is €${MIN_PAYOUT_AMOUNT}`);
        }

        // Balance check
        const balance = await this.getConsultantBalance(userId);
        if (amount > balance.withdrawableBalance) {
            throw new BadRequestError(
                `Insufficient balance. Available: €${balance.withdrawableBalance.toFixed(2)}, ` +
                `Requested: €${amount}`
            );
        }

        // Duplicate pending check
        const existingPending = await prisma.payout.findFirst({
            where: {
                consultantId: consultant.id,
                status: { in: ['PENDING', 'APPROVED', 'PROCESSING'] },
            },
        });

        if (existingPending) {
            throw new ConflictError(
                'You already have a pending payout request. ' +
                'Please wait for it to be processed before submitting a new one.'
            );
        }

        // Pick oldest unpaid earnings up to the requested amount
        const unpaidEarnings = await prisma.consultantEarning.findMany({
            where: { consultantId: consultant.id, isPaidOut: false },
            orderBy: { createdAt: 'asc' },
        });

        let accumulated = 0;
        const earningsToInclude = [];
        for (const earning of unpaidEarnings) {
            if (accumulated >= amount) break;
            earningsToInclude.push(earning.id);
            accumulated += Number(earning.consultantShare);
        }

        // Create payout with bank details embedded
        const payout = await prisma.payout.create({
            data: {
                consultantId:     consultant.id,
                amount,
                status:           'PENDING',
                method:           'BANK',
                organisationName,
                routingNumber,
                accountNumber,
                requestedAt:      new Date(),
                earnings: {
                    connect: earningsToInclude.map((id) => ({ id })),
                },
            },
            include: {
                earnings: { select: { id: true, consultantShare: true } },
            },
        });

        log.info(
            `Bank payout request created: ${payout.id} for consultant ${consultant.id}, ` +
            `amount: €${amount}, account: ${accountNumber}`
        );

        return payout;
    }

    // ─────────────────────────────────────────────────────────────────
    // CONSULTANT: Own payout history
    // ─────────────────────────────────────────────────────────────────
    async getMyPayouts(userId, query = {}) {
        const consultant = await prisma.consultant.findUnique({
            where: { userId },
            select: { id: true },
        });

        if (!consultant) throw new NotFoundError('Consultant profile not found');

        const page  = parseInt(query.page)  || 1;
        const limit = Math.min(parseInt(query.limit) || 10, 50);
        const skip  = (page - 1) * limit;

        const where = { consultantId: consultant.id };
        if (query.status) where.status = query.status;

        const [payouts, total] = await Promise.all([
            prisma.payout.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    earnings: {
                        select: { id: true, consultantShare: true, createdAt: true },
                    },
                },
            }),
            prisma.payout.count({ where }),
        ]);

        return {
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
            payouts,
        };
    }

    // ─────────────────────────────────────────────────────────────────
    // ADMIN: All payouts
    // ─────────────────────────────────────────────────────────────────
    async getAllPayouts(query = {}) {
        const page  = parseInt(query.page)  || 1;
        const limit = Math.min(parseInt(query.limit) || 20, 100);
        const skip  = (page - 1) * limit;

        const where = {};
        if (query.status) where.status = query.status;

        const [payouts, total] = await Promise.all([
            prisma.payout.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    consultant: {
                        include: {
                            user: {
                                select: { id: true, name: true, email: true, avatar: true, phone: true },
                            },
                        },
                    },
                    earnings: {
                        select: {
                            id: true,
                            consultantShare: true,
                            grossAmount: true,
                            createdAt: true,
                        },
                    },
                },
            }),
            prisma.payout.count({ where }),
        ]);

        return {
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
            payouts,
        };
    }

    // ─────────────────────────────────────────────────────────────────
    // ADMIN: Approve payout — mark COMPLETED, admin transfers manually
    // ─────────────────────────────────────────────────────────────────
    async approvePayout(payoutId, adminId, { adminNote } = {}) {
        const payout = await prisma.payout.findUnique({
            where: { id: payoutId },
            include: {
                consultant: {
                    include: {
                        user: { select: { name: true, email: true } },
                    },
                },
                earnings: true,
            },
        });

        if (!payout) throw new NotFoundError('Payout not found');
        if (payout.status !== 'PENDING') {
            throw new BadRequestError(
                `Payout is already ${payout.status}. Only PENDING payouts can be approved.`
            );
        }

        const updatedPayout = await prisma.$transaction(async (tx) => {
            const updated = await tx.payout.update({
                where: { id: payoutId },
                data: {
                    status:      'COMPLETED',
                    reviewedBy:  adminId,
                    reviewedAt:  new Date(),
                    adminNote,
                    processedAt: new Date(),
                    completedAt: new Date(),
                    netAmount:   payout.amount,
                },
            });

            // Mark linked earnings as paid
            await tx.consultantEarning.updateMany({
                where: { payoutId },
                data:  { isPaidOut: true },
            });

            return updated;
        });

        log.info(
            `Payout ${payoutId} approved by admin ${adminId}. ` +
            `Account: ${payout.accountNumber}, Org: ${payout.organisationName}`
        );

        return updatedPayout;
    }

    // ─────────────────────────────────────────────────────────────────
    // ADMIN: Reject payout
    // ─────────────────────────────────────────────────────────────────
    async rejectPayout(payoutId, adminId, { rejectReason }) {
        if (!rejectReason) throw new BadRequestError('Reject reason is required');

        const payout = await prisma.payout.findUnique({ where: { id: payoutId } });

        if (!payout) throw new NotFoundError('Payout not found');
        if (payout.status !== 'PENDING') {
            throw new BadRequestError(
                `Only PENDING payouts can be rejected. Current status: ${payout.status}`
            );
        }

        const updatedPayout = await prisma.$transaction(async (tx) => {
            const updated = await tx.payout.update({
                where: { id: payoutId },
                data: {
                    status:      'REJECTED',
                    reviewedBy:  adminId,
                    reviewedAt:  new Date(),
                    rejectReason,
                },
            });

            // Release earnings back to available pool
            await tx.consultantEarning.updateMany({
                where: { payoutId },
                data:  { payoutId: null },
            });

            return updated;
        });

        log.info(`Payout ${payoutId} rejected by admin ${adminId}. Reason: ${rejectReason}`);
        return updatedPayout;
    }

    // ─────────────────────────────────────────────────────────────────
    // ADMIN: Platform earnings summary
    // ─────────────────────────────────────────────────────────────────
    async getPlatformEarningsSummary(query = {}) {
        const { startDate, endDate } = query;
        const dateFilter = {};
        if (startDate) dateFilter.gte = new Date(startDate);
        if (endDate)   dateFilter.lte = new Date(endDate);

        const where = {};
        if (Object.keys(dateFilter).length > 0) where.createdAt = dateFilter;

        const [totalEarnings, totalPayouts, pendingPayouts, consultantCount] =
            await Promise.all([
                prisma.consultantEarning.aggregate({
                    where,
                    _sum: { grossAmount: true, consultantShare: true, platformShare: true },
                }),
                prisma.payout.aggregate({
                    where: { ...where, status: 'COMPLETED' },
                    _sum:  { amount: true },
                    _count: { id: true },
                }),
                prisma.payout.aggregate({
                    where: { status: { in: ['PENDING', 'APPROVED', 'PROCESSING'] } },
                    _sum:  { amount: true },
                    _count: { id: true },
                }),
                prisma.consultant.count({ where: { isApproved: true } }),
            ]);

        return {
            totalGrossRevenue:        Number(totalEarnings._sum?.grossAmount      || 0),
            totalConsultantEarnings:  Number(totalEarnings._sum?.consultantShare  || 0),
            totalPlatformEarnings:    Number(totalEarnings._sum?.platformShare     || 0),
            totalPaidOut:             Number(totalPayouts._sum?.amount             || 0),
            totalPayoutCount:         totalPayouts._count?.id                      || 0,
            pendingPayoutAmount:      Number(pendingPayouts._sum?.amount           || 0),
            pendingPayoutCount:       pendingPayouts._count?.id                    || 0,
            platformNetBalance:
                Number(totalEarnings._sum?.platformShare || 0) -
                Number(totalPayouts._sum?.amount          || 0),
            activeConsultants: consultantCount,
        };
    }

    // ─────────────────────────────────────────────────────────────────
    // ADMIN: Consultant earnings detail
    // ─────────────────────────────────────────────────────────────────
    async getConsultantEarningsDetail(consultantId, query = {}) {
        const page  = parseInt(query.page)  || 1;
        const limit = Math.min(parseInt(query.limit) || 20, 100);
        const skip  = (page - 1) * limit;

        const [earnings, total, summary] = await Promise.all([
            prisma.consultantEarning.findMany({
                where:   { consultantId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    calls: {
                        select: {
                            id: true, callType: true, durationSeconds: true, createdAt: true,
                        },
                    },
                },
            }),
            prisma.consultantEarning.count({ where: { consultantId } }),
            prisma.consultantEarning.aggregate({
                where: { consultantId },
                _sum:  { consultantShare: true, grossAmount: true },
            }),
        ]);

        return {
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
            earnings,
            summary: {
                totalGross:   Number(summary._sum?.grossAmount      || 0),
                totalEarned:  Number(summary._sum?.consultantShare  || 0),
            },
        };
    }
}

export const payoutService = new PayoutService();