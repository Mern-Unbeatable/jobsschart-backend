import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';

const log = new Logger('AdminDashboardService');

class AdminDashboardService {
    async getStats() {
        const [
            totalUsers,
            totalConsultants,
            totalCalls,
            totalChats,
            completedCalls,
            completedChats,
            activeCalls,
            activeChats,
            donationSum,
            webshopSum,
        ] = await Promise.all([
            prisma.user.count({ where: { role: 'USER' } }),
            prisma.consultant.count(),

            // all calls ever created (any status)
            prisma.call.count(),
            // chats that actually had a real session (mirrors AdminSessionsService logic)
            prisma.chatConversation.count({ where: { sessionStatus: { in: ['ACTIVE', 'ENDED'] } } }),

            // only completed ones count toward revenue
            prisma.call.aggregate({
                where: { status: 'COMPLETED' },
                _sum: { totalCost: true },
            }),
            prisma.chatConversation.aggregate({
                where: { sessionStatus: 'ENDED' },
                _sum: { totalCost: true },
            }),

            prisma.call.count({ where: { status: 'ACTIVE' } }),
            prisma.chatConversation.count({ where: { sessionStatus: 'ACTIVE' } }),

            prisma.payment.aggregate({
                where: { type: 'DONATION', status: 'SUCCESS' },
                _sum: { amount: true },
            }),
            prisma.payment.aggregate({
                where: { type: 'WEBSHOP', status: 'SUCCESS' },
                _sum: { amount: true },
            }),
        ]);

        const consultationRevenue =
            Number(completedCalls._sum.totalCost || 0) + Number(completedChats._sum.totalCost || 0);
        const donationRevenue = Number(donationSum._sum.amount || 0);
        const webshopRevenue = Number(webshopSum._sum.amount || 0);

        return {
            totalUsers,
            totalConsultants,
            totalConsultations: totalCalls + totalChats,
            totalRevenue: Number((consultationRevenue + donationRevenue + webshopRevenue).toFixed(2)),
            activeCalls: activeCalls + activeChats,
        };
    }

    // ─────────────────────────────────────────────────────────
    // 2. Revenue chart: Donation / Webshop / Consultant per month
    //    period: 'this_year' | 'last_year' | '6_months'
    // ─────────────────────────────────────────────────────────
    _getDateRange(period) {
        const now = new Date();
        let start;
        let end;
        let months;

        switch (period) {
            case 'last_year':
                start = new Date(now.getFullYear() - 1, 0, 1);
                end = new Date(now.getFullYear(), 0, 1);
                months = 12;
                break;

            case '6_months':
                end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
                months = 6;
                break;

            case 'this_year':
            default:
                start = new Date(now.getFullYear(), 0, 1);
                end = new Date(now.getFullYear() + 1, 0, 1);
                months = 12;
        }

        return { start, end, months };
    }

    async getRevenueChart(period = 'this_year') {
        const { start, end, months } = this._getDateRange(period);

        const [donationRows, webshopRows, callRows, chatRows] = await Promise.all([
            prisma.$queryRaw`
                SELECT date_trunc('month', "createdAt") AS month, SUM(amount)::float AS total
                FROM payments
                WHERE type = 'DONATION' AND status = 'SUCCESS'
                  AND "createdAt" >= ${start} AND "createdAt" < ${end}
                GROUP BY month ORDER BY month;
            `,
            prisma.$queryRaw`
                SELECT date_trunc('month', "createdAt") AS month, SUM(amount)::float AS total
                FROM payments
                WHERE type = 'WEBSHOP' AND status = 'SUCCESS'
                  AND "createdAt" >= ${start} AND "createdAt" < ${end}
                GROUP BY month ORDER BY month;
            `,
            prisma.$queryRaw`
                SELECT date_trunc('month', "createdAt") AS month, SUM("totalCost")::float AS total
                FROM calls
                WHERE status = 'COMPLETED'
                  AND "createdAt" >= ${start} AND "createdAt" < ${end}
                GROUP BY month ORDER BY month;
            `,
            prisma.$queryRaw`
                SELECT date_trunc('month', "createdAt") AS month, SUM("totalCost")::float AS total
                FROM chat_conversations
                WHERE "sessionStatus" = 'ENDED'
                  AND "createdAt" >= ${start} AND "createdAt" < ${end}
                GROUP BY month ORDER BY month;
            `,
        ]);

        // build empty month buckets across the range so missing months show as 0
        const buckets = [];
        const cursor = new Date(start);
        for (let i = 0; i < months; i++) {
            buckets.push({
                key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
                label: cursor.toLocaleString('en-US', { month: 'short' }),
                donation: 0,
                webshop: 0,
                consultant: 0,
            });
            cursor.setMonth(cursor.getMonth() + 1);
        }

        const keyOf = (rawMonth) => {
            const d = new Date(rawMonth);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        };

        const fillBucket = (rows, field) => {
            rows.forEach((row) => {
                const bucket = buckets.find((b) => b.key === keyOf(row.month));
                if (bucket) bucket[field] = Number(row.total || 0);
            });
        };

        fillBucket(donationRows, 'donation');
        fillBucket(webshopRows, 'webshop');

        // calls + chats together make up the "Consultant" series
        [...callRows, ...chatRows].forEach((row) => {
            const bucket = buckets.find((b) => b.key === keyOf(row.month));
            if (bucket) bucket.consultant += Number(row.total || 0);
        });

        return {
            period,
            data: buckets.map((b) => ({
                month: b.label,
                donation: Number(b.donation.toFixed(2)),
                webshop: Number(b.webshop.toFixed(2)),
                consultant: Number(b.consultant.toFixed(2)),
            })),
        };
    }
}

export const adminDashboardService = new AdminDashboardService();