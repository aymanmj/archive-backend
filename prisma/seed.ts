// prisma/seed.ts

import { PrismaClient, DistributionStatus } from '@prisma/client';
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
      { roleName: 'USER',  description: 'Regular user' },
    ],
    skipDuplicates: true,
  });

  await prisma.role.updateMany({
    where: { roleName: 'ADMIN' },
    data: { isSystem: true },
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
  // Legacy للتوافق
  const legacy = [
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
    { code: 'rbac.manage',    description: 'Manage roles/permissions' },
  ];

  // Granular RBAC
  const granular = [
    // Incoming
    { code: 'incoming.read',          description: 'Read incoming' },
    { code: 'incoming.create',        description: 'Create incoming' },
    { code: 'incoming.forward',       description: 'Forward incoming' },
    { code: 'incoming.assign',        description: 'Assign incoming distribution' },
    { code: 'incoming.updateStatus',  description: 'Update incoming distribution status/notes' },

    // Outgoing
    { code: 'outgoing.read',          description: 'Read outgoing' },
    { code: 'outgoing.create',        description: 'Create outgoing' },
    { code: 'outgoing.markDelivered', description: 'Mark outgoing delivered' },

    // Files
    { code: 'files.read',             description: 'List/read document files' },
    { code: 'files.upload',           description: 'Upload document files' },
    { code: 'files.delete',           description: 'Delete document files' },

    // Departments
    { code: 'departments.read',       description: 'Read departments' },
    { code: 'departments.create',     description: 'Create departments' },
    { code: 'departments.updateStatus', description: 'Update/toggle department status' },

    // Users
    { code: 'users.read',             description: 'Read users' },
    { code: 'users.manage',           description: 'Create/modify users & reset passwords' },

    // Audit
    { code: 'audit.read',             description: 'Read audit trail' },
  ];

  await prisma.permission.createMany({
    data: [...legacy, ...granular],
    skipDuplicates: true,
  });

  // اربط كل الصلاحيات بدور ADMIN
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

async function ensureViewerRoles() {
  const viewerIncoming = { roleName: 'ViewerIncoming', description: 'View-only Incoming' };
  const viewerOutgoing = { roleName: 'ViewerOutgoing', description: 'View-only Outgoing' };

  for (const r of [viewerIncoming, viewerOutgoing]) {
    await prisma.role.upsert({
      where: { roleName: r.roleName },
      update: { description: r.description ?? undefined, isSystem: false },
      create: { roleName: r.roleName, description: r.description, isSystem: false },
    });
  }

  const [roleIn, roleOut] = await Promise.all([
    prisma.role.findFirst({ where: { roleName: viewerIncoming.roleName } }),
    prisma.role.findFirst({ where: { roleName: viewerOutgoing.roleName } }),
  ]);

  if (!roleIn || !roleOut) return;

  const wantedIn  = ['incoming.read', 'files.read'];
  const wantedOut = ['outgoing.read', 'files.read'];

  const perms = await prisma.permission.findMany({
    where: { code: { in: [...wantedIn, ...wantedOut] } },
    select: { id: true, code: true },
  });
  const map = new Map(perms.map((p) => [p.code, p.id]));

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: roleIn.id } }),
    prisma.rolePermission.deleteMany({ where: { roleId: roleOut.id } }),
    ...wantedIn
      .filter((c) => map.has(c))
      .map((c) =>
        prisma.rolePermission.create({
          data: { roleId: roleIn.id, permissionId: map.get(c)! },
        }),
      ),
    ...wantedOut
      .filter((c) => map.has(c))
      .map((c) =>
        prisma.rolePermission.create({
          data: { roleId: roleOut.id, permissionId: map.get(c)! },
        }),
      ),
  ]);
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
        isSystem: true,
      },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        isActive: true,
        departmentId: dept?.id ?? null,
        isSystem: true,
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

