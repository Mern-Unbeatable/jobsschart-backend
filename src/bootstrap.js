// Your main app file (e.g., index.js, server.js, or bootstrap.js)
import { Application } from './app.js';
import { config } from './config/config.js';
import { connectDatabase } from './config/db.js';
import { seedAdmin, seedUser, seedConsultant } from './seeds/admin.seeder.js';
import { seedPackages } from './seeds/package.seeder.js';
import fs from 'fs';
import path from 'path';
const startApplication = async () => {
  const application = new Application();

  try {
    // ✅ Use process.cwd() to match upload utility — same root every time
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const tempDir = path.join(process.cwd(), 'temp');

    const subDirectories = [
      'users',
      'avatars',
      'blogs',
      'calls',
      'services',
      'products',
    ];

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      config.logger.info('Uploads directory created');
    }

    for (const subdir of subDirectories) {
      const subdirPath = path.join(uploadsDir, subdir);
      if (!fs.existsSync(subdirPath)) {
        fs.mkdirSync(subdirPath, { recursive: true });
        config.logger.info(`Created subdirectory: ${subdir}`);
      }
    }

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      config.logger.info('Temp directory created');
    }

    config.logger.info(`Uploads directory: ${uploadsDir}`);

    await connectDatabase();
    config.logger.info('Database connected');

    // ✅ Run all seeds (Admin, User, Consultant)
    await seedAdmin();
    config.logger.info('Admin seed check completed');

    await seedUser();
    config.logger.info('User seed check completed');

    await seedConsultant();
    config.logger.info('Consultant seed check completed');

    await seedPackages();
    config.logger.info('Package seed check completed');

    // Or use the combined function:
    // await runAllSeeds();
    // await seedPackages();

    application.start();
    config.logger.info('Application started successfully');
    
    // Log test credentials
    config.logger.info('\n📝 Test Credentials:');
    config.logger.info('┌─────────────────┬─────────────────────────────────┬──────────┐');
    config.logger.info('│ Role            │ Email                           │ Password │');
    config.logger.info('├─────────────────┼─────────────────────────────────┼──────────┤');
    config.logger.info('│ ADMIN           │ ' + config.ADMIN_EMAIL + ' │ ******** │');
    config.logger.info('│ USER            │ ibrahim.maktech33@gmail.com     │ 123456   │');
    config.logger.info('│ CONSULTANT      │ ibrahimsikder5033@gmail.com      │ 123456   │');
    config.logger.info('└─────────────────┴─────────────────────────────────┴──────────┘');
    
  } catch (error) {
    config.logger.error('Startup failed', error, 'Bootstrap');
    process.exit(1);
  }
};

startApplication().catch((error) => {
  config.logger.error('Unhandled bootstrap error', error, 'Bootstrap');
  process.exit(1);
});