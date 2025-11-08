// scripts/debug-perms.ts

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { username: 'admin' },
    include: {
      UserRole: { include: { Role: { include: { RolePermission: { include: { Permission: true } } } } } }
    }
  });

  if (!user) { console.log('admin user not found'); return; }

  const codes = new Set<string>();
  for (const ur of user.UserRole) {
    for (const rp of ur.Role.RolePermission) {
      codes.add(rp.Permission.code);
    }
  }
  console.log('admin perms =>', Array.from(codes).sort());
}

main().finally(() => prisma.$disconnect());