/** ✅ سياسة التصعيد الافتراضية + مستويات L1..L4 */
async function ensureEscalationPolicy() {
  // سياسة افتراضية
  const policy = await prisma.escalationPolicy.upsert({
    where: { name: 'Default SLA Policy' },
    update: { isActive: true },
    create: { name: 'Default SLA Policy', isActive: true },
  });

  // تعريف المستويات
  const levels = [
    {
      level: 1,
      thresholdMinutes: 0,                      // مباشرة عند الاختراق
      priorityBump: 1,
      statusOnReach: 'Escalated' as DistributionStatus,
      requireDelayReason: false,
      autoReassign: false,
      notifyAssignee: true,
      notifyManager: true,
      notifyAdmin: false,
      throttleMinutes: 60,
    },
    {
      level: 2,
      thresholdMinutes: 120,                    // بعد 2 ساعة
      priorityBump: 1,
      statusOnReach: 'Escalated' as DistributionStatus,
      requireDelayReason: true,
      autoReassign: false,
      notifyAssignee: true,
      notifyManager: true,
      notifyAdmin: false,
      throttleMinutes: 60,
    },
    {
      level: 3,
      thresholdMinutes: 24 * 60,                // بعد 24 ساعة
      priorityBump: 1,
      statusOnReach: 'Escalated' as DistributionStatus,
      requireDelayReason: true,
      autoReassign: true,                        // يمكن للـ worker إعادة الإسناد
      notifyAssignee: true,
      notifyManager: true,
      notifyAdmin: true,
      throttleMinutes: 120,
    },
    {
      level: 4,
      thresholdMinutes: 72 * 60,                // بعد 72 ساعة
      priorityBump: 1,
      statusOnReach: 'Escalated' as DistributionStatus,
      requireDelayReason: true,
      autoReassign: true,
      notifyAssignee: true,
      notifyManager: true,
      notifyAdmin: true,
      throttleMinutes: 240,
    },
  ];

  // upsert لكل مستوى على القيد المركّب policyId+level
  for (const l of levels) {
    await prisma.escalationLevel.upsert({
      where: { policyId_level: { policyId: policy.id, level: l.level } },
      update: { ...l },
      create: { ...l, policyId: policy.id },
    });
  }
}

async function main() {
  await ensureSecurityLevels();
  await ensureDocumentTypes();
  await ensureRoles();
  await ensurePermissions();
  await ensureViewerRoles();
  await ensureRootDepartment();
  await ensureExtraDepartments();
  await ensureAdminUser();
  await ensureEscalationPolicy(); // ✅ جديد

  console.log('✅ Seed completed');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });




// // prisma/seed.ts

// import { PrismaClient } from '@prisma/client';
// import * as bcrypt from 'bcrypt';

// const prisma = new PrismaClient();

// async function ensureSecurityLevels() {
//   await prisma.securityLevel.createMany({
//     data: [
//       { levelName: 'Public', rankOrder: 0 },
//       { levelName: 'Internal', rankOrder: 1 },
//       { levelName: 'Confidential', rankOrder: 2 },
//       { levelName: 'Top Secret', rankOrder: 3 },
//     ],
//     skipDuplicates: true,
//   });
// }

// async function ensureDocumentTypes() {
//   await prisma.documentType.createMany({
//     data: [
//       { typeName: 'Incoming', isIncomingType: true, description: 'Incoming letters' },
//       { typeName: 'Outgoing', isOutgoingType: true, description: 'Outgoing letters' },
//       { typeName: 'InternalMemo', isInternalMemo: true, description: 'Internal memos' },
//     ],
//     skipDuplicates: true,
//   });
// }

// async function ensureRoles() {
//   await prisma.role.createMany({
//     data: [
//       { roleName: 'ADMIN', description: 'System administrator' },
//       { roleName: 'USER',  description: 'Regular user' },
//     ],
//     skipDuplicates: true,
//   });

//   await prisma.role.updateMany({
//     where: { roleName: 'ADMIN' },
//     data: { isSystem: true },
//   });
// }

