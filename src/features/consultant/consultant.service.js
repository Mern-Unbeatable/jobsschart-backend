// src/features/consultant/consultant.service.js
import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';

class ConsultantService {
    constructor() {
        this.log = new Logger('ConsultantService');
    }

    async getConsultantProfile(userId) {
        const consultant = await prisma.consultant.findUnique({
            where: { userId },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        username: true,
                        name: true,
                        avatar: true,
                        bio: true,
                        location: true,
                        phone: true,
                        language: true,
                        isVerified: true,
                        status: true,
                        wallet: true,
                    },
                },
                reviews: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                username: true,
                                avatar: true,
                            },
                        },
                    },
                },
                earnings: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                },
                schedules: {
                    where: {
                        bookingDate: { gte: new Date() },
                        status: 'CONFIRMED',
                    },
                    orderBy: { bookingDate: 'asc' },
                    take: 10,
                },
            },
        });

        if (!consultant) return null;

        const avgRating = consultant.reviews.length > 0
            ? consultant.reviews.reduce((sum, r) => sum + r.rating, 0) / consultant.reviews.length
            : 0;

        return {
            ...consultant,
            averageRating: avgRating,
        };
    }

    async updateConsultantProfile(userId, data) {
        const { specialization, bio, pricePerMinute, firstNMinutes, firstNPrice } = data;

        const updatedConsultant = await prisma.consultant.update({
            where: { userId },
            data: {
                ...(specialization !== undefined && { specialization }),
                ...(bio !== undefined && { bio }),
                ...(pricePerMinute !== undefined && { pricePerMinute }),
                ...(firstNMinutes !== undefined && { firstNMinutes }),
                ...(firstNPrice !== undefined && { firstNPrice }),
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        username: true,
                        name: true,
                        avatar: true,
                        bio: true,
                        location: true,
                        phone: true,
                    },
                },
            },
        });

        return updatedConsultant;
    }

    async updateOnlineStatus(userId, onlineStatus) {
        return prisma.consultant.update({
            where: { userId },
            data: { onlineStatus },
            select: {
                id: true,
                userId: true,
                onlineStatus: true,
                updatedAt: true,
            },
        });
    }

    async getAllConsultants(queryParams = {}) {
        const page = parseInt(queryParams.page) || 1;
        const limit = Math.min(parseInt(queryParams.limit) || 20, 100);
        const skip = (page - 1) * limit;

        const where = {};

        if (queryParams.approved !== undefined) {
            where.isApproved = queryParams.approved === 'true';
        }

        if (queryParams.onlineStatus) {
            where.onlineStatus = queryParams.onlineStatus;
        }

        if (queryParams.specialization) {
            where.specialization = { has: queryParams.specialization };
        }

        if (queryParams.minRating) {
            where.rating = { gte: parseFloat(queryParams.minRating) };
        }

        if (queryParams.status) {
            where.user = { status: queryParams.status };
        }

        if (queryParams.search) {
            const searchTerm = queryParams.search.trim();
            where.user = {
                ...where.user,
                OR: [
                    { name: { contains: searchTerm, mode: 'insensitive' } },
                    { username: { contains: searchTerm, mode: 'insensitive' } },
                    { email: { contains: searchTerm, mode: 'insensitive' } },
                ],
            };
        }

        const sortField = queryParams.sortBy || 'rating';
        const sortOrder = queryParams.sortOrder === 'asc' ? 'asc' : 'desc';

        const [consultants, total] = await Promise.all([
            prisma.consultant.findMany({
                where,
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            username: true,
                            name: true,
                            avatar: true,
                            bio: true,
                            location: true,
                            phone: true,
                            isVerified: true,
                            status: true
                        },
                    },
                    reviews: {
                        select: { rating: true, comment: true, user: { select: { id: true, username: true } } },
                    },
                    earnings: true,
                    payouts: true,
                    schedules: true,
                },
                orderBy: { [sortField]: sortOrder },
                skip,
                take: limit,
            }),
            prisma.consultant.count({ where }),
        ]);

        const consultantsWithAvgRating = consultants.map(c => ({
            ...c,
            averageRating: c.reviews.length > 0
                ? c.reviews.reduce((sum, r) => sum + r.rating, 0) / c.reviews.length
                : 0,
            totalReviews: c.reviews.length,
        }));

        return {
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
            consultants: consultantsWithAvgRating,
        };
    }

    async getConsultantById(consultantId) {
        const consultant = await prisma.consultant.findUnique({
            where: { id: consultantId },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        username: true,
                        name: true,
                        avatar: true,
                        bio: true,
                        location: true,
                        phone: true,
                        isVerified: true,
                        status: true,
                    },
                },
                reviews: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                username: true,
                                avatar: true,
                            },
                        },
                    },
                },
                earnings: true,
                payouts: true,
                schedules: true,
            },
        });

        if (!consultant) return null;

        const avgRating = consultant.reviews.length > 0
            ? consultant.reviews.reduce((sum, r) => sum + r.rating, 0) / consultant.reviews.length
            : 0;

        return {
            ...consultant,
            averageRating: avgRating,
        };
    }

    // ==================== COMPLETE EARNINGS DASHBOARD ====================

  

    // NEW: Get complete earnings dashboard data
