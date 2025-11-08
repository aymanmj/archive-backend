export type Permission =
  | 'incoming.read'
  | 'incoming.create'
  | 'incoming.update'
  | 'incoming.assign'
  | 'incoming.upload'
  | 'outgoing.read'
  | 'outgoing.create'
  | 'outgoing.update'
  | 'outgoing.deliver'
  | 'departments.read'
  | 'departments.manage'
  | 'dashboard.read';

export const RolePermissions: Record<string, Permission[]> = {
  ADMIN: [
    'dashboard.read',
    'incoming.read','incoming.create','incoming.update','incoming.assign','incoming.upload',
    'outgoing.read','outgoing.create','outgoing.update','outgoing.deliver',
    'departments.read','departments.manage',
  ],
  MANAGER: [
    'dashboard.read',
    'incoming.read','incoming.create','incoming.update','incoming.assign','incoming.upload',
    'outgoing.read','outgoing.create','outgoing.update','outgoing.deliver',
    'departments.read',
  ],
  CLERK: [
    'dashboard.read',
    'incoming.read','incoming.create','incoming.upload',
    'outgoing.read','outgoing.create',
    'departments.read',
  ],
};
