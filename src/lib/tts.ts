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

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const EDGE_TTS_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/tts-synthesize`;
// ─────────────────────────────────────────────────────────────────────────────

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const FALLBACK_VOICES: TTSVoice[] = [
  { id: "en-US-GuyNeural",    name: "Guy (Male, US)",      gender: "Male",   locale: "en-US" },
  { id: "en-US-JennyNeural",  name: "Jenny (Female, US)",  gender: "Female", locale: "en-US" },
  { id: "en-US-AriaNeural",   name: "Aria (Female, US)",   gender: "Female", locale: "en-US" },
  { id: "en-US-DavisNeural",  name: "Davis (Male, US)",    gender: "Male",   locale: "en-US" },
  { id: "en-GB-RyanNeural",   name: "Ryan (Male, UK)",     gender: "Male",   locale: "en-GB" },
  { id: "en-GB-SoniaNeural",  name: "Sonia (Female, UK)",  gender: "Female", locale: "en-GB" },
];

// Fetch available voices from your Edge Function (falls back to hardcoded list)
export async function getAvailableVoices(): Promise<TTSVoice[]> {
  try {
    const resp = await fetch(`${EDGE_TTS_URL}?action=voices`);
    if (!resp.ok) throw new Error(`Voice list fetch failed: ${resp.status}`);
    const voices: TTSVoice[] = await resp.json();
    return voices.length > 0 ? voices : FALLBACK_VOICES;
  } catch (e) {
    console.warn("Could not fetch voice list from Edge Function, using fallback:", e);
    return FALLBACK_VOICES;
  }
}

function parseRateString(rate: string): number {
  // "+10%" → 1.1, "-10%" → 0.9, "+0%" → 1.0
  const match = rate.match(/([+-]?\d+)%/);
  if (!match) return 1.0;
  return 1.0 + parseInt(match[1]) / 100;
}

// Main entry point — tries Edge TTS first, then StreamElements as fallback
export async function synthesizeSpeech(
  text: string,
  voiceId = "en-US-GuyNeural",
  rate = "+0%",
  pitch = "+0Hz",
  volume = "+0%"
): Promise<TTSResult> {
  // Strategy 1: Your Supabase Edge Function (Microsoft Edge TTS — free, reliable)
  try {
    return await synthesizeWithEdgeTTS(text, voiceId, rate, pitch, volume);
  } catch (e) {
    console.warn("Edge TTS failed, falling back to StreamElements:", e);
  }

  // Strategy 2: StreamElements TTS (free REST API, no auth needed)
  try {
    return await synthesizeWithStreamElements(text, voiceId);
  } catch (e) {
    console.warn("StreamElements also failed:", e);
    throw new Error("All TTS strategies failed. Check your Edge Function URL and deployment.");
  }
}

// ─── Strategy 1: Supabase Edge Function → Microsoft Edge TTS ─────────────────
async function synthesizeWithEdgeTTS(
  text: string,
  voiceId: string,
  rate: string,
  pitch: string,
  volume: string
): Promise<TTSResult> {
  const resp = await fetch(EDGE_TTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: voiceId, rate, pitch, volume }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Edge TTS responded ${resp.status}: ${err}`);
  }

  const data = await resp.json();

  if (data.error) throw new Error(`Edge TTS error: ${data.error}`);

  // Decode base64 audio → Blob
  const binaryStr = atob(data.audio_base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const audioBlob = new Blob([bytes], { type: data.format || "audio/mpeg" });

  // Word boundaries come back in ms already (Edge Function handles the conversion)
  const wordBoundaries: WordBoundary[] = (data.word_boundaries || []).map((wb: any) => ({
    text: wb.text,
    offset: wb.offset,
    duration: wb.duration,
  }));

  // Calculate duration from last word boundary or estimate from word count
  const durationMs =
    wordBoundaries.length > 0
      ? wordBoundaries[wordBoundaries.length - 1].offset +
        wordBoundaries[wordBoundaries.length - 1].duration +
        300
      : text.split(/\s+/).length * (400 / parseRateString(rate));

  return { audioBlob, wordBoundaries, durationMs };
}

// ─── Strategy 2: StreamElements TTS ──────────────────────────────────────────
async function synthesizeWithStreamElements(text: string, voiceId: string): Promise<TTSResult> {
  const voiceMap: Record<string, string> = {
    "en-US-GuyNeural":   "Brian",
    "en-US-JennyNeural": "Joanna",
    "en-US-AriaNeural":  "Aria",
    "en-US-DavisNeural": "Matthew",
    "en-GB-RyanNeural":  "Brian",
    "en-GB-SoniaNeural": "Amy",
  };
  const seVoice = voiceMap[voiceId] ?? "Brian";
  const url = `https://api.streamelements.com/kappa/v2/speech?voice=${seVoice}&text=${encodeURIComponent(text)}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`StreamElements TTS failed: ${resp.status}`);

  const audioBlob = await resp.blob();
  const words = text.split(/\s+/);
  const msPerWord = 400;
  const wordBoundaries: WordBoundary[] = words.map((word, i) => ({
    text: word,
    offset: i * msPerWord,
    duration: msPerWord,
  }));
  const durationMs = words.length * msPerWord + 500;

  return { audioBlob, wordBoundaries, durationMs };
}
