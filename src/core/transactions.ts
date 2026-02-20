import { sheets_v4 } from 'googleapis';
import { Repository } from './SheetsORM';
import NodeCache from 'node-cache';
import { EntityMetadata } from './decorators';

/**
 * Transaction Operation Types
 */
type TransactionOperationType = 'insert' | 'update' | 'delete';

/**
 * Transaction Operation
 */
interface TransactionOperation {
  type: TransactionOperationType;
  entityName: string;
  sheetName: string;
  data: any;
  originalData?: any; // For rollback
  rowIndex?: number; // For updates/deletes
}

/**
 * Transaction State
 */
type TransactionState = 'pending' | 'committing' | 'committed' | 'rolling_back' | 'rolled_back' | 'failed';

/**
 * Transaction Options
 */
export interface TransactionOptions {
  isolationLevel?: 'read_uncommitted' | 'read_committed';
  timeout?: number; // milliseconds
}

/**
 * Transaction Manager
 * 
 * Note: Google Sheets doesn't support native transactions,
 * so this implementation provides:
 * - Operation batching
 * - Rollback support (best effort)
 * - Isolation through locking
 */
export class Transaction {
  private operations: TransactionOperation[] = [];
  private state: TransactionState = 'pending';
  private startTime: number;
  private lockKey: string;

  constructor(
    private sheets: sheets_v4.Sheets,
    private spreadsheetId: string,
    private cache: NodeCache,
    private repositories: Map<string, Repository<any>>,
    private options: TransactionOptions = {}
  ) {
    this.startTime = Date.now();
    this.lockKey = `transaction_lock_${Date.now()}`;
  }

  /**
   * Get repository for entity within transaction
   */
  getRepository<T>(entityClass: new () => T): TransactionRepository<T> {
    const entityName = entityClass.name;
    const baseRepo = this.repositories.get(entityName);

    if (!baseRepo) {
      throw new Error(`Repository for ${entityName} not found`);
    }

    return new TransactionRepository<T>(this, baseRepo);
  }

  /**
   * Add operation to transaction
   */
  addOperation(operation: TransactionOperation): void {
    if (this.state !== 'pending') {
      throw new Error(`Cannot add operation to transaction in state: ${this.state}`);
    }

    // Check timeout
    if (this.options.timeout) {
      const elapsed = Date.now() - this.startTime;
      if (elapsed > this.options.timeout) {
        throw new Error('Transaction timeout exceeded');
      }
    }

    this.operations.push(operation);
  }

  /**
   * Commit transaction - execute all operations
   */
  async commit(): Promise<void> {
    if (this.state !== 'pending') {
      throw new Error(`Cannot commit transaction in state: ${this.state}`);
    }

    this.state = 'committing';

    try {
      // Execute all operations in order
      for (const operation of this.operations) {
        await this.executeOperation(operation);
      }

      this.state = 'committed';
      
      // Clear locks and invalidate cache
      this.releaseLocks();
      this.invalidateCache();

      console.log(`✓ Transaction committed successfully (${this.operations.length} operations)`);
    } catch (error) {
      this.state = 'failed';
      console.error('Transaction commit failed:', error);
      
      // Attempt rollback
      await this.rollback();
      
      throw new Error(`Transaction failed: ${error}`);
    }
  }

  /**
   * Rollback transaction - undo all operations
   */
  async rollback(): Promise<void> {
    if (this.state === 'rolled_back') {
      return; // Already rolled back
    }

    if (this.state === 'committed') {
      throw new Error('Cannot rollback committed transaction');
    }

    this.state = 'rolling_back';

    try {
      // Reverse operations in reverse order
      for (let i = this.operations.length - 1; i >= 0; i--) {
        const operation = this.operations[i];
        await this.rollbackOperation(operation);
      }

      this.state = 'rolled_back';
      this.releaseLocks();
      this.invalidateCache();

      console.log(`✓ Transaction rolled back (${this.operations.length} operations undone)`);
    } catch (error) {
      console.error('Rollback failed:', error);
      throw new Error(`Rollback failed: ${error}`);
    }
  }

  /**
   * Execute a single operation
   */
  private async executeOperation(operation: TransactionOperation): Promise<void> {
    switch (operation.type) {
      case 'insert':
        await this.executeInsert(operation);
        break;
      
      case 'update':
        await this.executeUpdate(operation);
        break;
      
      case 'delete':
        await this.executeDelete(operation);
        break;
    }
  }

