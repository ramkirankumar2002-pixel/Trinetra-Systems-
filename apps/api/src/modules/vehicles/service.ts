import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { parsePagination } from "../../domain/pagination.js";
import { normalizeRegistrationNumber } from "../../domain/vehicleNumber.js";
import { HttpError } from "../../lib/httpError.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { toPublicVehicle, vehicleInclude, type PublicVehicle } from "./mapper.js";
import type { VehicleWriteInput } from "./validators.js";

export async function listVehicles(
  actor: ActorContext,
  query: Record<string, unknown>,
): Promise<{ items: PublicVehicle[]; page: number; pageSize: number; total: number }> {
  const pagination = parsePagination(query);
  const includeInactive = query.includeInactive === "true";
  const registration = typeof query.q === "string" ? normalizeRegistrationNumber(query.q) : "";
  const transporter = typeof query.transporter === "string" ? query.transporter.trim() : "";
  const supplier = typeof query.supplier === "string" ? query.supplier.trim() : "";

  const where: Prisma.VehicleWhereInput = {
    organizationId: actor.user.organizationId,
  };

  if (!includeInactive) {
    where.deletedAt = null;
  }

  if (registration !== "") {
    where.OR = [
      { registrationNumber: { contains: registration } },
      { displayRegistrationNumber: { contains: registration, mode: "insensitive" } },
    ];
  }

  if (transporter !== "") {
    where.transporterName = { contains: transporter, mode: "insensitive" };
  }

  if (supplier !== "") {
    where.supplier = { name: { contains: supplier, mode: "insensitive" } };
  }

  const [total, rows] = await prisma.$transaction([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({
      where,
      include: vehicleInclude,
      orderBy: { updatedAt: "desc" },
      skip: pagination.skip,
      take: pagination.pageSize,
    }),
  ]);

  return {
    items: rows.map(toPublicVehicle),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
  };
}

export async function getVehicle(actor: ActorContext, id: string): Promise<PublicVehicle> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, organizationId: actor.user.organizationId },
    include: vehicleInclude,
  });

  if (!vehicle) {
    throw new HttpError(404, "Vehicle not found");
  }

  return toPublicVehicle(vehicle);
}

export async function findVehicleByRegistration(
  actor: ActorContext,
  registration: string,
): Promise<PublicVehicle | null> {
  const normalized = normalizeRegistrationNumber(registration);
  if (normalized === "") {
    return null;
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: {
      organizationId: actor.user.organizationId,
      registrationNumber: normalized,
    },
    include: vehicleInclude,
  });

  return vehicle ? toPublicVehicle(vehicle) : null;
}

export async function createVehicle(actor: ActorContext, input: VehicleWriteInput): Promise<PublicVehicle> {
  await assertSupplier(actor.user.organizationId, input.supplierId);
  await assertNoDuplicate(actor.user.organizationId, input.registrationNumber);

  const created = await prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.create({
      data: {
        organizationId: actor.user.organizationId,
        registrationNumber: input.registrationNumber,
        displayRegistrationNumber: input.displayRegistrationNumber,
        vehicleType: input.vehicleType ?? null,
        transporterName: input.transporterName ?? null,
        supplierId: input.supplierId ?? null,
        notes: input.notes ?? null,
      },
      include: vehicleInclude,
    });

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.VEHICLE_CREATED,
        entityType: "Vehicle",
        entityId: vehicle.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { registrationNumber: vehicle.registrationNumber },
      },
      tx,
    );

    return vehicle;
  });

  return toPublicVehicle(created);
}

export async function updateVehicle(
  actor: ActorContext,
  id: string,
  input: Partial<VehicleWriteInput>,
): Promise<PublicVehicle> {
  const existing = await prisma.vehicle.findFirst({
    where: { id, organizationId: actor.user.organizationId },
  });

  if (!existing) {
    throw new HttpError(404, "Vehicle not found");
  }

  if (input.registrationNumber && input.registrationNumber !== existing.registrationNumber) {
    await assertNoDuplicate(actor.user.organizationId, input.registrationNumber, existing.id);
  }

  if (input.supplierId !== undefined) {
    await assertSupplier(actor.user.organizationId, input.supplierId);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.update({
      where: { id: existing.id },
      data: {
        ...(input.registrationNumber === undefined
          ? {}
          : { registrationNumber: input.registrationNumber }),
        ...(input.displayRegistrationNumber === undefined
          ? {}
          : { displayRegistrationNumber: input.displayRegistrationNumber }),
        ...(input.vehicleType === undefined ? {} : { vehicleType: input.vehicleType }),
        ...(input.transporterName === undefined ? {} : { transporterName: input.transporterName }),
        ...(input.supplierId === undefined ? {} : { supplierId: input.supplierId }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      },
      include: vehicleInclude,
    });

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.VEHICLE_UPDATED,
        entityType: "Vehicle",
        entityId: vehicle.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
      tx,
    );

    return vehicle;
  });

  return toPublicVehicle(updated);
}

export async function setVehicleActive(
  actor: ActorContext,
  id: string,
  isActive: boolean,
): Promise<PublicVehicle> {
  const existing = await prisma.vehicle.findFirst({
    where: { id, organizationId: actor.user.organizationId },
  });

  if (!existing) {
    throw new HttpError(404, "Vehicle not found");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.update({
      where: { id: existing.id },
      data: { deletedAt: isActive ? null : new Date() },
      include: vehicleInclude,
    });

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: isActive ? AUDIT_ACTIONS.VEHICLE_ACTIVATED : AUDIT_ACTIONS.VEHICLE_DEACTIVATED,
        entityType: "Vehicle",
        entityId: vehicle.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
      tx,
    );

    return vehicle;
  });

  return toPublicVehicle(updated);
}

async function assertNoDuplicate(
  organizationId: string,
  registrationNumber: string,
  excludeId?: string,
): Promise<void> {
  const existing = await prisma.vehicle.findFirst({
    where: {
      organizationId,
      registrationNumber,
      ...(excludeId === undefined ? {} : { NOT: { id: excludeId } }),
    },
  });

  if (!existing) {
    return;
  }

  if (existing.deletedAt) {
    throw new HttpError(409, "A vehicle with this number exists and is inactive");
  }

  throw new HttpError(409, "A vehicle with this number already exists");
}

async function assertSupplier(organizationId: string, supplierId: string | undefined): Promise<void> {
  if (supplierId === undefined) {
    return;
  }

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, organizationId, deletedAt: null },
  });

  if (!supplier) {
    throw new HttpError(400, "Supplier was not found");
  }
}
