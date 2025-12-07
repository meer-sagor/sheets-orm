# Google Sheets ORM - আর্কিটেকচার ও ফিচার ডকুমেন্টেশন

## 📐 সিস্টেম আর্কিটেকচার

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Your Application Code                               │   │
│  │  - Entity Definitions (@Entity, @Column)             │   │
│  │  - Business Logic                                    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      ORM Layer                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  SheetsORM   │  │  Repository  │  │QueryBuilder │       │
│  │              │  │              │  │              │       │
│  │ - Entity Reg │  │ - save()     │  │ - where()    │       │
│  │ - Sync       │  │ - find()     │  │ - orderBy()  │       │
│  │ - Cache Mgmt │  │ - update()   │  │ - limit()    │       │
│  └──────────────┘  │ - delete()   │  │ - getMany()  │       │
│                    └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Caching Layer                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  NodeCache (In-Memory Cache)                         │   │
│  │  - TTL: 300 seconds (configurable)                   │   │
│  │  - Automatic invalidation on write                   │   │
│  │  - Per-entity cache keys                             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│               Data Transformation Layer                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Type Conversion & Serialization                     │   │
│  │  - Entity ↔ Row conversion                           │   │
│  │  - JSON stringify/parse                              │   │
│  │  - Date conversion                                   │   │
│  │  - Boolean handling                                  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  Google Sheets API                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  googleapis (Official Google API Client)             │   │
│  │  - Authentication (Service Account)                  │   │
│  │  - spreadsheets.values.get()                         │   │
│  │  - spreadsheets.values.update()                      │   │
│  │  - spreadsheets.values.append()                      │   │
│  │  - spreadsheets.batchUpdate()                        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Google Sheets                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Your Spreadsheet                                    │   │
│  │  ┌────────┬────────┬────────┬────────┐              │   │
│  │  │   ID   │  Name  │  Email │  Age   │              │   │
│  │  ├────────┼────────┼────────┼────────┤              │   │
│  │  │   1    │  John  │ j@e.com│   30   │              │   │
│  │  │   2    │  Jane  │ ja@e.co│   25   │              │   │
│  │  └────────┴────────┴────────┴────────┘              │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 Core Components

### 1. SheetsORM Class
**দায়িত্ব:**
- Google Sheets API ইনিশিয়ালাইজ করা
- Entity রেজিস্ট্রেশন ম্যানেজ করা
- Cache instance তৈরি ও পরিচালনা
- Schema synchronization

**মূল মেথড:**
```typescript
constructor(config: SheetsORMConfig)
registerEntity<T>(entityClass, schema)
getRepository<T>(entityClass): Repository<T>
syncSchema(): Promise<void>
clearCache(): void
```

### 2. Repository Class
**দায়িত্ব:**
- CRUD অপারেশন
- Query execution
- Cache ম্যানেজমেন্ট
- Data transformation

**মূল মেথড:**
```typescript
save(entity): Promise<T>          // Insert/Update
findById(id): Promise<T | null>   // Find by primary key
findAll(): Promise<T[]>           // Get all records
find(criteria): Promise<T[]>      // Find by criteria
delete(id): Promise<boolean>      // Delete by ID
count(criteria?): Promise<number> // Count records
createQueryBuilder(): QueryBuilder<T>
```

### 3. QueryBuilder Class
**দায়িত্ব:**
- Complex query তৈরি
- Filtering, sorting, pagination
- Query optimization

**মূল মেথড:**
```typescript
where(condition): QueryBuilder<T>
andWhere(condition): QueryBuilder<T>
orWhere(condition): QueryBuilder<T>
orderBy(field, direction): QueryBuilder<T>
limit(n): QueryBuilder<T>
skip(n): QueryBuilder<T>
select(fields): QueryBuilder<T>
getMany(): Promise<T[]>
getOne(): Promise<T | null>
getCount(): Promise<number>
exists(): Promise<boolean>
```

