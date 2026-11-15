/**
 * ImportError - Comprehensive error reporting for Excel import operations
 * Provides structured error information with context, suggestions, and categorization
 */

export type ErrorType = 'error' | 'warning' | 'info';
export type ErrorSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ErrorCategory = 'structure' | 'data' | 'validation' | 'reference' | 'format' | 'system';

/** 2026-11-15: 出口统一的定位前缀格式（V1/V2 importer 共用；此前两处内联重复——盲评 B1-6 收敛）。
 *  输入是 toJSON() 后的序列化对象（含 location/detailedMessage/message）。 */
export function formatWithLocation(e: { location?: string; detailedMessage?: string; message?: string }): string {
  return e.location && e.location !== 'Unknown location'
    ? `[${e.location}] ${e.detailedMessage || e.message || 'Unknown error'}`
    : (e.detailedMessage || e.message || 'Unknown error');
}

/**
 * Progress reporting interface for import operations
 */
export interface ProgressCallback {
  onProgress?(completed: number, total: number, operation: string): void;
  onPhaseChange?(phase: string, details: string): void;
  onEstimate?(remainingMs: number, estimatedTotal?: number): void;
  onRowProcessed?(worksheet: string, row: number, totalRows: number): void;
}

/**
 * Import phase tracking
 */
export enum ImportPhase {
  VALIDATION = 'validation',
  PREPARATION = 'preparation',
  LOCATIONS = 'locations',
  PROJECT_TYPES = 'project_types',
  PHASES = 'phases',
  ROLES = 'roles',
  PEOPLE = 'people',
  PROJECTS = 'projects',
  ALLOCATIONS = 'allocations',
  ASSIGNMENTS = 'assignments',
  FINALIZATION = 'finalization'
}

/**
 * Progress tracker for import operations
 */
export class ImportProgressTracker {
  private startTime: number;
  private currentPhase: ImportPhase = ImportPhase.VALIDATION;
  private phaseStartTime: number;
  private totalOperations: number = 0;
  private completedOperations: number = 0;
  private rowProcessingStats: Map<string, { processed: number; total: number }> = new Map();
  private callback?: ProgressCallback;

  constructor(callback?: ProgressCallback) {
    this.startTime = Date.now();
    this.phaseStartTime = this.startTime;
    this.callback = callback;
  }

  /**
   * Set the total number of operations for progress calculation
   */
  setTotalOperations(total: number): void {
    this.totalOperations = total;
  }

  /**
   * Start a new phase of the import process
   */
  startPhase(phase: ImportPhase, details: string): void {
    this.currentPhase = phase;
    this.phaseStartTime = Date.now();
    this.callback?.onPhaseChange?.(phase, details);
    this.updateProgress(`Starting ${phase}`);
  }

  /**
   * Update progress with current operation
   */
  updateProgress(operation: string): void {
    if (this.totalOperations > 0) {
      const percentage = Math.min(100, (this.completedOperations / this.totalOperations) * 100);
      this.callback?.onProgress?.(percentage, 100, operation);
    }
    
    this.updateTimeEstimate();
  }

  /**
   * Mark an operation as completed
   */
  completeOperation(operation?: string): void {
    this.completedOperations++;
    if (operation) {
      this.updateProgress(operation);
    }
  }

  /**
   * Track row processing progress for a specific worksheet
   */
  updateRowProgress(worksheet: string, currentRow: number, totalRows: number): void {
    this.rowProcessingStats.set(worksheet, { processed: currentRow, total: totalRows });
    this.callback?.onRowProcessed?.(worksheet, currentRow, totalRows);
    
    // Update overall progress based on row processing
    const operation = `Processing ${worksheet} (row ${currentRow}/${totalRows})`;
    this.updateProgress(operation);
  }

  /**
   * Calculate and report estimated time remaining
   */
  private updateTimeEstimate(): void {
    if (this.completedOperations === 0 || this.totalOperations === 0) {
      return;
    }

    const elapsedMs = Date.now() - this.startTime;
    const progressRatio = this.completedOperations / this.totalOperations;
    const estimatedTotalMs = elapsedMs / progressRatio;
    const remainingMs = estimatedTotalMs - elapsedMs;

    this.callback?.onEstimate?.(Math.max(0, remainingMs), estimatedTotalMs);
  }

