import 'reflect-metadata';
import { Entity, PrimaryColumn, Column } from '../core/decorators';

/**
 * Example User Entity
 */
@Entity({ name: 'User', sheetName: 'Users' })
export class User {
  @PrimaryColumn({ type: 'number', autoIncrement: true })
  id!: number;

  @Column({ type: 'string' })
  name!: string;

  @Column({ type: 'string', unique: true })
  email!: string;

  @Column({ type: 'number', nullable: true })
  age?: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'date' })
  createdAt!: Date;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;
}

/**
 * Example Product Entity
 */
@Entity({ name: 'Product', sheetName: 'Products' })
export class Product {
  @PrimaryColumn({ type: 'number' })
  id!: number;

  @Column({ type: 'string' })
  name!: string;

  @Column({ type: 'string', nullable: true })
  description?: string;

  @Column({ type: 'number' })
  price!: number;

  @Column({ type: 'number', default: 0 })
  stock!: number;

  @Column({ type: 'string' })
  category!: string;

  @Column({ type: 'boolean', default: true })
  available!: boolean;

  @Column({ type: 'date' })
  createdAt!: Date;

  @Column({ type: 'date', nullable: true })
  updatedAt?: Date;
}

/**
 * Example Order Entity
 */
@Entity({ name: 'Order', sheetName: 'Orders' })
export class Order {
  @PrimaryColumn({ type: 'string' })
  id!: string;

  @Column({ type: 'number' })
  userId!: number;

  @Column({ type: 'json' })
  items!: Array<{ productId: number; quantity: number; price: number }>;

  @Column({ type: 'number' })
  totalAmount!: number;

  @Column({ type: 'string' })
  status!: 'pending' | 'processing' | 'completed' | 'cancelled';

  @Column({ type: 'date' })
  orderDate!: Date;

  @Column({ type: 'string', nullable: true })
  shippingAddress?: string;

  @Column({ type: 'date', nullable: true })
  deliveredAt?: Date;
}
