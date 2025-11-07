// src/common/auth.util.ts

export type UserContext = {
  userId: number;
  deptId: number;
  roles: string[];
};

export function extractUserContext(user: any): UserContext {
  // يدعم id أو sub / ويدعم departmentId أو user.department?.id
  const userIdRaw =
    user?.id ?? user?.sub ?? user?.userId ?? user?.user_id ?? 0;

  const deptIdRaw =
    user?.departmentId ??
    user?.deptId ??
    user?.department?.id ??
    user?.department?._id ??
    0;

  const rolesRaw =
    user?.roles ??
    user?.UserRole?.map((r: any) => r?.Role?.roleName).filter(Boolean) ??
    [];

  const userId = Number(userIdRaw) || 0;
  const deptId = Number(deptIdRaw) || 0;

  return { userId, deptId, roles: Array.isArray(rolesRaw) ? rolesRaw : [] };
}
