import 'reflect-metadata';
import { SheetsORM } from '../core/SheetsORM';
import { getEntitySchema } from '../core/decorators';
import { User, Product, Order } from '../entities/examples';

/**
 * Initialize the ORM
 */
async function initializeORM() {
  const orm = new SheetsORM({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL!,
      private_key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    },
    spreadsheetId: process.env.SPREADSHEET_ID!,
    cacheConfig: {
      stdTTL: 300, // 5 minutes
      checkperiod: 60,
      useClones: true,
    },
  });

  // Register entities
  const userSchema = getEntitySchema(User);
  const productSchema = getEntitySchema(Product);
  const orderSchema = getEntitySchema(Order);

  if (userSchema) orm.registerEntity(User, userSchema);
  if (productSchema) orm.registerEntity(Product, productSchema);
  if (orderSchema) orm.registerEntity(Order, orderSchema);

  // Sync schema (create sheets if they don't exist)
  await orm.syncSchema();

  return orm;
}

/**
 * Example 1: Basic CRUD Operations
 */
async function basicCRUDExample(orm: SheetsORM) {
  console.log('=== Basic CRUD Operations ===\n');

  const userRepo = orm.getRepository(User);

  // CREATE
  console.log('Creating new user...');
  const newUser = await userRepo.save({
    name: 'জন ডো',
    email: 'john@example.com',
    age: 30,
    isActive: true,
    createdAt: new Date(),
    metadata: {
      role: 'admin',
      preferences: { theme: 'dark', language: 'bn' },
    },
  });
  console.log('Created:', newUser);

  // READ
  console.log('\nFinding user by ID...');
  const foundUser = await userRepo.findById(newUser.id);
  console.log('Found:', foundUser);

  // UPDATE
  console.log('\nUpdating user...');
  const updatedUser = await userRepo.save({
    id: newUser.id,
    age: 31,
    metadata: {
      ...newUser.metadata,
      lastLogin: new Date().toISOString(),
    },
  });
  console.log('Updated:', updatedUser);

  // DELETE
  console.log('\nDeleting user...');
  const deleted = await userRepo.delete(newUser.id!);
  console.log('Deleted:', deleted);
}

/**
 * Example 2: Advanced Queries
 */
async function advancedQueriesExample(orm: SheetsORM) {
  console.log('\n=== Advanced Queries ===\n');

  const userRepo = orm.getRepository(User);

  // Insert some test data
  await userRepo.save({
    name: 'আলী',
    email: 'ali@example.com',
    age: 25,
    isActive: true,
    createdAt: new Date(),
  });

  await userRepo.save({
    name: 'ফাতিমা',
    email: 'fatima@example.com',
    age: 28,
    isActive: true,
    createdAt: new Date(),
  });

  await userRepo.save({
    name: 'করিম',
    email: 'karim@example.com',
    age: 35,
    isActive: false,
    createdAt: new Date(),
  });

  // Find all active users
  console.log('Finding active users...');
  const activeUsers = await userRepo.find({ isActive: true });
  console.log('Active users:', activeUsers.length);

  // Complex query with QueryBuilder
  console.log('\nFinding users between age 25-30, ordered by age...');
  const filteredUsers = await userRepo
    .createQueryBuilder()
    .where({ age: { $gte: 25, $lte: 30 } })
    .andWhere({ isActive: true })
    .orderBy('age', 'DESC')
    .getMany();
  
  console.log('Filtered users:', filteredUsers);

  // Find with LIKE operator
  console.log('\nFinding users with "আ" in name...');
  const usersWithA = await userRepo
    .createQueryBuilder()
    .where({ name: { $contains: 'আ' } })
    .getMany();
  
  console.log('Users with "আ":', usersWithA);

  // Pagination
  console.log('\nGetting page 1 (2 per page)...');
  const page1 = await userRepo
    .createQueryBuilder()
    .orderBy('id', 'ASC')
    .limit(2)
    .skip(0)
    .getMany();
  
  console.log('Page 1:', page1);
}

/**
 * Example 3: Product Management
 */
