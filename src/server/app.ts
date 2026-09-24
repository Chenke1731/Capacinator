import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { AuditRouteHandler } from './utils/AuditRouteHandler.js';
import apiRoutes from './api/routes/index.js';
import { enhancedErrorHandler } from './middleware/enhancedErrorHandler.js';
import { requestLoggerMiddleware, userContextMiddleware } from './middleware/requestLogger.js';
import { enhancedAuditMiddleware } from './middleware/enhancedAuditMiddleware.js';
import { initializeNotificationScheduler } from './services/notifications/scheduler.js';
import { initializeAutomaticBackups } from './services/backup/scheduler.js';
import { config } from './config/index.js';
import { logger } from './services/logging/config.js';

export async function createExpressApp() {
  const app = express();

  // Security middleware - Configure CSP
  // Note: 'unsafe-inline' for styles is acceptable per OWASP guidelines
  // 'unsafe-eval' is only allowed in development for Vite HMR
  const scriptSrcDirective: string[] = ["'self'"];
  if (process.env.NODE_ENV === 'development') {
    // Vite HMR requires unsafe-eval in development
    scriptSrcDirective.push("'unsafe-eval'");
  }

  const cspDirectives: Record<string, string[]> = {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: scriptSrcDirective,
    imgSrc: ["'self'", "data:", "blob:"],
    connectSrc: ["'self'"],
    reportUri: ['/api/csp-report'],
  };

  app.use(helmet({
    contentSecurityPolicy: {
      directives: cspDirectives,
      reportOnly: false,
    },
  }));

  // CORS configuration
  const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
      ? false // In production, frontend is served from same origin
      : ['http://localhost:3120', 'http://localhost:3121', 'http://localhost:5173'],
    credentials: true,
  };
  app.use(cors(corsOptions));

  // Body parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Compression
  app.use(compression());

  // Enhanced request logging
  app.use(requestLoggerMiddleware);
  
  // Legacy HTTP logging (kept for backward compatibility during migration)
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  // Add user context and enhanced audit middleware
  app.use(userContextMiddleware);
  app.use(enhancedAuditMiddleware);
  
  // Audit routes if enabled
  if (config.features.audit) {
    const { getAuditService } = await import('./services/audit/index.js');
    logger.info('Getting audit service');
    
    const auditService = getAuditService();
    if (auditService) {
      const auditHandler = new AuditRouteHandler(auditService);
      auditHandler.register(app);
      logger.info('Audit service and routes enabled');
    } else {
      logger.warn('Audit service is enabled but service instance is null');
    }
  } else {
    logger.info('Audit service is disabled in config');
  }

  // API routes
  logger.info('Mounting API routes');
  app.use('/api', apiRoutes);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV 
    });
  });

  // Enhanced error handling (replaces legacy errorHandler)
  app.use(enhancedErrorHandler);

  // Initialize background services
  if (process.env.NODE_ENV !== 'test') {
    logger.info('Initializing notification scheduler');
    initializeNotificationScheduler();
    logger.info('Notification scheduler started');
    
    initializeAutomaticBackups();
    logger.info('Automatic backups scheduled', { frequency: 'daily' });
  }

  return app;
}