import 'reflect-metadata';
import { Entity, PrimaryColumn, Column } from '../core/decorators';
import { OneToMany, ManyToOne, OneToOne } from '../core/relations';

/**
 * User Entity with Relations
 */
@Entity({ name: 'User', sheetName: 'Users' })
export class UserWithRelations {
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

  // Relations
  @OneToMany(() => Post, { eager: false })
  posts!: Post[];

  @OneToOne(() => UserProfile, { eager: false })
  profile!: UserProfile;
}

/**
 * Post Entity
 */
@Entity({ name: 'Post', sheetName: 'Posts' })
export class Post {
  @PrimaryColumn({ type: 'number' })
  id!: number;

  @Column({ type: 'string' })
  title!: string;

  @Column({ type: 'string' })
  content!: string;

  @Column({ type: 'number' })
  userId!: number; // Foreign key

  @Column({ type: 'boolean', default: false })
  published!: boolean;

  @Column({ type: 'date' })
  createdAt!: Date;

  // Relation
  @ManyToOne(() => UserWithRelations)
  user!: UserWithRelations;

  @OneToMany(() => Comment, { eager: false })
  comments!: Comment[];
}

/**
 * Comment Entity
 */
@Entity({ name: 'Comment', sheetName: 'Comments' })
export class Comment {
  @PrimaryColumn({ type: 'number' })
  id!: number;

  @Column({ type: 'string' })
  text!: string;

  @Column({ type: 'number' })
  postId!: number; // Foreign key

  @Column({ type: 'number' })
  userId!: number; // Foreign key

  @Column({ type: 'date' })
  createdAt!: Date;

  // Relations
  @ManyToOne(() => Post)
  post!: Post;

  @ManyToOne(() => UserWithRelations)
  user!: UserWithRelations;
}

/**
 * UserProfile Entity (OneToOne example)
 */
@Entity({ name: 'UserProfile', sheetName: 'UserProfiles' })
export class UserProfile {
  @PrimaryColumn({ type: 'number' })
  id!: number;

  @Column({ type: 'number' })
  userId!: number; // Foreign key

  @Column({ type: 'string', nullable: true })
  bio?: string;

  @Column({ type: 'string', nullable: true })
  avatar?: string;

  @Column({ type: 'string', nullable: true })
  website?: string;

  @Column({ type: 'json', nullable: true })
  socialLinks?: {
    twitter?: string;
    github?: string;
    linkedin?: string;
  };

  // Relation
  @OneToOne(() => UserWithRelations)
  user!: UserWithRelations;
}

/**
 * Category Entity
 */
@Entity({ name: 'Category', sheetName: 'Categories' })
export class Category {
  @PrimaryColumn({ type: 'number' })
  id!: number;

  @Column({ type: 'string' })
  name!: string;

  @Column({ type: 'string', nullable: true })
  description?: string;

  @OneToMany(() => ProductWithCategory, { eager: false })
  products!: ProductWithCategory[];
}

/**
 * Product with Category Relation
 */
@Entity({ name: 'ProductWithCategory', sheetName: 'Products' })
export class ProductWithCategory {
  @PrimaryColumn({ type: 'number' })
  id!: number;

  @Column({ type: 'string' })
  name!: string;

  @Column({ type: 'number' })
  price!: number;

  @Column({ type: 'number' })
  categoryId!: number; // Foreign key

  @Column({ type: 'boolean', default: true })
  available!: boolean;

  // Relation
  @ManyToOne(() => Category)
  category!: Category;
}
