import 'reflect-metadata';
import { SheetsORM } from '../core/SheetsORM';
import { getEntitySchema } from '../core/decorators';
import { UserWithRelations, Post, Comment, UserProfile, Category, ProductWithCategory } from '../entities/relations-examples';
import { User } from '../entities/examples';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Initialize ORM with advanced features
 */
async function initializeAdvancedORM() {
  const orm = new SheetsORM({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL!,
      private_key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    },
    spreadsheetId: process.env.SPREADSHEET_ID!,
    cacheConfig: {
      stdTTL: 300,
    },
    enableMigrations: true,
    enableTransactions: true,
  });

  // Register entities with relations
  const userSchema = getEntitySchema(UserWithRelations);
  const postSchema = getEntitySchema(Post);
  const commentSchema = getEntitySchema(Comment);
  const profileSchema = getEntitySchema(UserProfile);
  const categorySchema = getEntitySchema(Category);
  const productSchema = getEntitySchema(ProductWithCategory);

  if (userSchema) orm.registerEntity(UserWithRelations, userSchema);
  if (postSchema) orm.registerEntity(Post, postSchema);
  if (commentSchema) orm.registerEntity(Comment, commentSchema);
  if (profileSchema) orm.registerEntity(UserProfile, profileSchema);
  if (categorySchema) orm.registerEntity(Category, categorySchema);
  if (productSchema) orm.registerEntity(ProductWithCategory, productSchema);

  // Initialize migrations
  await orm.initMigrations();

  // Sync schema
  await orm.syncSchema();

  return orm;
}

/**
 * Example 1: Relations - OneToMany & ManyToOne
 */
async function relationsExample(orm: SheetsORM) {
  console.log('\n=== Relations Example ===\n');

  const userRepo = orm.getRepository(UserWithRelations);
  const postRepo = orm.getRepository(Post);
  const commentRepo = orm.getRepository(Comment);

  // Create a user
  const user = await userRepo.save({
    id: 1,
    name: 'আহমেদ',
    email: 'ahmed@example.com',
    age: 28,
    isActive: true,
    createdAt: new Date(),
  });
  console.log('✓ User created:', user.name);

  // Create posts for the user
  const post1 = await postRepo.save({
    id: 1,
    title: 'TypeScript এ ORM তৈরি করা',
    content: 'এই পোস্টে আমরা দেখবো কিভাবে TypeScript এ একটি ORM তৈরি করা যায়...',
    userId: user.id!,
    published: true,
    createdAt: new Date(),
  });

  const post2 = await postRepo.save({
    id: 2,
    title: 'Google Sheets API ব্যবহার',
    content: 'Google Sheets API দিয়ে অনেক কিছু করা সম্ভব...',
    userId: user.id!,
    published: true,
    createdAt: new Date(),
  });
  console.log('✓ Created 2 posts');

  // Create comments
  await commentRepo.save({
    id: 1,
    text: 'দুর্দান্ত পোস্ট!',
    postId: post1.id,
    userId: user.id!,
    createdAt: new Date(),
  });

  await commentRepo.save({
    id: 2,
    text: 'অনেক কিছু শিখলাম',
    postId: post1.id,
    userId: user.id!,
    createdAt: new Date(),
  });
  console.log('✓ Created 2 comments');

  // Load user with posts (OneToMany)
  console.log('\n--- Loading User with Posts ---');
  const userWithPosts = await userRepo.findByIdWithRelations(user.id!, {
    include: ['posts'],
    depth: 1,
  });

  console.log(`User: ${userWithPosts?.name}`);
  console.log(`Posts: ${(userWithPosts as any)?.posts?.length || 0}`);
  (userWithPosts as any)?.posts?.forEach((p: any) => {
    console.log(`  - ${p.title}`);
  });

  // Load post with comments (nested relations)
  console.log('\n--- Loading Post with Comments ---');
  const postWithComments = await postRepo.findByIdWithRelations(post1.id, {
    include: ['comments'],
    depth: 1,
  });

  console.log(`Post: ${postWithComments?.title}`);
  console.log(`Comments: ${(postWithComments as any)?.comments?.length || 0}`);
  (postWithComments as any)?.comments?.forEach((c: any) => {
    console.log(`  - ${c.text}`);
  });

  // Deep relation loading (depth: 2)
  console.log('\n--- Deep Relation Loading (User > Posts > Comments) ---');
  const userDeep = await userRepo.findByIdWithRelations(user.id!, {
    include: ['posts'],
    depth: 2,
  });

  (userDeep as any)?.posts?.forEach((p: any) => {
    console.log(`Post: ${p.title}`);
    if (p.comments) {
      p.comments.forEach((c: any) => {
        console.log(`  Comment: ${c.text}`);
      });
    }
  });
}

