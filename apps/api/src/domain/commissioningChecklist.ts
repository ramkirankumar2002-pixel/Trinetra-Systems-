export const COMMISSIONING_TEST_RESULTS = ["PASS", "FAIL", "NOT_TESTED"] as const;
export type CommissioningTestResultValue = (typeof COMMISSIONING_TEST_RESULTS)[number];

export type CommissioningItem = {
  testKey: string;
  testType: string;
  group: "WEIGHBRIDGE" | "CAMERA" | "SCANNER" | "EDGE";
  deviceTypes: string[];
  label: string;
};

export const COMMISSIONING_ITEMS: readonly CommissioningItem[] = [
  { testKey: "wb_powered", testType: "WEIGHBRIDGE", group: "WEIGHBRIDGE", deviceTypes: ["WEIGHBRIDGE_INDICATOR"], label: "Indicator powered" },
  { testKey: "wb_communication", testType: "WEIGHBRIDGE", group: "WEIGHBRIDGE", deviceTypes: ["WEIGHBRIDGE_INDICATOR"], label: "Indicator communication verified" },
  { testKey: "wb_protocol", testType: "WEIGHBRIDGE", group: "WEIGHBRIDGE", deviceTypes: ["WEIGHBRIDGE_INDICATOR"], label: "Correct protocol confirmed" },
  { testKey: "wb_weight_received", testType: "WEIGHBRIDGE", group: "WEIGHBRIDGE", deviceTypes: ["WEIGHBRIDGE_INDICATOR"], label: "Weight received" },
  { testKey: "wb_stable", testType: "WEIGHBRIDGE", group: "WEIGHBRIDGE", deviceTypes: ["WEIGHBRIDGE_INDICATOR"], label: "Stable status verified" },
  { testKey: "wb_unit", testType: "WEIGHBRIDGE", group: "WEIGHBRIDGE", deviceTypes: ["WEIGHBRIDGE_INDICATOR"], label: "Unit verified" },
  { testKey: "wb_timestamp", testType: "WEIGHBRIDGE", group: "WEIGHBRIDGE", deviceTypes: ["WEIGHBRIDGE_INDICATOR"], label: "Timestamp verified" },
  { testKey: "wb_gross", testType: "WEIGHBRIDGE", group: "WEIGHBRIDGE", deviceTypes: ["WEIGHBRIDGE_INDICATOR"], label: "Gross test completed" },
  { testKey: "wb_tare", testType: "WEIGHBRIDGE", group: "WEIGHBRIDGE", deviceTypes: ["WEIGHBRIDGE_INDICATOR"], label: "Tare test completed" },
  { testKey: "cam_powered", testType: "CAMERA", group: "CAMERA", deviceTypes: ["CAMERA"], label: "Camera powered" },
  { testKey: "cam_reachable", testType: "CAMERA", group: "CAMERA", deviceTypes: ["CAMERA"], label: "Network reachable" },
  { testKey: "cam_position", testType: "CAMERA", group: "CAMERA", deviceTypes: ["CAMERA"], label: "Correct position" },
  { testKey: "cam_image", testType: "CAMERA", group: "CAMERA", deviceTypes: ["CAMERA"], label: "Image available" },
  { testKey: "cam_plate_visible", testType: "CAMERA", group: "CAMERA", deviceTypes: ["CAMERA"], label: "Plate visible" },
  { testKey: "cam_anpr", testType: "CAMERA", group: "CAMERA", deviceTypes: ["CAMERA"], label: "ANPR result received" },
  { testKey: "cam_confidence", testType: "CAMERA", group: "CAMERA", deviceTypes: ["CAMERA"], label: "Confidence received" },
  { testKey: "cam_vehicle", testType: "CAMERA", group: "CAMERA", deviceTypes: ["CAMERA"], label: "Test vehicle identified" },
  { testKey: "scan_powered", testType: "SCANNER", group: "SCANNER", deviceTypes: ["SCANNER", "BARCODE_SCANNER"], label: "Scanner powered" },
  { testKey: "scan_driver", testType: "SCANNER", group: "SCANNER", deviceTypes: ["SCANNER", "BARCODE_SCANNER"], label: "Driver/API verified" },
  { testKey: "scan_test", testType: "SCANNER", group: "SCANNER", deviceTypes: ["SCANNER", "BARCODE_SCANNER"], label: "Test scan completed" },
  { testKey: "scan_file", testType: "SCANNER", group: "SCANNER", deviceTypes: ["SCANNER", "BARCODE_SCANNER"], label: "File received" },
  { testKey: "scan_ocr", testType: "SCANNER", group: "SCANNER", deviceTypes: ["SCANNER", "BARCODE_SCANNER"], label: "OCR pipeline receives document" },
  { testKey: "edge_registered", testType: "EDGE", group: "EDGE", deviceTypes: ["SENSOR", "PLC", "OTHER"], label: "Gateway registered" },
  { testKey: "edge_auth", testType: "EDGE", group: "EDGE", deviceTypes: ["SENSOR", "PLC", "OTHER"], label: "Authentication works" },
  { testKey: "edge_heartbeat", testType: "EDGE", group: "EDGE", deviceTypes: ["SENSOR", "PLC", "OTHER"], label: "Heartbeat works" },
  { testKey: "edge_devices", testType: "EDGE", group: "EDGE", deviceTypes: ["SENSOR", "PLC", "OTHER"], label: "Devices visible" },
  { testKey: "edge_queue", testType: "EDGE", group: "EDGE", deviceTypes: ["SENSOR", "PLC", "OTHER"], label: "Event queue works" },
  { testKey: "edge_sync", testType: "EDGE", group: "EDGE", deviceTypes: ["SENSOR", "PLC", "OTHER"], label: "Backend synchronization works" },
  { testKey: "edge_idempotency", testType: "EDGE", group: "EDGE", deviceTypes: ["SENSOR", "PLC", "OTHER"], label: "Duplicate protection works" },
] as const;

export const GATEWAY_COMMISSIONING_ITEMS = COMMISSIONING_ITEMS.filter((item) => item.group === "EDGE");

export function commissioningItemsForDeviceType(deviceType: string): CommissioningItem[] {
  return COMMISSIONING_ITEMS.filter((item) => item.deviceTypes.includes(deviceType));
}

export function isCommissioningTestResult(value: string): value is CommissioningTestResultValue {
  return (COMMISSIONING_TEST_RESULTS as readonly string[]).includes(value);
}

export function isKnownCommissioningTestKey(testKey: string): boolean {
  return COMMISSIONING_ITEMS.some((item) => item.testKey === testKey);
}
