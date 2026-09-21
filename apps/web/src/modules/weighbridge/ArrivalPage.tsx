import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import {
  confirmIdentification,
  correctDetection,
  detectionFrameUrl,
  confidenceLabel,
  getCameraStatus,
  listCameras,
  manualIdentify,
  recognizeCamera,
  sourceBadge,
  type PublicCamera,
  type PublicIdentification,
} from "../cameras/api.ts";
import { createVehicle, type PublicVehicle } from "../vehicles/api.ts";
import { listWeighbridges, type PublicWeighbridge } from "./api.ts";
import { LiveWeightPanel } from "./LiveWeightPanel.tsx";
import { OfflineBanner } from "../sync/OfflineBanner.tsx";

const SCENARIOS = [
  { id: "HIGH_KNOWN", label: "High confidence — known vehicle" },
  { id: "MEDIUM_KNOWN", label: "Medium confidence — known vehicle" },
  { id: "LOW", label: "Low confidence" },
  { id: "UNKNOWN", label: "Unknown vehicle" },
  { id: "NO_PLATE", label: "No plate detected" },
  { id: "MULTI_CANDIDATE", label: "Multiple candidates" },
] as const;

export function ArrivalPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [weighbridges, setWeighbridges] = useState<PublicWeighbridge[]>([]);
  const [cameras, setCameras] = useState<PublicCamera[]>([]);
  const [weighbridgeId, setWeighbridgeId] = useState(searchParams.get("weighbridgeId") ?? "");
  const [cameraId, setCameraId] = useState("");
  const [camera, setCamera] = useState<PublicCamera | null>(null);
  const [anprStatus, setAnprStatus] = useState<string>("UNAVAILABLE");
  const [scenario, setScenario] = useState("HIGH_KNOWN");
  const [identification, setIdentification] = useState<PublicIdentification | null>(null);
  const [correctionPlate, setCorrectionPlate] = useState("");
  const [manualPlate, setManualPlate] = useState("");
  const [showCorrect, setShowCorrect] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [vehicleType, setVehicleType] = useState("Truck");
  const [transporterName, setTransporterName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([listWeighbridges(), listCameras()]).then(([wb, cam]) => {
      setWeighbridges(wb.items);
      setCameras(cam.items);
      const nextWeighbridge = weighbridgeId === "" ? wb.items[0]?.id ?? "" : weighbridgeId;
      setWeighbridgeId(nextWeighbridge);
      const entry = cam.items.find((item) => item.weighbridgeId === nextWeighbridge && item.purpose === "ENTRY_ANPR");
      setCameraId(entry?.id ?? "");
    });
  }, [weighbridgeId]);

  useEffect(() => {
    if (cameraId === "") {
      setCamera(null);
      return;
    }
    void getCameraStatus(cameraId)
      .then((result) => {
        setCamera(result.camera);
        setAnprStatus(result.anpr.status);
        setScenario(result.camera.simulatorScenario);
      })
      .catch((caught: unknown) => {
        setError(isApiError(caught) ? caught.message : "Unable to load camera");
      });
  }, [cameraId]);

  const siteCameras = cameras.filter((item) => item.weighbridgeId === weighbridgeId);
  const vehicle: PublicVehicle | null = identification?.vehicle ?? null;
  const detection = identification?.detection ?? null;

  async function run<T>(action: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Vehicle identification failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleCapture(): Promise<void> {
    if (cameraId === "") {
      setError("Select an entry camera first");
      return;
    }
    const result = await run(() => recognizeCamera(cameraId, scenario));
    if (result) {
      setIdentification(result.identification);
      setCorrectionPlate(result.identification.detection.displayPlate ?? "");
      setShowCorrect(false);
      setShowManual(result.identification.decision.action === "MANUAL_REQUIRED");
    }
  }

  async function handleCorrect(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!detection) {
      return;
    }
    const result = await run(() => correctDetection(cameraId, detection.id, correctionPlate, "Operator correction"));
    if (result) {
      setIdentification(result.identification);
      setShowCorrect(false);
    }
  }

  async function handleManual(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (cameraId === "") {
      setError("Select an entry camera first");
      return;
    }
    const result = await run(() => manualIdentify(cameraId, manualPlate));
    if (result) {
      setIdentification(result.identification);
      setShowManual(false);
    }
  }

  async function handleRegister(): Promise<void> {
    const plate = detection?.correctedPlate ?? detection?.displayPlate ?? manualPlate;
    const result = await run(() =>
      createVehicle({
        registrationNumber: plate,
        displayRegistrationNumber: plate,
        vehicleType,
        transporterName,
      }),
    );
    if (result && detection) {
      const refreshed = await run(() =>
        detection.source === "MANUAL"
          ? manualIdentify(cameraId, plate)
          : correctDetection(cameraId, detection.id, plate),
      );
      if (refreshed) {
        setIdentification(refreshed.identification);
      }
    }
  }

  async function handleConfirm(): Promise<void> {
    if (!detection || !vehicle) {
      setError("Confirm a registered vehicle first");
      return;
    }
    const result = await run(() => confirmIdentification(cameraId, detection.id, vehicle.id));
    if (result?.identification.detection.transactionId) {
      navigate(`/transactions/${result.identification.detection.transactionId}`);
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Entry vehicle identification</p>
          <h1>Identify vehicle</h1>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      <OfflineBanner />

      <section className="identity-card">
        <label htmlFor="weighbridgeId">Weighbridge</label>
        <select
          id="weighbridgeId"
          value={weighbridgeId}
          onChange={(event) => {
            setWeighbridgeId(event.target.value);
            setIdentification(null);
          }}
        >
          {weighbridges.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} — {item.site.name}
            </option>
          ))}
        </select>

        <label htmlFor="cameraId">Camera</label>
        <select
          id="cameraId"
          value={cameraId}
          onChange={(event) => {
            setCameraId(event.target.value);
            setIdentification(null);
          }}
        >
          {siteCameras.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>

        {camera ? (
          <div className="camera-status-row">
            <strong>{camera.name}</strong>
            <span className={`status-dot ${camera.status === "CONNECTED" ? "connected" : "offline"}`} />
            <StatusPill value={camera.status} />
            <StatusPill value={`ANPR ${anprStatus}`} />
            {camera.simulated ? <StatusPill value="SIMULATED" /> : null}
          </div>
        ) : (
          <p className="login-note">No entry camera is configured for this weighbridge.</p>
        )}

        <LiveWeightPanel weighbridgeId={weighbridgeId || null} />

        {camera?.simulated ? (
          <>
            <label htmlFor="scenario">Demo scenario</label>
            <select id="scenario" value={scenario} onChange={(event) => setScenario(event.target.value)}>
              {SCENARIOS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </>
        ) : null}

        <div className="button-row">
          <button type="button" onClick={() => void handleCapture()} disabled={busy || cameraId === ""}>
            Capture and detect
          </button>
          <button type="button" className="ghost-button" onClick={() => setShowManual(true)} disabled={busy}>
            Manual entry
          </button>
        </div>
      </section>

      {detection ? (
        <section className="identity-card anpr-result-card">
          <p className="login-kicker">Latest frame</p>
          {detection.imageStorageKey ? (
            <div className="anpr-frame">
              <img src={detectionFrameUrl(cameraId, detection.id)} alt="ANPR evidence frame" />
            </div>
          ) : (
            <div className="anpr-frame">
              <span>No camera frame — {sourceBadge(detection.source, detection.simulated)}</span>
            </div>
          )}
          <p className="anpr-plate">{detection.displayPlate ?? detection.correctedPlate ?? "NO PLATE"}</p>
          <p>
            <span>Confidence</span>
            {confidenceLabel(detection.confidence)} · {detection.confidenceBand}
          </p>
          <p>
            <span>Source</span>
            {sourceBadge(detection.source, detection.simulated)} · {detection.provider}
          </p>
          <p>
            <span>Captured</span>
            {formatDateTime(detection.capturedAt)}
          </p>
          {identification ? <p className="login-note">{identification.decision.message}</p> : null}
          {detection.candidates.length > 1 ? (
            <div className="candidate-list">
              {detection.candidates.map((candidate) => (
                <button
                  key={candidate.normalizedPlateNumber}
                  type="button"
                  className="ghost-button"
                  disabled={busy}
                  onClick={() => {
                    setCorrectionPlate(candidate.plateNumber);
                    setShowCorrect(true);
                  }}
                >
                  {candidate.plateNumber} · {confidenceLabel(candidate.confidence)}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {identification && vehicle ? (
        <section className="identity-card">
          <p>
            <span>Vehicle found</span>
            {vehicle.displayRegistrationNumber}
          </p>
          <p>
            <span>Type</span>
            {vehicle.vehicleType ?? "Not set"}
          </p>
          <p>
            <span>Transporter</span>
            {vehicle.transporterName ?? "Not set"}
          </p>
          <p>
            <span>Status</span>
            {vehicle.isActive ? "Active" : "Inactive"}
          </p>
          {identification.recentTransactions.length > 0 ? (
            <p>
              <span>Recent visits</span>
              {identification.recentTransactions
                .map((item) => `${item.referenceNumber} (${item.status})`)
                .join(" · ")}
            </p>
          ) : null}
          <div className="button-row">
            <button type="button" onClick={() => void handleConfirm()} disabled={busy || !vehicle.isActive}>
              Confirm vehicle
            </button>
            <button type="button" className="ghost-button" onClick={() => setShowCorrect(true)} disabled={busy}>
              Correct number
            </button>
          </div>
        </section>
      ) : null}

      {identification && !vehicle && detection && detection.normalizedPlate ? (
        <section className="panel-form">
          <h2>Vehicle not registered</h2>
          <p className="login-note">ANPR will not create a vehicle automatically.</p>
          <label htmlFor="vehicleType">Vehicle type</label>
          <input id="vehicleType" value={vehicleType} onChange={(event) => setVehicleType(event.target.value)} />
          <label htmlFor="transporterName">Transporter</label>
          <input
            id="transporterName"
            value={transporterName}
            onChange={(event) => setTransporterName(event.target.value)}
          />
          <div className="button-row">
            <button type="button" onClick={() => void handleRegister()} disabled={busy}>
              Register vehicle
            </button>
            <button type="button" className="ghost-button" onClick={() => setShowCorrect(true)} disabled={busy}>
              Correct number
            </button>
          </div>
        </section>
      ) : null}

      {showCorrect && detection ? (
        <form className="panel-form" onSubmit={(event) => void handleCorrect(event)}>
          <h2>Correct detected number</h2>
          <p className="login-note">Original ANPR result is kept: {detection.rawPlate ?? "none"}</p>
          <label htmlFor="correctionPlate">Corrected vehicle number</label>
          <input
            id="correctionPlate"
            value={correctionPlate}
            onChange={(event) => setCorrectionPlate(event.target.value)}
            required
          />
          <button type="submit" disabled={busy}>
            Apply correction
          </button>
        </form>
      ) : null}

      {showManual ? (
        <form className="panel-form" onSubmit={(event) => void handleManual(event)}>
          <h2>Manual vehicle number</h2>
          <p className="login-note">This is operator entry, not ANPR detection.</p>
          <label htmlFor="manualPlate">Vehicle number</label>
          <input id="manualPlate" value={manualPlate} onChange={(event) => setManualPlate(event.target.value)} required />
          <button type="submit" disabled={busy}>
            Search vehicle
          </button>
        </form>
      ) : null}
    </main>
  );
}