  /**
   * Execute insert operation
   */
  private async executeInsert(operation: TransactionOperation): Promise<void> {
    const row = this.entityToRow(operation.data, operation.entityName);

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${operation.sheetName}!A2`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });

    // Store row index for rollback
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${operation.sheetName}!A:A`,
    });
    operation.rowIndex = (response.data.values?.length || 1) - 1;
  }

  /**
   * Execute update operation
   */
  private async executeUpdate(operation: TransactionOperation): Promise<void> {
    const row = this.entityToRow(operation.data, operation.entityName);
    const range = `${operation.sheetName}!A${operation.rowIndex! + 2}`;

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });
  }

  /**
   * Execute delete operation
   */
  private async executeDelete(operation: TransactionOperation): Promise<void> {
    const sheetId = await this.getSheetId(operation.sheetName);

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: operation.rowIndex! + 1,
              endIndex: operation.rowIndex! + 2,
            },
          },
        }],
      },
    });
  }

  /**
   * Rollback a single operation
   */
  private async rollbackOperation(operation: TransactionOperation): Promise<void> {
    switch (operation.type) {
      case 'insert':
        // Delete the inserted row
        if (operation.rowIndex !== undefined) {
          await this.executeDelete({
            ...operation,
            type: 'delete',
          });
        }
        break;
      
      case 'update':
        // Restore original data
        if (operation.originalData && operation.rowIndex !== undefined) {
          await this.executeUpdate({
            ...operation,
            data: operation.originalData,
          });
        }
        break;
      
      case 'delete':
        // Re-insert the deleted data
        if (operation.originalData) {
          await this.executeInsert({
            ...operation,
            type: 'insert',
            data: operation.originalData,
          });
        }
        break;
    }
  }

  /**
   * Convert entity to row array
   */
  private entityToRow(entity: any, entityName: string): any[] {
    const repo = this.repositories.get(entityName);
    if (!repo) {
      throw new Error(`Repository for ${entityName} not found`);
    }
    
    return (repo as any).entityToRow(entity);
  }

  /**
   * Get sheet ID by name
   */
  private async getSheetId(sheetName: string): Promise<number> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });

    const sheet = spreadsheet.data.sheets?.find(
      s => s.properties?.title === sheetName
    );

    return sheet?.properties?.sheetId || 0;
  }

  /**
   * Release all locks
   */
  private releaseLocks(): void {
    this.cache.del(this.lockKey);
  }

  /**
   * Invalidate cache for affected entities
   */
  private invalidateCache(): void {
    const entityNames = new Set(this.operations.map(op => op.entityName));
    
    for (const entityName of entityNames) {
      const keys = this.cache.keys().filter(key => key.startsWith(`${entityName}:`));
      keys.forEach(key => this.cache.del(key));
    }
  }

  /**
   * Get transaction state
   */
  getState(): TransactionState {
    return this.state;
  }

  /**
   * Get transaction operations count
   */
  getOperationsCount(): number {
    return this.operations.length;
  }
}

/**
 * Transaction Repository - Wraps regular repository to work within transaction
 */
export class TransactionRepository<T> {
  constructor(
    private transaction: Transaction,
    private baseRepository: Repository<T>
  ) {}

  /**
   * Save entity within transaction
   */
  async save(entity: Partial<T>): Promise<T> {
    const metadata = (this.baseRepository as any).metadata;
    const primaryKey = metadata.primaryKey;
    const id = (entity as any)[primaryKey];

    if (id) {
      // Update operation
      const original = await this.baseRepository.findById(id);
      
      this.transaction.addOperation({
        type: 'update',
        entityName: metadata.name,
        sheetName: metadata.sheetName,
        data: entity,
        originalData: original,
        rowIndex: await this.findRowIndex(id),
      });
    } else {
      // Insert operation
      // Generate ID if needed
      const primaryKeyCol = metadata.columns.find((c: any) => c.primary);
      if (primaryKeyCol && !entity[primaryKeyCol.propertyName as keyof T]) {
        const nextId = await this.getNextId();
        (entity as any)[primaryKeyCol.propertyName] = nextId;
      }

      this.transaction.addOperation({
        type: 'insert',
        entityName: metadata.name,
        sheetName: metadata.sheetName,
        data: entity,
      });
    }

    return entity as T;
  }

  /**
   * Delete entity within transaction
   */
  async delete(id: any): Promise<boolean> {
    const metadata = (this.baseRepository as any).metadata;
    const entity = await this.baseRepository.findById(id);

    if (!entity) {
      return false;
    }

    const rowIndex = await this.findRowIndex(id);

    this.transaction.addOperation({
      type: 'delete',
      entityName: metadata.name,
      sheetName: metadata.sheetName,
      data: { id },
      originalData: entity,
      rowIndex,
    });

    return true;
  }

  /**
   * Find methods delegate to base repository (read-only)
   */
  async findById(id: any): Promise<T | null> {
    return this.baseRepository.findById(id);
  }

  async findAll(): Promise<T[]> {
    return this.baseRepository.findAll();
  }

  async find(criteria: Partial<T>): Promise<T[]> {
    return this.baseRepository.find(criteria);
  }

  async count(criteria?: Partial<T>): Promise<number> {
    return this.baseRepository.count(criteria);
  }

  /**
   * Helper methods
   */
  private async findRowIndex(id: any): Promise<number> {
    const all = await this.baseRepository.findAll();
    const metadata = (this.baseRepository as any).metadata;
    return all.findIndex((e: any) => e[metadata.primaryKey] === id);
  }

  private async getNextId(): Promise<number> {
    const all = await this.baseRepository.findAll();
    if (all.length === 0) return 1;

    const metadata = (this.baseRepository as any).metadata;
    const ids = all.map((e: any) => {
      const id = e[metadata.primaryKey];
      return typeof id === 'number' ? id : parseInt(id) || 0;
    });

    return Math.max(...ids) + 1;
  }
}

/**
 * Transaction Manager - Manages transaction lifecycle
 */
export class TransactionManager {
  constructor(
    private sheets: sheets_v4.Sheets,
    private spreadsheetId: string,
    private cache: NodeCache,
    private repositories: Map<string, Repository<any>>
  ) {}

  /**
   * Create a new transaction
   */
  createTransaction(options?: TransactionOptions): Transaction {
    return new Transaction(
      this.sheets,
      this.spreadsheetId,
      this.cache,
      this.repositories,
      options
    );
  }

  /**
   * Execute a function within a transaction
   */
  async withTransaction<R>(
    callback: (transaction: Transaction) => Promise<R>,
    options?: TransactionOptions
  ): Promise<R> {
    const transaction = this.createTransaction(options);

    try {
      const result = await callback(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
