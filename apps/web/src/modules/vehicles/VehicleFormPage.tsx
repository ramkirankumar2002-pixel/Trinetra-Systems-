import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import {
  createVehicle,
  getVehicle,
  listSuppliers,
  setVehicleActive,
  updateVehicle,
  type PublicSupplier,
  type PublicVehicle,
} from "./api.ts";

export function VehicleFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = hasPermission(user, "vehicle.manage");
  const [vehicle, setVehicle] = useState<PublicVehicle | null>(null);
  const [suppliers, setSuppliers] = useState<PublicSupplier[]>([]);
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listSuppliers().then((result) => setSuppliers(result.items)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!id) {
      return;
    }

    void getVehicle(id)
      .then((result) => {
        setVehicle(result.vehicle);
        setRegistrationNumber(result.vehicle.displayRegistrationNumber);
        setVehicleType(result.vehicle.vehicleType ?? "");
        setTransporterName(result.vehicle.transporterName ?? "");
        setSupplierId(result.vehicle.supplier?.id ?? "");
        setNotes(result.vehicle.notes ?? "");
      })
      .catch((caught: unknown) => {
        setError(isApiError(caught) ? caught.message : "Unable to load vehicle");
      });
  }, [id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      registrationNumber,
      displayRegistrationNumber: registrationNumber,
      vehicleType,
      transporterName,
      supplierId: supplierId === "" ? undefined : supplierId,
      notes,
    };

    try {
      const result = id ? await updateVehicle(id, payload) : await createVehicle(payload);
      navigate(`/vehicles/${result.vehicle.id}`);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to save vehicle");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(): Promise<void> {
    if (!id || !vehicle) {
      return;
    }

    try {
      const result = await setVehicleActive(id, !vehicle.isActive);
      setVehicle(result.vehicle);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to update vehicle status");
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">{id ? "Vehicle details" : "New vehicle"}</p>
          <h1>{id ? registrationNumber || "Vehicle" : "Register vehicle"}</h1>
        </div>
        {id && canManage && vehicle ? (
          <button type="button" className="ghost-button" onClick={() => void handleToggle()}>
            {vehicle.isActive ? "Deactivate" : "Activate"}
          </button>
        ) : null}
      </header>

      <form className="panel-form" onSubmit={(event) => void handleSubmit(event)}>
        {error ? <p className="form-error">{error}</p> : null}
        <label htmlFor="registrationNumber">Vehicle number</label>
        <input
          id="registrationNumber"
          value={registrationNumber}
          onChange={(event) => setRegistrationNumber(event.target.value)}
          required
          disabled={!canManage}
        />
        <label htmlFor="vehicleType">Vehicle type</label>
        <input
          id="vehicleType"
          value={vehicleType}
          onChange={(event) => setVehicleType(event.target.value)}
          disabled={!canManage}
        />
        <label htmlFor="transporterName">Transporter</label>
        <input
          id="transporterName"
          value={transporterName}
          onChange={(event) => setTransporterName(event.target.value)}
          disabled={!canManage}
        />
        <label htmlFor="supplierId">Supplier</label>
        <select
          id="supplierId"
          value={supplierId}
          onChange={(event) => setSupplierId(event.target.value)}
          disabled={!canManage}
        >
          <option value="">Not assigned</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
        <label htmlFor="notes">Notes</label>
        <textarea
          id="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          disabled={!canManage}
        />
        {canManage ? (
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : id ? "Save changes" : "Register vehicle"}
          </button>
        ) : (
          <p className="login-note">You can view this vehicle but cannot change it.</p>
        )}
      </form>
    </main>
  );
}
