# SheetsORM Usage Examples

Complete examples for both OAuth (multi-tenant) and Service Account (single-tenant) modes.

---

## Example 1: Multi-Tenant E-Commerce Platform (OAuth)

### Setup

```typescript
// app.ts
import 'reflect-metadata';
import {
  SheetsORM,
  Entity,
  PrimaryColumn,
  Column,
  getEntitySchema,
} from '@meersagor/sheets-orm';

// Initialize ORM (once at app startup)
export const orm = new SheetsORM({
  authMode: 'oauth',
  oauth: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: process.env.GOOGLE_REDIRECT_URI!,
  },
  cacheConfig: {
    stdTTL: 300, // 5 minutes
  },
  enableMigrations: true,
  enableTransactions: true,
});

// Define entities
@Entity({ name: 'Product', sheetName: 'Products' })
export class Product {
  @PrimaryColumn()
  id!: number;

  @Column()
  name!: string;

  @Column()
  slug!: string;

  @Column({ type: 'number' })
  price!: number;

  @Column({ type: 'number', default: 0 })
  quantity!: number;

  @Column({ type: 'json', nullable: true })
  images?: string[];

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'date' })
  createdAt!: Date;
}

@Entity({ name: 'Order', sheetName: 'Orders' })
export class Order {
  @PrimaryColumn()
  id!: number;

  @Column()
  orderNumber!: string;

  @Column()
  customerEmail!: string;

  @Column({ type: 'number' })
  total!: number;

  @Column({ default: 'pending' })
  status!: string;

  @Column({ type: 'date' })
  createdAt!: Date;
}

// Register entities
orm.registerEntity(Product, getEntitySchema(Product)!);
orm.registerEntity(Order, getEntitySchema(Order)!);
```

### Vendor Connection Flow

```typescript
// google-auth.controller.ts
import { orm } from './app';

export class GoogleAuthController {
  /**
   * Step 1: Redirect to Google OAuth
   */
  async connect(vendorId: string, res: Response) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      state: vendorId, // Pass vendorId via state
      prompt: 'consent',
    });

    res.redirect(url);
  }

  /**
   * Step 2: Handle OAuth callback
   */
  async callback(code: string, state: string) {
    const vendorId = state;

    // Exchange code for tokens
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    const { tokens } = await oauth2Client.getToken(code);

    // Get user info
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    // Create spreadsheet for vendor
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: `Store Data - Vendor ${vendorId}`,
        },
      },
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId!;

    // Save to database
    await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        googleSheetId: spreadsheetId,
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token,
        googleTokenExpiry: new Date(tokens.expiry_date!),
        googleEmail: userInfo.data.email,
      },
    });

    // Register connection in ORM
    await orm.registerConnection({
      connectionId: vendorId,
      spreadsheetId: spreadsheetId,
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      tokenExpiry: new Date(tokens.expiry_date!),
      email: userInfo.data.email!,
    });

    // Create sheets for entities
    await orm.syncSchema(vendorId);

    return { success: true, spreadsheetId };
  }
}
```

### Products Service

```typescript
// products.service.ts
import { orm } from './app';
import { Product } from './entities';

export class ProductsService {
  async getProducts(vendorId: string): Promise<Product[]> {
    const repo = orm.getRepository(vendorId, Product);
    return await repo.findAll(); // Cached for 5 minutes!
  }

  async getProduct(
    vendorId: string,
    productId: number,
  ): Promise<Product | null> {
    const repo = orm.getRepository(vendorId, Product);
    return await repo.findById(productId);
  }

  async createProduct(
    vendorId: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const repo = orm.getRepository(vendorId, Product);

    // Check product limit
    const count = await repo.count();
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });

    if (count >= vendor!.productLimit) {
      throw new Error(`Product limit reached (${vendor!.productLimit})`);
    }

    data.createdAt = new Date();
    return await repo.save(data);
  }

  async updateProduct(
    vendorId: string,
    productId: number,
    data: Partial<Product>,
  ): Promise<Product> {
    const repo = orm.getRepository(vendorId, Product);
    const existing = await repo.findById(productId);

    if (!existing) {
      throw new Error('Product not found');
    }

    return await repo.save({ ...existing, ...data });
  }

  async deleteProduct(vendorId: string, productId: number): Promise<boolean> {
    const repo = orm.getRepository(vendorId, Product);
    return await repo.delete(productId);
  }

  async searchProducts(vendorId: string, query: string): Promise<Product[]> {
    const repo = orm.getRepository(vendorId, Product);
    const products = await repo.find({ isActive: true } as any);

    return products.filter((p) =>
      p.name.toLowerCase().includes(query.toLowerCase()),
    );
  }
}
```

