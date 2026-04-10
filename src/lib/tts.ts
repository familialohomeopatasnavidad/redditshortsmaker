export interface WordBoundary {
  text: string;
  offset: number; // ms
  duration: number; // ms
}

export interface TTSResult {
  audioBlob: Blob;
  wordBoundaries: WordBoundary[];
  durationMs: number;
}

export interface TTSVoice {
  id: string;
  name: string;
  gender: string;
  locale: string;
}

const EDGE_TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tts-synthesize`;
const EDGE_HEADERS = {
  "Content-Type": "application/json",
  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
};

const FALLBACK_VOICES: TTSVoice[] = [
  { id: "en-US-GuyNeural", name: "Guy (Male, US)", gender: "Male", locale: "en-US" },
  { id: "en-US-JennyNeural", name: "Jenny (Female, US)", gender: "Female", locale: "en-US" },
  { id: "en-US-AriaNeural", name: "Aria (Female, US)", gender: "Female", locale: "en-US" },
  { id: "en-US-DavisNeural", name: "Davis (Male, US)", gender: "Male", locale: "en-US" },
  { id: "en-US-ChristopherNeural", name: "Christopher (Male, US)", gender: "Male", locale: "en-US" },
  { id: "en-US-MichelleNeural", name: "Michelle (Female, US)", gender: "Female", locale: "en-US" },
  { id: "en-GB-RyanNeural", name: "Ryan (Male, UK)", gender: "Male", locale: "en-GB" },
  { id: "en-GB-SoniaNeural", name: "Sonia (Female, UK)", gender: "Female", locale: "en-GB" },
  { id: "en-AU-WilliamNeural", name: "William (Male, AU)", gender: "Male", locale: "en-AU" },
  { id: "en-AU-NatashaNeural", name: "Natasha (Female, AU)", gender: "Female", locale: "en-AU" },
  { id: "en-CA-LiamNeural", name: "Liam (Male, CA)", gender: "Male", locale: "en-CA" },
  { id: "en-CA-ClaraNeural", name: "Clara (Female, CA)", gender: "Female", locale: "en-CA" },
];

export async function getAvailableVoices(): Promise<TTSVoice[]> {
  try {
    const resp = await fetch(`${EDGE_TTS_URL}?action=voices`, {
      method: "GET",
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    });

    if (!resp.ok) throw new Error(`Voice list fetch failed: ${resp.status}`);

    const voices: TTSVoice[] = await resp.json();
    return voices.length > 0 ? voices : FALLBACK_VOICES;
  } catch (e) {
    console.warn("Could not fetch voice list from backend, using fallback:", e);
    return FALLBACK_VOICES;
  }
}

function parseRateString(rate: string): number {
  const match = rate.match(/([+-]?\d+)%/);
  if (!match) return 1;
  return 1 + parseInt(match[1], 10) / 100;
}

function base64ToBlob(base64: string, mimeType = "audio/mpeg"): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

async function getAudioDurationMs(audioBlob: Blob): Promise<number | null> {
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new AudioContext();
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    await audioContext.close();
    return Math.round(decoded.duration * 1000);
  } catch {
    return null;
  }
}

function estimateWordBoundaries(text: string, durationMs: number): WordBoundary[] {
  const words = text.split(/\s+/).map((word) => word.trim()).filter(Boolean);
  if (words.length === 0) return [];

  const weights = words.map((word) => Math.max(1, word.replace(/[^a-zA-Z0-9']/g, "").length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  let offset = 0;
  return words.map((word, index) => {
    const remaining = durationMs - offset;
    const isLast = index === words.length - 1;
    const duration = isLast
      ? Math.max(120, remaining)
      : Math.max(120, Math.round((durationMs * weights[index]) / totalWeight));

    const boundary = { text: word, offset, duration };
    offset += duration;
    return boundary;
  });
}

export async function synthesizeSpeech(
  text: string,
  voiceId = "en-US-GuyNeural",
  rate = "+0%",
  pitch = "+0Hz",
  volume = "+0%"
): Promise<TTSResult> {
  const resp = await fetch(EDGE_TTS_URL, {
    method: "POST",
    headers: EDGE_HEADERS,
    body: JSON.stringify({ text, voice: voiceId, rate, pitch, volume }),
  });

  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    throw new Error(data?.error || `TTS request failed (${resp.status})`);
  }

  if (!data?.audio_base64) {
    throw new Error(data?.error || "TTS provider returned no audio");
  }

  const audioBlob = base64ToBlob(data.audio_base64, data.format || "audio/mpeg");
  const decodedDurationMs = await getAudioDurationMs(audioBlob);
  const fallbackDurationMs = Math.round(text.split(/\s+/).filter(Boolean).length * (380 / parseRateString(rate)));
  const durationMs = decodedDurationMs ?? data.duration_ms ?? fallbackDurationMs;

  const wordBoundaries: WordBoundary[] = Array.isArray(data.word_boundaries) && data.word_boundaries.length > 0
    ? data.word_boundaries
    : estimateWordBoundaries(text, durationMs);

  return { audioBlob, wordBoundaries, durationMs };
}