  /**
   * Get current progress statistics
   */
  getStats(): {
    currentPhase: ImportPhase;
    completedOperations: number;
    totalOperations: number;
    elapsedMs: number;
    estimatedRemainingMs: number;
    rowStats: Map<string, { processed: number; total: number }>;
  } {
    const elapsedMs = Date.now() - this.startTime;
    const progressRatio = this.totalOperations > 0 ? this.completedOperations / this.totalOperations : 0;
    const estimatedTotalMs = progressRatio > 0 ? elapsedMs / progressRatio : 0;
    const estimatedRemainingMs = Math.max(0, estimatedTotalMs - elapsedMs);

    return {
      currentPhase: this.currentPhase,
      completedOperations: this.completedOperations,
      totalOperations: this.totalOperations,
      elapsedMs,
      estimatedRemainingMs,
      rowStats: new Map(this.rowProcessingStats)
    };
  }

  /**
   * Complete the import process
   */
  complete(): void {
    this.completedOperations = this.totalOperations;
    this.updateProgress('Import completed');
    this.callback?.onEstimate?.(0, Date.now() - this.startTime);
  }
}

export interface ImportErrorData {
  type: ErrorType;
  severity: ErrorSeverity;
  category: ErrorCategory;
  code?: string;
  worksheet?: string;
  row?: number;
  column?: string;
  columnIndex?: number;
  field?: string;
  currentValue?: any;
  expectedValue?: string;
  expectedType?: string;
  message: string;
  suggestion?: string;
  context?: Record<string, any>;
}

export class ImportError extends Error {
  public readonly type: ErrorType;
  public readonly severity: ErrorSeverity;
  public readonly category: ErrorCategory;
  public readonly code?: string;
  public readonly worksheet?: string;
  public readonly row?: number;
  public readonly column?: string;
  public readonly columnIndex?: number;
  public readonly field?: string;
  public readonly currentValue?: any;
  public readonly expectedValue?: string;
  public readonly expectedType?: string;
  public readonly suggestion?: string;
  public readonly context?: Record<string, any>;
  public readonly timestamp: Date;

  constructor(data: ImportErrorData) {
    super(data.message);
    this.name = 'ImportError';
    
    this.type = data.type;
    this.severity = data.severity;
    this.category = data.category;
    this.code = data.code;
    this.worksheet = data.worksheet;
    this.row = data.row;
    this.column = data.column;
    this.columnIndex = data.columnIndex;
    this.field = data.field;
    this.currentValue = data.currentValue;
    this.expectedValue = data.expectedValue;
    this.expectedType = data.expectedType;
    this.suggestion = data.suggestion;
    this.context = data.context;
    this.timestamp = new Date();
  }

  /**
   * Get a user-friendly location string
   */
  getLocation(): string {
    const parts: string[] = [];
    
    if (this.worksheet) parts.push(`Sheet: ${this.worksheet}`);
    if (this.row) parts.push(`Row: ${this.row}`);
    if (this.column) parts.push(`Column: ${this.column}`);
    if (this.field) parts.push(`Field: ${this.field}`);
    
    return parts.length > 0 ? parts.join(', ') : 'Unknown location';
  }

  /**
   * Get a detailed error description
   */
  getDetailedMessage(): string {
    let message = this.message;
    
    if (this.currentValue !== undefined) {
      message += ` (Current: "${this.currentValue}")`;
    }
    
    if (this.expectedValue) {
      message += ` (Expected: ${this.expectedValue})`;
    }
    
    if (this.expectedType) {
      message += ` (Type: ${this.expectedType})`;
    }
    
    return message;
  }

  /**
   * Convert to plain object for API responses
   */
  toJSON(): Record<string, any> {
    return {
      type: this.type,
      severity: this.severity,
      category: this.category,
      code: this.code,
      worksheet: this.worksheet,
      row: this.row,
      column: this.column,
      columnIndex: this.columnIndex,
      field: this.field,
      currentValue: this.currentValue,
      expectedValue: this.expectedValue,
      expectedType: this.expectedType,
      message: this.message,
      detailedMessage: this.getDetailedMessage(),
      location: this.getLocation(),
      suggestion: this.suggestion,
      context: this.context,
      timestamp: this.timestamp.toISOString()
    };
  }
}

/**
 * ImportErrorCollector - Manages and aggregates import errors
 */