async function productManagementExample(orm: SheetsORM) {
  console.log('\n=== Product Management ===\n');

  const productRepo = orm.getRepository(Product);

  // Create products
  const products = [
    {
      id: 1,
      name: 'ল্যাপটপ',
      description: 'উচ্চ পারফরম্যান্স ল্যাপটপ',
      price: 85000,
      stock: 10,
      category: 'Electronics',
      available: true,
      createdAt: new Date(),
    },
    {
      id: 2,
      name: 'স্মার্টফোন',
      description: 'নতুন মডেল স্মার্টফোন',
      price: 45000,
      stock: 25,
      category: 'Electronics',
      available: true,
      createdAt: new Date(),
    },
    {
      id: 3,
      name: 'বই',
      description: 'প্রোগ্রামিং বই',
      price: 500,
      stock: 100,
      category: 'Books',
      available: true,
      createdAt: new Date(),
    },
  ];

  console.log('Creating products...');
  for (const product of products) {
    await productRepo.save(product);
  }
  console.log('Products created!');

  // Find products by category
  console.log('\nFinding Electronics products...');
  const electronics = await productRepo.find({ category: 'Electronics' });
  console.log('Electronics:', electronics);

  // Find expensive products
  console.log('\nFinding products over 40,000 BDT...');
  const expensiveProducts = await productRepo
    .createQueryBuilder()
    .where({ price: { $gt: 40000 } })
    .orderBy('price', 'DESC')
    .getMany();
  
  console.log('Expensive products:', expensiveProducts);

  // Update stock
  console.log('\nUpdating laptop stock...');
  const laptop = await productRepo.findById(1);
  if (laptop) {
    await productRepo.save({
      id: laptop.id,
      stock: laptop.stock - 1,
      updatedAt: new Date(),
    });
    console.log('Stock updated!');
  }

  // Get product count
  const totalProducts = await productRepo.count();
  const availableProducts = await productRepo.count({ available: true });
  console.log(`\nTotal products: ${totalProducts}`);
  console.log(`Available products: ${availableProducts}`);
}

/**
 * Example 4: Order Processing
 */
async function orderProcessingExample(orm: SheetsORM) {
  console.log('\n=== Order Processing ===\n');

  const orderRepo = orm.getRepository(Order);

  // Create an order
  const order = await orderRepo.save({
    id: `ORD-${Date.now()}`,
    userId: 1,
    items: [
      { productId: 1, quantity: 1, price: 85000 },
      { productId: 3, quantity: 2, price: 500 },
    ],
    totalAmount: 86000,
    status: 'pending',
    orderDate: new Date(),
    shippingAddress: 'ঢাকা, বাংলাদেশ',
  });

  console.log('Order created:', order);

  // Update order status
  console.log('\nUpdating order status to processing...');
  await orderRepo.save({
    id: order.id,
    status: 'processing',
  });

  // Find pending orders
  console.log('\nFinding pending orders...');
  const pendingOrders = await orderRepo.find({ status: 'pending' });
  console.log('Pending orders:', pendingOrders.length);

  // Find orders by user
  console.log('\nFinding orders for user 1...');
  const userOrders = await orderRepo.find({ userId: 1 });
  console.log('User orders:', userOrders);

  // Find orders with high value
  console.log('\nFinding orders over 50,000 BDT...');
  const highValueOrders = await orderRepo
    .createQueryBuilder()
    .where({ totalAmount: { $gt: 50000 } })
    .orderBy('totalAmount', 'DESC')
    .getMany();
  
  console.log('High value orders:', highValueOrders);
}

/**
 * Example 5: Cache Management
 */
async function cacheManagementExample(orm: SheetsORM) {
  console.log('\n=== Cache Management ===\n');

  const userRepo = orm.getRepository(User);

  console.log('First query (will hit Google Sheets API)...');
  console.time('First query');
  await userRepo.findAll();
  console.timeEnd('First query');

  console.log('\nSecond query (will use cache)...');
  console.time('Second query (cached)');
  await userRepo.findAll();
  console.timeEnd('Second query (cached)');

  console.log('\nClearing cache...');
  orm.clearCache();

  console.log('\nThird query (cache cleared, will hit API again)...');
  console.time('Third query');
  await userRepo.findAll();
  console.timeEnd('Third query');
}

/**
 * Main function - Run all examples
 */
async function main() {
  try {
    console.log('🚀 Google Sheets ORM Examples\n');
    console.log('Initializing ORM...\n');
    
    const orm = await initializeORM();
    
    // Run examples
    await basicCRUDExample(orm);
    await advancedQueriesExample(orm);
    await productManagementExample(orm);
    await orderProcessingExample(orm);
    await cacheManagementExample(orm);

    console.log('\n✅ All examples completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

// Export for use in other files
export {
  initializeORM,
  basicCRUDExample,
  advancedQueriesExample,
  productManagementExample,
  orderProcessingExample,
  cacheManagementExample,
};

// Run if this file is executed directly
if (require.main === module) {
  main();
}
