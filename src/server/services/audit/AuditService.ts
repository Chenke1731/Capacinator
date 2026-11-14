import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

export interface AuditLogEntry {
  id: string;
  table_name: string;
  record_id: string;
  /** 基础为 CREATE/UPDATE/DELETE；业务域前缀事件（INTAKE_* 等）同列存储（034 迁移无 CHECK） */
  action: string;
  changed_by: string | null;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  changed_fields: string[] | null;
  request_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  comment: string | null;
  changed_at: Date;
}

interface AuditLogDbEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  changed_by: string | null;
  old_values: string | null;
  new_values: string | null;
  changed_fields: string | null;
  request_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  comment: string | null;
  changed_at: Date;
}

export interface AuditConfig {
  maxHistoryEntries: number;
  enabledTables: string[];
  sensitiveFields: string[];
  retentionDays: number;
}

export class AuditService {
  private db: Knex;
  private config: AuditConfig;

  constructor(db: Knex, config: AuditConfig) {
    this.db = db;
    this.config = config;
  }

  async logChange(params: {
    tableName: string;
    recordId: string;
    action: string;
    changedBy?: string;
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
    requestId?: string;
    ipAddress?: string;
    userAgent?: string;
    comment?: string;
  }): Promise<string> {
    const auditId = uuidv4();
    
    // Filter sensitive fields
    const filteredOldValues = this.filterSensitiveFields(params.oldValues);
    const filteredNewValues = this.filterSensitiveFields(params.newValues);
    
    // Calculate changed fields for UPDATE operations
    // I01v 交付评审 N5：业务域前缀事件（INTAKE_UPDATE 等）同样应记变更字段
    const isUpdateAction = params.action === 'UPDATE' || String(params.action).endsWith('_UPDATE');
    const changedFields = isUpdateAction
      ? this.getChangedFields(filteredOldValues || undefined, filteredNewValues || undefined)
      : null;

    const auditEntry: Partial<AuditLogDbEntry> = {
      id: auditId,
      table_name: params.tableName,
      record_id: params.recordId,
      action: params.action,
      changed_by: params.changedBy || null,
      old_values: filteredOldValues ? JSON.stringify(filteredOldValues) : null,
      new_values: filteredNewValues ? JSON.stringify(filteredNewValues) : null,
      changed_fields: changedFields ? JSON.stringify(changedFields) : null,
      request_id: params.requestId || null,
      ip_address: params.ipAddress || null,
      user_agent: params.userAgent || null,
      comment: params.comment || null,
      changed_at: new Date()
    };

    await this.db('audit_log').insert(auditEntry);
    
    // Cleanup old entries if needed
    await this.cleanupOldEntries(params.tableName, params.recordId);
    
    return auditId;
  }

  async getAuditHistory(
    tableName: string, 
    recordId: string, 
    limit?: number
  ): Promise<AuditLogEntry[]> {
    const query = this.db('audit_log')
      .where('table_name', tableName)
      .where('record_id', recordId)
      .orderBy('changed_at', 'desc');
    
    if (limit) {
      query.limit(limit);
    }
    
    const results = await query;
    return results.map(this.parseAuditEntry);
  }

  async getRecentChanges(
    changedBy?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<AuditLogEntry[]> {
    const query = this.db('audit_log')
      .orderBy('changed_at', 'desc')
      .limit(limit)
      .offset(offset);
    
    if (changedBy) {
      query.where('changed_by', changedBy);
    }
    
    const results = await query;
    return results.map(this.parseAuditEntry);
  }

  async undoLastChange(
    tableName: string,
    recordId: string,
    undoneBy: string,
    comment?: string
  ): Promise<boolean> {
    // Get all undo operations to track what has been specifically undone
    const undoEntries = await this.db('audit_log')
      .where('table_name', tableName)
      .where('record_id', recordId)
      .where(function() {
        this.where('comment', 'like', '%Undo UPDATE operation (audit_id:%')
          .orWhere('comment', 'like', '%Undo CREATE operation (audit_id:%')
          .orWhere('comment', 'like', '%Undo DELETE operation (audit_id:%');
      });

    const undoneAuditIds = new Set(
      undoEntries.map(entry => {
        const match = entry.comment?.match(/audit_id:\s*([^)]+)\)/);
        return match ? match[1] : null;
      }).filter(Boolean)
    );

