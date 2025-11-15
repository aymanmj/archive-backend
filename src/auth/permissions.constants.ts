// src/auth/permissions.constants.ts

export type PermissionCode =
  | 'incoming.read'
  | 'incoming.create'
  | 'incoming.forward'
  | 'incoming.assign'
  | 'incoming.updateStatus'
  | 'outgoing.read'
  | 'outgoing.create'
  | 'outgoing.markDelivered'
  | 'outgoing.updateStatus'
  | 'outgoing.send'
  | 'files.read'
  | 'files.upload'
  | 'files.delete'
  | 'departments.read'
  | 'departments.create'
  | 'departments.updateStatus'
  | 'users.read'
  | 'users.manage'
  | 'roles.read'
  | 'roles.manage'
  | 'admin.rbac'
  | 'rbac.manage'
  | 'audit.read'
  | 'dashboard.read';

export const PERMISSIONS = {
  // Incoming
  INCOMING_READ: 'incoming.read',
  INCOMING_CREATE: 'incoming.create',
  INCOMING_FORWARD: 'incoming.forward',
  INCOMING_ASSIGN: 'incoming.assign',
  INCOMING_UPDATE_STATUS: 'incoming.updateStatus',

  // Outgoing
  OUTGOING_READ: 'outgoing.read',
  OUTGOING_CREATE: 'outgoing.create',
  OUTGOING_SEND: 'outgoing.send',
  OUTGOING_MARK_DELIVERED: 'outgoing.markDelivered',
  OUTGOING_UPDATE_STATUS: 'outgoing.updateStatus',

  // Files
  FILES_READ: 'files.read',
  FILES_UPLOAD: 'files.upload',
  FILES_DELETE: 'files.delete',

  // Departments
  DEPARTMENTS_READ: 'departments.read',
  DEPARTMENTS_CREATE: 'departments.create',
  DEPARTMENTS_UPDATE_STATUS: 'departments.updateStatus',

  // Users / RBAC
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  ROLES_READ: 'roles.read',
  ROLES_MANAGE: 'roles.manage',

  // Audit / Dashboard
  AUDIT_READ: 'audit.read',
  DASHBOARD_READ: 'dashboard.read',

  RBAC_MANAGE: 'rbac.manage',
  ADMIN_RBAC: 'rbac.manage',
} as const;

// // src/auth/permissions.constants.ts

// export type PermissionCode =
//   | 'incoming.read' | 'incoming.create' | 'incoming.forward' | 'incoming.assign' | 'incoming.updateStatus'
//   | 'outgoing.read' | 'outgoing.create' | 'outgoing.markDelivered'
//   | 'files.read'    | 'files.upload'    | 'files.delete'
//   | 'departments.read' | 'departments.create' | 'departments.updateStatus'
//   | 'users.read'  | 'users.manage'
//   | 'admin.rbac'
//   | 'audit.read';

// export const PERMISSIONS = {
//   INCOMING_READ: 'incoming.read',
//   INCOMING_CREATE: 'incoming.create',
//   INCOMING_FORWARD: 'incoming.forward',
//   INCOMING_ASSIGN: 'incoming.assign',
//   INCOMING_UPDATE_STATUS: 'incoming.updateStatus',

//   OUTGOING_READ: 'outgoing.read',
//   OUTGOING_CREATE: 'outgoing.create',
//   OUTGOING_MARK_DELIVERED: 'outgoing.markDelivered',

//   FILES_READ: 'files.read',
//   FILES_UPLOAD: 'files.upload',
//   FILES_DELETE: 'files.delete',

//   DEPARTMENTS_READ: 'departments.read',
//   DEPARTMENTS_CREATE: 'departments.create',
//   DEPARTMENTS_UPDATE_STATUS: 'departments.updateStatus',

//   USERS_READ: 'users.read',
//   USERS_MANAGE: 'users.manage',

//    // لو كنت تستعمل هذه الصلاحية في الحماية (last admin check) فهي موجودة في DB لديك
//   ADMIN_RBAC: 'admin.rbac',

//   AUDIT_READ: 'audit.read',
// } as const;
