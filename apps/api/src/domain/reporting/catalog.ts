export const REPORT_IDS = [
  "transactions",
  "weighments",
  "materials",
  "vehicles",
  "suppliers",
  "weighbridges",
  "workflow",
  "approvals",
  "exceptions",
  "anomalies",
  "sync",
  "daily",
] as const;

export type ReportId = (typeof REPORT_IDS)[number];

export type ReportDefinition = {
  id: ReportId;
  name: string;
  description: string;
  requiredPermissions: string[];
  filters: string[];
  columns: string[];
  aggregations: string[];
  exportSupported: boolean;
  pagination: boolean;
};

export const REPORT_CATALOG: ReportDefinition[] = [
  {
    id: "transactions",
    name: "Transaction report",
    description: "Paginated visits with stored weights, status, and duration when both timestamps exist.",
    requiredPermissions: ["report.read"],
    filters: [
      "datePreset",
      "from",
      "to",
      "siteId",
      "weighbridgeId",
      "vehicle",
      "materialId",
      "supplierId",
      "status",
      "workflowCode",
      "exceptionFamily",
    ],
    columns: [
      "referenceNumber",
      "vehicleNumber",
      "material",
      "supplier",
      "grossWeightKg",
      "tareWeightKg",
      "netWeightKg",
      "status",
      "createdAt",
      "completedAt",
      "duration",
    ],
    aggregations: ["total"],
    exportSupported: true,
    pagination: true,
  },
  {
    id: "weighments",
    name: "Weighment report",
    description: "Recorded gross/tare/other weights. Raw device payloads are not included.",
    requiredPermissions: ["report.read"],
    filters: ["datePreset", "from", "to", "siteId", "weighbridgeId", "vehicle", "source", "kind"],
    columns: [
      "transaction",
      "vehicle",
      "weighbridge",
      "kind",
      "weightKg",
      "unit",
      "stability",
      "source",
      "recordedAt",
    ],
    aggregations: ["total"],
    exportSupported: true,
    pagination: true,
  },
  {
    id: "materials",
    name: "Material report",
    description: "Transaction counts and stored net/gross/tare totals by material and configured workflow.",
    requiredPermissions: ["report.read"],
    filters: ["datePreset", "from", "to", "siteId", "weighbridgeId", "workflowCode", "materialId"],
    columns: [
      "material",
      "transactionCount",
      "totalGrossWeightKg",
      "totalTareWeightKg",
      "totalNetWeightKg",
      "workflowClassification",
      "site",
    ],
    aggregations: ["transactionCount", "totalGrossWeightKg", "totalTareWeightKg", "totalNetWeightKg"],
    exportSupported: true,
    pagination: false,
  },
  {
    id: "vehicles",
    name: "Vehicle report",
    description: "Visit counts and stored net weight by vehicle within the caller’s site scope.",
    requiredPermissions: ["report.read"],
    filters: ["datePreset", "from", "to", "siteId", "weighbridgeId", "vehicle", "materialId"],
    columns: [
      "vehicleNumber",
      "transactionCount",
      "totalNetWeightKg",
      "firstTransactionAt",
      "lastTransactionAt",
    ],
    aggregations: ["transactionCount", "totalNetWeightKg"],
    exportSupported: true,
    pagination: false,
  },
  {
    id: "suppliers",
    name: "Supplier report",
    description: "Totals for suppliers that already exist on transactions. Missing supplier rows are omitted.",
    requiredPermissions: ["report.read"],
    filters: ["datePreset", "from", "to", "siteId", "supplierId", "materialId"],
    columns: ["supplier", "transactionCount", "totalNetWeightKg", "materials"],
    aggregations: ["transactionCount", "totalNetWeightKg"],
    exportSupported: true,
    pagination: false,
  },
  {
    id: "weighbridges",
    name: "Weighbridge performance",
    description: "Factual counts and average durations. Does not rank weighbridges.",
    requiredPermissions: ["report.read"],
    filters: ["datePreset", "from", "to", "siteId", "weighbridgeId"],
    columns: [
      "weighbridge",
      "transactionsProcessed",
      "completedTransactions",
      "exceptions",
      "weightAnomalies",
      "averageTransactionDuration",
      "averageWeighmentDuration",
      "offlinePeriods",
      "deviceCommunicationFailures",
    ],
    aggregations: ["transactionsProcessed", "completedTransactions", "exceptions", "weightAnomalies"],
    exportSupported: true,
    pagination: false,
  },
  {
    id: "workflow",
    name: "Workflow performance",
    description: "Stage durations calculated only when both required timestamps exist.",
    requiredPermissions: ["report.read"],
    filters: ["datePreset", "from", "to", "siteId", "weighbridgeId", "workflowCode"],
    columns: ["stage", "sampleCount", "averageDuration", "data"],
    aggregations: ["averageDuration"],
    exportSupported: true,
    pagination: false,
  },
  {
    id: "approvals",
    name: "Approval analytics",
    description: "Pending/approved/rejected counts and average decision time. No employee ranking.",
    requiredPermissions: ["report.read"],
    filters: ["datePreset", "from", "to", "siteId", "materialId", "workflowCode"],
    columns: ["decision", "count", "averageApprovalTime", "department", "workflow"],
    aggregations: ["pending", "approved", "rejected", "averageApprovalTime"],
    exportSupported: true,
    pagination: false,
  },
  {
    id: "exceptions",
    name: "Exception report",
    description: "Operational exceptions from transactions, documents, providers, and synchronization records.",
    requiredPermissions: ["report.read"],
    filters: ["datePreset", "from", "to", "siteId", "weighbridgeId", "exceptionFamily", "status"],
    columns: [
      "exceptionType",
      "transaction",
      "site",
      "weighbridge",
      "createdAt",
      "status",
      "resolutionTime",
      "resolutionStatus",
    ],
    aggregations: ["countByType"],
    exportSupported: true,
    pagination: true,
  },
  {
    id: "anomalies",
    name: "Weight anomaly report",
    description: "Possible weighing-system issues from the existing anomaly store. Not fraud findings.",
    requiredPermissions: ["report.read"],
    filters: ["datePreset", "from", "to", "siteId", "weighbridgeId", "status"],
    columns: ["type", "transaction", "device", "weightContext", "timestamp", "severity", "status", "resolution"],
    aggregations: ["countByType", "countBySeverity"],
    exportSupported: true,
    pagination: true,
  },
  {
    id: "sync",
    name: "Offline / synchronization report",
    description: "Gateway snapshots, ingest counts, dead-letter events, and recorded offline sessions.",
    requiredPermissions: ["report.read"],
    filters: ["datePreset", "from", "to", "siteId"],
    columns: [
      "gateway",
      "connectivityState",
      "queued",
      "synced",
      "failed",
      "deadLetter",
      "offlineDuration",
      "lastSuccessfulSyncAt",
    ],
    aggregations: ["queued", "synced", "failed", "deadLetter"],
    exportSupported: true,
    pagination: false,
  },
  {
    id: "daily",
    name: "Daily operations report",
    description: "One operational day’s counts from stored records in the site timezone.",
    requiredPermissions: ["report.read"],
    filters: ["datePreset", "from", "to", "siteId", "weighbridgeId"],
    columns: [
      "vehiclesProcessed",
      "totalTransactions",
      "completed",
      "pending",
      "exceptions",
      "totalNetWeightKg",
      "approvals",
      "weightAnomalies",
      "offlineEvents",
    ],
    aggregations: ["vehiclesProcessed", "totalTransactions", "completed", "totalNetWeightKg"],
    exportSupported: true,
    pagination: false,
  },
];

export function isReportId(value: string): value is ReportId {
  return (REPORT_IDS as readonly string[]).includes(value);
}

export function getReportDefinition(id: ReportId): ReportDefinition {
  const found = REPORT_CATALOG.find((item) => item.id === id);
  if (!found) {
    throw new Error(`Unknown report ${id}`);
  }
  return found;
}
