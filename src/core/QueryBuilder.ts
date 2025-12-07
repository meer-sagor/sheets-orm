import { Repository } from './SheetsORM';

type WhereCondition<T> = {
  [K in keyof T]?: T[K] | { 
    $gt?: T[K]; 
    $gte?: T[K]; 
    $lt?: T[K]; 
    $lte?: T[K]; 
    $ne?: T[K];
    $in?: T[K][];
    $contains?: string;
  };
};

export class QueryBuilder<T> {
  private whereConditions: WhereCondition<T>[] = [];
  private orderByField?: keyof T;
  private orderDirection: 'ASC' | 'DESC' = 'ASC';
  private limitValue?: number;
  private offsetValue?: number;
  private selectFields?: (keyof T)[];

  constructor(private repository: Repository<T>) {}

  /**
   * Add WHERE condition
   */
  where(condition: WhereCondition<T>): this {
    this.whereConditions.push(condition);
    return this;
  }

  /**
   * Add AND WHERE condition
   */
  andWhere(condition: WhereCondition<T>): this {
    return this.where(condition);
  }

  /**
   * Add OR WHERE condition (will be combined with previous conditions)
   */
  orWhere(condition: WhereCondition<T>): this {
    this.whereConditions.push(condition);
    return this;
  }

  /**
   * Order results
   */
  orderBy(field: keyof T, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderByField = field;
    this.orderDirection = direction;
    return this;
  }

  /**
   * Limit number of results
   */
  limit(value: number): this {
    this.limitValue = value;
    return this;
  }

  /**
   * Skip number of results
   */
  skip(value: number): this {
    this.offsetValue = value;
    return this;
  }

  /**
   * Select specific fields
   */
  select(fields: (keyof T)[]): this {
    this.selectFields = fields;
    return this;
  }

  /**
   * Execute query and get multiple results
   */
  async getMany(): Promise<T[]> {
    let results = await (this.repository as any).findAll();

    // Apply WHERE conditions
    if (this.whereConditions.length > 0) {
      results = results.filter((entity: T) => {
        return this.whereConditions.some(condition => 
          this.matchesCondition(entity, condition)
        );
      });
    }

    // Apply ORDER BY
    if (this.orderByField) {
      results.sort((a: T, b: T) => {
        const aVal = a[this.orderByField!];
        const bVal = b[this.orderByField!];
        
        let comparison = 0;
        if (aVal > bVal) comparison = 1;
        if (aVal < bVal) comparison = -1;
        
        return this.orderDirection === 'DESC' ? -comparison : comparison;
      });
    }

    // Apply OFFSET
    if (this.offsetValue) {
      results = results.slice(this.offsetValue);
    }

    // Apply LIMIT
    if (this.limitValue) {
      results = results.slice(0, this.limitValue);
    }

    // Apply SELECT
    if (this.selectFields) {
      results = results.map((entity: T) => {
        const selected: any = {};
        this.selectFields!.forEach(field => {
          selected[field] = entity[field];
        });
        return selected as T;
      });
    }

    return results;
  }

  /**
   * Execute query and get single result
   */
  async getOne(): Promise<T | null> {
    const results = await this.limit(1).getMany();
    return results[0] || null;
  }

  /**
   * Execute query and get count
   */
  async getCount(): Promise<number> {
    const results = await this.getMany();
    return results.length;
  }

  /**
   * Execute query and check if exists
   */
  async exists(): Promise<boolean> {
    const count = await this.getCount();
    return count > 0;
  }

  /**
   * Helper to match entity against condition
   */
  private matchesCondition(entity: T, condition: WhereCondition<T>): boolean {
    return Object.keys(condition).every(key => {
      const entityValue = (entity as any)[key];
      const conditionValue = (condition as any)[key];

      // Simple equality
      if (typeof conditionValue !== 'object' || conditionValue === null) {
        return entityValue === conditionValue;
      }

      // Complex operators
      if (conditionValue.$gt !== undefined && !(entityValue > conditionValue.$gt)) {
        return false;
      }
      if (conditionValue.$gte !== undefined && !(entityValue >= conditionValue.$gte)) {
        return false;
      }
      if (conditionValue.$lt !== undefined && !(entityValue < conditionValue.$lt)) {
        return false;
      }
      if (conditionValue.$lte !== undefined && !(entityValue <= conditionValue.$lte)) {
        return false;
      }
      if (conditionValue.$ne !== undefined && entityValue === conditionValue.$ne) {
        return false;
      }
      if (conditionValue.$in !== undefined && !conditionValue.$in.includes(entityValue)) {
        return false;
      }
      if (conditionValue.$contains !== undefined) {
        if (typeof entityValue !== 'string') return false;
        return entityValue.includes(conditionValue.$contains);
      }

      return true;
    });
  }
}