// /** إدارات إضافية بالعربية (بدون تكرار) */
// async function ensureExtraDepartments() {
//   const names = [
//     'الإدارة العامة',
//     'إدارة الشؤون القانونية',
//     'إدارة الموارد البشرية',
//     'إدارة المالية',
//     'إدارة تقنية المعلومات',
//   ];
//   for (const name of names) {
//     const exists = await prisma.department.findFirst({ where: { name } });
//     if (!exists) {
//       await prisma.department.create({ data: { name, status: 'Active' } });
//     }
//   }
// }

// async function ensurePermissions() {
//   // Legacy للتوافق
//   const legacy = [
//     { code: 'doc.view',       description: 'View document' },
//     { code: 'doc.download',   description: 'Download document' },
//     { code: 'doc.print',      description: 'Print document' },
//     { code: 'doc.forward',    description: 'Forward/Distribute' },
//     { code: 'doc.assign',     description: 'Assign user/department' },
//     { code: 'doc.close',      description: 'Close distribution' },
//     { code: 'doc.edit',       description: 'Edit document metadata' },
//     { code: 'file.upload',    description: 'Upload files' },
//     { code: 'file.delete',    description: 'Delete/replace files' },
//     { code: 'admin.rbac',     description: 'Manage roles/permissions' },
//     { code: 'rbac.manage',     description: 'Manage roles/permissions' },
//   ];

//   // Granular RBAC (أضفنا users.manage هنا)
//   const granular = [
//     // Incoming
//     { code: 'incoming.read',          description: 'Read incoming' },
//     { code: 'incoming.create',        description: 'Create incoming' },
//     { code: 'incoming.forward',       description: 'Forward incoming' },
//     { code: 'incoming.assign',        description: 'Assign incoming distribution' },
//     { code: 'incoming.updateStatus',  description: 'Update incoming distribution status/notes' },

//     // Outgoing
//     { code: 'outgoing.read',          description: 'Read outgoing' },
//     { code: 'outgoing.create',        description: 'Create outgoing' },
//     { code: 'outgoing.markDelivered', description: 'Mark outgoing delivered' },

//     // Files
//     { code: 'files.read',             description: 'List/read document files' },
//     { code: 'files.upload',           description: 'Upload document files' },
//     { code: 'files.delete',           description: 'Delete document files' },

//     // Departments
//     { code: 'departments.read',       description: 'Read departments' },
//     { code: 'departments.create',     description: 'Create departments' },
//     { code: 'departments.updateStatus', description: 'Update/toggle department status' },

//     // Users
//     { code: 'users.read',             description: 'Read users' },
//     { code: 'users.manage',           description: 'Create/modify users & reset passwords' }, // NEW

//     // Audit
//     { code: 'audit.read',             description: 'Read audit trail' },
//   ];

//   await prisma.permission.createMany({
//     data: [...legacy, ...granular],
//     skipDuplicates: true,
//   });

//   // اربط كل الصلاحيات بدور ADMIN
//   const adminRole = await prisma.role.findFirst({ where: { roleName: 'ADMIN' } });
//   if (adminRole) {
//     const allPerms = await prisma.permission.findMany();
//     for (const p of allPerms) {
//       await prisma.rolePermission.upsert({
//         where: { roleId_permissionId: { roleId: adminRole.id, permissionId: p.id } },
//         update: {},
//         create: { roleId: adminRole.id, permissionId: p.id },
//       });
//     }
//   }
// }


// async function ensureViewerRoles() {
//   const viewerIncoming = { roleName: 'ViewerIncoming', description: 'View-only Incoming' };
//   const viewerOutgoing = { roleName: 'ViewerOutgoing', description: 'View-only Outgoing' };

//   for (const r of [viewerIncoming, viewerOutgoing]) {
//     await prisma.role.upsert({
//       where: { roleName: r.roleName },
//       update: { description: r.description ?? undefined, isSystem: false },
//       create: { roleName: r.roleName, description: r.description, isSystem: false },
//     });
//   }

