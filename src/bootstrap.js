// Your main app file (e.g., index.js, server.js, or bootstrap.js)
import { Application } from './app.js';
import { config } from './config/config.js';
import { connectDatabase } from './config/db.js';
import { seedAdmin, seedUser, seedConsultant } from './seeds/admin.seeder.js';
import { seedPackages } from './seeds/package.seeder.js';
import { twilioService } from './shared/services/twilio.service.js';
import { StartupLogger } from './config/logger.js';
import fs from 'fs';
import path from 'path';
const startApplication = async () => {
  const application = new Application();
  const startupLogger = new StartupLogger();

  try {
    // Set startup info
    startupLogger.setEnvironment(config.NODE_ENV);
    startupLogger.setPort(config.PORT);

    // Use process.cwd() to match upload utility — same root every time
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const tempDir = path.join(process.cwd(), 'temp');
    const subDirectories = ['users', 'avatars', 'blogs', 'calls', 'services', 'products'];

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    for (const subdir of subDirectories) {
      const subdirPath = path.join(uploadsDir, subdir);
      if (!fs.existsSync(subdirPath)) {
        fs.mkdirSync(subdirPath, { recursive: true });
      }
    }

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Connect to database
    try {
      await connectDatabase();
      startupLogger.setDatabaseConnected(true);
    } catch (dbError) {
      startupLogger.addError('Database connection failed');
      startupLogger.print();
      process.exit(1);
    }

    // Validate Twilio (only log if misconfigured)
    if (twilioService.isConfigured()) {
      const twilioCheck = await twilioService.validateVideoCredentials();
      if (!twilioCheck.ok) {
        config.logger.error(`Twilio Video misconfigured: ${twilioCheck.reason}`);
      }
    }

    // Run all seeds (Admin, User, Consultant)
    await seedAdmin();
    await seedUser();
    await seedConsultant();
    await seedPackages();
    startupLogger.setSeedExecuted(true);

    // Start the application
    application.start();

    // Print startup status after server starts
    setTimeout(() => startupLogger.print(), 500);
  } catch (error) {
    startupLogger.addError('Server startup failed');
    startupLogger.print();
    config.logger.error('Startup failed', error, 'Bootstrap');
    process.exit(1);
  }
};

startApplication().catch((error) => {
  config.logger.error('Unhandled bootstrap error', error, 'Bootstrap');
  process.exit(1);
});
