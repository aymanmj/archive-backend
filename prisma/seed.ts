// prisma/seed.ts

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function ensureSecurityLevels() {
  await prisma.securityLevel.createMany({
    data: [
      { levelName: 'Public', rankOrder: 0 },
      { levelName: 'Internal', rankOrder: 1 },
      { levelName: 'Confidential', rankOrder: 2 },
      { levelName: 'Top Secret', rankOrder: 3 },
    ],
    skipDuplicates: true,
  });
}

async function ensureDocumentTypes() {
  await prisma.documentType.createMany({
    data: [
      { typeName: 'Incoming', isIncomingType: true, description: 'Incoming letters' },
      { typeName: 'Outgoing', isOutgoingType: true, description: 'Outgoing letters' },
      { typeName: 'InternalMemo', isInternalMemo: true, description: 'Internal memos' },
    ],
    skipDuplicates: true,
  });
}

async function ensureRoles() {
  await prisma.role.createMany({
    data: [
      { roleName: 'ADMIN', description: 'System administrator' },
      { roleName: 'USER', description: 'Regular user' },
    ],
    skipDuplicates: true,
  });
}

/** إدارات إضافية بالعربية (بدون تكرار) */
async function ensureExtraDepartments() {
  const names = [
    'الإدارة العامة',
    'إدارة الشؤون القانونية',
    'إدارة الموارد البشرية',
    'إدارة المالية',
    'إدارة تقنية المعلومات',
  ];
  for (const name of names) {
    const exists = await prisma.department.findFirst({ where: { name } });
    if (!exists) {
      await prisma.department.create({ data: { name, status: 'Active' } });
    }
  }
}

async function ensurePermissions() {
  // تُطابق الكود الحالي لديك (لا نغيّر الـ codes)
  const perms = [
    { code: 'doc.view',       description: 'View document' },
    { code: 'doc.download',   description: 'Download document' },
    { code: 'doc.print',      description: 'Print document' },
    { code: 'doc.forward',    description: 'Forward/Distribute' },
    { code: 'doc.assign',     description: 'Assign user/department' },
    { code: 'doc.close',      description: 'Close distribution' },
    { code: 'doc.edit',       description: 'Edit document metadata' },
    { code: 'file.upload',    description: 'Upload files' },
    { code: 'file.delete',    description: 'Delete/replace files' },
    { code: 'admin.rbac',     description: 'Manage roles/permissions' },
  ];

  await prisma.permission.createMany({ data: perms, skipDuplicates: true });

  const adminRole = await prisma.role.findFirst({ where: { roleName: 'ADMIN' } });
  if (adminRole) {
    const allPerms = await prisma.permission.findMany();
    for (const p of allPerms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: p.id } },
        update: {},
        create: { roleId: adminRole.id, permissionId: p.id },
      });
    }
  }
}

async function ensureRootDepartment() {
  const existing = await prisma.department.findFirst({ where: { name: 'Administration' } });
  if (!existing) {
    await prisma.department.create({
      data: { name: 'Administration', status: 'Active' },
    });
  }
}

async function ensureAdminUser() {
  // username: admin
  // password: admin123 (يمكن تغييره عبر متغير SEED_ADMIN_PASSWORD)
  const username = 'admin';
  const passwordPlain = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const passwordHash = await bcrypt.hash(passwordPlain, 12);

  const dept = await prisma.department.findFirst({ where: { name: 'Administration' } });
  const adminRole = await prisma.role.findFirst({ where: { roleName: 'ADMIN' } });
  const userRole  = await prisma.role.findFirst({ where: { roleName: 'USER' } });

  let user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        fullName: 'System Administrator',
        username,
        email: 'admin@example.com',
        passwordHash,
        isActive: true,
        departmentId: dept?.id ?? null,
        securityClearanceRank: 3,
      },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        isActive: true,
        departmentId: dept?.id ?? null,
        isDeleted: false,
        deletedAt: null,
      },
    });
  }

  if (adminRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
      update: {},
      create: { userId: user.id, roleId: adminRole.id },
    });
  }
  if (userRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: userRole.id } },
      update: {},
      create: { userId: user.id, roleId: userRole.id },
    });
  }
}

async function main() {
  await ensureSecurityLevels();
  await ensureDocumentTypes();
  await ensureRoles();
  await ensurePermissions();
  await ensureRootDepartment();
  await ensureExtraDepartments(); // ← إضافة الإدارات العربية
  await ensureAdminUser();

  console.log('✅ Seed completed');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
