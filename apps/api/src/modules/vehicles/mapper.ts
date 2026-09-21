import type { Prisma } from "@prisma/client";

export const vehicleInclude = {
  supplier: {
    select: {
      id: true,
      name: true,
      code: true,
    },
  },
} as const;

export type VehicleRecord = Prisma.VehicleGetPayload<{ include: typeof vehicleInclude }>;

export type PublicVehicle = {
  id: string;
  registrationNumber: string;
  displayRegistrationNumber: string;
  vehicleType: string | null;
  transporterName: string | null;
  supplier: { id: string; name: string; code: string | null } | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function toPublicVehicle(vehicle: VehicleRecord): PublicVehicle {
  return {
    id: vehicle.id,
    registrationNumber: vehicle.registrationNumber,
    displayRegistrationNumber: vehicle.displayRegistrationNumber,
    vehicleType: vehicle.vehicleType,
    transporterName: vehicle.transporterName,
    supplier: vehicle.supplier
      ? {
          id: vehicle.supplier.id,
          name: vehicle.supplier.name,
          code: vehicle.supplier.code,
        }
      : null,
    notes: vehicle.notes,
    isActive: vehicle.deletedAt === null,
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
  };
}
