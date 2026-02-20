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

// Relations exports
export {
  OneToMany,
  ManyToOne,
  OneToOne,
  getRelationsMetadata
} from './core/relations';

export type {
  RelationType,
  RelationMetadata,
  LoadRelationsOptions
} from './core/relations';

// Migration exports
export { MigrationManager } from './core/migrations';

export type {
  Migration,
  MigrationType,
  MigrationOperation
} from './core/migrations';

// Transaction exports
export {
  Transaction,
  TransactionRepository,
  TransactionManager
} from './core/transactions';

export type {
  TransactionOptions
} from './core/transactions';