export class ImportErrorCollector {
  private errors: ImportError[] = [];
  private warnings: ImportError[] = [];
  private info: ImportError[] = [];
  private readonly maxErrors: number;
  private readonly maxWarnings: number;
  private duplicateCount: Map<string, number> = new Map();
  private errorClusters: Map<string, ImportError[]> = new Map();

  constructor(maxErrors = 100, maxWarnings = 200) {
    this.maxErrors = maxErrors;
    this.maxWarnings = maxWarnings;
  }

  /**
   * Generate a unique key for error deduplication
   */
  private getErrorKey(error: ImportError): string {
    const parts = [
      error.worksheet || 'unknown',
      error.row?.toString() || 'no-row',
      error.column || 'no-column',
      error.field || 'no-field',
      error.category,
      error.message.substring(0, 50) // First 50 chars to group similar messages
    ];
    return parts.join('|');
  }

  /**
   * Check if error is similar to existing ones (within ±2 rows)
   */
  private findSimilarError(error: ImportError): ImportError | null {
    if (!error.worksheet || !error.row || !error.column || !error.field) {
      return null;
    }

    const targetRow = error.row;
    for (const existingError of [...this.errors, ...this.warnings]) {
      if (
        existingError.worksheet === error.worksheet &&
        existingError.column === error.column &&
        existingError.field === error.field &&
        existingError.category === error.category &&
        existingError.row &&
        Math.abs(existingError.row - targetRow) <= 2
      ) {
        return existingError;
      }
    }
    return null;
  }

  /**
   * Add an error to the collection with deduplication
   */
  addError(errorData: ImportErrorData): ImportError {
    const error = new ImportError(errorData);
    const errorKey = this.getErrorKey(error);
    
    // Check for exact duplicates
    if (this.duplicateCount.has(errorKey)) {
      const count = this.duplicateCount.get(errorKey)! + 1;
      this.duplicateCount.set(errorKey, count);
      return error; // Return the error but don't add it again
    }

    // Check for similar errors
    const similarError = this.findSimilarError(error);
    if (similarError) {
      const similarKey = this.getErrorKey(similarError);
      const count = this.duplicateCount.get(similarKey) || 1;
      this.duplicateCount.set(similarKey, count + 1);
      return error;
    }

    // Add to cluster for analysis
    const clusterKey = `${error.worksheet}|${error.category}|${error.severity}`;
    if (!this.errorClusters.has(clusterKey)) {
      this.errorClusters.set(clusterKey, []);
    }
    this.errorClusters.get(clusterKey)!.push(error);
    
    // Add to appropriate collection
    switch (error.type) {
      case 'error':
        if (this.errors.length < this.maxErrors) {
          this.errors.push(error);
          this.duplicateCount.set(errorKey, 1);
        }
        break;
      case 'warning':
        if (this.warnings.length < this.maxWarnings) {
          this.warnings.push(error);
          this.duplicateCount.set(errorKey, 1);
        }
        break;
      case 'info':
        this.info.push(error);
        this.duplicateCount.set(errorKey, 1);
        break;
    }
    
    return error;
  }

  /**
   * Add a critical error (stops import)
   */
  addCriticalError(worksheet: string, message: string, suggestion?: string): ImportError {
    return this.addError({
      type: 'error',
      severity: 'critical',
      category: 'system',
      worksheet,
      message,
      suggestion
    });
  }

  /**
   * Add a data validation error
   */
  addDataError(
    worksheet: string,
    row: number,
    column: string,
    field: string,
    currentValue: any,
    expectedType: string,
    message: string,
    suggestion?: string
  ): ImportError {
    return this.addError({
      type: 'error',
      severity: 'high',
      category: 'data',
      worksheet,
      row,
      column,
      field,
      currentValue,
      expectedType,
      message,
      suggestion
    });
  }

  /**
   * Add a structure error (missing worksheets/columns)
   */
  addStructureError(
    worksheet: string,
    message: string,
    suggestion?: string,
    field?: string
  ): ImportError {
    return this.addError({
      type: 'error',
      severity: 'high',
      category: 'structure',
      worksheet,
      field,
      message,
      suggestion
    });
  }

  /**
   * Add a warning
   */
  addWarning(
    worksheet: string,
    message: string,
    row?: number,
    column?: string,
    suggestion?: string
  ): ImportError {
    return this.addError({
      type: 'warning',
      severity: 'medium',
      category: 'validation',
      worksheet,
      row,
      column,
      message,
      suggestion
    });
  }

