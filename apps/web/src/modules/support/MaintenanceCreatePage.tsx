import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { createMaintenance } from "./api.ts";

const TYPES = ["CORRECTIVE", "PREVENTIVE", "INSPECTION", "CALIBRATION", "COMMISSIONING", "REPAIR", "OTHER"];

export function MaintenanceCreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [siteId, setSiteId] = useState(user?.defaultSite?.id ?? params.get("siteId") ?? "");
  const [type, setType] = useState("CORRECTIVE");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [startNow, setStartNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const weighbridgeId = params.get("weighbridgeId") ?? "";
  const gatewayId = params.get("gatewayId") ?? "";
  const deviceId = params.get("deviceId") ?? "";
  const ticketId = params.get("ticketId") ?? "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await createMaintenance({
        siteId,
        type,
        reason,
        description,
        startNow,
        ...(weighbridgeId ? { weighbridgeId } : {}),
        ...(gatewayId ? { gatewayId } : {}),
        ...(deviceId ? { deviceId } : {}),
        ...(ticketId ? { ticketId } : {}),
      });
      navigate(`/maintenance/${result.maintenance.id}`);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to create maintenance");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Maintenance</p>
          <h1>Create maintenance</h1>
        </div>
      </header>

      <form className="panel-form" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          Site
          <input value={siteId} onChange={(event) => setSiteId(event.target.value)} required />
        </label>
        <label>
          Type
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {TYPES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reason
          <input value={reason} onChange={(event) => setReason(event.target.value)} required />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} required rows={5} />
        </label>
        <label>
          <input type="checkbox" checked={startNow} onChange={(event) => setStartNow(event.target.checked)} /> Start now
        </label>
        <p className="login-note">
          Linked equipment is taken from the page you started from. You cannot select another organization's devices.
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" disabled={busy || siteId === ""}>
          Submit
        </button>
      </form>
    </main>
  );
}
