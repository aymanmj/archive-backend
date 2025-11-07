// scripts/check-login.ts

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.TEST_USER || 'admin';
  const password = (process.env.TEST_PASS || 'admin123').trim();
  const u = await prisma.user.findUnique({ where: { username } });
  console.log('User row:', !!u, u?.username, u?.isActive, u?.isDeleted);
  if (!u) return;
  console.log('Hash len:', u.passwordHash?.length);
  const ok = await bcrypt.compare(password, u.passwordHash || '');
  console.log('bcrypt.compare =>', ok);
}
main().finally(() => prisma.$disconnect());
