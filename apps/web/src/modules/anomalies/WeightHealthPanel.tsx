import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { StatusPill } from "../../shared/ui/StatusPill.tsx";
import {
  endMaintenance,
  getAnomalyConfig,
  getWeightHealth,
  runAnomalyScenario,
  startMaintenance,
  updateAnomalyConfig,
  type PublicAnomalyConfig,
  type PublicWeightHealth,
} from "./api.ts";

const SCENARIOS = [
  "NORMAL_EMPTY",
  "ZERO_DRIFT",
  "EMPTY_ANOMALY",
  "WEIGHT_JUMP",
  "REPEATED_INSTABILITY",
  "NEGATIVE",
  "INVALID",
  "RECOVERY",
  "MAINTENANCE_ABNORMAL",
];

export function WeightHealthPanel({ weighbridgeId }: { weighbridgeId: string }) {
  const { user } = useAuth();
  const [health, setHealth] = useState<PublicWeightHealth | null>(null);
  const [config, setConfig] = useState<PublicAnomalyConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [threshold, setThreshold] = useState("");
  const [reason, setReason] = useState("");
  const canConfigure = hasPermission(user, "anomaly.configure");
  const canSimulate = hasPermission(user, "weighment.record", "anomaly.configure", "weighbridge.manage");
  const canMaintain = hasPermission(user, "maintenance.manage");

  async function refresh(): Promise<void> {
    const [healthResult, configResult] = await Promise.all([
      getWeightHealth(weighbridgeId),
      getAnomalyConfig(weighbridgeId),
    ]);
    setHealth(healthResult.health);
    setConfig(configResult.config);
    setThreshold(configResult.config.emptyPlatformThresholdKg);
  }

  useEffect(() => {
    void refresh().catch((caught: unknown) => {
      setError(isApiError(caught) ? caught.message : "Unable to load weight health");
    });
  }, [weighbridgeId]);

  return (
    <section className="panel-form">
      <h2>Weight health</h2>
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="login-note">{message}</p> : null}
      {health ? (
        <>
          <p>
            <span>Current</span> {health.currentWeightKg ?? "—"} kg
          </p>
          <p>
            <span>Platform</span> {health.platformState}
          </p>
          <p>
            <span>Status</span> <StatusPill value={health.healthStatus} />
          </p>
          <p>
            <span>Last normal</span> {health.lastNormalWeightKg ?? "—"} kg
          </p>
          <p>
            <span>Open anomalies</span> {health.openAnomalyCount}
          </p>
          <p>
            <span>Device</span> {health.deviceStatus ?? "—"} · {health.quality ?? "—"}
          </p>
          {health.lastAnomaly ? (
            <p>
              Last anomaly{" "}
              <Link to={`/weighbridge/anomalies/${health.lastAnomaly.id}`} className="text-link">
                {health.lastAnomaly.type.replaceAll("_", " ")}
              </Link>
            </p>
          ) : null}
        </>
      ) : null}

      {config ? <p className="login-note">Thresholds: {config.defaultsLabel}</p> : null}

      {canConfigure && config ? (
        <div className="button-row">
          <input value={threshold} onChange={(event) => setThreshold(event.target.value)} aria-label="Empty platform threshold" />
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Change reason" />
          <button
            type="button"
            onClick={() =>
              void updateAnomalyConfig(weighbridgeId, {
                emptyPlatformThresholdKg: Number(threshold),
                reason,
              })
                .then((result) => {
                  setConfig(result.config);
                  setMessage("Threshold updated");
                })
                .catch((caught: unknown) => {
                  setError(isApiError(caught) ? caught.message : "Threshold update failed");
                })
            }
          >
            Save empty-platform threshold
          </button>
        </div>
      ) : null}

      {canMaintain ? (
        <div className="button-row">
          <button
            type="button"
            className="ghost-button"
            onClick={() =>
              void startMaintenance(weighbridgeId, "Operator started maintenance from devices page")
                .then(() => refresh())
                .then(() => setMessage("Maintenance started"))
            }
          >
            Start maintenance
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() =>
              void endMaintenance(weighbridgeId, "Operator ended maintenance")
                .then(() => refresh())
                .then(() => setMessage("Maintenance ended"))
            }
          >
            End maintenance
          </button>
        </div>
      ) : null}

      {canSimulate ? (
        <div className="button-row">
          {SCENARIOS.map((scenario) => (
            <button
              key={scenario}
              type="button"
              className="ghost-button"
              onClick={() =>
                void runAnomalyScenario(weighbridgeId, scenario)
                  .then(() => refresh())
                  .then(() => setMessage(`Ran ${scenario.replaceAll("_", " ")}`))
              }
            >
              {scenario.replaceAll("_", " ")}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
