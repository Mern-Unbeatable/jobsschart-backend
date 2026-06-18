// src/features/package/package.service.js
import { prisma } from '../../config/db.js';
import {
  NotFoundError,
  ConflictError,
} from '../../shared/globals/helpers/error-handler.js';

class PackageService {

  async getAllPackages(queryParams = {}) {
    const page = parseInt(queryParams.page) || 1;
    const limit = Math.min(parseInt(queryParams.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const where = {};

    if (queryParams.isActive === 'true') {
      where.isActive = true;
    } else if (queryParams.isActive === 'false') {
      where.isActive = false;
    }

    if (queryParams.search) {
      where.OR = [
        { name: { contains: queryParams.search, mode: 'insensitive' } },
        { slug: { contains: queryParams.search, mode: 'insensitive' } },
        { description: { contains: queryParams.search, mode: 'insensitive' } },
      ];
    }

    const orderBy = {};
    const sortField = queryParams.sortBy || 'sortOrder';
    const sortOrder = queryParams.sortOrder === 'asc' ? 'asc' : 'asc';
    orderBy[sortField] = sortOrder;

    const [packages, total] = await Promise.all([
      prisma.package.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.package.count({ where }),
    ]);

    // Get purchase counts for each package from PackagePurchase table
    const packagesWithStats = await Promise.all(
      packages.map(async (pkg) => {
        const purchases = await prisma.packagePurchase.count({
          where: { packageId: pkg.id, status: 'SUCCESS' },
        });

        return {
          ...pkg,
          totalPurchases: purchases,
        };
      })
    );

    return {
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      packages: packagesWithStats,
    };
  }

  async getPackageById(id) {
    const pkg = await prisma.package.findUnique({
      where: { id },
    });

    if (!pkg) throw new NotFoundError('Package not found');

    // Get purchase count
    const purchases = await prisma.packagePurchase.count({
      where: { packageId: pkg.id, status: 'SUCCESS' },
    });

    return {
      ...pkg,
      totalPurchases: purchases,
    };
  }

  async getPackageBySlug(slug) {
    const pkg = await prisma.package.findUnique({
      where: { slug },
    });

    if (!pkg) throw new NotFoundError('Package not found');

    const purchases = await prisma.packagePurchase.count({
      where: { packageId: pkg.id, status: 'SUCCESS' },
    });

    return {
      ...pkg,
      totalPurchases: purchases,
    };
  }

  async createPackage(data) {
    const existing = await prisma.package.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictError(`Package with slug "${data.slug}" already exists`);
    }

    return prisma.package.create({
      data: {
        name: data.name,
        slug: data.slug,
        price: data.price,
        minutes: data.minutes || 0,
        credits: data.credits || null,
        description: data.description || null,
        features: data.features || [],
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  async updatePackage(id, data) {
    const pkg = await prisma.package.findUnique({
      where: { id },
      select: { id: true, slug: true },
    });

    if (!pkg) throw new NotFoundError('Package not found');

    if (data.slug && data.slug !== pkg.slug) {
      const slugTaken = await prisma.package.findUnique({
        where: { slug: data.slug },
        select: { id: true },
      });
      if (slugTaken) throw new ConflictError(`Slug "${data.slug}" is already in use`);
    }

    const updateData = {};
    const allowedFields = ['name', 'slug', 'price', 'minutes', 'credits', 'description', 'features', 'isActive', 'sortOrder'];

    allowedFields.forEach((field) => {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    });

    return prisma.package.update({
      where: { id },
      data: updateData,
    });
  }

  async deletePackage(id) {
    const pkg = await prisma.package.findUnique({
      where: { id },
    });

    if (!pkg) throw new NotFoundError('Package not found');

    // Check if package has any purchases
    const purchaseCount = await prisma.packagePurchase.count({
      where: { packageId: id },
    });

    if (purchaseCount > 0) {
      throw new ConflictError(
        `Cannot delete package - ${purchaseCount} purchase(s) exist. Deactivate it instead.`
      );
    }

    return prisma.package.delete({ where: { id } });
  }

  async getActivePackages() {
    const packages = await prisma.package.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const packagesWithStats = await Promise.all(
      packages.map(async (pkg) => {
        const purchases = await prisma.packagePurchase.count({
          where: { packageId: pkg.id, status: 'SUCCESS' },
        });
        return { ...pkg, totalPurchases: purchases };
      })
    );

    return packagesWithStats;
  }
}

export const packageService = new PackageService();