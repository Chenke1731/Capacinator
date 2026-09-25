export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface ClientLogEntry {
  timestamp: string;
  level: string;
  message: string;
  component?: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
    componentStack?: string;
  };
}

export class ClientLogger {
  private level: LogLevel;
  private isProduction: boolean;
  private enableConsole: boolean;
  private enableRemoteLogging: boolean;
  private logBuffer: ClientLogEntry[] = [];
  private sessionId: string;

  constructor() {
    this.isProduction = import.meta.env.MODE === 'production';
    this.enableConsole = !this.isProduction || localStorage.getItem('debug') === 'true';
    this.enableRemoteLogging = this.isProduction;
    this.sessionId = this.generateSessionId();
    
    // Set log level based on environment
    this.level = this.isProduction ? LogLevel.WARN : LogLevel.DEBUG;
    
    // Set up error boundary
    this.setupErrorBoundary();
    
    // Flush logs periodically in production
    if (this.enableRemoteLogging) {
      setInterval(() => this.flushLogs(), 30000); // Every 30 seconds
    }
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private setupErrorBoundary(): void {
    // Global error handler for unhandled errors
    window.addEventListener('error', (event) => {
      this.error('Unhandled Error', {
        error: event.error,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled Promise Rejection', {
        reason: event.reason
      });
    });
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.level;
  }

  private formatLogEntry(
    level: LogLevel,
    message: string,
    metadata: Record<string, any> = {}
  ): ClientLogEntry {
    const entry: ClientLogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      sessionId: this.sessionId,
      userId: this.getCurrentUserId(),
      ...metadata
    };

    return entry;
  }

  private getCurrentUserId(): string | undefined {
    // Try to get user ID from various common locations
    try {
      const user = (window as any).currentUser || 
                  JSON.parse(localStorage.getItem('user') || '{}') ||
                  JSON.parse(sessionStorage.getItem('user') || '{}');
      return user?.id;
    } catch {
      return undefined;
    }
  }

  private writeLog(entry: ClientLogEntry): void {
    // Console logging (development or debug mode)
    if (this.enableConsole) {
      // formatted fields (emoji/timestamp/component) reserved for console transport
      
      if (entry.error) {
        console.error('Error details:', entry.error);
      }
    }

    // Buffer for remote logging
    if (this.enableRemoteLogging) {
      this.logBuffer.push(entry);
      
      // Flush immediately for errors
      if (entry.level === 'ERROR') {
        this.flushLogs();
      }
      
      // Prevent buffer from growing too large
      if (this.logBuffer.length > 100) {
        this.logBuffer = this.logBuffer.slice(-50); // Keep last 50 entries
      }
    }
  }

  private getLevelEmoji(level: LogLevel): string {
    switch (level) {
      case LogLevel.ERROR: return '❌';
      case LogLevel.WARN: return '⚠️';
      case LogLevel.INFO: return 'ℹ️';
      case LogLevel.DEBUG: return '🔍';
      default: return '📝';
    }
  }

  private async flushLogs(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    const logsToSend = [...this.logBuffer];
    this.logBuffer = [];

    try {
      await fetch('/api/client-logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ logs: logsToSend })
      });
    } catch {
      // If remote logging fails, put logs back in buffer (but limit size)
      this.logBuffer = [...logsToSend, ...this.logBuffer].slice(-50);
    }
  }

  error(message: string, metadata: Record<string, any> = {}): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    const entry = this.formatLogEntry(LogLevel.ERROR, message, metadata);
    
    // Extract error information if present
    if (metadata.error) {
      const error = metadata.error;
      entry.error = {
        message: error.message || String(error),
        stack: error.stack,
        componentStack: error.componentStack
      };
    }
    
    this.writeLog(entry);
  }

  warn(message: string, metadata: Record<string, any> = {}): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    const entry = this.formatLogEntry(LogLevel.WARN, message, metadata);
    this.writeLog(entry);
  }

  info(message: string, metadata: Record<string, any> = {}): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    const entry = this.formatLogEntry(LogLevel.INFO, message, metadata);
    this.writeLog(entry);
  }

  debug(message: string, metadata: Record<string, any> = {}): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    const entry = this.formatLogEntry(LogLevel.DEBUG, message, metadata);
    this.writeLog(entry);
  }

  // Convenience methods
  logUserAction(action: string, component: string, metadata: Record<string, any> = {}): void {
    this.info('User Action', {
      action,
      component,
      ...metadata
    });
  }

  logApiCall(method: string, url: string, duration: number, statusCode: number): void {
    const level = statusCode >= 400 ? LogLevel.WARN : LogLevel.DEBUG;
    if (!this.shouldLog(level)) return;

    const entry = this.formatLogEntry(level, 'API Call', {
      method,
      url,
      duration: `${duration}ms`,
      statusCode
    });
    this.writeLog(entry);
  }

  logPerformance(operation: string, duration: number, metadata: Record<string, any> = {}): void {
    const level = duration > 1000 ? LogLevel.WARN : LogLevel.DEBUG;
    if (!this.shouldLog(level)) return;

    const entry = this.formatLogEntry(level, 'Performance', {
      operation,
      duration: `${duration}ms`,
      ...metadata
    });
    this.writeLog(entry);
  }

  // Create a child logger with additional context
  child(metadata: Record<string, any>): ChildClientLogger {
    return new ChildClientLogger(this, metadata);
  }

  // Manual flush for cleanup
  async flush(): Promise<void> {
    await this.flushLogs();
  }
}

export class ChildClientLogger {
  constructor(
    private parent: ClientLogger,
    private defaultMetadata: Record<string, any>
  ) {}

  private mergeMetadata(metadata: Record<string, any> = {}): Record<string, any> {
    return { ...this.defaultMetadata, ...metadata };
  }

  error(message: string, metadata: Record<string, any> = {}): void {
    this.parent.error(message, this.mergeMetadata(metadata));
  }

  warn(message: string, metadata: Record<string, any> = {}): void {
    this.parent.warn(message, this.mergeMetadata(metadata));
  }

  info(message: string, metadata: Record<string, any> = {}): void {
    this.parent.info(message, this.mergeMetadata(metadata));
  }

  debug(message: string, metadata: Record<string, any> = {}): void {
    this.parent.debug(message, this.mergeMetadata(metadata));
  }

  logUserAction(action: string, metadata: Record<string, any> = {}): void {
    this.parent.logUserAction(action, this.defaultMetadata.component || 'Unknown', this.mergeMetadata(metadata));
  }

  logApiCall(method: string, url: string, duration: number, statusCode: number): void {
    this.parent.logApiCall(method, url, duration, statusCode);
  }

  logPerformance(operation: string, duration: number, metadata: Record<string, any> = {}): void {
    this.parent.logPerformance(operation, duration, this.mergeMetadata(metadata));
  }

  child(metadata: Record<string, any>): ChildClientLogger {
    return new ChildClientLogger(this.parent, this.mergeMetadata(metadata));
  }
}

// Export singleton instance
export const logger = new ClientLogger();

// React Error Boundary helper
export function withErrorLogging<P extends object>(
  Component: React.ComponentType<P>,
  componentName?: string
): React.ComponentType<P> {
  return class WithErrorLogging extends React.Component<P> {
    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
      logger.error('React Component Error', {
        component: componentName || Component.name,
        error,
        errorInfo
      });
    }

    render() {
      return React.createElement(Component, this.props);
    }
  };
}