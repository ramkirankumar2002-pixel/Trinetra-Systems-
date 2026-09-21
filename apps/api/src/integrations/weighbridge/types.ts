export type WeighbridgeReadSource = "SIMULATED";

export type WeighbridgeReadResult = {
  kg: number;
  asDecimal: string;
  readAt: string;
  source: WeighbridgeReadSource;
  provider: string;
  weighbridgeId: string;
};

export interface WeighbridgeReader {
  readWeight(weighbridgeId: string): Promise<WeighbridgeReadResult>;
}
