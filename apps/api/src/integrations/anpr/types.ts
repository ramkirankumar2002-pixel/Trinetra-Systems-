export type AnprSource = "SIMULATED";

export type AnprReadResult = {
  plate: string;
  displayPlate: string;
  confidence: number;
  source: AnprSource;
  provider: string;
  readAt: string;
};

export type AnprReadInput = {
  weighbridgeId: string;
};

export interface AnprReader {
  readPlate(input: AnprReadInput): Promise<AnprReadResult>;
}
