// scripts/reset-admin.ts

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const username = 'admin02';
  const newPass  = process.env.NEW_ADMIN_PASS || 'admin123';
  const hash = await bcrypt.hash(newPass, 12);

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.log('admin user not found, creating it…');
    // حاول إيجاد قسم Administration لو موجود، أو اتركه null
    const dept = await prisma.department.findFirst({ where: { name: 'Administration' } });
    await prisma.user.create({
      data: {
        fullName: 'System Administrator',
        username,
        email: 'admin@example.com',
        passwordHash: hash,
        isActive: true,
        departmentId: dept?.id ?? null,
        securityClearanceRank: 3,
      },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        isActive: true,
        isDeleted: false,
        deletedAt: null,
      },
    });
  }

  // تأكد أن لديه دور ADMIN
  const adminRole = await prisma.role.findFirst({ where: { roleName: 'ADMIN' } });
  if (adminRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: (await prisma.user.findUnique({ where: { username } }))!.id, roleId: adminRole.id } },
      update: {},
      create: { userId: (await prisma.user.findUnique({ where: { username } }))!.id, roleId: adminRole.id },
    });
  }

  console.log('✅ admin password reset. Username: admin, Password:', newPass);
}

main().finally(() => prisma.$disconnect());
