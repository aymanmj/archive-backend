export class CreateRoleDto {
  roleName!: string;
  description?: string;
}
export class UpdateRoleDto {
  roleName?: string;
  description?: string;
}
export class SetRolePermissionsDto {
  permissions!: string[]; // codes
}
export class SetUserRolesDto {
  roleIds!: number[];
}
