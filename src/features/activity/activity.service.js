import { prisma } from '../../config/db.js';
import { Logger } from '../../config/logger.js';
import { NotFoundError, ConflictError } from '../../shared/globals/helpers/error-handler.js';

const log = new Logger('ActivityService');

const toPrismaType = (type) => type.toUpperCase();

const registrationInclude = {
  registrations: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      fullName: true,
      emailAddress: true,
      createdAt: true,
    },
  },
};

const formatActivity = (activity) => {
  const { registrations = [], ...rest } = activity;

  return {
    ...rest,
    type: rest.type.toLowerCase(),
    registrations,
    registrationCount: registrations.length,
  };
};

class ActivityService {
  buildWhereClause(queryParams = {}) {
    const { search, type } = queryParams;
    const where = {};

    if (type && type !== 'all') {
      where.type = toPrismaType(type.toLowerCase());
    }

    if (search) {
      const searchTerm = search.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { host: { contains: searchTerm, mode: 'insensitive' } },
        { hostTitle: { contains: searchTerm, mode: 'insensitive' } },
        { location: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  async createActivity(data) {
    const activity = await prisma.activity.create({
      data: {
        type: toPrismaType(data.type),
        title: data.title,
        description: data.description,
        host: data.host,
        hostTitle: data.hostTitle ?? null,
        date: data.date,
        time: data.time,
        price: data.price ?? null,
        location: data.location ?? null,
        duration: data.duration ?? null,
        tags: data.tags || [],
        image: data.image ?? null,
      },
    });

    log.info(`Activity created: ${activity.id}`);
    return formatActivity(activity);
  }

  async getAllActivities(queryParams = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'date',
      sortOrder = 'asc',
    } = queryParams;

    const where = this.buildWhereClause(queryParams);

    const take = Math.min(parseInt(limit) || 20, 100);
    const skip = (parseInt(page) - 1) * take;

    const orderBy = [];
    const validSortFields = ['date', 'createdAt', 'updatedAt', 'title', 'type'];
    if (validSortFields.includes(sortBy)) {
      orderBy.push({ [sortBy]: sortOrder === 'desc' ? 'desc' : 'asc' });
    } else {
      orderBy.push({ date: 'asc' });
    }

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        orderBy,
        skip,
        take,
        include: registrationInclude,
      }),
      prisma.activity.count({ where }),
    ]);

    return {
      meta: {
        page: parseInt(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
      activities: activities.map(formatActivity),
    };
  }

  async getActivityStats() {
    const [totalEvents, totalWorkshops, paidSessions] = await Promise.all([
      prisma.activity.count({ where: { type: 'EVENT' } }),
      prisma.activity.count({ where: { type: 'WORKSHOP' } }),
      prisma.activity.count({
        where: {
          NOT: {
            OR: [
              { price: { equals: 'Free', mode: 'insensitive' } },
              { price: { equals: 'Gratis', mode: 'insensitive' } },
            ],
          },
        },
      }),
    ]);

    return { totalEvents, totalWorkshops, paidSessions };
  }

  async getActivityById(id) {
    const activity = await prisma.activity.findUnique({
      where: { id },
      include: registrationInclude,
    });

    if (!activity) {
      throw new NotFoundError('Activity not found');
    }

    return formatActivity(activity);
  }

  async updateActivity(id, data) {
    const activity = await prisma.activity.findUnique({
      where: { id },
    });

    if (!activity) {
      throw new NotFoundError('Activity not found');
    }

    const updateData = {};

    if (data.type !== undefined) updateData.type = toPrismaType(data.type);
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.host !== undefined) updateData.host = data.host;
    if (data.hostTitle !== undefined) updateData.hostTitle = data.hostTitle;
    if (data.date !== undefined) updateData.date = data.date;
    if (data.time !== undefined) updateData.time = data.time;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.duration !== undefined) updateData.duration = data.duration;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.image !== undefined) updateData.image = data.image;

    const updatedActivity = await prisma.activity.update({
      where: { id },
      data: updateData,
    });

    log.info(`Activity updated: ${id}`);
    return formatActivity(updatedActivity);
  }

  async deleteActivity(id) {
    const activity = await prisma.activity.findUnique({
      where: { id },
    });

    if (!activity) {
      throw new NotFoundError('Activity not found');
    }

    await prisma.activity.delete({
      where: { id },
    });

    log.info(`Activity deleted: ${id}`);
    return { success: true, message: 'Activity deleted successfully' };
  }

  async registerForActivity(activityId, data) {
    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
    });

    if (!activity) {
      throw new NotFoundError('Activity not found');
    }

    const existingRegistration = await prisma.activityRegistration.findFirst({
      where: {
        activityId,
        emailAddress: { equals: data.emailAddress, mode: 'insensitive' },
      },
    });

    if (existingRegistration) {
      throw new ConflictError('You are already registered for this activity');
    }

    const registration = await prisma.activityRegistration.create({
      data: {
        activityId,
        fullName: data.fullName,
        emailAddress: data.emailAddress,
      },
    });

    log.info(`Activity registration created: ${registration.id} for activity: ${activityId}`);
    return registration;
  }
}

export const activityService = new ActivityService();
