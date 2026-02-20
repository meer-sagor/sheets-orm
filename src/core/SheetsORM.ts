import { google, sheets_v4 } from 'googleapis';
import NodeCache from 'node-cache';
import { EntityMetadata, ColumnMetadata, EntitySchema } from './decorators';
import { QueryBuilder } from './QueryBuilder';
import { MigrationManager } from './migrations';
import { TransactionManager, Transaction } from './transactions';
import { getRelationsMetadata, RelationMetadata, LoadRelationsOptions } from './relations';

/**
 * Authentication modes
 */
export type AuthMode = 'oauth' | 'service-account';

/**
 * OAuth Configuration
 */
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Service Account Configuration
 */
export interface ServiceAccountConfig {
  clientEmail: string;
  privateKey: string;
}

/**
 * Unified ORM Configuration
 */
export interface SheetsORMConfig {
  // Authentication mode
  authMode: AuthMode;
  
  // OAuth config (required if authMode = 'oauth')
  oauth?: OAuthConfig;
  
  // Service Account config (required if authMode = 'service-account')
  serviceAccount?: ServiceAccountConfig;
  
  // For service account mode: single spreadsheet ID
  spreadsheetId?: string;
  
  // Cache configuration
  cacheConfig?: {
    stdTTL?: number; // seconds
    checkperiod?: number;
    useClones?: boolean;
  };
  
  // Feature flags
  enableMigrations?: boolean;
  enableTransactions?: boolean;
}

/**
 * Connection information (for OAuth mode)
 */
export interface ConnectionInfo {
  connectionId: string;
  spreadsheetId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: Date;
  email?: string;
}

/**
 * Unified Google Sheets ORM
 * Supports both OAuth (multi-tenant) and Service Account (single-tenant)
 */
export class SheetsORM {
  private cache: NodeCache;
  private entities: Map<string, EntityMetadata> = new Map();
  
  // Mode-specific storage
  private authMode: AuthMode;
  
  // OAuth mode data
  private oauth2ClientConfig?: OAuthConfig;
  private connections: Map<string, ConnectionInfo> = new Map();
  private sheetsClients: Map<string, sheets_v4.Sheets> = new Map();
  private repositories: Map<string, Map<string, Repository<any>>> = new Map();
  private migrations: Map<string, MigrationManager> = new Map();
  private transactions: Map<string, TransactionManager> = new Map();
  
  // Service Account mode data
  private serviceAccountClient?: sheets_v4.Sheets;
  private serviceAccountSpreadsheetId?: string;
  private serviceAccountRepositories: Map<string, Repository<any>> = new Map();
  private serviceAccountMigrationManager?: MigrationManager;
  private serviceAccountTransactionManager?: TransactionManager;
  
  // Feature flags
  private enableMigrations: boolean;
  private enableTransactions: boolean;

  constructor(config: SheetsORMConfig) {
    this.authMode = config.authMode;
    
    // Validate configuration
    this.validateConfig(config);
    
    // Initialize cache
    this.cache = new NodeCache({
      stdTTL: config.cacheConfig?.stdTTL || 300, // 5 minutes default
      checkperiod: config.cacheConfig?.checkperiod || 60,
      useClones: config.cacheConfig?.useClones ?? true,
    });

    this.enableMigrations = config.enableMigrations !== false;
    this.enableTransactions = config.enableTransactions !== false;

    // Initialize based on mode
    if (this.authMode === 'oauth') {
      this.initializeOAuthMode(config.oauth!);
    } else {
      this.initializeServiceAccountMode(config.serviceAccount!, config.spreadsheetId!);
    }

    console.log(`✅ SheetsORM initialized in ${this.authMode} mode`);
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: SheetsORMConfig): void {
    if (config.authMode === 'oauth' && !config.oauth) {
      throw new Error('OAuth configuration is required when authMode is "oauth"');
    }
    
    if (config.authMode === 'service-account') {
      if (!config.serviceAccount) {
        throw new Error('Service Account configuration is required when authMode is "service-account"');
      }
      if (!config.spreadsheetId) {
        throw new Error('spreadsheetId is required when authMode is "service-account"');
      }
    }
  }

