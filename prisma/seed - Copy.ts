// prisma/seed.ts

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function ensureSecurityLevels() {
  // لو عندك مستويات سابقة مش هنعيدها
  await prisma.securityLevel.createMany({
    data: [
      { levelName: 'Public',       rankOrder: 0 },
      { levelName: 'Internal',     rankOrder: 1 },
      { levelName: 'Confidential', rankOrder: 2 },
      { levelName: 'Top Secret',   rankOrder: 3 },
    ],
    skipDuplicates: true,
  });
}

async function ensureDocumentType(opts: {
  typeName: string;
  isIncomingType?: boolean;
  isOutgoingType?: boolean;
  isInternalMemo?: boolean;
  description?: string | null;
}) {
  const exists = await prisma.documentType.findFirst({
    where: { typeName: opts.typeName },
    select: { id: true },
  });

  if (!exists) {
    await prisma.documentType.create({
      data: {
        typeName: opts.typeName,
        isIncomingType: Boolean(opts.isIncomingType),
        isOutgoingType: Boolean(opts.isOutgoingType),
        isInternalMemo: Boolean(opts.isInternalMemo),
        description: opts.description ?? null,
      },
    });
  } else {
    // نحدّث الفلاجز لو كانت False سابقًا
    await prisma.documentType.update({
      where: { id: exists.id },
      data: {
        isIncomingType: opts.isIncomingType ?? undefined,
        isOutgoingType: opts.isOutgoingType ?? undefined,
        isInternalMemo: opts.isInternalMemo ?? undefined,
        description: opts.description ?? undefined,
      },
    });
  }
}

async function ensureDocumentTypes() {
  await ensureDocumentType({
    typeName: 'Incoming',
    isIncomingType: true,
    description: 'Incoming letters / الوارد',
  });
  await ensureDocumentType({
    typeName: 'Outgoing',
    isOutgoingType: true,
    description: 'Outgoing letters / الصادر',
  });
  await ensureDocumentType({
    typeName: 'InternalMemo',
    isInternalMemo: true,
    description: 'Internal memos / مذكرة داخلية',
  });
}

async function ensureRootDepartment() {
  // إدارة عامة (id = 1 اختياري، مش شرط)
  const exists = await prisma.department.findFirst({
    where: { name: 'الإدارة العامة' },
    select: { id: true },
  });

  if (!exists) {
    await prisma.department.create({
      data: { name: 'الإدارة العامة', status: 'Active', updatedAt: new Date() },
    });
  }
}

async function ensureRoles() {
  await prisma.role.createMany({
    data: [{ roleName: 'ADMIN' }, { roleName: 'USER' }],
    skipDuplicates: true,
  });
}

async function ensureAdminUser() {
  const dept = await prisma.department.findFirst({
    where: { name: 'الإدارة العامة' },
    select: { id: true },
  });

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      fullName: 'مدير النظام',
      username: 'admin',
      // كلمة مرور: admin123 (مثال) — غيّرها لاحقًا
      // هاش Bcrypt لـ "admin123"
      passwordHash:
        '$2b$10$vTs3aHWKj2ZEIJaxs0DF0OX4aOHMhoLe.omX.kThgTG.TocqXATl6',
      departmentId: dept ? dept.id : null,
      isActive: true,
      // لو عندك حقل securityClearanceRank في User، أضفه هنا
      // securityClearanceRank: 3,
    },
  });

  const adminRole = await prisma.role.findUnique({
    where: { roleName: 'ADMIN' },
    select: { id: true },
  });

  if (adminRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
      update: {},
      create: { userId: admin.id, roleId: adminRole.id },
    });
  }
}

async function main() {
  await ensureSecurityLevels();
  await ensureDocumentTypes();
  await ensureRootDepartment();
  await ensureRoles();
  await ensureAdminUser();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
