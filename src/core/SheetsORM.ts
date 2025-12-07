import { google, sheets_v4 } from 'googleapis';
import NodeCache from 'node-cache';
import { EntityMetadata, ColumnMetadata, EntitySchema } from './decorators';
import { QueryBuilder } from './QueryBuilder';

export interface SheetsORMConfig {
  credentials: {
    client_email: string;
    private_key: string;
  };
  spreadsheetId: string;
  cacheConfig?: {
    stdTTL?: number; // seconds
    checkperiod?: number;
    useClones?: boolean;
  };
}

export class SheetsORM {
  private sheets: sheets_v4.Sheets;
  private spreadsheetId: string;
  private cache: NodeCache;
  private entities: Map<string, EntityMetadata> = new Map();

  constructor(config: SheetsORMConfig) {
    // Initialize Google Sheets API
    const auth = new google.auth.JWT(
      config.credentials.client_email,
      undefined,
      config.credentials.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    this.sheets = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = config.spreadsheetId;

    // Initialize cache
    this.cache = new NodeCache({
      stdTTL: config.cacheConfig?.stdTTL || 300, // 5 minutes default
      checkperiod: config.cacheConfig?.checkperiod || 60,
      useClones: config.cacheConfig?.useClones ?? true,
    });
  }

  /**
   * Register an entity with the ORM
   */
  registerEntity<T>(entityClass: new () => T, schema: EntitySchema): void {
    const metadata: EntityMetadata = {
      name: schema.name,
      sheetName: schema.sheetName || schema.name,
      columns: schema.columns,
      primaryKey: schema.columns.find(col => col.primary)?.propertyName || 'id',
    };

    this.entities.set(schema.name, metadata);
  }

  /**
   * Get repository for an entity
   */
  getRepository<T>(entityClass: new () => T): Repository<T> {
    const entityName = entityClass.name;
    const metadata = this.entities.get(entityName);

    if (!metadata) {
      throw new Error(`Entity ${entityName} is not registered`);
    }

    return new Repository<T>(this.sheets, this.spreadsheetId, this.cache, metadata);
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.flushAll();
  }

  /**
   * Sync schema - creates sheets if they don't exist and sets up headers
   */
  async syncSchema(): Promise<void> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });

    const existingSheets = spreadsheet.data.sheets?.map(s => s.properties?.title) || [];

    for (const [_, metadata] of this.entities) {
      if (!existingSheets.includes(metadata.sheetName)) {
        // Create new sheet
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: [{
              addSheet: {
                properties: {
                  title: metadata.sheetName,
                },
              },
            }],
          },
        });

        // Add headers
        const headers = metadata.columns.map(col => col.name);
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${metadata.sheetName}!A1`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [headers],
          },
        });
      }
    }
  }
}

export class Repository<T> {
  private cacheKeyPrefix: string;

  constructor(
    private sheets: sheets_v4.Sheets,
    private spreadsheetId: string,
    private cache: NodeCache,
    private metadata: EntityMetadata
  ) {
    this.cacheKeyPrefix = `${metadata.name}:`;
  }

  /**
   * Save an entity (insert or update)
   */
  async save(entity: Partial<T>): Promise<T> {
    const primaryKey = this.metadata.primaryKey;
    const id = (entity as any)[primaryKey];

    if (id) {
      return this.update(id, entity);
    } else {
      return this.insert(entity);
    }
  }

  /**
   * Insert a new entity
   */
  private async insert(entity: Partial<T>): Promise<T> {
    const row = this.entityToRow(entity);
    
    // Generate ID if primary key is not provided
    const primaryKeyCol = this.metadata.columns.find(col => col.primary);
    if (primaryKeyCol && !entity[primaryKeyCol.propertyName as keyof T]) {
      const nextId = await this.getNextId();
      row[this.metadata.columns.indexOf(primaryKeyCol)] = nextId.toString();
      (entity as any)[primaryKeyCol.propertyName] = nextId;
    }

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${this.metadata.sheetName}!A2`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });

    this.invalidateCache();
    return entity as T;
  }

  /**
   * Update an existing entity
   */
  private async update(id: any, entity: Partial<T>): Promise<T> {
    const rowIndex = await this.findRowIndexById(id);
    
    if (rowIndex === -1) {
      throw new Error(`Entity with ID ${id} not found`);
    }

    const row = this.entityToRow(entity);
    const range = `${this.metadata.sheetName}!A${rowIndex + 2}`;

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });

    this.invalidateCache();
    return entity as T;
  }

  /**
   * Find entity by ID
   */
  async findById(id: any): Promise<T | null> {
    const cacheKey = `${this.cacheKeyPrefix}${id}`;
    const cached = this.cache.get<T>(cacheKey);

    if (cached) {
      return cached;
    }

    const all = await this.findAll();
    const entity = all.find((e: any) => e[this.metadata.primaryKey] === id) || null;

    if (entity) {
      this.cache.set(cacheKey, entity);
    }

    return entity;
  }

  /**
   * Find all entities
   */
  async findAll(): Promise<T[]> {
    const cacheKey = `${this.cacheKeyPrefix}all`;
    const cached = this.cache.get<T[]>(cacheKey);

    if (cached) {
      return cached;
    }

    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.metadata.sheetName}!A2:ZZ`,
    });

    const rows = response.data.values || [];
    const entities = rows.map(row => this.rowToEntity(row));

    this.cache.set(cacheKey, entities);
    return entities;
  }

  /**
   * Find entities matching criteria
   */
  async find(criteria: Partial<T>): Promise<T[]> {
    const all = await this.findAll();
    return all.filter(entity => {
      return Object.keys(criteria).every(key => {
        return (entity as any)[key] === (criteria as any)[key];
      });
    });
  }

  /**
   * Create a query builder for complex queries
   */
  createQueryBuilder(): QueryBuilder<T> {
    return new QueryBuilder<T>(this);
  }

  /**
   * Delete entity by ID
   */
  async delete(id: any): Promise<boolean> {
    const rowIndex = await this.findRowIndexById(id);
    
    if (rowIndex === -1) {
      return false;
    }

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: await this.getSheetId(),
              dimension: 'ROWS',
              startIndex: rowIndex + 1,
              endIndex: rowIndex + 2,
            },
          },
        }],
      },
    });

    this.invalidateCache();
    return true;
  }

  /**
   * Count entities
   */
  async count(criteria?: Partial<T>): Promise<number> {
    if (criteria) {
      const results = await this.find(criteria);
      return results.length;
    }

    const all = await this.findAll();
    return all.length;
  }

  // Helper methods

  private entityToRow(entity: Partial<T>): any[] {
    return this.metadata.columns.map(col => {
      const value = (entity as any)[col.propertyName];
      return this.serializeValue(value, col.type);
    });
  }

  private rowToEntity(row: any[]): T {
    const entity: any = {};
    
    this.metadata.columns.forEach((col, index) => {
      const value = row[index];
      entity[col.propertyName] = this.deserializeValue(value, col.type);
    });

    return entity;
  }

  private serializeValue(value: any, type: string): string {
    if (value === null || value === undefined) return '';
    
    switch (type) {
      case 'number':
        return value.toString();
      case 'boolean':
        return value ? 'TRUE' : 'FALSE';
      case 'date':
        return value instanceof Date ? value.toISOString() : value;
      case 'json':
        return JSON.stringify(value);
      default:
        return value.toString();
    }
  }

  private deserializeValue(value: string, type: string): any {
    if (!value || value === '') return null;

    switch (type) {
      case 'number':
        return parseFloat(value);
      case 'boolean':
        return value === 'TRUE' || value === 'true';
      case 'date':
        return new Date(value);
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      default:
        return value;
    }
  }

  private async findRowIndexById(id: any): Promise<number> {
    const all = await this.findAll();
    return all.findIndex((e: any) => e[this.metadata.primaryKey] === id);
  }

  private async getNextId(): Promise<number> {
    const all = await this.findAll();
    if (all.length === 0) return 1;

    const ids = all.map((e: any) => {
      const id = e[this.metadata.primaryKey];
      return typeof id === 'number' ? id : parseInt(id) || 0;
    });

    return Math.max(...ids) + 1;
  }

  private async getSheetId(): Promise<number> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });

    const sheet = spreadsheet.data.sheets?.find(
      s => s.properties?.title === this.metadata.sheetName
    );

    return sheet?.properties?.sheetId || 0;
  }

  private invalidateCache(): void {
    const keys = this.cache.keys().filter(key => key.startsWith(this.cacheKeyPrefix));
    keys.forEach(key => this.cache.del(key));
  }
}