### Using Transactions

```typescript
// orders.service.ts
import { orm } from './app';
import { Order, Product } from './entities';

export class OrdersService {
  async createOrder(vendorId: string, orderData: any): Promise<Order> {
    return await orm.withTransaction(vendorId, async (transaction) => {
      const orderRepo = transaction.getRepository(Order);
      const productRepo = transaction.getRepository(Product);

      // Create order
      const order = await orderRepo.save({
        orderNumber: `ORD-${Date.now()}`,
        customerEmail: orderData.customerEmail,
        total: orderData.total,
        status: 'pending',
        createdAt: new Date(),
      });

      // Update product quantities
      for (const item of orderData.items) {
        const product = await productRepo.findById(item.productId);

        if (!product) {
          throw new Error(`Product ${item.productId} not found`);
        }

        if (product.quantity < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}`);
        }

        product.quantity -= item.quantity;
        await productRepo.save(product);
      }

      // All operations committed together!
      return order;
    });
  }
}
```

### NestJS Controller

```typescript
// products.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  async getProducts(@CurrentUser() user: any) {
    return this.productsService.getProducts(user.vendorId);
  }

  @Get(':id')
  async getProduct(@CurrentUser() user: any, @Param('id') id: string) {
    return this.productsService.getProduct(user.vendorId, parseInt(id));
  }

  @Post()
  async createProduct(@CurrentUser() user: any, @Body() data: any) {
    return this.productsService.createProduct(user.vendorId, data);
  }

  @Put(':id')
  async updateProduct(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.productsService.updateProduct(
      user.vendorId,
      parseInt(id),
      data,
    );
  }

  @Delete(':id')
  async deleteProduct(@CurrentUser() user: any, @Param('id') id: string) {
    return this.productsService.deleteProduct(user.vendorId, parseInt(id));
  }
}
```

---

## Example 2: Internal Analytics Dashboard (Service Account)

### Setup

```typescript
// app.ts
import 'reflect-metadata';
import {
  SheetsORM,
  Entity,
  PrimaryColumn,
  Column,
  getEntitySchema,
} from '@meersagor/sheets-orm';

// Initialize ORM with service account
export const orm = new SheetsORM({
  authMode: 'service-account',
  serviceAccount: {
    clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    privateKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY!,
  },
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID!,
  cacheConfig: {
    stdTTL: 60, // 1 minute for real-time analytics
  },
  enableMigrations: true,
  enableTransactions: true,
});

// Define entities
@Entity({ name: 'Metric' })
export class Metric {
  @PrimaryColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ type: 'number' })
  value!: number;

  @Column()
  category!: string;

  @Column({ type: 'date' })
  timestamp!: Date;
}

@Entity({ name: 'Event' })
export class Event {
  @PrimaryColumn()
  id!: number;

  @Column()
  eventType!: string;

  @Column()
  userId!: string;

  @Column({ type: 'json' })
  data!: any;

  @Column({ type: 'date' })
  timestamp!: Date;
}

// Register entities
orm.registerEntity(Metric, getEntitySchema(Metric)!);
orm.registerEntity(Event, getEntitySchema(Event)!);

// Sync schema
await orm.syncSchema();
```

### Analytics Service

```typescript
// analytics.service.ts
import { orm } from './app';
import { Metric, Event } from './entities';

export class AnalyticsService {
  async trackMetric(
    name: string,
    value: number,
    category: string,
  ): Promise<Metric> {
    const repo = orm.getRepository(Metric); // No connectionId!

    return await repo.save({
      name,
      value,
      category,
      timestamp: new Date(),
    });
  }

