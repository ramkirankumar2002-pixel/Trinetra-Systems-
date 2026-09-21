import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { createTicket } from "./api.ts";

const CATEGORIES = [
  "WEIGHBRIDGE",
  "DEVICE",
  "GATEWAY",
  "ANPR",
  "DOCUMENT_SCANNER",
  "SOFTWARE",
  "NETWORK",
  "OFFLINE_SYNC",
  "USER_ACCESS",
  "TRANSACTION",
  "REPORTING",
  "OTHER",
];

export function TicketCreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const defaultSiteId = user?.defaultSite?.id ?? params.get("siteId") ?? "";
  const [siteId, setSiteId] = useState(defaultSiteId);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(params.get("category") ?? "OTHER");
  const [priority, setPriority] = useState("MEDIUM");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const weighbridgeId = params.get("weighbridgeId") ?? "";
  const gatewayId = params.get("gatewayId") ?? "";
  const deviceId = params.get("deviceId") ?? "";
  const operationalAlertId = params.get("operationalAlertId") ?? "";
  const contextNote = useMemo(() => {
    return [weighbridgeId && "Weighbridge attached", gatewayId && "Gateway attached", deviceId && "Device attached"]
      .filter(Boolean)
      .join(" · ");
  }, [deviceId, gatewayId, weighbridgeId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await createTicket({
        siteId,
        subject,
        description,
        category,
        priority,
        ...(weighbridgeId ? { weighbridgeId } : {}),
        ...(gatewayId ? { gatewayId } : {}),
        ...(deviceId ? { deviceId } : {}),
        ...(operationalAlertId ? { operationalAlertId } : {}),
      });
      navigate(`/support/tickets/${result.ticket.id}`);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to create ticket");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Support</p>
          <h1>Create ticket</h1>
        </div>
      </header>

      <form className="panel-form" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          Site
          <input value={siteId} onChange={(event) => setSiteId(event.target.value)} required />
        </label>
        <label>
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select value={priority} onChange={(event) => setPriority(event.target.value)}>
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Subject
          <input value={subject} onChange={(event) => setSubject(event.target.value)} required maxLength={200} />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} required rows={6} />
        </label>
        {contextNote ? <p className="login-note">{contextNote}. Device selection is limited to your organization and site.</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" disabled={busy || siteId === ""}>
          Submit ticket
        </button>
      </form>
    </main>
  );
}