//   const [roleIn, roleOut] = await Promise.all([
//     prisma.role.findFirst({ where: { roleName: viewerIncoming.roleName } }),
//     prisma.role.findFirst({ where: { roleName: viewerOutgoing.roleName } }),
//   ]);

//   if (!roleIn || !roleOut) return;

//   const wantedIn  = ['incoming.read', 'files.read'];
//   const wantedOut = ['outgoing.read', 'files.read'];

//   const perms = await prisma.permission.findMany({
//     where: { code: { in: [...wantedIn, ...wantedOut] } },
//     select: { id: true, code: true },
//   });
//   const map = new Map(perms.map((p) => [p.code, p.id]));

//   await prisma.$transaction([
//     prisma.rolePermission.deleteMany({ where: { roleId: roleIn.id } }),
//     prisma.rolePermission.deleteMany({ where: { roleId: roleOut.id } }),
//     ...wantedIn
//       .filter((c) => map.has(c))
//       .map((c) =>
//         prisma.rolePermission.create({
//           data: { roleId: roleIn.id, permissionId: map.get(c)! },
//         }),
//       ),
//     ...wantedOut
//       .filter((c) => map.has(c))
//       .map((c) =>
//         prisma.rolePermission.create({
//           data: { roleId: roleOut.id, permissionId: map.get(c)! },
//         }),
//       ),
//   ]);
// }



// async function ensureRootDepartment() {
//   const existing = await prisma.department.findFirst({ where: { name: 'Administration' } });
//   if (!existing) {
//     await prisma.department.create({
//       data: { name: 'Administration', status: 'Active' },
//     });
//   }
// }

// async function ensureAdminUser() {
//   const username = 'admin';
//   const passwordPlain = process.env.SEED_ADMIN_PASSWORD || 'admin123';
//   const passwordHash = await bcrypt.hash(passwordPlain, 12);

//   const dept = await prisma.department.findFirst({ where: { name: 'Administration' } });
//   const adminRole = await prisma.role.findFirst({ where: { roleName: 'ADMIN' } });
//   const userRole  = await prisma.role.findFirst({ where: { roleName: 'USER' } });

//   let user = await prisma.user.findUnique({ where: { username } });
//   if (!user) {
//     user = await prisma.user.create({
//       data: {
//         fullName: 'System Administrator',
//         username,
//         email: 'admin@example.com',
//         passwordHash,
//         isActive: true,
//         departmentId: dept?.id ?? null,
//         securityClearanceRank: 3,
//         isSystem: true, // ✅ NEW: عند الإنشاء أيضًا
//       },
//     });
//   } else {
//     await prisma.user.update({
//       where: { id: user.id },
//       data: {
//         passwordHash,
//         isActive: true,
//         departmentId: dept?.id ?? null,
//         isSystem: true, // ✅ تأكيد
//         isDeleted: false,
//         deletedAt: null,
//       },
//     });
//   }

//   if (adminRole) {
//     await prisma.userRole.upsert({
//       where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
//       update: {},
//       create: { userId: user.id, roleId: adminRole.id },
//     });
//   }
//   if (userRole) {
//     await prisma.userRole.upsert({
//       where: { userId_roleId: { userId: user.id, roleId: userRole.id } },
//       update: {},
//       create: { userId: user.id, roleId: userRole.id },
//     });
//   }
// }

// async function main() {
//   await ensureSecurityLevels();
//   await ensureDocumentTypes();
//   await ensureRoles();
//   await ensurePermissions();
//   await ensureViewerRoles();
//   await ensureRootDepartment();
//   await ensureExtraDepartments();
//   await ensureAdminUser();

//   console.log('✅ Seed completed');
// }

// main()
//   .then(async () => { await prisma.$disconnect(); })
//   .catch(async (e) => {
//     console.error(e);
//     await prisma.$disconnect();
//     process.exit(1);
//   });


