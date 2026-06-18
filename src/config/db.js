import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config } from './config.js';
import { PrismaClient } from '../generated/prisma/index.js';

const pool = new Pool({ connectionString: config.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export const connectDatabase = async () => {
  await prisma.$connect();
};

export const disconnectDatabase = async () => {
  await prisma.$disconnect();
};