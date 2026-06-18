import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';

class UserService {
  constructor() {
    this.log = new Logger('UserService');
  }

  async getUserById(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { wallet: true, consultant: true },
    });
    if (!user) return null;
    const { password, confirmPassword, ...rest } = user;
    return rest;
  }

  async getFullProfile(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        wallet: true,
        consultant: {
          include: {
            earnings: { orderBy: { createdAt: 'desc' }, take: 10 },
            payouts: { orderBy: { createdAt: 'desc' }, take: 5 },
            reviews: { orderBy: { createdAt: 'desc' }, take: 5 },
            schedules: { orderBy: { startTime: 'desc' }, take: 10 },
            availabilitySlots: true,
          },
        },
        creditTransactions: { orderBy: { createdAt: 'desc' }, take: 20 },
        packagePurchases: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { package: true },
        },
        callsAsUser: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            consultant: {
              select: { id: true, name: true, username: true, avatar: true, email: true },
            },
          },
        },
        callsAsConsultant: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            user: {
              select: { id: true, name: true, username: true, avatar: true, email: true },
            },
          },
        },
        posts: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!user) return null;
    const { password, confirmPassword, ...rest } = user;
    return rest;
  }

  async getUserWithDetails(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        wallet: true,
        consultant: {
          include: {
            earnings: true,
            payouts: true,
            reviews: true,
            schedules: true,
            availabilitySlots: true,
          },
        },
        creditTransactions: { orderBy: { createdAt: 'desc' }, take: 20 },
        packagePurchases: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { package: true },
        },
        payments: { orderBy: { createdAt: 'desc' }, take: 20 },
        callsAsUser: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            consultant: {
              select: { id: true, name: true, username: true, avatar: true },
            },
          },
        },
        callsAsConsultant: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            user: {
              select: { id: true, name: true, username: true, avatar: true },
            },
          },
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { items: { include: { product: true } } },
        },
      },
    });
    if (!user) return null;
    const { password, confirmPassword, ...rest } = user;
    return rest;
  }

  async updateProfile(userId, data) {
    const { name, bio, location, phone, avatar, language } = data;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined && { name }),
        ...(bio !== undefined && { bio }),
        ...(location !== undefined && { location }),
        ...(phone !== undefined && { phone }),
        ...(avatar !== undefined && { avatar }),
        ...(language !== undefined && { language }),
      },
      include: { wallet: true, consultant: true },
    });

    const { password, confirmPassword, ...rest } = updatedUser;
    return rest;
  }

  async getUserStats(userId) {
    const [user, totalCallsAsUser, totalCallsAsConsultant, totalCreditTransactions, totalEarnings] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          include: { wallet: true, consultant: true },
        }),
        prisma.call.count({ where: { userId, status: 'COMPLETED' } }),
        prisma.call.count({ where: { consultantId: userId, status: 'COMPLETED' } }),
        prisma.creditTransaction.aggregate({
          where: { userId, transactionType: 'PURCHASE' },
          _sum: { amount: true },
        }),
        prisma.consultantEarning.aggregate({
          where: { consultantId: userId, isPaidOut: true },
          _sum: { consultantShare: true },
        }),
      ]);

    return {
      credits: user?.wallet?.creditBalance || 0,
      totalCallsMade: totalCallsAsUser,
      totalCallsReceived: totalCallsAsConsultant,
      totalCreditsPurchased: totalCreditTransactions._sum.amount || 0,
      totalEarned: totalEarnings._sum.consultantShare || 0,
      consultantStatus: user?.consultant || null,
      memberSince: user?.createdAt,
    };
  }

  async getCreditHistory(userId, queryParams = {}) {
    const page = parseInt(queryParams.page) || 1;
    const limit = Math.min(parseInt(queryParams.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      prisma.creditTransaction.findMany({
        where: { userId },
        include: {
          call: {
            select: { id: true, callType: true, status: true, durationSeconds: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.creditTransaction.count({ where: { userId } }),
    ]);

    return {
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      transactions,
    };
  }

  async getAllUsers(queryParams = {}) {
    const page = parseInt(queryParams.page) || 1;
    const limit = Math.min(parseInt(queryParams.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const where = {};

    if (queryParams.search) {
      where.OR = [
        { email: { contains: queryParams.search, mode: 'insensitive' } },
        { username: { contains: queryParams.search, mode: 'insensitive' } },
        { name: { contains: queryParams.search, mode: 'insensitive' } },
      ];
    }
    if (queryParams.role) where.role = queryParams.role;
    if (queryParams.status) where.status = queryParams.status;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          avatar: true,
          role: true,
          status: true,
          isVerified: true,
          location: true,
          language: true,
          createdAt: true,
          updatedAt: true,
          wallet: { select: { creditBalance: true } },
          consultant: {
            select: {
              id: true,
              specialization: true,
              onlineStatus: true,
              isApproved: true,
              rating: true,
              totalReviews: true,
            },
          },
        },
        orderBy: {
          [queryParams.sortBy || 'createdAt']: queryParams.sortOrder === 'asc' ? 'asc' : 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      users,
    };
  }

  async getAdminUserStats() {
    const [
      totalUsers, totalConsultants, totalAdmins,
      activeUsers, suspendedUsers, bannedUsers, pendingUsers,
      verifiedConsultants, totalCredits, totalVerifiedUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'CONSULTANT' } }),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'SUSPENDED' } }),
      prisma.user.count({ where: { status: 'BANNED' } }),
      prisma.user.count({ where: { status: 'PENDING' } }),
      prisma.consultant.count({ where: { isApproved: true } }),
      prisma.wallet.aggregate({ _sum: { creditBalance: true } }),
      prisma.user.count({ where: { isVerified: true } }),
    ]);

    return {
      totalUsers, totalConsultants, totalAdmins,
      activeUsers, suspendedUsers, bannedUsers, pendingUsers,
      verifiedUsers: totalVerifiedUsers,
      verifiedConsultants,
      totalCreditsInCirculation: totalCredits._sum.creditBalance || 0,
    };
  }


  async updateUserStatus(userId, status) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { status },
      include: { wallet: true, consultant: true },
    });

    const { password, confirmPassword, ...rest } = updatedUser;
    return rest;
  }

  async updateUserRole(userId, role) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
      include: { wallet: true, consultant: true },
    });

    // Auto-create consultant record when role is promoted to CONSULTANT
    if (role === 'CONSULTANT') {
      const existing = await prisma.consultant.findUnique({ where: { userId } });
      if (!existing) {
        await prisma.consultant.create({
          data: {
            userId,
            specialization: [],
            pricePerMinute: 2.50,
            isApproved: false,
            onlineStatus: 'OFFLINE',
          },
        });
      }
    }

    const { password, confirmPassword, ...rest } = updatedUser;
    return rest;
  }

  async adjustCredits(userId, amount, type, description) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new Error('Wallet not found');

    const balanceBefore = wallet.creditBalance;
    const balanceAfter = Number(balanceBefore) + Number(amount);

    if (balanceAfter < 0) throw new Error('Insufficient credits');

    const [updatedWallet, transaction] = await prisma.$transaction([
      prisma.wallet.update({
        where: { userId },
        data: { creditBalance: balanceAfter },
      }),
      prisma.creditTransaction.create({
        data: {
          userId,
          transactionType: type,
          amount,
          balanceBefore,
          balanceAfter,
          description: description || null,
        },
      }),
    ]);

    return { wallet: updatedWallet, transaction };
  }

  async deleteUser(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    return prisma.user.delete({ where: { id: userId } });
  }
}

export const userService = new UserService();