  /**
   * Get all errors and warnings
   */
  getErrors(): ImportError[] {
    return [...this.errors, ...this.warnings];
  }

  /**
   * Check if there are critical errors that should stop import
   */
  hasCriticalErrors(): boolean {
    return this.errors.some(error => error.severity === 'critical');
  }

  /**
   * Check if there are any errors (not warnings)
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /**
   * Get total error count
   */
  getErrorCount(): number {
    return this.errors.length;
  }

  /**
   * Get total warning count
   */
  getWarningCount(): number {
    return this.warnings.length;
  }

  /**
   * Get errors grouped by category
   */
  getErrorsByCategory(): Record<ErrorCategory, ImportError[]> {
    const grouped: Record<ErrorCategory, ImportError[]> = {
      structure: [],
      data: [],
      validation: [],
      reference: [],
      format: [],
      system: []
    };

    [...this.errors, ...this.warnings].forEach(error => {
      grouped[error.category].push(error);
    });

    return grouped;
  }

  /**
   * Get errors grouped by worksheet
   */
  getErrorsByWorksheet(): Record<string, ImportError[]> {
    const grouped: Record<string, ImportError[]> = {};

    [...this.errors, ...this.warnings].forEach(error => {
      const worksheet = error.worksheet || 'Unknown';
      if (!grouped[worksheet]) {
        grouped[worksheet] = [];
      }
      grouped[worksheet].push(error);
    });

    return grouped;
  }

  /**
   * Get summary of errors for reporting
   */
  getSummary(): {
    totalErrors: number;
    totalWarnings: number;
    criticalErrors: number;
    byCategory: Record<ErrorCategory, number>;
    bySeverity: Record<ErrorSeverity, number>;
  } {
    const allIssues = [...this.errors, ...this.warnings];
    
    const byCategory: Record<ErrorCategory, number> = {
      structure: 0,
      data: 0,
      validation: 0,
      reference: 0,
      format: 0,
      system: 0
    };

    const bySeverity: Record<ErrorSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };

    allIssues.forEach(issue => {
      byCategory[issue.category]++;
      bySeverity[issue.severity]++;
    });

