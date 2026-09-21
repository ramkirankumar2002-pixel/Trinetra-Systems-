import { apiRequest } from "../../shared/api/client.ts";

export type PublicSupplier = {
  id: string;
  name: string;
  code: string | null;
};

export type PublicVehicle = {
  id: string;
  registrationNumber: string;
  displayRegistrationNumber: string;
  vehicleType: string | null;
  transporterName: string | null;
  supplier: PublicSupplier | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type VehicleListResponse = {
  items: PublicVehicle[];
  page: number;
  pageSize: number;
  total: number;
};

export type VehicleWritePayload = {
  registrationNumber: string;
  displayRegistrationNumber?: string;
  vehicleType?: string;
  transporterName?: string;
  supplierId?: string;
  notes?: string;
};

export function listVehicles(search: URLSearchParams): Promise<VehicleListResponse> {
  return apiRequest<VehicleListResponse>(`/api/v1/vehicles?${search.toString()}`);
}

export function lookupVehicle(registration: string): Promise<{ vehicle: PublicVehicle | null }> {
  const params = new URLSearchParams({ registration });
  return apiRequest<{ vehicle: PublicVehicle | null }>(`/api/v1/vehicles/lookup?${params.toString()}`);
}

export function getVehicle(id: string): Promise<{ vehicle: PublicVehicle }> {
  return apiRequest<{ vehicle: PublicVehicle }>(`/api/v1/vehicles/${id}`);
}

export function createVehicle(payload: VehicleWritePayload): Promise<{ vehicle: PublicVehicle }> {
  return apiRequest<{ vehicle: PublicVehicle }>("/api/v1/vehicles", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateVehicle(id: string, payload: Partial<VehicleWritePayload>): Promise<{ vehicle: PublicVehicle }> {
  return apiRequest<{ vehicle: PublicVehicle }>(`/api/v1/vehicles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function setVehicleActive(id: string, isActive: boolean): Promise<{ vehicle: PublicVehicle }> {
  return apiRequest<{ vehicle: PublicVehicle }>(`/api/v1/vehicles/${id}/${isActive ? "activate" : "deactivate"}`, {
    method: "POST",
  });
}

export function listSuppliers(): Promise<{ items: PublicSupplier[] }> {
  return apiRequest<{ items: PublicSupplier[] }>("/api/v1/suppliers");
}