### 4. Decorators
**দায়িত্ব:**
- Entity metadata সংরক্ষণ
- Type inference
- Column configuration

**Available Decorators:**
```typescript
@Entity(options?)              // Mark class as entity
@Column(options?)              // Mark property as column
@PrimaryColumn(options?)       // Mark as primary key
```

## 🔄 Data Flow

### Write Operation (Save/Update)
```
User Code
    ↓
Repository.save(entity)
    ↓
Check if ID exists
    ↓
    ├─→ Insert: Generate ID → Convert to Row → Append to Sheet
    └─→ Update: Find Row Index → Convert to Row → Update Sheet
    ↓
Invalidate Cache
    ↓
Return Updated Entity
```

### Read Operation (Find)
```
User Code
    ↓
Repository.find(criteria)
    ↓
Check Cache
    ↓
    ├─→ Cache Hit: Return Cached Data
    └─→ Cache Miss: ↓
                    Fetch from Sheets API
                    ↓
                    Convert Rows to Entities
                    ↓
                    Store in Cache
                    ↓
                    Return Entities
```

### Query Operation (QueryBuilder)
```
User Code
    ↓
repository.createQueryBuilder()
    .where({ age: { $gte: 25 } })
    .orderBy('age', 'DESC')
    .limit(10)
    ↓
Build Query Chain
    ↓
Execute: Fetch All from Repository
    ↓
Apply Filters (where conditions)
    ↓
Apply Sorting (orderBy)
    ↓
Apply Pagination (limit/skip)
    ↓
Apply Field Selection (select)
    ↓
Return Filtered Results
```

## 💾 Caching Strategy

### Cache Key Structure
```
{entityName}:all          → All records cache
{entityName}:{id}         → Individual record cache
```

### Cache Invalidation
```
Write Operation (save/update/delete)
    ↓
Delete all keys matching: {entityName}:*
    ↓
Next read will fetch fresh data from Sheets
    ↓
New cache entries created
```

### Cache Configuration
```typescript
{
  stdTTL: 300,        // 5 minutes default
  checkperiod: 60,    // Check for expired keys every 60s
  useClones: true     // Return cloned objects (safe)
}
```

## 🔐 Type System

### Supported Types
```typescript
type DataType = 
  | 'string'    → JavaScript String  → Google Sheets Text
  | 'number'    → JavaScript Number  → Google Sheets Number
  | 'boolean'   → JavaScript Boolean → Google Sheets TRUE/FALSE
  | 'date'      → JavaScript Date    → Google Sheets ISO String
  | 'json'      → JavaScript Object  → Google Sheets JSON String
```

### Type Conversion Flow
```
Entity (TypeScript) → Serialization → Sheet Row
    ↑                                      ↓
    └────────── Deserialization ←──────────┘
```

## 🚀 Performance Optimizations

### 1. Caching
- **Benefit:** 50-100x faster for repeated queries
- **Implementation:** NodeCache with configurable TTL
- **Strategy:** Cache entire result sets, invalidate on write

### 2. Batch Operations
```typescript
// Instead of:
for (const user of users) {
  await repo.save(user);  // N API calls
}

// Do this:
const batch = users.map(u => repo.save(u));
await Promise.all(batch);  // Parallel execution
```

### 3. Selective Field Loading
```typescript
// Load only needed fields
const results = await repo
  .createQueryBuilder()
  .select(['id', 'name'])  // Reduces data transfer
  .getMany();
```

### 4. Pagination
```typescript
// Don't load everything
const page = await repo
  .createQueryBuilder()
  .limit(20)      // Limit results
  .skip(offset)   // Skip already loaded
  .getMany();
```

## 🔍 Query Operators

### Comparison Operators
```typescript
$gt     // Greater than:        { age: { $gt: 25 } }
$gte    // Greater or equal:    { age: { $gte: 25 } }
$lt     // Less than:           { price: { $lt: 100 } }
$lte    // Less or equal:       { price: { $lte: 100 } }
$ne     // Not equal:           { status: { $ne: 'deleted' } }
```

