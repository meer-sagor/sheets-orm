/**
 * সিম্পল Example - দ্রুত টেস্ট করার জন্য
 * 
 * এই ফাইলটি রান করুন: npm run dev
 */

import 'reflect-metadata';
import { SheetsORM } from '../core/SheetsORM';
import { Entity, PrimaryColumn, Column, getEntitySchema } from '../core/decorators';
import * as dotenv from 'dotenv';

// Environment variables লোড করুন
dotenv.config();

// ========================================
// Entity Definition
// ========================================

@Entity({ name: 'Student', sheetName: 'Students' })
class Student {
  @PrimaryColumn({ type: 'number' })
  id!: number;

  @Column({ type: 'string' })
  name!: string;

  @Column({ type: 'string' })
  class!: string;

  @Column({ type: 'number' })
  roll!: number;

  @Column({ type: 'number', nullable: true })
  marks?: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}

// ========================================
// Main Function
// ========================================

async function main() {
  console.log('🚀 Google Sheets ORM - সিম্পল Example\n');

  try {
    // ১. ORM সেটআপ
    console.log('১. ORM ইনিশিয়ালাইজ করা হচ্ছে...');
    const orm = new SheetsORM({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL!,
        private_key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      },
      spreadsheetId: process.env.SPREADSHEET_ID!,
      cacheConfig: {
        stdTTL: 300, // 5 minutes
      },
    });

    // ২. Entity রেজিস্টার
    console.log('২. Student entity রেজিস্টার করা হচ্ছে...');
    const schema = getEntitySchema(Student);
    if (schema) {
      orm.registerEntity(Student, schema);
    }

    // ৩. Schema সিঙ্ক
    console.log('৩. Schema সিঙ্ক করা হচ্ছে...');
    await orm.syncSchema();
    console.log('✅ Schema সিঙ্ক সম্পন্ন!\n');

    // ৪. Repository নিন
    const studentRepo = orm.getRepository(Student);

    // ৫. CREATE - নতুন students তৈরি করুন
    console.log('৪. নতুন students তৈরি করা হচ্ছে...');
    
    const students = [
      {
        id: 1,
        name: 'রহিম',
        class: 'দশম',
        roll: 101,
        marks: 85,
        active: true,
      },
      {
        id: 2,
        name: 'করিম',
        class: 'দশম',
        roll: 102,
        marks: 92,
        active: true,
      },
      {
        id: 3,
        name: 'ফাতিমা',
        class: 'নবম',
        roll: 201,
        marks: 88,
        active: true,
      },
      {
        id: 4,
        name: 'সালমা',
        class: 'নবম',
        roll: 202,
        marks: 78,
        active: false,
      },
    ];

    for (const student of students) {
      await studentRepo.save(student);
      console.log(`   ✅ ${student.name} যোগ করা হয়েছে`);
    }

    // ৬. READ - সব students দেখুন
    console.log('\n৫. সব students দেখা হচ্ছে...');
    const allStudents = await studentRepo.findAll();
    console.log(`   মোট students: ${allStudents.length}`);
    allStudents.forEach(s => {
      console.log(`   - ${s.name} (Class: ${s.class}, Roll: ${s.roll}, Marks: ${s.marks})`);
    });

    // ৭. FIND - নির্দিষ্ট শর্তে খুঁজুন
    console.log('\n৬. দশম শ্রেণীর students খুঁজছি...');
    const class10Students = await studentRepo.find({ class: 'দশম' });
    console.log(`   দশম শ্রেণীতে ${class10Students.length} জন student আছে`);

    // ৮. QUERY BUILDER - অ্যাডভান্সড কোয়েরি
    console.log('\n৭. ৮৫+ নম্বর পাওয়া students খুঁজছি...');
    const topStudents = await studentRepo
      .createQueryBuilder()
      .where({ marks: { $gte: 85 } })
      .orderBy('marks', 'DESC')
      .getMany();
    
    console.log(`   ${topStudents.length} জন student ৮৫+ নম্বর পেয়েছে:`);
    topStudents.forEach(s => {
      console.log(`   - ${s.name}: ${s.marks} নম্বর`);
    });

    // ৯. UPDATE - একটি student আপডেট করুন
    console.log('\n৮. রহিমের নম্বর আপডেট করা হচ্ছে...');
    await studentRepo.save({
      id: 1,
      marks: 90,
    });
    const updatedStudent = await studentRepo.findById(1);
    console.log(`   ✅ রহিমের নতুন নম্বর: ${updatedStudent?.marks}`);

    // ১০. COUNT - কাউন্ট করুন
    console.log('\n৯. সংখ্যা গণনা করা হচ্ছে...');
    const totalCount = await studentRepo.count();
    const activeCount = await studentRepo.count({ active: true });
    console.log(`   মোট students: ${totalCount}`);
    console.log(`   সক্রিয় students: ${activeCount}`);

    // ১১. Cache পরীক্ষা
    console.log('\n১০. Cache পারফরম্যান্স টেস্ট...');
    
    console.time('   প্রথম কোয়েরি (API)');
    await studentRepo.findAll();
    console.timeEnd('   প্রথম কোয়েরি (API)');
    
    console.time('   দ্বিতীয় কোয়েরি (Cache)');
    await studentRepo.findAll();
    console.timeEnd('   দ্বিতীয় কোয়েরি (Cache)');

    console.log('\n✅ সব অপারেশন সফলভাবে সম্পন্ন হয়েছে!');
    console.log('\n📊 এখন আপনার Google Sheets দেখুন - "Students" sheet এ ডেটা দেখতে পাবেন!');

  } catch (error) {
    console.error('\n❌ Error occurred:', error);
    throw error;
  }
}

// Run the example
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n👋 প্রোগ্রাম শেষ হয়েছে');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default main;