    // Find the last change that hasn't been specifically undone
    // This includes both original operations and undo operations (undo operations can themselves be undone)
    // Use rowid as secondary sort for deterministic ordering when timestamps are identical
    const candidates = await this.db('audit_log')
      .where('table_name', tableName)
      .where('record_id', recordId)
      .orderBy('changed_at', 'desc')
      .orderByRaw('rowid DESC');

    // Find the first candidate that either:
    // 1. Is an undo operation (can always be undone), OR
    // 2. Is an original operation that hasn't been undone yet
    const lastChangeRaw = candidates.find(entry => {
      const isUndoOperation = entry.comment && entry.comment.includes('Undo');
      const hasBeenUndone = undoneAuditIds.has(entry.id);
      return isUndoOperation || !hasBeenUndone;
    });
    

    if (!lastChangeRaw) {
      throw new Error('No changes found to undo');
    }

    const lastChange = this.parseAuditEntry(lastChangeRaw);
    // 复合操作（转换/撤销替换）以 DELETE+CREATE 成对审计；逐条撤销会
    // 造成 0 行（撤销 CREATE）或重复分配（撤销 DELETE），必须整体禁用。
    if (String(lastChange.comment ?? '').includes('[composite]')) {
      return false;
    }
    return this.undoSpecificChange(lastChange, undoneBy, comment);
  }

  // New method to undo a specific change
  async undoSpecificChange(
    change: AuditLogEntry,
    undoneBy: string,
    comment?: string
  ): Promise<boolean> {
    const { table_name: tableName, record_id: recordId } = change;

    // If this is an undo operation, we need to restore the original change
    if (change.comment && change.comment.includes('Undo')) {
      // For undoing an undo operation, we apply the inverse of what the undo did
      if (change.action === 'DELETE' && change.old_values) {
        // This was an undo of CREATE - restore by recreating
        await this.db(tableName).insert({
          id: recordId,
          ...change.old_values
        });

        await this.logChange({
          tableName,
          recordId,
          action: 'CREATE',
          changedBy: undoneBy,
          newValues: change.old_values,
          comment: comment || `Undo ${change.comment} (audit_id: ${change.id})`
        });

        return true;
      } else if (change.action === 'UPDATE' && change.old_values && change.new_values) {
        // This was an undo of UPDATE - restore by applying original change
        await this.db(tableName)
          .where('id', recordId)
          .update(change.old_values);

        await this.logChange({
          tableName,
          recordId,
          action: 'UPDATE',
          changedBy: undoneBy,
          oldValues: change.new_values,
          newValues: change.old_values,
          comment: comment || `Undo ${change.comment} (audit_id: ${change.id})`
        });

        return true;
      } else if (change.action === 'CREATE' && change.new_values) {
        // This was an undo of DELETE - restore by deleting again
        await this.db(tableName).where('id', recordId).del();

        await this.logChange({
          tableName,
          recordId,
          action: 'DELETE',
          changedBy: undoneBy,
          oldValues: change.new_values,
          comment: comment || `Undo ${change.comment} (audit_id: ${change.id})`
        });

        return true;
      }
    }

    // Handle regular (non-undo) operations
    if (change.action === 'DELETE') {
      // For DELETE operations, we could recreate the record if we have the old values
      if (change.old_values) {
        await this.db(tableName).insert({
          id: recordId,
          ...change.old_values
        });

        await this.logChange({
          tableName,
          recordId,
          action: 'CREATE',
          changedBy: undoneBy,
          newValues: change.old_values,
          comment: comment || `Undo DELETE operation (audit_id: ${change.id})`
        });

        return true;
      }
      throw new Error('Cannot undo DELETE operations without old values');
    }

    // For CREATE operations, delete the record
    if (change.action === 'CREATE') {
      // Get current record state before deleting
      const currentRecord = await this.db(tableName).where('id', recordId).first();
      
      await this.db(tableName).where('id', recordId).del();
      
      await this.logChange({
        tableName,
        recordId,
        action: 'DELETE',
        changedBy: undoneBy,
        oldValues: currentRecord || change.new_values || undefined,
        comment: comment || `Undo CREATE operation (audit_id: ${change.id})`
      });
      
      return true;
    }

    // For UPDATE operations, restore old values
    if (change.action === 'UPDATE' && change.old_values) {
      // Get current state before reverting
      const currentRecord = await this.db(tableName).where('id', recordId).first();
      
      await this.db(tableName)
        .where('id', recordId)
        .update(change.old_values);
      
      await this.logChange({
        tableName,
        recordId,
        action: 'UPDATE',
        changedBy: undoneBy,
        oldValues: currentRecord || change.new_values || undefined,
        newValues: change.old_values,
        comment: comment || `Undo UPDATE operation (audit_id: ${change.id})`
      });
      
      return true;
    }

    return false;
  }

  async undoLastNChanges(
    changedBy: string,
    count: number,
    undoneBy: string,
    comment?: string
  ): Promise<{ undone: number; errors: string[] }> {
    // Get only non-undo changes by the specified user
    // Use rowid as secondary sort for deterministic ordering when timestamps are identical
    const changes = await this.db('audit_log')
      .where('changed_by', changedBy)
      .where(function() {
        this.whereNull('comment')
          .orWhere('comment', 'not like', '%Undo%');
      })
      .orderBy('changed_at', 'desc')
      .orderByRaw('rowid DESC')
      .limit(count);

    let undone = 0;
    const errors: string[] = [];

    // Process in reverse order (oldest first) to maintain consistency
    for (const change of changes.reverse()) {
      try {
        const parsedChange = this.parseAuditEntry(change);
        await this.undoSpecificChange(
          parsedChange,
          undoneBy,
          comment || `Bulk undo operation (${count} changes)`
        );
        undone++;
      } catch (error) {
        errors.push(`Failed to undo change ${change.id}: ${(error as Error).message}`);
      }
    }

    return { undone, errors };
  }

  async searchAuditLog(filters: {
    tableName?: string;
    recordId?: string;
    changedBy?: string;
    action?: string;
    fromDate?: Date;
    toDate?: Date;
    requestId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ total: number; entries: AuditLogEntry[] }> {
    let query = this.db('audit_log');
    
    if (filters.tableName) query = query.where('table_name', filters.tableName);
    if (filters.recordId) query = query.where('record_id', filters.recordId);
    if (filters.changedBy) query = query.where('changed_by', filters.changedBy);
    if (filters.action) query = query.where('action', filters.action);
    if (filters.requestId) query = query.where('request_id', filters.requestId);
    if (filters.fromDate) query = query.where('changed_at', '>=', filters.fromDate);
    if (filters.toDate) query = query.where('changed_at', '<=', filters.toDate);

    const total = await query.clone().count('* as count').first();
    
    const entries = await query
      .orderBy('changed_at', 'desc')
      .limit(filters.limit || 50)
      .offset(filters.offset || 0);

    return {
      total: (total as any)?.count || 0,
      entries: entries.map(this.parseAuditEntry)
    };
  }

  private filterSensitiveFields(values?: Record<string, any>): Record<string, any> | null {
    if (!values) return null;
    
    const filtered = { ...values };
    this.config.sensitiveFields.forEach(field => {
      if (field in filtered) {
        filtered[field] = '[REDACTED]';
      }
    });
    
    return filtered;
  }

  private getChangedFields(
    oldValues?: Record<string, any>, 
    newValues?: Record<string, any>
  ): string[] | null {
    if (!oldValues || !newValues) return null;
    
    const changed: string[] = [];
    const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
    
    for (const key of allKeys) {
      if (JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])) {
        changed.push(key);
      }
    }
    
    return changed.length > 0 ? changed : null;
  }

  private async cleanupOldEntries(tableName: string, recordId: string): Promise<void> {
    const entryCount = await this.db('audit_log')
      .where('table_name', tableName)
      .where('record_id', recordId)
      .count('* as count')
      .first();

    const count = (entryCount as any)?.count || 0;
    
    if (count > this.config.maxHistoryEntries) {
      const excessCount = count - this.config.maxHistoryEntries;
      const oldestEntries = await this.db('audit_log')
        .where('table_name', tableName)
        .where('record_id', recordId)
        .orderBy('changed_at', 'asc')
        .limit(excessCount)
        .pluck('id');

      if (oldestEntries.length > 0) {
        await this.db('audit_log').whereIn('id', oldestEntries).del();
      }
    }
  }

  async cleanupExpiredEntries(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
    
    const deletedCount = await this.db('audit_log')
      .where('changed_at', '<', cutoffDate)
      .del();
    
    return deletedCount;
  }

  async getAuditStats(): Promise<{
    totalEntries: number;
    entriesByAction: Record<string, number>;
    entriesByTable: Record<string, number>;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  }> {
    const total = await this.db('audit_log').count('* as count').first();
    
    const byAction = await this.db('audit_log')
      .select('action')
      .count('* as count')
      .groupBy('action');
    
    const byTable = await this.db('audit_log')
      .select('table_name')
      .count('* as count')
      .groupBy('table_name');
    
    const oldest = await this.db('audit_log')
      .min('changed_at as min_date')
      .first();
    
    const newest = await this.db('audit_log')
      .max('changed_at as max_date')
      .first();

    const entriesByAction: Record<string, number> = {};
    byAction.forEach((row: any) => {
      entriesByAction[row.action] = Number(row.count);
    });

    const entriesByTable: Record<string, number> = {};
    byTable.forEach((row: any) => {
      entriesByTable[row.table_name] = Number(row.count);
    });

    return {
      totalEntries: (total as any)?.count || 0,
      entriesByAction,
      entriesByTable,
      oldestEntry: (oldest as any)?.min_date || null,
      newestEntry: (newest as any)?.max_date || null
    };
  }

  // Get the history of actual changes (excluding undo operations)
  async getActualChangeHistory(
    tableName: string,
    recordId: string,
    limit?: number
  ): Promise<AuditLogEntry[]> {
    const query = this.db('audit_log')
      .where('table_name', tableName)
      .where('record_id', recordId)
      .where(function() {
        this.whereNull('comment')
          .orWhere('comment', 'not like', '%Undo%');
      })
      .orderBy('changed_at', 'desc');
    
    if (limit) {
      query.limit(limit);
    }
    
    const results = await query;
    return results.map(this.parseAuditEntry);
  }

  private parseAuditEntry(entry: AuditLogDbEntry): AuditLogEntry {
    return {
      ...entry,
      old_values: entry.old_values ? JSON.parse(entry.old_values) : null,
      new_values: entry.new_values ? JSON.parse(entry.new_values) : null,
      changed_fields: entry.changed_fields ? JSON.parse(entry.changed_fields) : null
    };
  }

  // NEW METHODS FOR E2E TESTS

  async getAuditEntryById(auditId: string): Promise<AuditLogEntry | null> {
    const entry = await this.db('audit_log')
      .where('id', auditId)
      .first();
    
    return entry ? this.parseAuditEntry(entry) : null;
  }

  async getAuditSummaryByTable(): Promise<Record<string, Record<string, number>>> {
    const results = await this.db('audit_log')
      .select('table_name', 'action')
      .count('* as count')
      .groupBy('table_name', 'action');

    const summary: Record<string, Record<string, number>> = {};

    // Initialize all audited tables with zero counts
    this.config.enabledTables.forEach(table => {
      summary[table] = {
        CREATE: 0,
        UPDATE: 0,
        DELETE: 0
      };
    });

    // Fill in actual counts
    results.forEach((row: any) => {
      if (!summary[row.table_name]) {
        summary[row.table_name] = {
          CREATE: 0,
          UPDATE: 0,
          DELETE: 0
        };
      }
      summary[row.table_name][row.action] = Number(row.count);
    });

    return summary;
  }

  async getAuditTimeline(
    startDate: Date,
    endDate: Date,
    interval: 'hour' | 'day' | 'week' = 'hour'
  ): Promise<Array<{ timestamp: string; action_count: number }>> {
    // SQLite datetime formatting based on interval
    let dateFormat: string;
    switch (interval) {
      case 'hour':
        dateFormat = '%Y-%m-%d %H:00:00';
        break;
      case 'day':
        dateFormat = '%Y-%m-%d';
        break;
      case 'week':
        dateFormat = '%Y-W%W';
        break;
    }

    const results = await this.db('audit_log')
      .select(this.db.raw(`strftime('${dateFormat}', changed_at) as period`))
      .count('* as action_count')
      .where('changed_at', '>=', startDate)
      .where('changed_at', '<=', endDate)
      .groupBy('period')
      .orderBy('period', 'asc');

    return results.map((row: any) => ({
      timestamp: row.period,
      action_count: Number(row.action_count)
    }));
  }

  async getUserActivity(): Promise<Record<string, { total_actions: number; last_activity: Date | null }>> {
    const results = await this.db('audit_log')
      .select('changed_by')
      .count('* as total_actions')
      .max('changed_at as last_activity')
      .whereNotNull('changed_by')
      .groupBy('changed_by');

    const activity: Record<string, { total_actions: number; last_activity: Date | null }> = {};

    results.forEach((row: any) => {
      activity[row.changed_by] = {
        total_actions: Number(row.total_actions),
        last_activity: row.last_activity ? new Date(row.last_activity) : null
      };
    });

    return activity;
  }
}