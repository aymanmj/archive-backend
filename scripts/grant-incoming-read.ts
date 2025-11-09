// scripts/grant-incoming-read.ts

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function up() {
  const username = 'adel';      // غيّر المستخدم
  const roleName = 'IncomingViewer'; // غيّر/أو استعمل دور موجود

  // 1) تأكيد وجود الصلاحية
  const perm = await prisma.permission.upsert({
    where: { code: 'incoming.read' },
    update: {},
    create: { code: 'incoming.read', description: 'عرض الوارد' },
  });

  // 2) تأكيد وجود الدور
  const role = await prisma.role.upsert({
    where: { roleName },
    update: {},
    create: { roleName },
  });

  // 3) ربط الدور بالصلاحية
  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
    update: {},
    create: { roleId: role.id, permissionId: perm.id },
  });

  // 4) ربط المستخدم بالدور
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new Error(`User not found: ${username}`);

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  console.log('✅ Granted incoming.read to user', username, 'via role', roleName);
}

up().finally(() => prisma.$disconnect());
