// scripts/grant-admin-perms.ts

import { PrismaClient } from '@prisma/client';

// نحاول نقرأ كل الأكواد من PERMISSIONS لتحديث/إدراج الأكواد القياسية
// ولو صار أي مشكلة في الاستيراد (مسارات/ESM/CJS) نكمل بدونها
let PERMISSION_CODES_FROM_CONSTANTS: string[] = [];
try {
  // مسار من scripts/ إلى src/
  // لو اختلف مسارك عدّله: '../src/auth/permissions.constants'
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PERMISSIONS } = require('../src/auth/permissions.constants');
  const raw = Object.values(PERMISSIONS) as string[];
  PERMISSION_CODES_FROM_CONSTANTS = Array.from(new Set(raw)).sort();
} catch (e) {
  console.warn(
    '[grant-admin-perms] ⚠️ لم نتمكن من استيراد PERMISSIONS من constants. سنكتفي بمنح جميع الصلاحيات الموجودة في قاعدة البيانات فقط.'
  );
}

const prisma = new PrismaClient();

async function main() {
  // 1) Upsert للّّي في constants (لو تمكنا من قراءته)
  if (PERMISSION_CODES_FROM_CONSTANTS.length) {
    console.log('[grant-admin-perms] Upserting permissions from PERMISSIONS...');
    await prisma.$transaction(
      PERMISSION_CODES_FROM_CONSTANTS.map((code) =>
        prisma.permission.upsert({
          where: { code },
          update: {},
          create: { code, description: code },
        })
      )
    );
  }

  // 2) احضر دور الأدمن
  const adminRole = await prisma.role.findFirst({
    where: { roleName: 'ADMIN' },
  });
  if (!adminRole) {
    throw new Error('ADMIN role not found. أنشئ دور ADMIN أولاً.');
  }

  // 3) احضر **كل** الصلاحيات الموجودة في الجدول الآن
  const allPerms = await prisma.permission.findMany();
  if (!allPerms.length) {
    console.warn('[grant-admin-perms] ⚠️ لا توجد صلاحيات في قاعدة البيانات.');
  } else {
    console.log(`[grant-admin-perms] Granting ${allPerms.length} permissions to ADMIN...`);
  }

  // 4) اربطها كلّها مع ADMIN (upsert آمن)
  await prisma.$transaction(
    allPerms.map((p) =>
      prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: adminRole.id,
            permissionId: p.id,
          },
        },
        update: {},
        create: { roleId: adminRole.id, permissionId: p.id },
      })
    )
  );

  console.log('✅ ADMIN صار معه كل الصلاحيات الموجودة حالياً في قاعدة البيانات.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });







// // scripts/grant-admin-perms.ts

// import { PrismaClient } from '@prisma/client';
// const prisma = new PrismaClient();

// const PERMS = [
//   // Incoming
//   'incoming.read','incoming.create','incoming.forward','incoming.assign','incoming.updateStatus',
//   // Outgoing
//   'outgoing.read','outgoing.create','outgoing.markDelivered',
//   // Files
//   'files.read','files.upload','files.delete',
//   // Departments
//   'departments.read','departments.create','departments.updateStatus',
//   // Users
//   'users.read',
//   // Audit
//   'audit.read',
// ];

// async function main() {
//   // 1) upsert permissions (حساس لحالة الأحرف)
//   for (const code of PERMS) {
//     await prisma.permission.upsert({
//       where: { code },
//       update: {},
//       create: { code, description: code },
//     });
//   }

//   // 2) اربط كل الصلاحيات بدور ADMIN
//   const adminRole = await prisma.role.findFirst({ where: { roleName: 'ADMIN' } });
//   if (!adminRole) throw new Error('ADMIN role not found');

//   const allPerms = await prisma.permission.findMany({ where: { code: { in: PERMS } } });
//   for (const p of allPerms) {
//     await prisma.rolePermission.upsert({
//       where: { roleId_permissionId: { roleId: adminRole.id, permissionId: p.id } },
//       update: {},
//       create: { roleId: adminRole.id, permissionId: p.id },
//     });
//   }

//   console.log('✅ Granted ADMIN all required permissions.');
// }

// main().finally(() => prisma.$disconnect());
