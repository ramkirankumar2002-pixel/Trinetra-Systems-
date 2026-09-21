import type { AuthenticatedUser, PublicUser } from "./types.js";

type UserRecord = {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  organizationId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
    kind: "DEMO" | "CUSTOMER";
  };
  defaultDepartment: {
    id: string;
    code: string;
    name: string;
  } | null;
  defaultSite: {
    id: string;
    code: string;
    name: string;
    status?: "ACTIVE" | "INACTIVE";
    timezone?: string;
  } | null;
  userRoles: Array<{
    role: {
      id: string;
      code: string;
      name: string;
      rolePermissions: Array<{
        permission: {
          code: string;
        };
      }>;
    };
    site: {
      id: string;
      code: string;
      name: string;
      status?: "ACTIVE" | "INACTIVE";
      timezone?: string;
    } | null;
    weighbridge: {
      id: string;
      code: string;
      name: string;
    } | null;
  }>;
};

export function toPublicUser(user: UserRecord): PublicUser {
  const permissions = new Set<string>();
  const roles = user.userRoles.map((assignment) => {
    for (const rolePermission of assignment.role.rolePermissions) {
      permissions.add(rolePermission.permission.code);
    }

    return {
      id: assignment.role.id,
      code: assignment.role.code,
      name: assignment.role.name,
      site: assignment.site,
      weighbridge: assignment.weighbridge,
    };
  });

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    isActive: user.isActive,
    organization: user.organization,
    defaultDepartment: user.defaultDepartment,
    defaultSite: user.defaultSite,
    roles,
    permissions: [...permissions].sort(),
  };
}

export function toAuthenticatedUser(user: UserRecord, sessionId: string): AuthenticatedUser {
  return {
    ...toPublicUser(user),
    organizationId: user.organizationId,
    sessionId,
  };
}

export const userAuthInclude = {
  organization: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      kind: true,
    },
  },
  defaultDepartment: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  defaultSite: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      timezone: true,
    },
  },
  userRoles: {
    include: {
      role: {
        include: {
          rolePermissions: {
            include: {
              permission: {
                select: {
                  code: true,
                },
              },
            },
          },
        },
      },
      site: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          timezone: true,
        },
      },
      weighbridge: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  },
} as const;
