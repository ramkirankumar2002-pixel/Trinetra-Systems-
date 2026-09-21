import type { AnprProviderSnapshot, NormalizedAnprResult } from "../../domain/anprResult.js";
import type { CameraFrame } from "../cameras/types.js";

export interface IAnprProvider {
  initialize(): Promise<void>;
  recognize(frame: CameraFrame): Promise<NormalizedAnprResult>;
  getStatus(): AnprProviderSnapshot;
  shutdown(): Promise<void>;
}