  async getMetrics(category?: string): Promise<Metric[]> {
    const repo = orm.getRepository(Metric);

    if (category) {
      return await repo.find({ category } as any);
    }

    return await repo.findAll();
  }

  async getDailyRevenue(date: Date): Promise<number> {
    const repo = orm.getRepository(Metric);

    const metrics = await repo
      .createQueryBuilder()
      .where({ name: 'revenue', category: 'sales' } as any)
      .andWhere({ timestamp: { $gte: date } } as any)
      .getMany();

    return metrics.reduce((sum, m) => sum + m.value, 0);
  }

  async trackEvent(
    eventType: string,
    userId: string,
    data: any,
  ): Promise<Event> {
    const repo = orm.getRepository(Event);

    return await repo.save({
      eventType,
      userId,
      data,
      timestamp: new Date(),
    });
  }

  async getUserEvents(userId: string): Promise<Event[]> {
    const repo = orm.getRepository(Event);
    return await repo.find({ userId } as any);
  }
}
```

### Express API

```typescript
// server.ts
import express from 'express';
import { AnalyticsService } from './analytics.service';

const app = express();
const analytics = new AnalyticsService();

// Track revenue
app.post('/metrics/revenue', async (req, res) => {
  const { amount } = req.body;

  const metric = await analytics.trackMetric('revenue', amount, 'sales');
  res.json(metric);
});

// Get today's revenue
app.get('/metrics/revenue/today', async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const revenue = await analytics.getDailyRevenue(today);
  res.json({ revenue });
});

// Track user event
app.post('/events', async (req, res) => {
  const { eventType, userId, data } = req.body;

  const event = await analytics.trackEvent(eventType, userId, data);
  res.json(event);
});

// Get user events
app.get('/events/user/:userId', async (req, res) => {
  const { userId } = req.params;

  const events = await analytics.getUserEvents(userId);
  res.json(events);
});

app.listen(3000, () => {
  console.log('Analytics API running on port 3000');
});
```

---

## Example 3: Migrating Existing Vendor (OAuth → Service Account)

Sometimes you want to test OAuth mode locally but run in Service Account mode for certain vendors.

```typescript
// Load vendor from database on app start
async function initializeVendors() {
  const vendors = await prisma.vendor.findMany({
    where: {
      googleSheetId: { not: null },
    },
  });

  for (const vendor of vendors) {
    await orm.registerConnection({
      connectionId: vendor.id,
      spreadsheetId: vendor.googleSheetId!,
      accessToken: vendor.googleAccessToken!,
      refreshToken: vendor.googleRefreshToken!,
      tokenExpiry: vendor.googleTokenExpiry!,
      email: vendor.googleEmail!,
    });

    console.log(`✅ Vendor ${vendor.id} registered`);
  }
}

// Call on app startup
await initializeVendors();
```

---

## Comparison: When to Use Which Mode

### Use OAuth Mode When:

- ✅ Building multi-tenant SaaS
- ✅ Each user/customer owns their data
- ✅ Need to scale to thousands of users
- ✅ Want isolated quotas per user
- ✅ Regulatory requirements (data ownership)

### Use Service Account Mode When:

- ✅ Building internal tools
- ✅ You own all the data
- ✅ Single team/organization use
- ✅ Simple setup preferred
- ✅ No user authentication needed

---

## Performance Tips

### 1. Increase Cache TTL for Read-Heavy Data

```typescript
{
  cacheConfig: {
    stdTTL: 600, // 10 minutes for products
  }
}
```

### 2. Use Transactions for Multi-Step Operations

```typescript
await orm.withTransaction(vendorId, async (tx) => {
  // All operations committed together
});
```

### 3. Batch Operations

```typescript
// ❌ BAD: Multiple API calls
for (const product of products) {
  await repo.save(product); // 50 API calls for 50 products!
}

// ✅ GOOD: Use bulk insert (coming soon)
// For now, minimize by checking cache first
const existing = await repo.findAll(); // 1 cached call
```

### 4. Clear Cache Selectively

```typescript
// Clear only specific connection's cache
orm.clearCache(vendorId);

// Instead of clearing everything
orm.clearAllCache();
```

---

**Now you're ready to build with SheetsORM! 🚀**