### Array Operators
```typescript
$in     // In array:            { category: { $in: ['A', 'B'] } }
```

### String Operators
```typescript
$contains  // Contains string:  { name: { $contains: 'John' } }
```

### Usage Example
```typescript
// Complex query
const results = await repo
  .createQueryBuilder()
  .where({ 
    age: { $gte: 25, $lte: 35 },
    status: { $ne: 'inactive' }
  })
  .andWhere({
    category: { $in: ['premium', 'vip'] }
  })
  .orderBy('age', 'DESC')
  .limit(10)
  .getMany();
```

## 🛡️ Error Handling

### Common Errors & Solutions

**1. Authentication Error**
```
Error: Invalid grant
Solution: Check credentials, ensure service account has access
```

**2. Spreadsheet Not Found**
```
Error: Spreadsheet not found
Solution: Verify spreadsheet ID and sharing permissions
```

**3. Entity Not Registered**
```
Error: Entity {name} is not registered
Solution: Call orm.registerEntity() before using repository
```

**4. Cache Stale Data**
```
Issue: Getting old data after update
Solution: orm.clearCache() or wait for TTL expiry
```

## 📊 Best Practices

### 1. Entity Design
```typescript
✅ DO:
@Entity()
class User {
  @PrimaryColumn({ type: 'number' })
  id!: number;  // Auto-increment handled
  
  @Column({ type: 'string' })
  email!: string;
}

❌ DON'T:
class User {
  id: number;  // No decorator = not persisted
}
```

### 2. Cache Management
```typescript
✅ DO:
// Clear cache after bulk updates
await bulkUpdate();
orm.clearCache();

❌ DON'T:
// Forget to clear cache
await bulkUpdate();
// Users see old data
```

### 3. Query Optimization
```typescript
✅ DO:
// Specific query
const user = await repo.findById(1);

❌ DON'T:
// Fetch all then filter
const all = await repo.findAll();
const user = all.find(u => u.id === 1);
```

## 📈 Scalability Considerations

### Limitations
- Google Sheets API quota: 100 requests/100 seconds/user
- Maximum 10 million cells per spreadsheet
- Read/write latency: 200-500ms per request

### Solutions
1. **Caching:** Reduces API calls by 90%+
2. **Batch Operations:** Combine multiple operations
3. **Pagination:** Load data in chunks
4. **Multiple Sheets:** Split data across sheets
5. **Archive Old Data:** Keep active data small

## 🔄 Migration from TypeORM

### TypeORM → Sheets ORM

```typescript
// TypeORM
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
class User {
  @PrimaryGeneratedColumn()
  id: number;
  
  @Column()
  name: string;
}

// Sheets ORM
import { Entity, Column, PrimaryColumn } from './core/decorators';

@Entity()
class User {
  @PrimaryColumn({ type: 'number' })
  id!: number;
  
  @Column({ type: 'string' })
  name!: string;
}
```

### Key Differences
1. **No database connection** - Uses Google Sheets
2. **No migrations** - Auto-sync with syncSchema()
3. **Built-in caching** - No need for Redis
4. **No transactions** - Single document updates only
5. **No relations** - Store foreign keys manually

## 🎓 Learning Path

### Beginner → Advanced

**Level 1: Basics**
- Setup ORM
- Define entities
- CRUD operations
- Basic queries

**Level 2: Intermediate**
- Query builder
- Complex filters
- Pagination
- Cache management

**Level 3: Advanced**
- Custom repositories
- JSON data types
- Performance optimization
- Error handling

**Level 4: Expert**
- Multiple spreadsheets
- Data migration
- Batch processing
- Custom decorators

---

**এই ডকুমেন্টেশন নিয়মিত আপডেট করা হবে নতুন ফিচার যোগ হওয়ার সাথে সাথে।**
