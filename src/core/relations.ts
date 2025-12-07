import { ColumnMetadata, EntityMetadata } from './decorators';

/**
 * Relation Types
 */
export type RelationType = 'one-to-many' | 'many-to-one' | 'one-to-one';

/**
 * Relation Metadata
 */
export interface RelationMetadata {
  propertyName: string;
  type: RelationType;
  target: () => any; // Function that returns the target entity class
  foreignKey: string; // Foreign key column name
  localKey: string; // Local key column name
  eager?: boolean; // Auto-load relations
  cascade?: boolean; // Cascade operations
}

/**
 * Relation metadata storage
 */
const relationMetadataStorage = new Map<any, RelationMetadata[]>();

/**
 * OneToMany decorator - One entity has many related entities
 * Example: User has many Posts
 * 
 * @param target - Target entity class function
 * @param options - Relation options
 */
export function OneToMany(
  target: () => any,
  options?: {
    foreignKey?: string;
    eager?: boolean;
    cascade?: boolean;
  }
) {
  return function (prototype: any, propertyKey: string) {
    const relations = getRelationsMetadata(prototype) || [];
    
    const relationMetadata: RelationMetadata = {
      propertyName: propertyKey,
      type: 'one-to-many',
      target,
      foreignKey: options?.foreignKey || `${prototype.constructor.name.toLowerCase()}Id`,
      localKey: 'id',
      eager: options?.eager ?? false,
      cascade: options?.cascade ?? false,
    };

    relations.push(relationMetadata);
    setRelationsMetadata(prototype, relations);
  };
}

/**
 * ManyToOne decorator - Many entities belong to one entity
 * Example: Post belongs to User
 * 
 * @param target - Target entity class function
 * @param options - Relation options
 */
export function ManyToOne(
  target: () => any,
  options?: {
    foreignKey?: string;
    eager?: boolean;
  }
) {
  return function (prototype: any, propertyKey: string) {
    const relations = getRelationsMetadata(prototype) || [];
    
    const relationMetadata: RelationMetadata = {
      propertyName: propertyKey,
      type: 'many-to-one',
      target,
      foreignKey: options?.foreignKey || `${propertyKey}Id`,
      localKey: 'id',
      eager: options?.eager ?? false,
      cascade: false, // ManyToOne doesn't cascade by default
    };

    relations.push(relationMetadata);
    setRelationsMetadata(prototype, relations);
  };
}

/**
 * OneToOne decorator - One entity has one related entity
 * Example: User has one Profile
 * 
 * @param target - Target entity class function
 * @param options - Relation options
 */
export function OneToOne(
  target: () => any,
  options?: {
    foreignKey?: string;
    eager?: boolean;
    cascade?: boolean;
  }
) {
  return function (prototype: any, propertyKey: string) {
    const relations = getRelationsMetadata(prototype) || [];
    
    const relationMetadata: RelationMetadata = {
      propertyName: propertyKey,
      type: 'one-to-one',
      target,
      foreignKey: options?.foreignKey || `${propertyKey}Id`,
      localKey: 'id',
      eager: options?.eager ?? false,
      cascade: options?.cascade ?? false,
    };

    relations.push(relationMetadata);
    setRelationsMetadata(prototype, relations);
  };
}

/**
 * Get relations metadata from a class prototype
 */
export function getRelationsMetadata(prototype: any): RelationMetadata[] | undefined {
  return relationMetadataStorage.get(prototype);
}

/**
 * Set relations metadata for a class prototype
 */
function setRelationsMetadata(prototype: any, relations: RelationMetadata[]): void {
  relationMetadataStorage.set(prototype, relations);
}

/**
 * Extended Entity Metadata with Relations
 */
export interface EntityMetadataWithRelations extends EntityMetadata {
  relations?: RelationMetadata[];
}

/**
 * Relation loader options
 */
export interface LoadRelationsOptions {
  include?: string[]; // Which relations to include
  depth?: number; // How deep to load relations (default: 1)
}

export { relationMetadataStorage };
