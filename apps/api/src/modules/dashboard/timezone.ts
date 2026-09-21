import { defaultOperationalTimezone } from "../../domain/siteDay.js";
import { prisma } from "../../db/client.js";
import type { ActorContext } from "../shared/actor.js";
import { assertRequestedSite } from "../shared/siteScope.js";

export async function resolveReportTimezone(actor: ActorContext, query: Record<string, unknown>): Promise<string> {
  const requestedSiteId = typeof query.siteId === "string" && query.siteId !== "" ? query.siteId : undefined;
  const siteId = requestedSiteId ?? actor.user.defaultSite?.id;
  if (!siteId) {
    return defaultOperationalTimezone();
  }
  if (requestedSiteId) {
    await assertRequestedSite(actor, requestedSiteId);
  }
  const site = await prisma.site.findFirst({
    where: { id: siteId, organizationId: actor.user.organizationId },
    select: { timezone: true },
  });
  return site?.timezone ?? defaultOperationalTimezone();
}
