# 🚀 দ্রুত শুরু করার গাইড

এই গাইড আপনাকে ৫ মিনিটে Google Sheets ORM দিয়ে শুরু করতে সাহায্য করবে।

## ধাপ ১: প্রজেক্ট সেটআপ (২ মিনিট)

```bash
# রিপোজিটরি ক্লোন করুন
git clone <your-repo-url>
cd sheets-orm

# ডিপেন্ডেন্সি ইন্সটল করুন
npm install

# Environment ফাইল তৈরি করুন
cp .env.example .env
```

## ধাপ ২: Google Sheets API সেটআপ (২ মিনিট)

### A. Google Cloud Console সেটআপ

1. যান: https://console.cloud.google.com/
2. নতুন প্রজেক্ট তৈরি করুন
3. "APIs & Services" > "Enable APIs and Services"
4. "Google Sheets API" সার্চ করে এনাবল করুন

### B. Service Account তৈরি করুন

1. "APIs & Services" > "Credentials"
2. "Create Credentials" > "Service Account"
3. নাম দিন (যেমন: "sheets-orm")
4. "Create and Continue" ক্লিক করুন
5. Role: "Editor" সিলেক্ট করুন
6. "Done" ক্লিক করুন

### C. Key তৈরি করুন

1. তৈরি করা Service Account এ ক্লিক করুন
2. "Keys" ট্যাবে যান
3. "Add Key" > "Create New Key"
4. "JSON" সিলেক্ট করুন
5. JSON ফাইল ডাউনলোড হবে

### D. Credentials কপি করুন

ডাউনলোড করা JSON ফাইল খুলুন এবং `.env` ফাইলে কপি করুন:

```env
GOOGLE_CLIENT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
SPREADSHEET_ID=your-spreadsheet-id
```

## ধাপ ৩: Google Sheets তৈরি ও শেয়ার করুন (১ মিনিট)

1. একটি নতুন Google Sheets তৈরি করুন
2. URL থেকে Spreadsheet ID কপি করুন:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
   ```
3. "Share" বাটনে ক্লিক করুন
4. Service Account এর email যোগ করুন (JSON ফাইল থেকে)
5. "Editor" access দিন

## ধাপ ৪: প্রথম কোড রান করুন

### A. সিম্পল Example তৈরি করুন

`src/quick-start.ts` ফাইল তৈরি করুন:

```typescript
import 'reflect-metadata';
import { SheetsORM } from './core/SheetsORM';
import { Entity, PrimaryColumn, Column, getEntitySchema } from './core/decorators';
import * as dotenv from 'dotenv';

// Environment variables লোড করুন
dotenv.config();

// User Entity ডিফাইন করুন
@Entity({ name: 'User', sheetName: 'Users' })
class User {
  @PrimaryColumn({ type: 'number' })
  id!: number;

  @Column({ type: 'string' })
  name!: string;

  @Column({ type: 'string' })
  email!: string;
}

async function main() {
  // ORM ইনিশিয়ালাইজ করুন
  const orm = new SheetsORM({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL!,
      private_key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    },
    spreadsheetId: process.env.SPREADSHEET_ID!,
  });

  // Entity রেজিস্টার করুন
  const schema = getEntitySchema(User);
  if (schema) {
    orm.registerEntity(User, schema);
  }

  // Schema সিঙ্ক করুন (sheet তৈরি হবে)
  await orm.syncSchema();
  console.log('✅ Schema synced!');

  // Repository নিন
  const userRepo = orm.getRepository(User);

  // নতুন user তৈরি করুন
  const user = await userRepo.save({
    id: 1,
    name: 'আপনার নাম',
    email: 'your@email.com',
  });
  console.log('✅ User created:', user);

  // User খুঁজুন
  const foundUser = await userRepo.findById(1);
  console.log('✅ User found:', foundUser);

  // সব users দেখুন
  const allUsers = await userRepo.findAll();
  console.log('✅ All users:', allUsers);
}

main().catch(console.error);
```

### B. রান করুন

```bash
npm run dev
```

### C. আউটপুট দেখুন

```
✅ Schema synced!
✅ User created: { id: 1, name: 'আপনার নাম', email: 'your@email.com' }
✅ User found: { id: 1, name: 'আপনার নাম', email: 'your@email.com' }
✅ All users: [ { id: 1, name: 'আপনার নাম', email: 'your@email.com' } ]
```

## ধাপ ৫: Google Sheets চেক করুন

আপনার Google Sheets খুলুন - আপনি দেখবেন:

1. "Users" নামে একটি নতুন sheet তৈরি হয়েছে
2. Headers: `id | name | email`
3. আপনার ডেটা প্রথম row তে আছে

## 🎉 সফল! এখন কি করবেন?

### আরও Entity যোগ করুন

```typescript
@Entity({ name: 'Product' })
class Product {
  @PrimaryColumn({ type: 'number' })
  id!: number;

  @Column({ type: 'string' })
  name!: string;

  @Column({ type: 'number' })
  price!: number;

  @Column({ type: 'boolean' })
  available!: boolean;
}
```

### অ্যাডভান্সড কোয়েরি ব্যবহার করুন

```typescript
// দামের উপর ভিত্তি করে খুঁজুন
const expensiveProducts = await productRepo
  .createQueryBuilder()
  .where({ price: { $gt: 5000 } })
  .orderBy('price', 'DESC')
  .limit(10)
  .getMany();

// নাম দিয়ে সার্চ করুন
const searchResults = await productRepo
  .createQueryBuilder()
  .where({ name: { $contains: 'ল্যাপটপ' } })
  .getMany();
```

### সম্পূর্ণ উদাহরণ দেখুন

```bash
# সব উদাহরণ দেখুন
npm run dev
```

## 🆘 সমস্যা সমাধান

### সমস্যা: "Invalid grant" error

**সমাধান:** নিশ্চিত করুন যে:
- Service Account email সঠিক
- Private key সম্পূর্ণ (\\n সহ)
- Google Sheets শেয়ার করা আছে service account এর সাথে

### সমস্যা: "Spreadsheet not found"

**সমাধান:**
- Spreadsheet ID সঠিক আছে কিনা চেক করুন
- Service account কে editor access দেওয়া আছে কিনা চেক করুন

### সমস্যা: TypeScript errors

**সমাধান:**
```bash
npm install reflect-metadata
```

প্রথম লাইনে যোগ করুন:
```typescript
import 'reflect-metadata';
```

## 📚 পরবর্তী ধাপ

1. **README.md** পড়ুন সম্পূর্ণ ডকুমেন্টেশনের জন্য
2. **src/examples/usage.ts** দেখুন আরও উদাহরণের জন্য
3. নিজের entity তৈরি করুন এবং পরীক্ষা করুন!

---

**সাফল্যের শুভেচ্ছা! 🎊**
