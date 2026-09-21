export const AUDIO_CUES = [
  "VEHICLE_DETECTED",
  "DOCUMENT_CAPTURED",
  "WEIGHMENT_STABLE",
  "APPROVAL_RECEIVED",
  "UNLOADING_ASSIGNED",
  "TRANSACTION_COMPLETED",
  "ERROR_DETECTED",
] as const;

export type AudioCue = (typeof AUDIO_CUES)[number];

export type AudioFeedbackProvider = {
  readonly id: string;
  play(cue: AudioCue): Promise<void>;
};

const CUE_FREQUENCY: Record<AudioCue, number> = {
  VEHICLE_DETECTED: 520,
  DOCUMENT_CAPTURED: 620,
  WEIGHMENT_STABLE: 700,
  APPROVAL_RECEIVED: 780,
  UNLOADING_ASSIGNED: 480,
  TRANSACTION_COMPLETED: 880,
  ERROR_DETECTED: 220,
};

export class SimulatedAudioFeedbackProvider implements AudioFeedbackProvider {
  readonly id = "simulated-audio";
  lastCue: AudioCue | null = null;

  async play(cue: AudioCue): Promise<void> {
    this.lastCue = cue;
    if (typeof window === "undefined" || typeof window.AudioContext === "undefined") {
      return;
    }

    const context = new window.AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = CUE_FREQUENCY[cue];
    gain.gain.value = cue === "ERROR_DETECTED" ? 0.08 : 0.05;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.16);
    window.setTimeout(() => {
      void context.close();
    }, 220);
  }
}

export class AudioFeedbackService {
  private enabled: boolean;
  private readonly provider: AudioFeedbackProvider;

  constructor(provider: AudioFeedbackProvider, enabled: boolean) {
    this.provider = provider;
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async play(cue: AudioCue): Promise<void> {
    if (!this.enabled) {
      return;
    }
    await this.provider.play(cue);
  }
}

export function createAudioFeedbackService(enabled: boolean): AudioFeedbackService {
  return new AudioFeedbackService(new SimulatedAudioFeedbackProvider(), enabled);
}
