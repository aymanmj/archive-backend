// scripts/grant-admin-perms.ts

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const PERMS = [
  // Incoming
  'incoming.read','incoming.create','incoming.forward','incoming.assign','incoming.updateStatus',
  // Outgoing
  'outgoing.read','outgoing.create','outgoing.markDelivered',
  // Files
  'files.read','files.upload','files.delete',
  // Departments
  'departments.read','departments.create','departments.updateStatus',
  // Users
  'users.read',
  // Audit
  'audit.read',
];

async function main() {
  // 1) upsert permissions (حساس لحالة الأحرف)
  for (const code of PERMS) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, description: code },
    });
  }

  // 2) اربط كل الصلاحيات بدور ADMIN
  const adminRole = await prisma.role.findFirst({ where: { roleName: 'ADMIN' } });
  if (!adminRole) throw new Error('ADMIN role not found');

  const allPerms = await prisma.permission.findMany({ where: { code: { in: PERMS } } });
  for (const p of allPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: p.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: p.id },
    });
  }

  console.log('✅ Granted ADMIN all required permissions.');
}

main().finally(() => prisma.$disconnect());