  /**
   * Initialize OAuth mode
   */
  private initializeOAuthMode(oauth: OAuthConfig): void {
    this.oauth2ClientConfig = oauth;
    console.log('✅ OAuth mode initialized');
  }

  /**
   * Initialize Service Account mode
   */
  private initializeServiceAccountMode(serviceAccount: ServiceAccountConfig, spreadsheetId: string): void {
    const auth = new google.auth.JWT({
      email: serviceAccount.clientEmail,
      key: serviceAccount.privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.serviceAccountClient = google.sheets({ version: 'v4', auth });
    this.serviceAccountSpreadsheetId = spreadsheetId;

    // Initialize migration manager if enabled
    if (this.enableMigrations) {
      this.serviceAccountMigrationManager = new MigrationManager(
        this.serviceAccountClient,
        spreadsheetId
      );
    }

    // Initialize transaction manager if enabled
    if (this.enableTransactions) {
      this.serviceAccountTransactionManager = new TransactionManager(
        this.serviceAccountClient,
        spreadsheetId,
        this.cache,
        this.serviceAccountRepositories
      );
    }

    console.log('✅ Service Account mode initialized');
  }

  /**
   * Register connection (OAuth mode only)
   */
  async registerConnection(connection: ConnectionInfo): Promise<void> {
    if (this.authMode !== 'oauth') {
      throw new Error('registerConnection() is only available in OAuth mode');
    }

    const { connectionId, spreadsheetId, accessToken, refreshToken, tokenExpiry } = connection;

    // Store connection info
    this.connections.set(connectionId, connection);

    // Create OAuth client
    const oauth2Client = new google.auth.OAuth2(
      this.oauth2ClientConfig!.clientId,
      this.oauth2ClientConfig!.clientSecret,
      this.oauth2ClientConfig!.redirectUri
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: tokenExpiry.getTime(),
    });

    // Create sheets client
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    this.sheetsClients.set(connectionId, sheets);

    // Initialize repositories map
    this.repositories.set(connectionId, new Map());

    // Initialize migration manager if enabled
    if (this.enableMigrations) {
      const migrationManager = new MigrationManager(sheets, spreadsheetId);
      this.migrations.set(connectionId, migrationManager);
    }

    // Initialize transaction manager if enabled
    if (this.enableTransactions) {
      const repos = this.repositories.get(connectionId)!;
      const transactionManager = new TransactionManager(
        sheets,
        spreadsheetId,
        this.cache,
        repos
      );
      this.transactions.set(connectionId, transactionManager);
    }

    console.log(`✅ Connection ${connectionId} registered`);
  }

  /**
   * Unregister connection (OAuth mode only)
   */
  unregisterConnection(connectionId: string): void {
    if (this.authMode !== 'oauth') {
      throw new Error('unregisterConnection() is only available in OAuth mode');
    }

    this.connections.delete(connectionId);
    this.sheetsClients.delete(connectionId);
    this.repositories.delete(connectionId);
    this.migrations.delete(connectionId);
    this.transactions.delete(connectionId);
    
    // Clear cache
    if (this.authMode === 'oauth') {
      this.clearConnectionCache(connectionId);
    }

    console.log(`✅ Connection ${connectionId} unregistered`);
  }

  /**
   * Refresh connection token (OAuth mode only)
   */
  async refreshConnectionToken(connectionId: string): Promise<void> {
    if (this.authMode !== 'oauth') {
      return; // No-op for service account mode
    }

    const connection = this.connections.get(connectionId);
    
    if (!connection) {
      throw new Error(`Connection ${connectionId} not registered`);
    }

    // Check if token is expired
    const now = new Date();
    const expiryBuffer = new Date(connection.tokenExpiry.getTime() - 5 * 60 * 1000);

    if (now < expiryBuffer) {
      return; // Token still valid
    }

    console.log(`🔄 Refreshing token for connection ${connectionId}...`);

    // Refresh token
    const oauth2Client = new google.auth.OAuth2(
      this.oauth2ClientConfig!.clientId,
      this.oauth2ClientConfig!.clientSecret,
      this.oauth2ClientConfig!.redirectUri
    );

    oauth2Client.setCredentials({
      refresh_token: connection.refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    // Update connection
    connection.accessToken = credentials.access_token!;
    connection.tokenExpiry = new Date(credentials.expiry_date!);

    // Update sheets client
    oauth2Client.setCredentials({
      access_token: credentials.access_token,
      refresh_token: connection.refreshToken,
      expiry_date: credentials.expiry_date,
    });

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    this.sheetsClients.set(connectionId, sheets);

    console.log(`✅ Token refreshed for connection ${connectionId}`);
  }

  /**
   * Get sheets client (mode-aware)
   */
  private async getSheetsClient(connectionId?: string): Promise<sheets_v4.Sheets> {
    if (this.authMode === 'service-account') {
      return this.serviceAccountClient!;
    }

    // OAuth mode
    if (!connectionId) {
      throw new Error('connectionId is required in OAuth mode');
    }

    await this.refreshConnectionToken(connectionId);
    const sheets = this.sheetsClients.get(connectionId);
    
    if (!sheets) {
      throw new Error(`Connection ${connectionId} not registered`);
    }

    return sheets;
  }

  /**
   * Get spreadsheet ID (mode-aware)
   */
  private getSpreadsheetId(connectionId?: string): string {
    if (this.authMode === 'service-account') {
      return this.serviceAccountSpreadsheetId!;
    }

    // OAuth mode
    if (!connectionId) {
      throw new Error('connectionId is required in OAuth mode');
    }

    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not registered`);
    }

    return connection.spreadsheetId;
  }

  /**
   * Register an entity
   */
  registerEntity<T>(entityClass: new () => T, schema: EntitySchema): void {
    const prototype = entityClass.prototype;
    const relations = getRelationsMetadata(prototype) || [];

    const metadata: EntityMetadata & { relations?: RelationMetadata[] } = {
      name: schema.name,
      sheetName: schema.sheetName || schema.name,
      columns: schema.columns,
      primaryKey: schema.columns.find(col => col.primary)?.propertyName || 'id',
      relations,
    };

    this.entities.set(schema.name, metadata);
  }

  /**
   * Get repository (mode-aware)
   * 
   * Service Account mode: getRepository(Product)
   * OAuth mode: getRepository('connection-123', Product)
   */
  getRepository<T>(
    entityClassOrConnectionId: (new () => T) | string,
    entityClass?: new () => T
  ): Repository<T> {
    if (this.authMode === 'service-account') {
      // Service account mode: first param is entity class
      const entityCls = entityClassOrConnectionId as new () => T;
      return this.getServiceAccountRepository(entityCls);
    } else {
      // OAuth mode: first param is connectionId, second is entity class
      const connectionId = entityClassOrConnectionId as string;
      if (!entityClass) {
        throw new Error('entityClass is required as second parameter in OAuth mode');
      }
      return this.getOAuthRepository(connectionId, entityClass);
    }
  }

  /**
   * Get repository for service account mode
   */
  private getServiceAccountRepository<T>(entityClass: new () => T): Repository<T> {
    const entityName = entityClass.name;

    // Return cached repository if exists
    if (this.serviceAccountRepositories.has(entityName)) {
      return this.serviceAccountRepositories.get(entityName)!;
    }

    const metadata = this.entities.get(entityName);
    if (!metadata) {
      throw new Error(`Entity ${entityName} is not registered`);
    }

    // Create repository
    const repository = new Repository<T>(
      'service-account', // connectionId (for cache key)
      async () => this.serviceAccountClient!,
      () => this.serviceAccountSpreadsheetId!,
      this.cache,
      metadata,
      this
    );

    this.serviceAccountRepositories.set(entityName, repository);
    return repository;
  }

  /**
   * Get repository for OAuth mode
   */
  private getOAuthRepository<T>(connectionId: string, entityClass: new () => T): Repository<T> {
    const entityName = entityClass.name;
    
    const connectionRepos = this.repositories.get(connectionId);
    if (!connectionRepos) {
      throw new Error(`Connection ${connectionId} not registered`);
    }

    // Return cached repository if exists
    if (connectionRepos.has(entityName)) {
      return connectionRepos.get(entityName)!;
    }

    const metadata = this.entities.get(entityName);
    if (!metadata) {
      throw new Error(`Entity ${entityName} is not registered`);
    }

    // Create repository
    const repository = new Repository<T>(
      connectionId,
      async () => this.getSheetsClient(connectionId),
      () => this.getSpreadsheetId(connectionId),
      this.cache,
      metadata,
      this
    );

    connectionRepos.set(entityName, repository);
    return repository;
  }

  /**
   * Start transaction (mode-aware)
   */
  transaction(connectionIdOrOptions?: string | any, options?: any): Transaction {
    if (this.authMode === 'service-account') {
      if (!this.serviceAccountTransactionManager) {
        throw new Error('Transactions are not enabled');
      }
      const opts = typeof connectionIdOrOptions === 'object' ? connectionIdOrOptions : options;
      return this.serviceAccountTransactionManager.createTransaction(opts);
    } else {
      // OAuth mode
      const connectionId = connectionIdOrOptions as string;
      if (!connectionId) {
        throw new Error('connectionId is required in OAuth mode');
      }

      const transactionManager = this.transactions.get(connectionId);
      if (!transactionManager) {
        throw new Error('Transactions are not enabled or connection not registered');
      }

      return transactionManager.createTransaction(options);
    }
  }

  /**
   * Execute within transaction (mode-aware)
   */
  async withTransaction<R>(
    connectionIdOrCallback: string | ((transaction: Transaction) => Promise<R>),
    callbackOrOptions?: ((transaction: Transaction) => Promise<R>) | any,
    options?: any
  ): Promise<R> {
    if (this.authMode === 'service-account') {
      if (!this.serviceAccountTransactionManager) {
        throw new Error('Transactions are not enabled');
      }
      const callback = connectionIdOrCallback as (transaction: Transaction) => Promise<R>;
      const opts = callbackOrOptions as any;
      return this.serviceAccountTransactionManager.withTransaction(callback, opts);
    } else {
      // OAuth mode
      const connectionId = connectionIdOrCallback as string;
      const callback = callbackOrOptions as (transaction: Transaction) => Promise<R>;

      const transactionManager = this.transactions.get(connectionId);
      if (!transactionManager) {
        throw new Error('Transactions are not enabled or connection not registered');
      }

      return transactionManager.withTransaction(callback, options);
    }
  }

  /**
   * Get migration manager (mode-aware)
   */
  getMigrationManager(connectionId?: string): MigrationManager {
    if (this.authMode === 'service-account') {
      if (!this.serviceAccountMigrationManager) {
        throw new Error('Migrations are not enabled');
      }
      return this.serviceAccountMigrationManager;
    } else {
      // OAuth mode
      if (!connectionId) {
        throw new Error('connectionId is required in OAuth mode');
      }

      const migrationManager = this.migrations.get(connectionId);
      if (!migrationManager) {
        throw new Error('Migrations are not enabled or connection not registered');
      }

      return migrationManager;
    }
  }

  /**
   * Sync schema (mode-aware)
   */
  async syncSchema(connectionId?: string): Promise<void> {
    const sheets = await this.getSheetsClient(connectionId);
    const spreadsheetId = this.getSpreadsheetId(connectionId);

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const existingSheets = spreadsheet.data.sheets?.map(s => s.properties?.title) || [];

    for (const [_, metadata] of this.entities) {
      if (!existingSheets.includes(metadata.sheetName)) {
        // Create new sheet
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
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
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${metadata.sheetName}!A1`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [headers],
          },
        });

        const mode = this.authMode === 'service-account' ? 'service account' : `connection ${connectionId}`;
        console.log(`✅ Created sheet ${metadata.sheetName} for ${mode}`);
      }
    }
  }

  /**
   * Synchronize schema changes — the SheetsORM equivalent of TypeORM synchronize:true.
   *
   * Behaviour per sheet:
   *   • Sheet does NOT exist   → creates it and writes all schema headers (same as syncSchema)
   *   • Sheet EXISTS, no diff  → no-op (fast, safe to call on every request)
   *   • Sheet EXISTS, new cols → appends missing column headers to the END of row 1
   *                              and re-aligns the in-memory entity metadata to match
   *                              the actual sheet column order so rowToEntity stays correct
   *
   * What it will NEVER do (safe for production data):
   *   • Remove or rename existing columns
   *   • Move or rewrite existing data rows
   */
  async syncSchemaChanges(connectionId?: string): Promise<void> {
    const sheets = await this.getSheetsClient(connectionId);
    const spreadsheetId = this.getSpreadsheetId(connectionId);

    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheetTitles =
      spreadsheet.data.sheets?.map(s => s.properties?.title) || [];

    for (const [, metadata] of this.entities) {
      const schemaHeaders = metadata.columns.map(col => col.name);

      if (!existingSheetTitles.includes(metadata.sheetName)) {
        // ── Sheet does not exist yet ─────────────────────────────────────
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: metadata.sheetName } } }],
          },
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${metadata.sheetName}!A1`,
          valueInputOption: 'RAW',
          requestBody: { values: [schemaHeaders] },
        });
        console.log(`✅ [syncSchemaChanges] Created sheet "${metadata.sheetName}" with ${schemaHeaders.length} columns`);
      } else {
        // ── Sheet exists — diff headers ──────────────────────────────────
        const headerResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${metadata.sheetName}!1:1`,
        });

        const currentHeaders: string[] =
          (headerResponse.data.values?.[0] as string[] | undefined) ?? [];

        // Columns in schema but missing from the sheet
        const missingCols = metadata.columns.filter(
          col => !currentHeaders.includes(col.name),
        );

        if (missingCols.length > 0) {
          const updatedHeaders = [...currentHeaders, ...missingCols.map(c => c.name)];
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${metadata.sheetName}!A1`,
            valueInputOption: 'RAW',
            requestBody: { values: [updatedHeaders] },
          });
          console.log(
            `✅ [syncSchemaChanges] Added ${missingCols.length} column(s) to "${metadata.sheetName}": ` +
              missingCols.map(c => c.name).join(', '),
          );
        }

        // ── Re-align metadata columns to match ACTUAL sheet column order ──
        // SheetsORM maps row[index] → col[index], so the in-memory metadata
        // column array MUST match the sheet's physical column order.
        const finalHeaders = [
          ...currentHeaders,
          ...missingCols.map(c => c.name),
        ].filter(h => !!h);

        const aligned: ColumnMetadata[] = finalHeaders
          .map(header => metadata.columns.find(col => col.name === header))
          .filter((col): col is ColumnMetadata => col !== undefined);

        // Append any remaining schema columns not yet in the sheet (safety net)
        const remaining = metadata.columns.filter(
          col => !finalHeaders.includes(col.name),
        );
        metadata.columns = [...aligned, ...remaining];
        metadata.primaryKey =
          metadata.columns.find(col => col.primary)?.propertyName ?? 'id';
      }
    }
  }

  /**
   * Clear cache (mode-aware)
   */
  clearCache(connectionId?: string): void {
    if (this.authMode === 'service-account') {
      // Clear all cache with 'service-account' prefix
      const keys = this.cache.keys();
      keys.forEach(key => {
        if (key.startsWith('connection:service-account:')) {
          this.cache.del(key);
        }
      });
    } else {
      // OAuth mode
      if (connectionId) {
        this.clearConnectionCache(connectionId);
      } else {
        throw new Error('connectionId is required in OAuth mode');
      }
    }
  }

  /**
   * Clear connection cache (OAuth mode)
   */
  private clearConnectionCache(connectionId: string): void {
    const keys = this.cache.keys();
    keys.forEach(key => {
      if (key.startsWith(`connection:${connectionId}:`)) {
        this.cache.del(key);
      }
    });
  }

  /**
   * Clear all cache
   */
  clearAllCache(): void {
    this.cache.flushAll();
  }

  /**
   * Get connection info (OAuth mode only)
   */
  getConnection(connectionId: string): ConnectionInfo | undefined {
    if (this.authMode !== 'oauth') {
      throw new Error('getConnection() is only available in OAuth mode');
    }
    return this.connections.get(connectionId);
  }

  /**
   * Check if connection is registered (OAuth mode only)
   */
  isConnectionRegistered(connectionId: string): boolean {
    if (this.authMode !== 'oauth') {
      return false;
    }
    return this.connections.has(connectionId);
  }

  /**
   * Get all registered connections (OAuth mode only)
   */
  getRegisteredConnections(): string[] {
    if (this.authMode !== 'oauth') {
      return [];
    }
    return Array.from(this.connections.keys());
  }

  /**
   * Get current auth mode
   */
  getAuthMode(): AuthMode {
    return this.authMode;
  }
}

/**
 * Repository class (same for both modes)
 */
export class Repository<T> {
  private cacheKeyPrefix: string;

  constructor(
    private connectionId: string,
    private getSheetsClient: () => Promise<sheets_v4.Sheets>,
    private getSpreadsheetId: () => string,
    private cache: NodeCache,
    private metadata: EntityMetadata & { relations?: RelationMetadata[] },
    private orm: SheetsORM
  ) {
    this.cacheKeyPrefix = `connection:${connectionId}:${metadata.name}:`;
  }

  async save(entity: Partial<T>): Promise<T> {
    const primaryKey = this.metadata.primaryKey;
    const id = (entity as any)[primaryKey];

    if (id) {
      return this.update(id, entity);
    } else {
      return this.insert(entity);
    }
  }

  private async insert(entity: Partial<T>): Promise<T> {
    const sheets = await this.getSheetsClient();
    const spreadsheetId = this.getSpreadsheetId();
    
    const row = this.entityToRow(entity);
    
    const primaryKeyCol = this.metadata.columns.find(col => col.primary);
    if (primaryKeyCol && !entity[primaryKeyCol.propertyName as keyof T]) {
      const nextId = await this.getNextId();
      row[this.metadata.columns.indexOf(primaryKeyCol)] = nextId.toString();
      (entity as any)[primaryKeyCol.propertyName] = nextId;
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${this.metadata.sheetName}!A2`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });

    this.invalidateCache();
    return entity as T;
  }

  private async update(id: any, entity: Partial<T>): Promise<T> {
    const sheets = await this.getSheetsClient();
    const spreadsheetId = this.getSpreadsheetId();
    
    const rowIndex = await this.findRowIndexById(id);
    
    if (rowIndex === -1) {
      throw new Error(`Entity with ID ${id} not found`);
    }

    const row = this.entityToRow(entity);
    const range = `${this.metadata.sheetName}!A${rowIndex + 2}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });

    this.invalidateCache();
    return entity as T;
  }

  async findById(id: any): Promise<T | null> {
    const cacheKey = `${this.cacheKeyPrefix}id:${id}`;
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

  async findAll(): Promise<T[]> {
    const cacheKey = `${this.cacheKeyPrefix}all`;
    const cached = this.cache.get<T[]>(cacheKey);

    if (cached) {
      return cached;
    }

    const sheets = await this.getSheetsClient();
    const spreadsheetId = this.getSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${this.metadata.sheetName}!A2:ZZ`,
    });

    const rows = response.data.values || [];
    const entities = rows.map(row => this.rowToEntity(row));

    this.cache.set(cacheKey, entities);
    return entities;
  }

  async find(criteria: Partial<T>): Promise<T[]> {
    const all = await this.findAll();
    return all.filter(entity => {
      return Object.keys(criteria).every(key => {
        return (entity as any)[key] === (criteria as any)[key];
      });
    });
  }

  createQueryBuilder(): QueryBuilder<T> {
    return new QueryBuilder<T>(this);
  }

  async delete(id: any): Promise<boolean> {
    const sheets = await this.getSheetsClient();
    const spreadsheetId = this.getSpreadsheetId();
    
    const rowIndex = await this.findRowIndexById(id);
    
    if (rowIndex === -1) {
      return false;
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
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

  async count(criteria?: Partial<T>): Promise<number> {
    if (criteria) {
      const results = await this.find(criteria);
      return results.length;
    }

    const all = await this.findAll();
    return all.length;
  }

  async findByIdWithRelations(id: any, options?: LoadRelationsOptions): Promise<T | null> {
    const entity = await this.findById(id);
    if (!entity) return null;
    
    return this.loadRelations(entity, options);
  }

  async findAllWithRelations(options?: LoadRelationsOptions): Promise<T[]> {
    const entities = await this.findAll();
    return Promise.all(entities.map(e => this.loadRelations(e, options)));
  }

  async findWithRelations(criteria: Partial<T>, options?: LoadRelationsOptions): Promise<T[]> {
    const entities = await this.find(criteria);
    return Promise.all(entities.map(e => this.loadRelations(e, options)));
  }

  async loadRelations(entity: T, options?: LoadRelationsOptions): Promise<T> {
    const relations = this.metadata.relations || [];
    
    if (relations.length === 0) return entity;

    const depth = options?.depth ?? 1;
    if (depth <= 0) return entity;

    for (const relation of relations) {
      if (options?.include && !options.include.includes(relation.propertyName)) {
        continue;
      }

      await this.loadRelation(entity, relation, depth);
    }

    return entity;
  }

  private async loadRelation(entity: any, relation: RelationMetadata, depth: number): Promise<void> {
    const TargetClass = relation.target();
    
    // Get repository based on ORM mode
    const orm = this.orm as any;
    let targetRepo: Repository<any>;
    
    if (orm.getAuthMode() === 'service-account') {
      targetRepo = orm.getRepository(TargetClass);
    } else {
      targetRepo = orm.getRepository(this.connectionId, TargetClass);
    }

    switch (relation.type) {
      case 'one-to-many':
        const localValue = entity[relation.localKey];
        const relatedEntities = await targetRepo.find({ [relation.foreignKey]: localValue } as any);
        
        if (depth > 1) {
          entity[relation.propertyName] = await Promise.all(
            relatedEntities.map(e => targetRepo.loadRelations(e, { depth: depth - 1 }))
          );
        } else {
          entity[relation.propertyName] = relatedEntities;
        }
        break;

      case 'many-to-one':
      case 'one-to-one':
        const foreignValue = entity[relation.foreignKey];
        if (foreignValue) {
          const relatedEntity = await targetRepo.findById(foreignValue);
          
          if (relatedEntity && depth > 1) {
            entity[relation.propertyName] = await targetRepo.loadRelations(relatedEntity, { depth: depth - 1 });
          } else {
            entity[relation.propertyName] = relatedEntity;
          }
        }
        break;
    }
  }

  public entityToRow(entity: Partial<T>): any[] {
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
    const sheets = await this.getSheetsClient();
    const spreadsheetId = this.getSpreadsheetId();
    
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
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