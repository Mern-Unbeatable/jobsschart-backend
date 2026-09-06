import { prisma } from '../config/db.js';
import { config } from '../config/config.js';
import { expandI18n, expandI18nArray } from '../shared/services/translate.service.js';

/** Only these 3 packages belong in the system — no extra test packages. */
const SEED_SLUGS = ['basic', 'standard', 'advanced'];

const PACKAGE_SOURCES = [
  {
    name: 'BASIC',
    slug: 'basic',
    price: 225.0,
    minutes: 90,
    credits: null,
    description: '90 minutes session for €225. Perfect for initial consultation.',
    features: [
      '90 minutes consultation',
      'No hidden fees',
      'Pay only for what you use',
      'Same rate for all consultants',
      'Buy Credits option available',
    ],
    isActive: true,
    sortOrder: 1,
  },
  {
    name: 'STANDARD',
    slug: 'standard',
    price: 300.0,
    minutes: 120,
    credits: null,
    description: '120-minute session for just €300. Best value for extended consultation.',
    features: [
      '120 minutes consultation',
      'Transparent pricing',
      'No extra charges',
      'Fair pricing for everyone',
      'Extended discussion time',
    ],
    isActive: true,
    sortOrder: 2,
  },
  {
    name: 'ADVANCED',
    slug: 'advanced',
    price: 375.0,
    minutes: 150,
    credits: null,
    description: '150 minutes session for €375. Comprehensive consultation package.',
    features: [
      '150 minutes consultation',
      'No hidden costs',
      'Real-time usage billing',
      'Unified rate for all experts',
      'Most comprehensive package',
    ],
    isActive: true,
    sortOrder: 3,
  },
];

async function detachAndDeletePackages(ids) {
  if (!ids.length) return;

  await prisma.payment.updateMany({
    where: { packageId: { in: ids } },
    data: { packageId: null },
  });
  await prisma.packagePurchase.deleteMany({
    where: { packageId: { in: ids } },
  });
  await prisma.package.deleteMany({
    where: { id: { in: ids } },
  });
}

/** Remove any package that is NOT basic / standard / advanced. */
async function removeExtraPackages() {
  const extras = await prisma.package.findMany({
    where: { slug: { notIn: SEED_SLUGS } },
    select: { id: true, slug: true },
  });

  if (!extras.length) return 0;
  await detachAndDeletePackages(extras.map((pkg) => pkg.id));
  return extras.length;
}

/** Delete the 3 canonical seed packages so they can be recreated fresh. */
async function resetSeedPackages() {
  const existing = await prisma.package.findMany({
    where: { slug: { in: SEED_SLUGS } },
    select: { id: true, slug: true },
  });

  if (!existing.length) return 0;
  await detachAndDeletePackages(existing.map((pkg) => pkg.id));
  return existing.length;
}

async function buildPackageFromSource(source) {
  return {
    name: await expandI18n(source.name, { sourceLocale: 'en' }),
    slug: source.slug,
    price: source.price,
    minutes: source.minutes,
    credits: source.credits,
    description: await expandI18n(source.description, { sourceLocale: 'en' }),
    features: await expandI18nArray(source.features, { sourceLocale: 'en' }),
    isActive: source.isActive,
    sortOrder: source.sortOrder,
  };
}

/**
 * Seed exactly 3 packages (basic, standard, advanced) with EN + auto-translated NL.
 * @param {object} options
 * @param {boolean} options.reset - delete the 3 seed packages and recreate with fresh translation
 * @param {boolean} options.removeExtra - delete any other packages in DB
 */
export async function seedPackages({ reset = false, removeExtra = true } = {}) {
  const { logger } = config;

  try {
    if (removeExtra) {
      await removeExtraPackages();
    }

    if (reset) {
      await resetSeedPackages();
    }

    let upserted = 0;

    for (const source of PACKAGE_SOURCES) {
      const existing = await prisma.package.findUnique({
        where: { slug: source.slug },
        select: { id: true, slug: true },
      });

      if (existing && !reset) {
        await prisma.package.update({
          where: { slug: source.slug },
          data: {
            price: source.price,
            minutes: source.minutes,
            credits: source.credits,
            isActive: source.isActive,
            sortOrder: source.sortOrder,
          },
        });
        upserted++;
        continue;
      }

      const pkg = await buildPackageFromSource(source);
      const saved = await prisma.package.upsert({
        where: { slug: pkg.slug },
        update: pkg,
        create: pkg,
        select: {
          id: true,
          slug: true,
          price: true,
          minutes: true,
          name: true,
        },
      });
      upserted++;
    }
  } catch (error) {
    logger.error('Package seeding failed', error);
    throw error;
  }
}

// Run directly: node src/seeds/package.seeder.js
import { fileURLToPath } from 'url';
import path from 'path';
import { connectDatabase } from '../config/db.js';

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  connectDatabase()
    .then(() => seedPackages({ reset: true, removeExtra: true }))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
