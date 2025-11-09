// src/auth/permissions.constants.ts

export type PermissionCode =
  | 'incoming.read' | 'incoming.create' | 'incoming.forward' | 'incoming.assign' | 'incoming.updateStatus'
  | 'outgoing.read' | 'outgoing.create' | 'outgoing.markDelivered'
  | 'files.read'    | 'files.upload'    | 'files.delete'
  | 'departments.read' | 'departments.create' | 'departments.updateStatus'
  | 'users.read'  | 'users.manage'
  | 'admin.rbac'
  | 'audit.read';

export const PERMISSIONS = {
  INCOMING_READ: 'incoming.read',
  INCOMING_CREATE: 'incoming.create',
  INCOMING_FORWARD: 'incoming.forward',
  INCOMING_ASSIGN: 'incoming.assign',
  INCOMING_UPDATE_STATUS: 'incoming.updateStatus',

  OUTGOING_READ: 'outgoing.read',
  OUTGOING_CREATE: 'outgoing.create',
  OUTGOING_MARK_DELIVERED: 'outgoing.markDelivered',

  FILES_READ: 'files.read',
  FILES_UPLOAD: 'files.upload',
  FILES_DELETE: 'files.delete',

  DEPARTMENTS_READ: 'departments.read',
  DEPARTMENTS_CREATE: 'departments.create',
  DEPARTMENTS_UPDATE_STATUS: 'departments.updateStatus',

  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',

   // لو كنت تستعمل هذه الصلاحية في الحماية (last admin check) فهي موجودة في DB لديك
  ADMIN_RBAC: 'admin.rbac',

  AUDIT_READ: 'audit.read',
} as const;



// // src/auth/permissions.constants.ts

// export type PermissionCode =
//   | 'incoming.read' | 'incoming.create' | 'incoming.forward' | 'incoming.assign' | 'incoming.updateStatus'
//   | 'outgoing.read' | 'outgoing.create' | 'outgoing.markDelivered'
//   | 'files.read'    | 'files.upload'    | 'files.delete'
//   | 'departments.read' | 'departments.create' | 'departments.updateStatus'
//   | 'users.read'
//   | 'audit.read';

// export const PERMISSIONS: Record<string, PermissionCode> = {
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

//   AUDIT_READ: 'audit.read',
// };
