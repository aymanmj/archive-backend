// src/auth/permissions.decorator.ts
import { SetMetadata } from '@nestjs/common';
import type { PermissionCode } from './permissions.constants';

export const PERMISSIONS_KEY = 'required_permissions';
export const RequirePermissions = (...perms: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);



// import { SetMetadata } from '@nestjs/common';
// export const PERMISSIONS_KEY = 'route_permissions';
// export const Permissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);
