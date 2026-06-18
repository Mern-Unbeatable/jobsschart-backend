import { prisma } from '../config/db.js';
import { config } from '../config/config.js';

const PACKAGES = [
  {
    name: 'BASIC',
    slug: 'basic',
    price: 225.00,
    minutes: 90,
    credits: null, // No credits for minute-based packages
    description: '90 minutes session for €225. Perfect for initial consultation.',
    features: [
      '90 minutes consultation',
      'No hidden fees',
      'Pay only for what you use',
      'Same rate for all consultants',
      'Buy Credits option available'
    ],
    isActive: true,
    sortOrder: 1,
  },
  {
    name: 'STANDARD',
    slug: 'standard',
    price: 300.00,
    minutes: 120,
    credits: null,
    description: '120-minute session for just €300. Best value for extended consultation.',
    features: [
      '120 minutes consultation',
      'Transparent pricing',
      'No extra charges',
      'Fair pricing for everyone',
      'Extended discussion time'
    ],
    isActive: true,
    sortOrder: 2,
  },
  {
    name: 'ADVANCED',
    slug: 'advanced',
    price: 375.00,
    minutes: 150,
    credits: null,
    description: '150 minutes session for €375. Comprehensive consultation package.',
    features: [
      '150 minutes consultation',
      'No hidden costs',
      'Real-time usage billing',
      'Unified rate for all experts',
      'Most comprehensive package'
    ],
    isActive: true,
    sortOrder: 3,
  },
];

export async function seedPackages() {
  const { logger } = config;

  try {
    let created = 0;
    let skipped = 0;

    for (const pkg of PACKAGES) {
      const existing = await prisma.package.findUnique({
        where: { slug: pkg.slug },
        select: { id: true, slug: true },
      });

      if (existing) {
        logger.info(`Package already exists — slug: ${pkg.slug}`);
        skipped++;
        continue;
      }

      const created_pkg = await prisma.package.create({
        data: pkg,
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          minutes: true,
          credits: true,
          sortOrder: true
        },
      });

      logger.info(
        `Package created — name: "${created_pkg.name}" | slug: ${created_pkg.slug} | €${created_pkg.price} | ${created_pkg.minutes} minutes`
      );
      created++;
    }

    logger.info(
      `Package seeding completed — ${created} created, ${skipped} already existed`
    );
  } catch (error) {
    logger.error('Package seeding failed', error);
    throw error;
  }
}