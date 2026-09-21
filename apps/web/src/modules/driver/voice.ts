export const DRIVER_INTENTS = [
  "START_TRANSACTION",
  "CONFIRM",
  "CANCEL",
  "RETRY",
  "SCAN_DOCUMENT",
  "NEXT",
  "BACK",
  "HELP",
  "COMPLETE_UNLOADING",
] as const;

export type DriverIntent = (typeof DRIVER_INTENTS)[number];

export type NormalizedVoiceInput = {
  transcript: string;
  intent: DriverIntent | null;
  confidence: number;
  uncertain: boolean;
  unavailable: boolean;
};

export type SpeechToTextProvider = {
  readonly id: string;
  readonly kind: "SIMULATED" | "LOCAL";
  available(): boolean;
  listen(): Promise<NormalizedVoiceInput>;
};

export type TextToSpeechProvider = {
  readonly id: string;
  readonly kind: "SIMULATED" | "LOCAL";
  available(): boolean;
  speak(text: string, locale: string): Promise<void>;
  stop(): void;
};

export type VoiceService = {
  stt: SpeechToTextProvider;
  tts: TextToSpeechProvider;
  mapTranscript: typeof mapTranscriptToIntent;
};

const INTENT_PHRASES: Record<DriverIntent, string[]> = {
  START_TRANSACTION: [
    "start",
    "start transaction",
    "new transaction",
    "begin",
    "शुरू",
    "लेन-देन शुरू",
    "మొదలు",
    "లావాదేవీ మొదలు",
  ],
  CONFIRM: ["confirm", "yes", "ok", "okay", "haan", "हां", "हाँ", "ठीक", "సరే", "అవును", "ధృవీకరించు"],
  CANCEL: ["cancel", "no", "stop", "रद्द", "नहीं", "రద్దు", "వద్దు"],
  RETRY: ["retry", "again", "try again", "फिर", "दोबारा", "మళ్లీ", "మళ్లీ ప్రయత్నించు"],
  SCAN_DOCUMENT: ["scan", "scan document", "document", "स्कैन", "दस्तावेज़", "స్కాన్", "పత్రం"],
  NEXT: ["next", "continue", "आगे", "आगे बढ़ो", "తర్వాత", "కొనసాగించు"],
  BACK: ["back", "previous", "पीछे", "वापस", "వెనుకకు"],
  HELP: ["help", "assist", "मदद", "सहायता", "సహాయం"],
  COMPLETE_UNLOADING: [
    "unloading completed",
    "complete unloading",
    "unloaded",
    "अनलोडिंग पूरी",
    "अनलोड पूरा",
    "అన్‌లోడింగ్ పూర్తి",
  ],
};

export function isDriverIntent(value: string): value is DriverIntent {
  return (DRIVER_INTENTS as readonly string[]).includes(value);
}

export function mapTranscriptToIntent(transcript: string): NormalizedVoiceInput {
  const normalized = transcript.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized === "") {
    return { transcript, intent: null, confidence: 0, uncertain: true, unavailable: false };
  }

  for (const intent of DRIVER_INTENTS) {
    if (INTENT_PHRASES[intent].some((phrase) => normalized === phrase || normalized.includes(phrase))) {
      return { transcript, intent, confidence: 0.95, uncertain: false, unavailable: false };
    }
  }

  return { transcript, intent: null, confidence: 0.2, uncertain: true, unavailable: false };
}

export class SimulatedSpeechToTextProvider implements SpeechToTextProvider {
  readonly id = "simulated-stt";
  readonly kind = "SIMULATED" as const;
  private nextTranscript: string | null = null;

  available(): boolean {
    return true;
  }

  queueTranscript(transcript: string): void {
    this.nextTranscript = transcript;
  }

  async listen(): Promise<NormalizedVoiceInput> {
    const queued = this.nextTranscript;
    this.nextTranscript = null;
    if (queued === null) {
      return {
        transcript: "",
        intent: null,
        confidence: 0,
        uncertain: true,
        unavailable: true,
      };
    }
    return mapTranscriptToIntent(queued);
  }
}

export class SimulatedTextToSpeechProvider implements TextToSpeechProvider {
  readonly id = "simulated-tts";
  readonly kind = "SIMULATED" as const;
  lastSpoken: { text: string; locale: string } | null = null;

  available(): boolean {
    return true;
  }

  async speak(text: string, locale: string): Promise<void> {
    this.lastSpoken = { text, locale };
  }

  stop(): void {
    this.lastSpoken = null;
  }
}

type BrowserRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: Array<Array<{ transcript: string; confidence: number }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
};

function getBrowserRecognition(): (new () => BrowserRecognition) | null {
  if (typeof window === "undefined") {
    return null;
  }
  const candidate = window as Window & {
    SpeechRecognition?: new () => BrowserRecognition;
    webkitSpeechRecognition?: new () => BrowserRecognition;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

export class LocalSpeechToTextProvider implements SpeechToTextProvider {
  readonly id = "local-browser-stt";
  readonly kind = "LOCAL" as const;
  private readonly locale: string;

  constructor(locale = "en-IN") {
    this.locale = locale;
  }

  available(): boolean {
    return getBrowserRecognition() !== null;
  }

  listen(): Promise<NormalizedVoiceInput> {
    const Recognition = getBrowserRecognition();
    if (!Recognition) {
      return Promise.resolve({
        transcript: "",
        intent: null,
        confidence: 0,
        uncertain: true,
        unavailable: true,
      });
    }

    return new Promise((resolve) => {
      const recognition = new Recognition();
      recognition.lang = this.locale;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const first = event.results[0]?.[0];
        const transcript = first?.transcript ?? "";
        const mapped = mapTranscriptToIntent(transcript);
        const confidence = typeof first?.confidence === "number" ? first.confidence : mapped.confidence;
        resolve({
          ...mapped,
          confidence,
          uncertain: mapped.uncertain || confidence < 0.7,
        });
      };
      recognition.onerror = () => {
        resolve({ transcript: "", intent: null, confidence: 0, uncertain: true, unavailable: false });
      };
      recognition.onend = () => {
        resolve({ transcript: "", intent: null, confidence: 0, uncertain: true, unavailable: false });
      };
      try {
        recognition.start();
      } catch {
        resolve({ transcript: "", intent: null, confidence: 0, uncertain: true, unavailable: true });
      }
    });
  }
}

export class LocalTextToSpeechProvider implements TextToSpeechProvider {
  readonly id = "local-browser-tts";
  readonly kind = "LOCAL" as const;

  available(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  async speak(text: string, locale: string): Promise<void> {
    if (!this.available() || text.trim() === "") {
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale === "hi" ? "hi-IN" : locale === "te" ? "te-IN" : "en-IN";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  stop(): void {
    if (this.available()) {
      window.speechSynthesis.cancel();
    }
  }
}

export function createVoiceService(options?: {
  stt?: SpeechToTextProvider;
  tts?: TextToSpeechProvider;
  locale?: string;
}): VoiceService {
  const locale = options?.locale ?? "en";
  const localStt = new LocalSpeechToTextProvider(locale === "hi" ? "hi-IN" : locale === "te" ? "te-IN" : "en-IN");
  const localTts = new LocalTextToSpeechProvider();
  return {
    stt: options?.stt ?? (localStt.available() ? localStt : new SimulatedSpeechToTextProvider()),
    tts: options?.tts ?? (localTts.available() ? localTts : new SimulatedTextToSpeechProvider()),
    mapTranscript: mapTranscriptToIntent,
  };
}
