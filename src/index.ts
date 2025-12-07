/**
 * Google Sheets ORM - TypeORM-like ORM for Google Sheets
 * 
 * Main export file
 */

// Core exports
export { SheetsORM, Repository } from './core/SheetsORM';
export type { SheetsORMConfig } from './core/SheetsORM';

// Decorator exports
export { 
  Entity, 
  Column, 
  PrimaryColumn,
  getEntitySchema 
} from './core/decorators';

export type { 
  ColumnMetadata, 
  EntityMetadata, 
  EntitySchema 
} from './core/decorators';

// QueryBuilder exports
export { QueryBuilder } from './core/QueryBuilder';

// Example entities (optional)
export { User, Product, Order } from './entities/examples';