    return {
      totalErrors: this.errors.length,
      totalWarnings: this.warnings.length,
      criticalErrors: this.errors.filter(e => e.severity === 'critical').length,
      byCategory,
      bySeverity
    };
  }

  /**
   * Convert all errors to JSON for API response with deduplication info
   */
  toJSON(): {
    errors: any[];
    warnings: any[];
    summary: any;
    analysis: any;
  } {
    const errorsWithCounts = this.errors.map(e => {
      const key = this.getErrorKey(e);
      const count = this.duplicateCount.get(key) || 1;
      return {
        ...e.toJSON(),
        duplicateCount: count > 1 ? count : undefined
      };
    });
    
    const warningsWithCounts = this.warnings.map(w => {
      const key = this.getErrorKey(w);
      const count = this.duplicateCount.get(key) || 1;
      return {
        ...w.toJSON(),
        duplicateCount: count > 1 ? count : undefined
      };
    });
    
    return {
      errors: errorsWithCounts,
      warnings: warningsWithCounts,
      summary: this.getSummary(),
      analysis: this.getErrorAnalysis()
    };
  }

  /**
   * Get duplicate counts for all errors
   */
  getDuplicateCounts(): Map<string, number> {
    return new Map(this.duplicateCount);
  }

  /**
   * Get error clusters grouped by worksheet, category, and severity
   */
  getErrorClusters(): Map<string, ImportError[]> {
    return new Map(this.errorClusters);
  }

  /**
   * Get top errors by frequency (most duplicated)
   */
  getTopErrorsByFrequency(limit = 10): Array<{ error: ImportError; count: number }> {
    const errorFrequency: Array<{ error: ImportError; count: number }> = [];
    
    for (const error of [...this.errors, ...this.warnings]) {
      const key = this.getErrorKey(error);
      const count = this.duplicateCount.get(key) || 1;
      errorFrequency.push({ error, count });
    }
    
    return errorFrequency
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get sampled errors when there are too many (for performance)
   */
  getSampledErrors(maxSample = 50): ImportError[] {
    if (this.errors.length <= maxSample) {
      return [...this.errors];
    }
    
    const sampled: ImportError[] = [];
    const step = Math.floor(this.errors.length / maxSample);
    
    for (let i = 0; i < this.errors.length; i += step) {
      sampled.push(this.errors[i]);
      if (sampled.length >= maxSample) break;
    }
    
    return sampled;
  }

  /**
   * Get comprehensive error analysis
   */
  getErrorAnalysis(): {
    totalUniqueErrors: number;
    totalDuplicates: number;
    topErrors: Array<{ error: ImportError; count: number }>;
    clusterSummary: Array<{ cluster: string; count: number; severity: string }>;
    worstWorksheet: string | null;
  } {
    const totalDuplicates = Array.from(this.duplicateCount.values())
      .reduce((sum, count) => sum + (count - 1), 0);
    
    const topErrors = this.getTopErrorsByFrequency(5);
    
    const clusterSummary = Array.from(this.errorClusters.entries())
      .map(([cluster, errors]) => {
        const [worksheet, category, severity] = cluster.split('|');
        return { cluster: `${worksheet} - ${category}`, count: errors.length, severity };
      })
      .sort((a, b) => b.count - a.count);
    
    // Find worksheet with most errors
    const worksheetErrorCounts = new Map<string, number>();
    for (const error of [...this.errors, ...this.warnings]) {
      if (error.worksheet) {
        const count = worksheetErrorCounts.get(error.worksheet) || 0;
        worksheetErrorCounts.set(error.worksheet, count + 1);
      }
    }
    
    const worstWorksheet = worksheetErrorCounts.size > 0 
      ? Array.from(worksheetErrorCounts.entries())
          .sort((a, b) => b[1] - a[1])[0][0]
      : null;
    
    return {
      totalUniqueErrors: this.errors.length + this.warnings.length,
      totalDuplicates,
      topErrors,
      clusterSummary,
      worstWorksheet
    };
  }

  /**
   * Clear all collected errors
   */
  clear(): void {
    this.errors = [];
    this.warnings = [];
    this.info = [];
    this.duplicateCount.clear();
    this.errorClusters.clear();
  }
}

/**
 * Utility functions for common error scenarios
 */
export class ImportErrorUtils {
  /**
   * Create error for missing worksheet
   */
  static missingWorksheet(worksheetName: string): ImportErrorData {
    return {
      type: 'error',
      severity: 'critical',
      category: 'structure',
      worksheet: worksheetName,
      message: `Required worksheet '${worksheetName}' not found`,
      suggestion: `Add a worksheet named '${worksheetName}' to your Excel file`
    };
  }

  /**
   * Create error for missing required field
   */
  static missingRequiredField(
    worksheet: string,
    row: number,
    column: string,
    field: string
  ): ImportErrorData {
    return {
      type: 'error',
      severity: 'high',
      category: 'data',
      worksheet,
      row,
      column,
      field,
      currentValue: null,
      expectedType: 'non-empty value',
      message: `${field} is required but is empty`,
      suggestion: `Enter a value for ${field} in row ${row}`
    };
  }

  /**
   * Create error for invalid data type
   */
  static invalidDataType(
    worksheet: string,
    row: number,
    column: string,
    field: string,
    currentValue: any,
    expectedType: string
  ): ImportErrorData {
    return {
      type: 'error',
      severity: 'high',
      category: 'data',
      worksheet,
      row,
      column,
      field,
      currentValue,
      expectedType,
      message: `Invalid ${expectedType} format in ${field}`,
      suggestion: `Enter a valid ${expectedType} value in row ${row}, column ${column}`
    };
  }

  /**
   * Create error for invalid email format
   */
  static invalidEmail(
    worksheet: string,
    row: number,
    column: string,
    currentValue: string
  ): ImportErrorData {
    return {
      type: 'error',
      severity: 'medium',
      category: 'format',
      worksheet,
      row,
      column,
      field: 'Email',
      currentValue,
      expectedType: 'email address',
      message: 'Invalid email address format',
      suggestion: 'Enter a valid email address (e.g., user@example.com)'
    };
  }

