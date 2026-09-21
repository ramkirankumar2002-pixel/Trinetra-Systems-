export const ROLE_APPROVAL_DEPARTMENTS: Record<string, string[]> = {
  STORE_OFFICER: ["STORE"],
  SUPERVISOR: ["SUPERVISOR"],
  LAB_USER: ["LAB"],
};

export const DEPARTMENT_REQUESTED_ROLES: Record<string, string> = {
  STORE: "STORE_OFFICER",
  SUPERVISOR: "SUPERVISOR",
  LAB: "LAB_USER",
};

export type ApprovalEligibilityInput = {
  userId: string;
  isAdmin: boolean;
  hasDecidePermission: boolean;
  departmentId: string | null;
  departmentCode: string | null;
  roleCodes: string[];
  approvalDepartmentId: string;
  approvalDepartmentCode: string;
  assignedUserId: string | null;
};

export function eligibleDepartmentCodes(roleCodes: string[], departmentCode: string | null): string[] {
  const codes = new Set<string>();
  if (departmentCode) {
    codes.add(departmentCode);
  }
  for (const role of roleCodes) {
    for (const department of ROLE_APPROVAL_DEPARTMENTS[role] ?? []) {
      codes.add(department);
    }
  }
  return [...codes];
}

export function canDecideApproval(input: ApprovalEligibilityInput): boolean {
  if (!input.hasDecidePermission) {
    return false;
  }
  if (input.isAdmin) {
    return true;
  }
  if (input.assignedUserId !== null && input.assignedUserId === input.userId) {
    return true;
  }
  if (input.departmentId !== null && input.departmentId === input.approvalDepartmentId) {
    return true;
  }
  return eligibleDepartmentCodes(input.roleCodes, input.departmentCode).includes(input.approvalDepartmentCode);
}

export function approvalEligibilityFromUser(user: {
  id: string;
  permissions: string[];
  defaultDepartment: { id: string; code: string } | null;
  roles: Array<{ code: string }>;
}): Omit<ApprovalEligibilityInput, "approvalDepartmentId" | "approvalDepartmentCode" | "assignedUserId"> {
  return {
    userId: user.id,
    isAdmin: user.roles.some((role) => role.code === "ADMIN"),
    hasDecidePermission: user.permissions.includes("approval.decide"),
    departmentId: user.defaultDepartment?.id ?? null,
    departmentCode: user.defaultDepartment?.code ?? null,
    roleCodes: user.roles.map((role) => role.code),
  };
}
