import { sheets_v4 } from 'googleapis';
import { EntityMetadata } from './decorators';

/**
 * Migration Types
 */
export type MigrationType = 'add_column' | 'remove_column' | 'rename_column' | 'add_sheet' | 'remove_sheet';

/**
 * Migration Definition
 */
export interface Migration {
  id: string; // Unique migration ID (timestamp-based)
  name: string; // Human-readable name
  type: MigrationType;
  timestamp: Date;
  executed: boolean;
  metadata: any; // Migration-specific data
}

/**
 * Migration Operation
 */
export interface MigrationOperation {
  entityName: string;
  sheetName: string;
  operation: MigrationType;
  data: any;
}

/**
 * Migration Manager
 */
export class MigrationManager {
  private migrations: Migration[] = [];
  private migrationsSheetName = '__migrations__';

  constructor(
    private sheets: sheets_v4.Sheets,
    private spreadsheetId: string
  ) {}

  /**
   * Initialize migrations sheet
   */
  async initialize(): Promise<void> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });

    const existingSheets = spreadsheet.data.sheets?.map(s => s.properties?.title) || [];

    // Create migrations sheet if it doesn't exist
    if (!existingSheets.includes(this.migrationsSheetName)) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: this.migrationsSheetName,
                hidden: true, // Hide from users
              },
            },
          }],
        },
      });

      // Add headers
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.migrationsSheetName}!A1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['id', 'name', 'type', 'timestamp', 'executed', 'metadata']],
        },
      });
    }

    // Load existing migrations
    await this.loadMigrations();
  }

  /**
   * Load migrations from sheet
   */
  private async loadMigrations(): Promise<void> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.migrationsSheetName}!A2:F`,
      });

      const rows = response.data.values || [];
      this.migrations = rows.map(row => ({
        id: row[0],
        name: row[1],
        type: row[2] as MigrationType,
        timestamp: new Date(row[3]),
        executed: row[4] === 'TRUE',
        metadata: row[5] ? JSON.parse(row[5]) : {},
      }));
    } catch (error) {
      console.error('Error loading migrations:', error);
      this.migrations = [];
    }
  }

  /**
   * Create a new migration
   */
  async createMigration(name: string, operations: MigrationOperation[]): Promise<Migration> {
    const migration: Migration = {
      id: `${Date.now()}`,
      name,
      type: operations[0].operation, // Use first operation type
      timestamp: new Date(),
      executed: false,
      metadata: { operations },
    };

    this.migrations.push(migration);
    await this.saveMigration(migration);

    return migration;
  }

  /**
   * Save migration to sheet
   */
  private async saveMigration(migration: Migration): Promise<void> {
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${this.migrationsSheetName}!A2`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          migration.id,
          migration.name,
          migration.type,
          migration.timestamp.toISOString(),
          migration.executed ? 'TRUE' : 'FALSE',
          JSON.stringify(migration.metadata),
        ]],
      },
    });
  }

  /**
   * Execute a migration
   */
  async executeMigration(migrationId: string): Promise<void> {
    const migration = this.migrations.find(m => m.id === migrationId);
    
    if (!migration) {
      throw new Error(`Migration ${migrationId} not found`);
    }

    if (migration.executed) {
      console.log(`Migration ${migration.name} already executed`);
      return;
    }

    const operations = migration.metadata.operations as MigrationOperation[];

    for (const op of operations) {
      await this.executeOperation(op);
    }

    // Mark as executed
    migration.executed = true;
    await this.updateMigrationStatus(migration);
  }

  /**
   * Execute a single migration operation
   */
  private async executeOperation(operation: MigrationOperation): Promise<void> {
    switch (operation.operation) {
      case 'add_column':
        await this.addColumn(operation.sheetName, operation.data.columnName);
        break;
      
      case 'remove_column':
        await this.removeColumn(operation.sheetName, operation.data.columnIndex);
        break;
      
      case 'rename_column':
        await this.renameColumn(
          operation.sheetName,
          operation.data.oldName,
          operation.data.newName
        );
        break;
      
      case 'add_sheet':
        await this.addSheet(operation.sheetName, operation.data.headers);
        break;
      
      case 'remove_sheet':
        await this.removeSheet(operation.sheetName);
        break;
    }
  }

  /**
   * Add a column to a sheet
   */
  private async addColumn(sheetName: string, columnName: string): Promise<void> {
    // Get current headers
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!1:1`,
    });

    const headers = response.data.values?.[0] || [];
    headers.push(columnName);

    // Update headers
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!1:1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers],
      },
    });
  }

  /**
   * Remove a column from a sheet
   */
  private async removeColumn(sheetName: string, columnIndex: number): Promise<void> {
    const sheetId = await this.getSheetId(sheetName);

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'COLUMNS',
              startIndex: columnIndex,
              endIndex: columnIndex + 1,
            },
          },
        }],
      },
    });
  }

  /**
   * Rename a column
   */
  private async renameColumn(
    sheetName: string,
    oldName: string,
    newName: string
  ): Promise<void> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!1:1`,
    });

    const headers = response.data.values?.[0] || [];
    const index = headers.indexOf(oldName);

    if (index === -1) {
      throw new Error(`Column ${oldName} not found`);
    }

    headers[index] = newName;

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!1:1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers],
      },
    });
  }

  /**
   * Add a new sheet
   */
  private async addSheet(sheetName: string, headers: string[]): Promise<void> {
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: sheetName,
            },
          },
        }],
      },
    });

    // Add headers
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers],
      },
    });
  }

  /**
   * Remove a sheet
   */
  private async removeSheet(sheetName: string): Promise<void> {
    const sheetId = await this.getSheetId(sheetName);

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [{
          deleteSheet: {
            sheetId,
          },
        }],
      },
    });
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
   * Update migration status
   */
  private async updateMigrationStatus(migration: Migration): Promise<void> {
    // Find row index
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.migrationsSheetName}!A2:A`,
    });

    const ids = response.data.values?.map(row => row[0]) || [];
    const rowIndex = ids.indexOf(migration.id);

    if (rowIndex === -1) return;

    // Update executed status
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${this.migrationsSheetName}!E${rowIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['TRUE']],
      },
    });
  }

  /**
   * Get pending migrations
   */
  getPendingMigrations(): Migration[] {
    return this.migrations.filter(m => !m.executed);
  }

  /**
   * Get executed migrations
   */
  getExecutedMigrations(): Migration[] {
    return this.migrations.filter(m => m.executed);
  }

  /**
   * Run all pending migrations
   */
  async runPendingMigrations(): Promise<void> {
    const pending = this.getPendingMigrations();
    
    console.log(`Found ${pending.length} pending migrations`);

    for (const migration of pending) {
      console.log(`Executing migration: ${migration.name}`);
      await this.executeMigration(migration.id);
      console.log(`✓ Migration ${migration.name} executed successfully`);
    }

    console.log('All migrations completed!');
  }

  /**
   * Generate migration from schema changes
   */
  async generateMigration(
    name: string,
    currentMetadata: Map<string, EntityMetadata>,
    previousMetadata?: Map<string, EntityMetadata>
  ): Promise<Migration | null> {
    const operations: MigrationOperation[] = [];

    // Compare schemas and generate operations
    for (const [entityName, metadata] of currentMetadata) {
      const previous = previousMetadata?.get(entityName);

      if (!previous) {
        // New entity - add sheet
        operations.push({
          entityName,
          sheetName: metadata.sheetName,
          operation: 'add_sheet',
          data: {
            headers: metadata.columns.map(c => c.name),
          },
        });
      } else {
        // Check for column changes
        const currentColumns = metadata.columns.map(c => c.name);
        const previousColumns = previous.columns.map(c => c.name);

        // New columns
        const newColumns = currentColumns.filter(c => !previousColumns.includes(c));
        for (const col of newColumns) {
          operations.push({
            entityName,
            sheetName: metadata.sheetName,
            operation: 'add_column',
            data: { columnName: col },
          });
        }

        // Removed columns
        const removedColumns = previousColumns.filter(c => !currentColumns.includes(c));
        for (const col of removedColumns) {
          const index = previousColumns.indexOf(col);
          operations.push({
            entityName,
            sheetName: metadata.sheetName,
            operation: 'remove_column',
            data: { columnIndex: index },
          });
        }
      }
    }

    // Removed entities
    if (previousMetadata) {
      for (const [entityName, metadata] of previousMetadata) {
        if (!currentMetadata.has(entityName)) {
          operations.push({
            entityName,
            sheetName: metadata.sheetName,
            operation: 'remove_sheet',
            data: {},
          });
        }
      }
    }

    if (operations.length === 0) {
      console.log('No schema changes detected');
      return null;
    }

    return this.createMigration(name, operations);
  }
}