/**
 * Example 2: OneToOne Relations
 */
async function oneToOneExample(orm: SheetsORM) {
  console.log('\n=== OneToOne Relation Example ===\n');

  const userRepo = orm.getRepository(UserWithRelations);
  const profileRepo = orm.getRepository(UserProfile);

  // Create user
  const user = await userRepo.save({
    id: 2,
    name: 'ফাতিমা',
    email: 'fatima@example.com',
    age: 25,
    isActive: true,
    createdAt: new Date(),
  });

  // Create profile
  const profile = await profileRepo.save({
    id: 1,
    userId: user.id!,
    bio: 'Full-stack developer passionate about TypeScript',
    avatar: 'https://example.com/avatar.jpg',
    website: 'https://fatima.dev',
    socialLinks: {
      github: 'https://github.com/fatima',
      twitter: 'https://twitter.com/fatima',
      linkedin: 'https://linkedin.com/in/fatima',
    },
  });

  console.log('✓ User and Profile created');

  // Load user with profile
  const userWithProfile = await userRepo.findByIdWithRelations(user.id!, {
    include: ['profile'],
  });

  console.log(`\nUser: ${userWithProfile?.name}`);
  console.log(`Bio: ${(userWithProfile as any)?.profile?.bio}`);
  console.log(`Website: ${(userWithProfile as any)?.profile?.website}`);
  console.log(`Social Links:`, (userWithProfile as any)?.profile?.socialLinks);
}

/**
 * Example 3: Transactions
 */
async function transactionExample(orm: SheetsORM) {
  console.log('\n=== Transaction Example ===\n');

  // Example 1: Successful transaction
  console.log('--- Successful Transaction ---');
  try {
    await orm.withTransaction(async (trx) => {
      const userRepo = trx.getRepository(UserWithRelations);
      const postRepo = trx.getRepository(Post);

      // Create user
      const user = await userRepo.save({
        id: 10,
        name: 'করিম',
        email: 'karim@example.com',
        age: 30,
        isActive: true,
        createdAt: new Date(),
      });

      // Create post
      await postRepo.save({
        id: 10,
        title: 'Transaction টেস্ট',
        content: 'এই পোস্টটি transaction এর মধ্যে তৈরি হয়েছে',
        userId: user.id!,
        published: true,
        createdAt: new Date(),
      });

      console.log('✓ User and Post created in transaction');
    });

    console.log('✓ Transaction committed successfully');
  } catch (error) {
    console.error('✗ Transaction failed:', error);
  }

  // Example 2: Failed transaction with rollback
  console.log('\n--- Failed Transaction (Rollback) ---');
  try {
    await orm.withTransaction(async (trx) => {
      const userRepo = trx.getRepository(UserWithRelations);

      await userRepo.save({
        id: 20,
        name: 'রহিম',
        email: 'rahim@example.com',
        age: 35,
        isActive: true,
        createdAt: new Date(),
      });

      console.log('✓ User created');

      // Simulate an error
      throw new Error('Simulated error - will trigger rollback');
    });
  } catch (error: any) {
    console.log('✓ Transaction rolled back due to error');
    console.log(`  Error: ${error.message}`);
  }

  // Example 3: Manual transaction control
  console.log('\n--- Manual Transaction Control ---');
  const transaction = orm.transaction();

  try {
    const userRepo = transaction.getRepository(UserWithRelations);

    await userRepo.save({
      id: 30,
      name: 'সালমা',
      email: 'salma@example.com',
      age: 27,
      isActive: true,
      createdAt: new Date(),
    });

    console.log('✓ User added to transaction');
    console.log(`  Transaction state: ${transaction.getState()}`);
    console.log(`  Operations count: ${transaction.getOperationsCount()}`);

    // Manually commit
    await transaction.commit();
    console.log('✓ Transaction committed manually');
  } catch (error) {
    await transaction.rollback();
    console.error('✗ Transaction failed and rolled back');
  }
}

