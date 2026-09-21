import type { ActorContext } from "../shared/actor.js";

export function reliabilitySystemActor(organizationId: string): ActorContext {
  return {
    user: {
      id: "system:reliability",
      fullName: "Reliability scanner",
      email: "reliability@system.local",
      isActive: true,
      organization: { id: organizationId, name: "System", slug: "system" },
      defaultDepartment: null,
      defaultSite: null,
      roles: [],
      permissions: ["reliability.read", "reliability.manage"],
      organizationId,
      sessionId: "system:reliability",
    },
  };
}
