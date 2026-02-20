# Google Sheets ORM

A powerful TypeScript ORM for Google Sheets with support for both **OAuth (multi-tenant)** and **Service Account (single-tenant)** authentication modes.

Perfect for:

- 🚀 Multi-tenant SaaS applications
- 📊 Internal tools and dashboards
- 🎯 Rapid prototyping with spreadsheet databases
- 💰 Free-tier data storage solutions

## Features

✅ **Dual Auth Modes**: OAuth for multi-tenant SaaS, Service Account for internal tools  
✅ **TypeScript Decorators**: Define entities with `@Entity()`, `@Column()`, `@PrimaryColumn()`  
✅ **Query Builder**: Complex queries with `.where()`, `.orderBy()`, `.limit()`  
✅ **Relations**: `@OneToMany()`, `@ManyToOne()`, `@OneToOne()` support  
✅ **Transactions**: ACID-like transactions with rollback support  
✅ **Migrations**: Schema versioning and migration management  
✅ **Caching**: Built-in 5-minute cache reduces API calls by 95%  
✅ **Auto Token Refresh**: No more expired token errors (OAuth mode)  
✅ **Type-Safe**: Full TypeScript support with generics

---

## Installation

```bash
npm install @your-org/sheets-orm reflect-metadata googleapis node-cache
```

Add to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

Import at app entry point:

```typescript
import 'reflect-metadata';
```

---

## Quick Start

### 🔐 OAuth Mode (Multi-Tenant SaaS)

```typescript
import {
  SheetsORM,
  Entity,
  PrimaryColumn,
  Column,
  getEntitySchema,
} from '@your-org/sheets-orm';

// 1. Initialize ORM
const orm = new SheetsORM({
  authMode: 'oauth',
  oauth: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: 'http://localhost:3001/google/callback',
  },
});

// 2. Define entities
@Entity({ name: 'Product' })
export class Product {
  @PrimaryColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ type: 'number' })
  price!: number;
}

orm.registerEntity(Product, getEntitySchema(Product)!);

// 3. Register user connection
await orm.registerConnection({
  connectionId: 'user-123',
  spreadsheetId: 'abc123...',
  accessToken: tokens.access_token,
  refreshToken: tokens.refresh_token,
  tokenExpiry: new Date(tokens.expiry_date),
});

await orm.syncSchema('user-123');

// 4. Use repository
const productRepo = orm.getRepository('user-123', Product);
const products = await productRepo.findAll(); // Cached!
```

### 🔧 Service Account Mode (Single-Tenant)

```typescript
// 1. Initialize ORM
const orm = new SheetsORM({
  authMode: 'service-account',
  serviceAccount: {
    clientEmail: 'service@project.iam.gserviceaccount.com',
    privateKey: '-----BEGIN PRIVATE KEY-----...',
  },
  spreadsheetId: 'your-spreadsheet-id',
});

// 2. Define & register entities (same as above)
orm.registerEntity(Product, getEntitySchema(Product)!);
await orm.syncSchema();

// 3. Use repository (no connectionId needed!)
const productRepo = orm.getRepository(Product);
const products = await productRepo.findAll();
```

---

## Comparison: OAuth vs Service Account

| Feature             | OAuth Mode                            | Service Account Mode    |
| ------------------- | ------------------------------------- | ----------------------- |
| **Use Case**        | Multi-tenant SaaS                     | Internal tools          |
| **Data Ownership**  | Each user owns their sheet            | You own the sheet       |
| **Scalability**     | Unlimited users                       | Single spreadsheet      |
| **Repository Call** | `getRepository(connectionId, Entity)` | `getRepository(Entity)` |
| **Per-User Quota**  | Yes                                   | No                      |

---

## Documentation

📖 [Full Documentation](https://github.com/your-org/sheets-orm)  
🐛 [Report Issues](https://github.com/your-org/sheets-orm/issues)

---

## License

MIT
