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
  // upsert permissions
  for (const code of PERMS) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, description: code },
    });
  }

  // attach all to ADMIN
  const admin = await prisma.role.findFirst({ where: { roleName: 'ADMIN' } });
  if (!admin) {
    throw new Error('ADMIN role not found');
  }

  const allPerms = await prisma.permission.findMany({ where: { code: { in: PERMS } } });
  for (const p of allPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: admin.id, permissionId: p.id } },
      update: {},
      create: { roleId: admin.id, permissionId: p.id },
    });
  }

  console.log('✅ Permissions seeded & bound to ADMIN');
}

main().finally(() => prisma.$disconnect());
