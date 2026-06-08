import bcrypt from 'bcrypt';
import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';

class AuthService {
  constructor() {
    this.log = new Logger('AuthService');
  }

  generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async saveOtp(userId, otp, purpose) {
    const hashedOtp = await bcrypt.hash(otp, 10);
    return prisma.user.update({
      where: { id: userId },
      data: {
        otpCode: hashedOtp,
        otpExpires: new Date(Date.now() + 10 * 60 * 1000),
        otpPurpose: purpose,
      },
    });
  }

  async verifyOtp(userId, plainOtp) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        otpCode: true,
        otpExpires: true,
        otpPurpose: true,
      },
    });

    if (!user || !user.otpCode) return { valid: false, reason: 'No OTP found' };
    if (user.otpExpires < new Date()) return { valid: false, reason: 'OTP expired' };

    const isMatch = await bcrypt.compare(plainOtp, user.otpCode);
    if (!isMatch) return { valid: false, reason: 'Invalid OTP' };

    return { valid: true, purpose: user.otpPurpose };
  }

  async clearOtp(userId) {
    return prisma.user.update({
      where: { id: userId },
      data: { otpCode: null, otpExpires: null, otpPurpose: null },
    });
  }
  async getUserByEmail(email) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        wallet: true,
        consultant: true,
      },
    });

    if (!user) return null;


    const { password, ...userWithoutPassword } = user;

    return userWithoutPassword;
  }

  async getUserByEmailWithPassword(email) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        wallet: true,
        consultant: true,
      },
    });

    return user;
  }

  async getUserById(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        wallet: true,
        consultant: true,
      },
    });

    if (!user) return null;

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getUserByIdWithPassword(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        wallet: true,
        consultant: true,
      },
    });

    return user;
  }

  async createUser(data) {
    let username = data.username;
    if (!username && data.email) {
      username = data.email.split('@')[0];
      let existing = await prisma.user.findUnique({ where: { username } });
      let counter = 1;
      while (existing) {
        username = `${data.email.split('@')[0]}${counter}`;
        existing = await prisma.user.findUnique({ where: { username } });
        counter++;
      }
    }

    const userRole = data.role || 'USER';


    const userData = {
      email: data.email,
      password: data.password,
      username: username,
      role: userRole,
      status: 'ACTIVE',
      isVerified: false,
      name: data.name || null,
      phone: data.phone || null,
      bio: data.bio || null,
      location: data.location || null,
      language: data.language || 'nl',
      avatar: data.avatar || null,
    };


    const user = await prisma.user.create({
      data: {
        ...userData,
        wallet: {
          create: {
            creditBalance: 0,
          }
        },
        ...(userRole === 'CONSULTANT' && {
          consultant: {
            create: {
              specialization: data.specialization || [],
              bio: data.bio || null,
              pricePerMinute: data.pricePerMinute || 2.50,
              firstNMinutes: data.firstNMinutes || null,
              firstNPrice: data.firstNPrice || null,
              isApproved: false,
              onlineStatus: 'OFFLINE',
            }
          }
        })
      },
      include: {
        wallet: true,
        consultant: true,
      },
    });

    this.log.info(`User created: ${user.email} with role: ${user.role}`);

    const { password, ...userWithoutPassword } = user;

    return userWithoutPassword;
  }

  async updatePassword(userId, hashedPassword) {
    return prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }

  async updateRefreshToken(userId, refreshToken) {
    return prisma.user.update({
      where: { id: userId },
      data: { refreshTokens: refreshToken },
    });
  }

  async clearRefreshToken(userId) {
    return prisma.user.update({
      where: { id: userId },
      data: { refreshTokens: null },
    });
  }

  async hashPassword(password) {
    return bcrypt.hash(password, 10);
  }

  async comparePassword(plainPassword, hashedPassword) {
    if (!hashedPassword) return false;
    return bcrypt.compare(plainPassword, hashedPassword);
  }
}

export const authService = new AuthService();