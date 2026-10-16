import { config as dotenvConfig } from 'dotenv';
import { createExpressApp } from './app.js';
import { initializeDatabase } from './database/index.js';
import { initializeAutomaticBackups } from './services/backup/scheduler.js';
import { initializeE2EDatabase } from './database/init-e2e.js';
import { setupGlobalErrorHandlers } from './middleware/enhancedErrorHandler.js';
import { logger } from './services/logging/config.js';
import { getConfig } from './config/index.js';

// Load environment variables from appropriate .env file
// This must happen before getConfig() is called
const nodeEnv = process.env.NODE_ENV || 'development';
let envFile = '.env';
if (nodeEnv === 'development') {
  envFile = '.env.development';
} else if (nodeEnv === 'test') {
  envFile = '.env.test';
} else if (nodeEnv === 'e2e') {
  envFile = '.env.e2e';
}
dotenvConfig({ path: envFile });

// Now load the validated configuration
const appConfig = getConfig();

// Setup global error handlers for enhanced logging
setupGlobalErrorHandlers();

// For notification system stability
if (appConfig.isDevelopment) {
  logger.info('Notification scheduler initialized');
}

async function startServer() {
  try {
    logger.info('Starting Capacinator server', {
      port: appConfig.server.port,
      environment: appConfig.env
    });

    // Initialize database
    logger.info('Initializing database', { environment: appConfig.env });
    if (appConfig.isE2E) {
      const e2eDb = await initializeE2EDatabase();
      // Set global reference for E2E database
      global.__E2E_DB__ = e2eDb;
      logger.info('E2E database initialized');
    } else {
      await initializeDatabase();
      // IP-08c: 备份在迁移完成后启动(首启不再对空库备份)
      if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'e2e') {
        initializeAutomaticBackups();
      }
    }
    logger.info('Database ready');

    // Create Express app
    const app = await createExpressApp();

    // Start the server
    const server = app.listen(appConfig.server.port, () => {
      logger.info('Server running', {
        port: appConfig.server.port,
        healthCheck: `http://localhost:${appConfig.server.port}/api/health`,
        environment: appConfig.env
      });

      if (appConfig.isDevelopment) {
        logger.info('Development mode', {
          frontendUrl: 'http://localhost:3120'
        });
      } else {
        logger.info('Production mode', {
          applicationUrl: `http://localhost:${appConfig.server.port}`
        });
      }
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server', error instanceof Error ? error : undefined, {
      port: appConfig.server.port,
      environment: appConfig.env
    });
    console.error('SERVER STARTUP ERROR:', error);
    // TEMPORARILY COMMENTED FOR DEBUGGING - DO NOT COMMIT
    // process.exit(1);
  }
}

// Note: Global error handlers are now set up by setupGlobalErrorHandlers()
// These handlers provide structured logging and better error management

// Start the server
startServer();
