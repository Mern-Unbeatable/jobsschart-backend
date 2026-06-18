import { prisma } from '../../config/db.js';

export const generateSlug = (name) => {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
};

export const makeSlugUnique = async (baseSlug, options) => {
    const {
        model,
        slugField = 'slug',
        excludeId = null,
        extraWhere = {}
    } = options;

    let slug = baseSlug;
    let counter = 1;
    let exists = true;

    while (exists) {
        const whereCondition = {
            [slugField]: slug,
            ...extraWhere,
            ...(excludeId && { NOT: { id: excludeId } })
        };
        if (!prisma[model]) {
            throw new Error(`Model "${model}" does not exist in Prisma client`);
        }

        const existing = await prisma[model].findFirst({
            where: whereCondition
        });

        if (!existing) {
            exists = false;
        } else {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }
    }

    return slug;
};

export const createUniqueSlug = async (name, options) => {
    const baseSlug = generateSlug(name);
    return await makeSlugUnique(baseSlug, options);
};