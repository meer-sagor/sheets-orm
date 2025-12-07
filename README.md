# Google Sheets ORM 📊

TypeORM-এর মতো একটি সম্পূর্ণ ফিচার্ড ORM যা Google Sheets-কে ডাটাবেস হিসেবে ব্যবহার করে। এতে রয়েছে **Relations**, **Migrations**, **Transactions**, ক্যাশিং, অ্যাডভান্সড কোয়েরি বিল্ডার এবং টাইপ সেফটি।

## ✨ ফিচারসমূহ

### Core Features
- 🎯 **TypeORM-স্টাইল ডেকোরেটর** - `@Entity`, `@Column`, `@PrimaryColumn`
- 🔍 **অ্যাডভান্সড কোয়েরি বিল্ডার** - `where`, `orderBy`, `limit`, `skip`
- 💾 **স্মার্ট ক্যাশিং** - `node-cache` দিয়ে পারফরম্যান্স অপটিমাইজেশন
- 🛡️ **টাইপ সেফটি** - সম্পূর্ণ TypeScript সাপোর্ট
- ⚡ **সহজ API** - `save`, `find`, `update`, `delete`
- 🔄 **অটো-সিঙ্ক** - স্বয়ংক্রিয় স্কিমা সিঙ্ক্রোনাইজেশন
- 🎨 **কমপ্লেক্স ডেটা টাইপ** - JSON, Date, Boolean সাপোর্ট

### ⭐ Advanced Features (NEW!)
- 🔗 **Relations Support** - OneToMany, ManyToOne, OneToOne
- 📊 **Deep Loading** - Nested relations (যেকোনো depth)
- 🔄 **Migration System** - Schema versioning and tracking
- 💾 **Transactions** - Atomic operations with rollback
- 🎯 **Cascade Operations** - Auto-delete related entities

## 📦 ইন্সটলেশন

```bash
# প্রজেক্ট ক্লোন করুন
git clone <repository-url>
cd sheets-orm

# ডিপেন্ডেন্সি ইন্সটল করুন
npm install

# Environment ফাইল সেটআপ করুন
cp .env.example .env
# এবার .env ফাইলে আপনার Google Sheets API credentials যোগ করুন
```

## 🔑 Google Sheets API সেটআপ

### ধাপ ১: Google Cloud Console-এ প্রজেক্ট তৈরি করুন