/**
 * Example 4: Migrations
 */
async function migrationExample(orm: SheetsORM) {
  console.log('\n=== Migration Example ===\n');

  const migrationManager = orm.getMigrationManager();

  // Example 1: Create a migration manually
  console.log('--- Creating Migration ---');
  const migration = await migrationManager.createMigration('add_phone_to_users', [
    {
      entityName: 'User',
      sheetName: 'Users',
      operation: 'add_column',
      data: { columnName: 'phone' },
    },
  ]);

  console.log(`✓ Migration created: ${migration.name}`);
  console.log(`  ID: ${migration.id}`);
  console.log(`  Status: ${migration.executed ? 'Executed' : 'Pending'}`);

  // Example 2: Check pending migrations
  console.log('\n--- Pending Migrations ---');
  const pending = migrationManager.getPendingMigrations();
  console.log(`Pending migrations: ${pending.length}`);
  pending.forEach(m => {
    console.log(`  - ${m.name} (${m.type})`);
  });

  // Example 3: Run pending migrations
  if (pending.length > 0) {
    console.log('\n--- Running Migrations ---');
    await migrationManager.runPendingMigrations();
  }

  // Example 4: Check executed migrations
  console.log('\n--- Executed Migrations ---');
  const executed = migrationManager.getExecutedMigrations();
  console.log(`Executed migrations: ${executed.length}`);
  executed.forEach(m => {
    console.log(`  - ${m.name} (${new Date(m.timestamp).toLocaleDateString()})`);
  });
}

/**
 * Example 5: Complex Scenario - E-commerce with Relations
 */
async function complexScenarioExample(orm: SheetsORM) {
  console.log('\n=== Complex E-commerce Scenario ===\n');

  const categoryRepo = orm.getRepository(Category);
  const productRepo = orm.getRepository(ProductWithCategory);

  // Create in a transaction
  await orm.withTransaction(async (trx) => {
    const categoryTrx = trx.getRepository(Category);
    const productTrx = trx.getRepository(ProductWithCategory);

    // Create categories
    const electronics = await categoryTrx.save({
      id: 1,
      name: 'ইলেকট্রনিক্স',
      description: 'ইলেকট্রনিক পণ্যসমূহ',
    });

    const books = await categoryTrx.save({
      id: 2,
      name: 'বই',
      description: 'বিভিন্ন ধরনের বই',
    });

    console.log('✓ Categories created');

    // Create products
    await productTrx.save({
      id: 1,
      name: 'ল্যাপটপ',
      price: 65000,
      categoryId: electronics.id!,
      available: true,
    });

    await productTrx.save({
      id: 2,
      name: 'স্মার্টফোন',
      price: 35000,
      categoryId: electronics.id!,
      available: true,
    });

    await productTrx.save({
      id: 3,
      name: 'TypeScript হ্যান্ডবুক',
      price: 800,
      categoryId: books.id!,
      available: true,
    });

    console.log('✓ Products created');
  });

  console.log('✓ Transaction completed');

  // Load category with products
  const electronicsWithProducts = await categoryRepo.findByIdWithRelations(1, {
    include: ['products'],
  });

  console.log(`\nCategory: ${electronicsWithProducts?.name}`);
  console.log(`Products: ${(electronicsWithProducts as any)?.products?.length || 0}`);
  (electronicsWithProducts as any)?.products?.forEach((p: any) => {
    console.log(`  - ${p.name}: ${p.price} টাকা`);
  });
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Advanced Google Sheets ORM Features\n');

  const orm = await initializeAdvancedORM();

  // Run examples
  await relationsExample(orm);
  await oneToOneExample(orm);
  await transactionExample(orm);
  await migrationExample(orm);
  await complexScenarioExample(orm);

  console.log('\n✅ All advanced examples completed!');
  console.log('\n📊 Check your Google Sheets to see the data!');
}

// Run
if (require.main === module) {
  main().catch(console.error);
}

export default main;
