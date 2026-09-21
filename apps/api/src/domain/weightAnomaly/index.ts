export {
  DEVELOPMENT_DEFAULT_ANOMALY_CONFIG,
  DEVELOPMENT_DEFAULT_LABEL,
  WEIGHT_ANOMALY_RULE_VERSION,
  toConfigValues,
} from "./config.js";
export { evaluateWeightAnomaly, sampleFromWeight } from "./engine.js";
export { derivePlatformState, platformAllowsEmptyRule } from "./platformState.js";
export { RULE_DETECTORS } from "./rules.js";
export {
  WEIGHT_ANOMALY_SCENARIOS,
  isWeightAnomalyScenario,
  scenarioReadings,
} from "./scenarios.js";
export { formatKgValue, toSecuritySeverity } from "./severity.js";
export {
  WEIGHT_ANOMALY_STATUSES,
  WEIGHT_ANOMALY_TYPES,
  isWeightAnomalyStatus,
  isWeightAnomalyType,
  type AnomalySample,
  type WeightAnomalyConfigValues,
  type WeightAnomalyType,
} from "./types.js";
