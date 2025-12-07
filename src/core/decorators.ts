export interface ColumnMetadata {
  propertyName: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'json';
  primary?: boolean;
  nullable?: boolean;
  unique?: boolean;
  default?: any;
}

export interface EntityMetadata {
  name: string;
  sheetName: string;
  columns: ColumnMetadata[];
  primaryKey: string;
}

export interface EntitySchema {
  name: string;
  sheetName?: string;
  columns: ColumnMetadata[];
}

// Decorator metadata storage
const entityMetadataStorage = new Map<any, EntitySchema>();

/**
 * Entity decorator - marks a class as a database entity
 */
export function Entity(options?: { name?: string; sheetName?: string }) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    const metadata: EntitySchema = {
      name: options?.name || constructor.name,
      sheetName: options?.sheetName || options?.name || constructor.name,
      columns: getColumnsMetadata(constructor.prototype) || [],
    };

    entityMetadataStorage.set(constructor, metadata);
    return constructor;
  };
}

/**
 * Column decorator - marks a property as a database column
 */
export function Column(options?: {
  name?: string;
  type?: 'string' | 'number' | 'boolean' | 'date' | 'json';
  nullable?: boolean;
  unique?: boolean;
  default?: any;
}) {
  return function (target: any, propertyKey: string) {
    const columns = getColumnsMetadata(target) || [];
    
    const columnMetadata: ColumnMetadata = {
      propertyName: propertyKey,
      name: options?.name || propertyKey,
      type: options?.type || inferType(target, propertyKey),
      nullable: options?.nullable ?? true,
      unique: options?.unique ?? false,
      default: options?.default,
    };

    columns.push(columnMetadata);
    setColumnsMetadata(target, columns);
  };
}

/**
 * PrimaryColumn decorator - marks a property as the primary key
 */
export function PrimaryColumn(options?: {
  name?: string;
  type?: 'string' | 'number';
  autoIncrement?: boolean;
}) {
  return function (target: any, propertyKey: string) {
    const columns = getColumnsMetadata(target) || [];
    
    const columnMetadata: ColumnMetadata = {
      propertyName: propertyKey,
      name: options?.name || propertyKey,
      type: options?.type || 'number',
      primary: true,
      nullable: false,
      unique: true,
    };

    columns.push(columnMetadata);
    setColumnsMetadata(target, columns);
  };
}

/**
 * Get entity schema from a class
 */
export function getEntitySchema<T>(entityClass: new () => T): EntitySchema | undefined {
  return entityMetadataStorage.get(entityClass);
}

// Helper functions for metadata storage
const columnsMetadataKey = Symbol('columns');

function getColumnsMetadata(target: any): ColumnMetadata[] | undefined {
  return Reflect.getMetadata(columnsMetadataKey, target);
}

function setColumnsMetadata(target: any, columns: ColumnMetadata[]): void {
  Reflect.defineMetadata(columnsMetadataKey, columns, target);
}

function inferType(target: any, propertyKey: string): 'string' | 'number' | 'boolean' | 'date' | 'json' {
  const designType = Reflect.getMetadata('design:type', target, propertyKey);
  
  if (designType === Number) return 'number';
  if (designType === Boolean) return 'boolean';
  if (designType === Date) return 'date';
  if (designType === String) return 'string';
  
  return 'json'; // Default for complex types
}

// Export metadata storage for internal use
export { entityMetadataStorage };