// src/features/consultant/consultant.service.js

// FIXED: Corrected getEarningsDashboard method
async getEarningsDashboard(userId) {
    // Get consultant by userId
    const consultant = await prisma.consultant.findUnique({
        where: { userId },
        select: { id: true },
    });

    if (!consultant) throw new Error('Consultant not found');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
    
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    // Get wallet balance from User model (wallet is related to User, not Consultant)
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            wallet: {
                select: {
                    creditBalance: true,
                },
            },
        },
    });

    // Get all earnings for calculations
    const allEarnings = await prisma.consultantEarning.findMany({
        where: { consultantId: consultant.id },
        select: {
            consultantShare: true,
            createdAt: true,
            isPaidOut: true,
        },
    });

    // Calculate today's income
    const todayIncome = allEarnings
        .filter(e => new Date(e.createdAt) >= today)
        .reduce((sum, e) => sum + Number(e.consultantShare), 0);

    // Calculate total revenue (all time)
    const totalRevenue = allEarnings.reduce((sum, e) => sum + Number(e.consultantShare), 0);

    // Calculate withdrawable amount (earned but not paid out)
    const withdrawableAmount = allEarnings
        .filter(e => !e.isPaidOut)
        .reduce((sum, e) => sum + Number(e.consultantShare), 0);

    // Available balance (from wallet)
    const availableBalance = user?.wallet?.creditBalance || 0;

    // Calculate this week's income
    const weekIncome = allEarnings
        .filter(e => new Date(e.createdAt) >= startOfWeek)
        .reduce((sum, e) => sum + Number(e.consultantShare), 0);

    // Calculate this month's income
    const monthIncome = allEarnings
        .filter(e => new Date(e.createdAt) >= startOfMonth)
        .reduce((sum, e) => sum + Number(e.consultantShare), 0);

    // Calculate monthly earnings for chart (last 12 months)
    const monthlyEarnings = [];
    for (let i = 11; i >= 0; i--) {
        const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
        
        const monthEarnings = allEarnings
            .filter(e => {
                const earningDate = new Date(e.createdAt);
                return earningDate >= monthStart && earningDate <= monthEnd;
            })
            .reduce((sum, e) => sum + Number(e.consultantShare), 0);
        
        monthlyEarnings.push({
            month: monthDate.toLocaleString('default', { month: 'short' }),
            year: monthDate.getFullYear(),
            earnings: Number(monthEarnings.toFixed(2)),
        });
    }

    // Calculate today's scheduled sessions count
    const todaySessions = await prisma.schedule.count({
        where: {
            consultantId: consultant.id,
            bookingDate: {
                gte: today,
                lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
            },
            status: { in: ['CONFIRMED', 'PENDING'] },
        },
    });

    return {
        dashboard: {
            todayIncome: Number(todayIncome.toFixed(2)),
            totalRevenue: Number(totalRevenue.toFixed(2)),
            withdrawableAmount: Number(withdrawableAmount.toFixed(2)),
            availableBalance: Number(availableBalance.toFixed(2)),
            weekIncome: Number(weekIncome.toFixed(2)),
            monthIncome: Number(monthIncome.toFixed(2)),
            todaySessions,
        },
        chart: {
            monthlyEarnings,
        },
    };
}

    // NEW: Get earnings over time for chart data
    async getEarningsOverTime(userId, period = 'monthly') {
        const consultant = await prisma.consultant.findUnique({
            where: { userId },
            select: { id: true },
        });

        if (!consultant) throw new Error('Consultant not found');

        const allEarnings = await prisma.consultantEarning.findMany({
            where: { consultantId: consultant.id },
            select: {
                consultantShare: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
        });

        const today = new Date();
        
        if (period === 'weekly') {
            // Last 12 weeks
            const weeklyEarnings = [];
            for (let i = 11; i >= 0; i--) {
                const weekStart = new Date(today);
                weekStart.setDate(today.getDate() - (today.getDay() + 7 * i));
                weekStart.setHours(0, 0, 0, 0);
                
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekStart.getDate() + 6);
                weekEnd.setHours(23, 59, 59, 999);
                
                const weekEarnings = allEarnings
                    .filter(e => {
                        const earningDate = new Date(e.createdAt);
                        return earningDate >= weekStart && earningDate <= weekEnd;
                    })
                    .reduce((sum, e) => sum + Number(e.consultantShare), 0);
                
                weeklyEarnings.push({
                    week: `Week ${i + 1}`,
                    startDate: weekStart.toISOString().split('T')[0],
                    endDate: weekEnd.toISOString().split('T')[0],
                    earnings: Number(weekEarnings.toFixed(2)),
                });
            }
            return weeklyEarnings;
        } else {
            // Last 12 months
            const monthlyEarnings = [];
            for (let i = 11; i >= 0; i--) {
                const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
                const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
                const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
                
                const monthEarnings = allEarnings
                    .filter(e => {
                        const earningDate = new Date(e.createdAt);
                        return earningDate >= monthStart && earningDate <= monthEnd;
                    })
                    .reduce((sum, e) => sum + Number(e.consultantShare), 0);
                
                monthlyEarnings.push({
                    month: monthDate.toLocaleString('default', { month: 'short' }),
                    year: monthDate.getFullYear(),
                    earnings: Number(monthEarnings.toFixed(2)),
                });
            }
            return monthlyEarnings;
        }
    }

    async approveConsultant(consultantId, isApproved) {
        const consultant = await prisma.consultant.findUnique({
            where: { id: consultantId },
        });

        if (!consultant) throw new Error('Consultant not found');

        const updatedConsultant = await prisma.consultant.update({
            where: { id: consultantId },
            data: { isApproved },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        username: true,
                        name: true,
                        avatar: true,
                        isVerified: true,
                    },
                },
            },
        });

        if (isApproved) {
            await prisma.user.update({
                where: { id: consultant.userId },
                data: { isVerified: true },
            });
        }

        return updatedConsultant;
    }

    async updateScheduleStatus(userId, scheduleId, status, notes) {
        const consultant = await prisma.consultant.findUnique({
            where: { userId },
        });

        if (!consultant) throw new Error('Consultant not found');

        return prisma.schedule.update({
            where: { id: scheduleId, consultantId: consultant.id },
            data: { status, notes },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        username: true,
                        email: true,
                        phone: true,
                    },
                },
            },
        });
    }
}

export const consultantService = new ConsultantService();