// src/seeders/admin.seeder.js
import bcrypt from 'bcrypt';
import { prisma } from '../config/db.js';
import { config } from '../config/config.js';

export async function seedAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = config;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    config.logger.warn('ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin seed');
    return;
  }

  try {
    // 1. Check existing admin
    const existingAdmin = await prisma.user.findUnique({
      where: { email: ADMIN_EMAIL },
    });

    if (existingAdmin) {
      config.logger.info(`Admin already exists (${ADMIN_EMAIL})`);
      return;
    }

    // 2. Generate username from email
    const username = ADMIN_EMAIL.split('@')[0];

    // 3. Hash password
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

    // 4. Create admin user
    const admin = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        password: hashedPassword,
        confirmPassword: hashedPassword,
        username: username,
        role: 'ADMIN',
        status: 'ACTIVE',
        isVerified: true,
        name: 'Super Admin',
      },
    });

    // 5. Create wallet for admin
    await prisma.wallet.create({
      data: {
        userId: admin.id,
        creditBalance: 0,
      },
    });

    config.logger.info(
      `Admin created successfully — email: ${admin.email}, id: ${admin.id}, username: ${admin.username}`
    );
  } catch (error) {
    config.logger.error('Admin seed failed', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────
// USER SEEDER
// ─────────────────────────────────────────────────────────────
export async function seedUser() {
  const userEmail = 'ibrahim.maktech33@gmail.com';
  const userPassword = '123456';

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: userEmail },
    });

    if (existingUser) {
      config.logger.info(`User already exists (${userEmail})`);
      return existingUser;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(userPassword, 10);
    const username = 'ibrahim.maktech';

    // Create user
    const user = await prisma.user.create({
      data: {
        email: userEmail,
        password: hashedPassword,
        confirmPassword: hashedPassword,
        username: username,
        role: 'USER',
        status: 'ACTIVE',
        isVerified: true,
        name: 'Ibrahim Maktech',
        avatar: 'https://ui-avatars.com/api/?name=Ibrahim+Maktech&background=6E35AE&color=fff',
        bio: 'Regular user for testing',
        location: 'Bangladesh',
        language: 'en',
        phone: '+880123456789',
      },
    });

    // Create wallet for user with some initial credits for testing
    await prisma.wallet.create({
      data: {
        userId: user.id,
        creditBalance: 100.00, // Give some credits for testing calls
      },
    });

    config.logger.info(
      `User created successfully — email: ${user.email}, id: ${user.id}, username: ${user.username}`
    );

    return user;
  } catch (error) {
    config.logger.error('User seed failed', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────
// CONSULTANT SEEDER
// ─────────────────────────────────────────────────────────────
export async function seedConsultant() {
  const consultantEmail = 'ibrahimsikder5033@gmail.com';
  const consultantPassword = '123456';

  try {
    // Check if consultant already exists
    const existingConsultant = await prisma.user.findUnique({
      where: { email: consultantEmail },
      include: { consultant: true },
    });

    if (existingConsultant) {
      config.logger.info(`Consultant already exists (${consultantEmail})`);
      return existingConsultant;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(consultantPassword, 10);
    const username = 'ibrahim.sikder';

    // Create consultant user
    const consultantUser = await prisma.user.create({
      data: {
        email: consultantEmail,
        password: hashedPassword,
        confirmPassword: hashedPassword,
        username: username,
        role: 'CONSULTANT',
        status: 'ACTIVE',
        isVerified: true,
        name: 'Ibrahim Sikder',
        avatar: 'https://ui-avatars.com/api/?name=Ibrahim+Sikder&background=9B59B6&color=fff',
        bio: 'Experienced consultant specializing in business strategy and career development',
        location: 'Bangladesh',
        language: 'en',
        phone: '+880987654321',
      },
    });

    // Create wallet for consultant
    await prisma.wallet.create({
      data: {
        userId: consultantUser.id,
        creditBalance: 0, // Consultants don't need credits, they earn
      },
    });

    // Create consultant profile
    const consultant = await prisma.consultant.create({
      data: {
        userId: consultantUser.id,
        specialization: ['Business Strategy', 'Career Development', 'Leadership', 'Digital Marketing'],
        bio: 'With over 10 years of experience in business consulting, I help entrepreneurs and professionals achieve their goals. Specialized in business strategy, career development, and digital transformation.',
        pricePerMinute: 2.50,
        firstNMinutes: 5,
        firstNPrice: 5.00,
        rating: 4.8,
        totalReviews: 25,
        onlineStatus: 'ONLINE',
        isApproved: true, // Auto-approve for testing
        stripeAccountId: 'test_account_id_' + Date.now(),
      },
    });

    // Add some availability slots for the consultant
    const daysOfWeek = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
    
    for (const day of daysOfWeek) {
      await prisma.availabilitySlot.create({
        data: {
          consultantId: consultant.id,
          dayOfWeek: day,
          startTime: '09:00',
          endTime: '17:00',
          isActive: true,
        },
      });
    }

    config.logger.info(
      `Consultant created successfully — email: ${consultantUser.email}, id: ${consultantUser.id}, consultantId: ${consultant.id}`
    );

    return { user: consultantUser, consultant };
  } catch (error) {
    config.logger.error('Consultant seed failed', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN SEED FUNCTION
// ─────────────────────────────────────────────────────────────
export async function runAllSeeds() {
  try {
    config.logger.info('Starting database seeding...');
    
    // Run all seeders
    await seedAdmin();
    await seedUser();
    await seedConsultant();
    
    config.logger.info('Database seeding completed successfully!');
  } catch (error) {
    config.logger.error('Database seeding failed:', error);
    throw error;
  }
}

// If running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllSeeds()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}