  /**
   * Create error for invalid date format
   */
  static invalidDate(
    worksheet: string,
    row: number,
    column: string,
    field: string,
    currentValue: any,
    expectedFormat: string
  ): ImportErrorData {
    return {
      type: 'error',
      severity: 'medium',
      category: 'format',
      worksheet,
      row,
      column,
      field,
      currentValue,
      expectedValue: expectedFormat,
      message: `Invalid date format in ${field}`,
      suggestion: `Enter date in ${expectedFormat} format`
    };
  }

  /**
   * Create warning for reference not found
   */
  static referenceNotFound(
    worksheet: string,
    row: number,
    column: string,
    field: string,
    currentValue: string,
    referenceType: string
  ): ImportErrorData {
    return {
      type: 'warning',
      severity: 'medium',
      category: 'reference',
      worksheet,
      row,
      column,
      field,
      currentValue,
      message: `${referenceType} '${currentValue}' not found`,
      suggestion: `Ensure '${currentValue}' exists or will be created by this import`
    };
  }

  /**
   * Validate email format using RFC 5322 compliant regex
   */
  static validateEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email);
  }

  /**
   * Validate percentage value (0-100)
   */
  static validatePercentage(value: any): { isValid: boolean; numericValue?: number } {
    if (value === null || value === undefined || value === '') {
      return { isValid: false };
    }
    
    const numericValue = parseFloat(value.toString().replace('%', ''));
    if (isNaN(numericValue)) {
      return { isValid: false };
    }
    
    return {
      isValid: numericValue >= 0 && numericValue <= 100,
      numericValue
    };
  }

  /**
   * Validate positive number
   */
  static validatePositiveNumber(value: any): { isValid: boolean; numericValue?: number } {
    if (value === null || value === undefined || value === '') {
      return { isValid: false };
    }
    
    const numericValue = parseFloat(value.toString());
    if (isNaN(numericValue)) {
      return { isValid: false };
    }
    
    return {
      isValid: numericValue > 0,
      numericValue
    };
  }

  /**
   * Validate date format and parse with multiple format support
   */
  static validateDate(value: any, expectedFormat?: string): { isValid: boolean; parsedDate?: Date; format?: string } {
    if (value === null || value === undefined || value === '') {
      return { isValid: false };
    }

    // Handle Excel date numbers
    if (typeof value === 'number') {
      try {
        const date = new Date((value - 25569) * 86400 * 1000);
        if (!isNaN(date.getTime())) {
          return { isValid: true, parsedDate: date, format: 'Excel serial number' };
        }
      } catch {
        return { isValid: false };
      }
    }

    // Handle Date objects
    if (value instanceof Date) {
      return { isValid: !isNaN(value.getTime()), parsedDate: value, format: 'Date object' };
    }

    // Handle string dates with multiple formats
    const dateString = value.toString().trim();
    const formats = [
      { regex: /^\d{1,2}\/\d{1,2}\/\d{4}$/, name: 'MM/DD/YYYY' },
      { regex: /^\d{1,2}-\d{1,2}-\d{4}$/, name: 'MM-DD-YYYY' },
      { regex: /^\d{4}-\d{1,2}-\d{1,2}$/, name: 'YYYY-MM-DD' },
      { regex: /^\d{1,2}\/\d{1,2}\/\d{2}$/, name: 'MM/DD/YY' },
      { regex: /^\d{4}\/\d{1,2}\/\d{1,2}$/, name: 'YYYY/MM/DD' }
    ];

    for (const format of formats) {
      if (format.regex.test(dateString)) {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
          if (expectedFormat && format.name !== expectedFormat) {
            continue;
          }
          return { isValid: true, parsedDate: date, format: format.name };
        }
      }
    }

    return { isValid: false };
  }

  /**
   * Validate required field
   */
  static validateRequired(value: any): boolean {
    if (value === null || value === undefined) {
      return false;
    }
    
    const stringValue = value.toString().trim();
    return stringValue.length > 0;
  }

  /**
   * Validate date range (start < end)
   */
  static validateDateRange(startDate: any, endDate: any): { isValid: boolean; message?: string } {
    const startValidation = ImportErrorUtils.validateDate(startDate);
    const endValidation = ImportErrorUtils.validateDate(endDate);

    if (!startValidation.isValid || !endValidation.isValid) {
      return { isValid: false, message: 'Invalid date format in date range' };
    }

    if (startValidation.parsedDate! > endValidation.parsedDate!) {
      return { isValid: false, message: 'Start date must be before end date' };
    }

    return { isValid: true };
  }
}