1. [Google Cloud Console](https://console.cloud.google.com/) এ যান
2. নতুন প্রজেক্ট তৈরি করুন
3. Google Sheets API এনাবল করুন

### ধাপ ২: Service Account তৈরি করুন

1. "Credentials" > "Create Credentials" > "Service Account"
2. Service Account তৈরি করার পর "Keys" ট্যাবে যান
3. "Add Key" > "Create New Key" > "JSON" সিলেক্ট করুন
4. JSON ফাইল ডাউনলোড হবে - এটি সংরক্ষণ করুন

### ধাপ ৩: Google Sheets শেয়ার করুন

1. আপনার Google Sheets খুলুন
2. "Share" বাটনে ক্লিক করুন
3. Service Account এর ইমেইল (যেমন: `xxx@xxx.iam.gserviceaccount.com`) যোগ করুন
4. "Editor" পারমিশন দিন

### ধাপ ৪: .env ফাইল কনফিগার করুন

```env
GOOGLE_CLIENT_EMAIL=your-service-account@project-id.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
SPREADSHEET_ID=your-spreadsheet-id
```

## 🚀 দ্রুত শুরু

### Entity ডিফাইন করুন

```typescript
import 'reflect-metadata';
import { Entity, PrimaryColumn, Column } from './core/decorators';
import { OneToMany, ManyToOne } from './core/relations';

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

  // Relations
  @OneToMany(() => Post)
  posts!: Post[];
}

@Entity({ name: 'Post', sheetName: 'Posts' })
export class Post {
  @PrimaryColumn({ type: 'number' })
  id!: number;

  @Column({ type: 'string' })
  title!: string;

  @Column({ type: 'number' })
  userId!: number;

  @ManyToOne(() => User)
  user!: User;
}
```

### ORM ইনিশিয়ালাইজ করুন

```typescript
import { SheetsORM } from './core/SheetsORM';
import { getEntitySchema } from './core/decorators';

const orm = new SheetsORM({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL!,
    private_key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  },
  spreadsheetId: process.env.SPREADSHEET_ID!,
  cacheConfig: {
    stdTTL: 300, // 5 মিনিট
    checkperiod: 60,
  },
  // Advanced features
  enableMigrations: true,
  enableTransactions: true,
});

// Entity রেজিস্টার করুন
const userSchema = getEntitySchema(User);
const postSchema = getEntitySchema(Post);

if (userSchema) orm.registerEntity(User, userSchema);
if (postSchema) orm.registerEntity(Post, postSchema);

// স্কিমা সিঙ্ক করুন (sheets তৈরি করবে)
await orm.syncSchema();
```

## 📖 ব্যবহারের উদাহরণ

### ১. বেসিক CRUD অপারেশন

```typescript
const userRepo = orm.getRepository(User);

// CREATE - নতুন ইউজার তৈরি করুন
const newUser = await userRepo.save({
  name: 'জন ডো',
  email: 'john@example.com',
  age: 30,
  isActive: true,
  createdAt: new Date(),
  metadata: {
    role: 'admin',
    preferences: { theme: 'dark' }
  }
});

// READ - ID দিয়ে খুঁজুন
const user = await userRepo.findById(1);

// READ - সব ইউজার খুঁজুন
const allUsers = await userRepo.findAll();

// READ - নির্দিষ্ট শর্তে খুঁজুন
const activeUsers = await userRepo.find({ isActive: true });

// UPDATE - ইউজার আপডেট করুন
await userRepo.save({
  id: 1,
  age: 31,
  metadata: { lastLogin: new Date() }
});

// DELETE - ইউজার ডিলিট করুন
await userRepo.delete(1);

// COUNT - কাউন্ট করুন
const totalUsers = await userRepo.count();
const activeCount = await userRepo.count({ isActive: true });
```

### ২. অ্যাডভান্সড কোয়েরি

```typescript
// QueryBuilder ব্যবহার করুন
const users = await userRepo
  .createQueryBuilder()
  .where({ age: { $gte: 25, $lte: 35 } })
  .andWhere({ isActive: true })
  .orderBy('age', 'DESC')
  .limit(10)
  .getMany();

// LIKE অপারেটর
const usersWithA = await userRepo
  .createQueryBuilder()
  .where({ name: { $contains: 'আ' } })
  .getMany();

// IN অপারেটর
const specificUsers = await userRepo
  .createQueryBuilder()
  .where({ age: { $in: [25, 30, 35] } })
  .getMany();

// পেজিনেশন
const page1 = await userRepo
  .createQueryBuilder()
  .orderBy('id', 'ASC')
  .limit(10)
  .skip(0)
  .getMany();

// নির্দিষ্ট ফিল্ড সিলেক্ট করুন
const namesOnly = await userRepo
  .createQueryBuilder()
  .select(['name', 'email'])
  .getMany();

// চেক করুন ডেটা আছে কিনা
const exists = await userRepo
  .createQueryBuilder()
  .where({ email: 'john@example.com' })
  .exists();
```

### ৩. Relations (NEW! ⭐)

```typescript
// OneToMany - User has many Posts
const userWithPosts = await userRepo.findByIdWithRelations(1, {
  include: ['posts'],
  depth: 1
});

console.log(userWithPosts.name);
console.log(`Posts: ${userWithPosts.posts.length}`);
userWithPosts.posts.forEach(post => {
  console.log(`  - ${post.title}`);
});

// ManyToOne - Post belongs to User
const postWithAuthor = await postRepo.findByIdWithRelations(1, {
  include: ['user']
});

console.log(postWithAuthor.title);
console.log(`Author: ${postWithAuthor.user.name}`);

// Deep Relations - User > Posts > Comments (2 levels)
const userDeep = await userRepo.findByIdWithRelations(1, {
  include: ['posts'],
  depth: 2 // Comments ও load হবে
});

userDeep.posts.forEach(post => {
  console.log(`Post: ${post.title}`);
  post.comments.forEach(comment => {
    console.log(`  Comment: ${comment.text}`);
  });
});

// Multiple Relations
const userFull = await userRepo.findByIdWithRelations(1, {
  include: ['posts', 'profile', 'orders']
});
```

### ৪. Transactions (NEW! ⭐)

```typescript
// Automatic commit/rollback
await orm.withTransaction(async (trx) => {
  const userRepo = trx.getRepository(User);
  const postRepo = trx.getRepository(Post);

  // Create user
  const user = await userRepo.save({
    name: 'আহমেদ',
    email: 'ahmed@example.com',
    age: 28,
    isActive: true,
    createdAt: new Date()
  });

  // Create post
  await postRepo.save({
    title: 'My First Post',
    userId: user.id,
    content: 'Content here...',
    createdAt: new Date()
  });

  // Auto commits if successful
  // Auto rollbacks on error
});

// Manual control
const transaction = orm.transaction();
try {
  const repo = transaction.getRepository(User);
  
  await repo.save({ name: 'User 1' });
  await repo.save({ name: 'User 2' });
  
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
}
```

### ৫. Migrations (NEW! ⭐)

```typescript
// Initialize migrations
await orm.initMigrations();

// Create a migration
const migrationManager = orm.getMigrationManager();
await migrationManager.createMigration('add_phone_column', [
  {
    entityName: 'User',
    sheetName: 'Users',
    operation: 'add_column',
    data: { columnName: 'phone' }
  }
]);

// Run pending migrations
await orm.runMigrations();

// Check migration status
const pending = migrationManager.getPendingMigrations();
const executed = migrationManager.getExecutedMigrations();

console.log(`Pending: ${pending.length}`);
console.log(`Executed: ${executed.length}`);
```

### ৬. কমপ্লেক্স ডেটা টাইপ

```typescript
@Entity()
export class Product {
  @PrimaryColumn({ type: 'number' })
  id!: number;

  @Column({ type: 'json' })
  specifications!: {
    weight: number;
    dimensions: { width: number; height: number };
    features: string[];
  };

  @Column({ type: 'date' })
  releaseDate!: Date;

  @Column({ type: 'boolean' })
  available!: boolean;
}

// JSON ডেটা সেভ করুন
await productRepo.save({
  id: 1,
  specifications: {
    weight: 1.5,
    dimensions: { width: 30, height: 20 },
    features: ['ওয়াটারপ্রুফ', 'ওয়্যারলেস']
  },
  releaseDate: new Date('2024-01-01'),
  available: true
});
```

### ৪. ক্যাশ ম্যানেজমেন্ট

```typescript
// প্রথম কোয়েরি - API কল হবে
const users1 = await userRepo.findAll(); // ~500ms

// দ্বিতীয় কোয়েরি - ক্যাশ থেকে আসবে
const users2 = await userRepo.findAll(); // ~5ms

// ক্যাশ ক্লিয়ার করুন
orm.clearCache();

// নতুন ডেটা পাবেন
const users3 = await userRepo.findAll(); // ~500ms
```

## 🎯 কোয়েরি অপারেটর

| অপারেটর | বর্ণনা | উদাহরণ |
|---------|--------|---------|
| `$gt` | বড় | `{ age: { $gt: 25 } }` |
| `$gte` | বড় বা সমান | `{ age: { $gte: 25 } }` |
| `$lt` | ছোট | `{ price: { $lt: 1000 } }` |
| `$lte` | ছোট বা সমান | `{ price: { $lte: 1000 } }` |
| `$ne` | সমান নয় | `{ status: { $ne: 'deleted' } }` |
| `$in` | তালিকায় আছে | `{ category: { $in: ['A', 'B'] } }` |
| `$contains` | টেক্সট আছে | `{ name: { $contains: 'জন' } }` |

## 📁 প্রজেক্ট স্ট্রাকচার

```
sheets-orm/
├── src/
│   ├── core/
│   │   ├── SheetsORM.ts      # মূল ORM ক্লাস
│   │   ├── decorators.ts     # Entity ডেকোরেটর
│   │   └── QueryBuilder.ts   # কোয়েরি বিল্ডার
│   ├── entities/
│   │   └── examples.ts       # উদাহরণ entities
│   ├── examples/
│   │   └── usage.ts          # ব্যবহারের উদাহরণ
│   └── index.ts              # মূল এক্সপোর্ট ফাইল
├── package.json
├── tsconfig.json
└── .env.example
```

## 🏃 প্রজেক্ট রান করুন

```bash
# TypeScript বিল্ড করুন
npm run build

# Development mode
npm run dev

# Production mode
npm start

# উদাহরণ রান করুন
npm run dev
```

## 🔧 কনফিগারেশন অপশন

### SheetsORM কনফিগ

```typescript
{
  credentials: {
    client_email: string;    // Service account email
    private_key: string;     // Private key
  },
  spreadsheetId: string;     // Google Sheets ID
  cacheConfig: {
    stdTTL: number;          // Cache TTL (সেকেন্ড)
    checkperiod: number;     // ক্যাশ চেক পিরিয়ড
    useClones: boolean;      // ডেটা ক্লোন করবে কিনা
  }
}
```

### Column Options

```typescript
{
  name?: string;           // Column নাম (default: property name)
  type?: string;           // ডেটা টাইপ
  nullable?: boolean;      // null হতে পারবে কিনা
  unique?: boolean;        // ইউনিক কিনা
  default?: any;           // ডিফল্ট মান
  primary?: boolean;       // Primary key কিনা
}
```

## 🎨 সাপোর্টেড ডেটা টাইপ

- `string` - টেক্সট ডেটা
- `number` - সংখ্যা
- `boolean` - true/false
- `date` - তারিখ ও সময়
- `json` - কমপ্লেক্স অবজেক্ট

## ⚡ পারফরম্যান্স টিপস

1. **ক্যাশিং ব্যবহার করুন** - ডিফল্ট 5 মিনিট TTL
2. **Batch অপারেশন** - একসাথে অনেক ডেটা সেভ করুন
3. **সিলেক্টিভ ফিল্ড** - শুধু প্রয়োজনীয় ফিল্ড নিন
4. **পেজিনেশন** - বড় ডেটাসেটের জন্য limit/skip ব্যবহার করুন

## 🤝 কন্ট্রিবিউশন

এই প্রজেক্টে কন্ট্রিবিউট করতে চাইলে:

1. Fork করুন
2. Feature branch তৈরি করুন (`git checkout -b feature/amazing-feature`)
3. Commit করুন (`git commit -m 'Add amazing feature'`)
4. Push করুন (`git push origin feature/amazing-feature`)
5. Pull Request খুলুন

## 📝 লাইসেন্স

MIT License

## 🙏 কৃতজ্ঞতা

- TypeORM থেকে অনুপ্রাণিত
- Google Sheets API
- Node-cache

## 📞 সাপোর্ট

সমস্যা বা প্রশ্ন থাকলে GitHub Issues ব্যবহার করুন।

---

**তৈরি করেছেন ❤️ দিয়ে TypeScript এবং Google Sheets দিয়ে**
