import "dotenv/config";
import {
  configCheckSummary,
  formatConfigChecks,
  validateReleaseConfigFromEnv,
} from "../config/productionValidator.js";

const checks = validateReleaseConfigFromEnv();
const summary = configCheckSummary(checks);

process.stdout.write(`${formatConfigChecks(checks)}\n`);
process.stdout.write(`Summary: ${summary.ok} OK, ${summary.warning} WARNING, ${summary.error} ERROR\n`);
process.stdout.write("Secret values are not printed.\n");

if (summary.error > 0) {
  process.exitCode = 1;
}
