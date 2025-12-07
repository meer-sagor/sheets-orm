# Advanced Features Guide 🚀

এই গাইডে Google Sheets ORM-এর advanced features নিয়ে বিস্তারিত আলোচনা করা হয়েছে।

## 📚 বিষয়বস্তু

1. [Relations](#relations) - Entity relationships
2. [Migrations](#migrations) - Schema versioning
3. [Transactions](#transactions) - Atomic operations

---

## 1. Relations

### OneToMany Relation

একটি entity-র সাথে অনেকগুলো related entities।

```typescript
import { Entity, PrimaryColumn, Column } from './core/decorators';
import { OneToMany } from './core/relations';

@Entity()
class User {
  @PrimaryColumn({ type: 'number' })
  id!: number;

  @Column({ type: 'string' })
  name!: string;

  @OneToMany(() => Post, { eager: false })
  posts!: Post[];
}

@Entity()
class Post {
  @PrimaryColumn({ type: 'number' })
  id!: number;

  @Column({ type: 'string' })
  title!: string;

  @Column({ type: 'number' })
  userId!: number; // Foreign key
}
```

**ব্যবহার:**

```typescript
// Load user with posts
const user = await userRepo.findByIdWithRelations(1, {
  include: ['posts'],
  depth: 1
});

console.log(user.name);
console.log(user.posts.length); // User-এর সব posts
```

### ManyToOne Relation

অনেকগুলো entity একটি entity-র সাথে সম্পর্কিত।

```typescript
@Entity()
class Post {
  @PrimaryColumn({ type: 'number' })
  id!: number;

  @Column({ type: 'string' })
  title!: string;

  @Column({ type: 'number' })
  userId!: number;

  @ManyToOne(() => User)
  user!: User; // Post এর author
}
```

**ব্যবহার:**

```typescript
// Load post with author
const post = await postRepo.findByIdWithRelations(1, {
  include: ['user']
});

console.log(post.title);
console.log(post.user.name); // Post এর author
```

### OneToOne Relation

একটি entity শুধুমাত্র একটি related entity-র সাথে সম্পর্কিত।

```typescript
@Entity()
class User {
  @PrimaryColumn({ type: 'number' })
  id!: number;

  @Column({ type: 'string' })
  name!: string;

  @OneToOne(() => UserProfile)
  profile!: UserProfile;
}

@Entity()
class UserProfile {
  @PrimaryColumn({ type: 'number' })
  id!: number;

  @Column({ type: 'number' })
  userId!: number; // Foreign key

  @Column({ type: 'string' })
  bio!: string;

  @OneToOne(() => User)
  user!: User;
}
```

**ব্যবহার:**

```typescript
// Load user with profile
const user = await userRepo.findByIdWithRelations(1, {
  include: ['profile']
});

console.log(user.name);
console.log(user.profile.bio);
```

### Deep Relations (Nested Loading)

```typescript
// Load User > Posts > Comments (2 levels deep)
const user = await userRepo.findByIdWithRelations(1, {
  include: ['posts'],
  depth: 2 // Comments ও load হবে
});

user.posts.forEach(post => {
  console.log(post.title);
  post.comments.forEach(comment => {
    console.log(`  - ${comment.text}`);
  });
});
```

### Relation Options

```typescript
@OneToMany(() => Post, {
  eager: false,      // Auto-load করবে কিনা
  cascade: true,     // Delete cascade
  foreignKey: 'userId' // Custom foreign key
})
posts!: Post[];
```

---

## 2. Migrations

Schema changes track এবং version করার জন্য।

### Setup

```typescript
const orm = new SheetsORM({
  credentials: {...},
  spreadsheetId: '...',
  enableMigrations: true // Enable migrations
});

// Initialize migrations
await orm.initMigrations();
```

### Migration তৈরি করা

#### ১. Manually Create Migration

```typescript
const migrationManager = orm.getMigrationManager();

const migration = await migrationManager.createMigration('add_phone_column', [
  {
    entityName: 'User',
    sheetName: 'Users',
    operation: 'add_column',
    data: { columnName: 'phone' }
  }
]);
```

#### ২. Auto-Generate from Schema

```typescript
// Schema change করার পর
await orm.generateMigration('update_user_schema');
```

### Migration Operations

```typescript
// Add column
{
  operation: 'add_column',
  data: { columnName: 'email' }
}

// Remove column
{
  operation: 'remove_column',
  data: { columnIndex: 3 }
}

// Rename column
{
  operation: 'rename_column',
  data: { oldName: 'name', newName: 'fullName' }
}

// Add sheet
{
  operation: 'add_sheet',
  data: { headers: ['id', 'name', 'email'] }
}

// Remove sheet
{
  operation: 'remove_sheet',
  data: {}
}
```

### Migration চালানো

```typescript
// Check pending migrations
const pending = migrationManager.getPendingMigrations();
console.log(`Pending: ${pending.length}`);

// Run all pending
await migrationManager.runPendingMigrations();

// Run specific migration
await migrationManager.executeMigration(migrationId);
```

### Migration History

```typescript
// Get executed migrations
const executed = migrationManager.getExecutedMigrations();

executed.forEach(m => {
  console.log(`${m.name} - ${m.timestamp}`);
});
```

### Migration Best Practices

```typescript
// ✅ DO: Descriptive names
await orm.generateMigration('add_user_phone_and_address');

// ✅ DO: Run migrations before schema sync
await orm.runMigrations();
await orm.syncSchema();

// ❌ DON'T: Run migrations in production without testing
// ❌ DON'T: Manually edit migration data
```

---

## 3. Transactions

Multiple operations একসাথে atomic ভাবে execute করা।

### Setup

```typescript
const orm = new SheetsORM({
  credentials: {...},
  spreadsheetId: '...',
  enableTransactions: true // Enable transactions
});
```

### Method 1: withTransaction (Recommended)

```typescript
try {
  await orm.withTransaction(async (trx) => {
    const userRepo = trx.getRepository(User);
    const postRepo = trx.getRepository(Post);

    // Create user
    const user = await userRepo.save({
      name: 'জন',
      email: 'john@example.com'
    });

    // Create post
    await postRepo.save({
      title: 'My First Post',
      userId: user.id,
      content: '...'
    });

    // If any error occurs, everything rolls back
  });

  console.log('✓ Transaction committed');
} catch (error) {
  console.log('✗ Transaction rolled back');
}
```

### Method 2: Manual Control

```typescript
const transaction = orm.transaction();

try {
  const userRepo = transaction.getRepository(User);

  await userRepo.save({
    name: 'জন',
    email: 'john@example.com'
  });

  await userRepo.save({
    name: 'জেন',
    email: 'jane@example.com'
  });

  // Manually commit
  await transaction.commit();
  
} catch (error) {
  // Manually rollback
  await transaction.rollback();
}
```

### Transaction Options

```typescript
await orm.withTransaction(async (trx) => {
  // Your operations
}, {
  timeout: 30000, // 30 seconds
  isolationLevel: 'read_committed'
});
```

### Transaction State

```typescript
const trx = orm.transaction();

console.log(trx.getState()); // 'pending'
console.log(trx.getOperationsCount()); // 0

await userRepo.save({...});

console.log(trx.getOperationsCount()); // 1

await trx.commit();
console.log(trx.getState()); // 'committed'
```

### Transaction Best Practices

```typescript
// ✅ DO: Keep transactions short
await orm.withTransaction(async (trx) => {
  // Quick operations only
});

// ✅ DO: Handle errors properly
try {
  await orm.withTransaction(async (trx) => {
    // Operations
  });
} catch (error) {
  console.error('Transaction failed:', error);
}

// ❌ DON'T: Long-running operations
await orm.withTransaction(async (trx) => {
  // Don't do this
  await fetchDataFromExternalAPI(); // Slow!
  await processHugeDataset(); // Slow!
});

// ❌ DON'T: Nested transactions (not supported)
```

### Rollback Example

```typescript
await orm.withTransaction(async (trx) => {
  const userRepo = trx.getRepository(User);
  const postRepo = trx.getRepository(Post);

  const user = await userRepo.save({
    name: 'Test User'
  });

  await postRepo.save({
    title: 'Test Post',
    userId: user.id
  });

  // This will rollback everything
  throw new Error('Rollback test');
});

// User এবং Post উভয়ই save হবে না
```

---

## 🎯 Complete Example

সব features একসাথে:

```typescript
import { SheetsORM } from './core/SheetsORM';
import { Entity, Column, PrimaryColumn } from './core/decorators';
import { OneToMany, ManyToOne } from './core/relations';

// Define entities with relations
@Entity()
class User {
  @PrimaryColumn({ type: 'number' })
  id!: number;

  @Column({ type: 'string' })
  name!: string;

  @OneToMany(() => Order)
  orders!: Order[];
}

@Entity()
class Order {
  @PrimaryColumn({ type: 'number' })
  id!: number;

  @Column({ type: 'number' })
  userId!: number;

  @Column({ type: 'number' })
  amount!: number;

  @ManyToOne(() => User)
  user!: User;
}

// Initialize with all features
const orm = new SheetsORM({
  credentials: {...},
  spreadsheetId: '...',
  enableMigrations: true,
  enableTransactions: true,
});

// Register entities
orm.registerEntity(User, getEntitySchema(User));
orm.registerEntity(Order, getEntitySchema(Order));

// Initialize & sync
await orm.initMigrations();
await orm.runMigrations();
await orm.syncSchema();

// Use with transaction and relations
await orm.withTransaction(async (trx) => {
  const userRepo = trx.getRepository(User);
  const orderRepo = trx.getRepository(Order);

  // Create user
  const user = await userRepo.save({
    id: 1,
    name: 'আহমেদ'
  });

  // Create orders
  await orderRepo.save({
    id: 1,
    userId: user.id,
    amount: 1000
  });

  await orderRepo.save({
    id: 2,
    userId: user.id,
    amount: 2000
  });
});

// Load with relations
const userWithOrders = await userRepo.findByIdWithRelations(1, {
  include: ['orders']
});

console.log(userWithOrders.name);
console.log(`Orders: ${userWithOrders.orders.length}`);
console.log(`Total: ${userWithOrders.orders.reduce((sum, o) => sum + o.amount, 0)}`);
```

---

## 📝 Tips & Tricks

### Performance

```typescript
// ✅ Load only needed relations
const user = await userRepo.findByIdWithRelations(1, {
  include: ['profile'], // শুধু profile, posts নয়
  depth: 1
});

// ✅ Use transactions for bulk operations
await orm.withTransaction(async (trx) => {
  const repo = trx.getRepository(User);
  for (const user of users) {
    await repo.save(user);
  }
});
```

### Error Handling

```typescript
// Migrations
try {
  await orm.runMigrations();
} catch (error) {
  console.error('Migration failed:', error);
  // Handle migration failure
}

// Transactions
try {
  await orm.withTransaction(async (trx) => {
    // Operations
  });
} catch (error) {
  console.error('Transaction failed:', error);
  // Already rolled back automatically
}
```

### Debugging

```typescript
// Check migration status
const pending = migrationManager.getPendingMigrations();
console.log('Pending migrations:', pending.map(m => m.name));

// Check transaction state
const trx = orm.transaction();
console.log(`State: ${trx.getState()}`);
console.log(`Operations: ${trx.getOperationsCount()}`);
```

---

এই advanced features ব্যবহার করে আপনি একটি পূর্ণাঙ্গ production-ready application তৈরি করতে পারবেন!
