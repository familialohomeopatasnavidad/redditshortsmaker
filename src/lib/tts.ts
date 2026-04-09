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

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Get voices available in this browser
export async function getAvailableVoices(): Promise<TTSVoice[]> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    let voices = synth.getVoices();
    if (voices.length > 0) {
      resolve(mapVoices(voices));
      return;
    }
    // voices load async on first call
    synth.onvoiceschanged = () => {
      voices = synth.getVoices();
      resolve(mapVoices(voices));
    };
    // fallback if onvoiceschanged never fires
    setTimeout(() => {
      voices = synth.getVoices();
      resolve(voices.length > 0 ? mapVoices(voices) : FALLBACK_VOICES);
    }, 1000);
  });
}

function mapVoices(voices: SpeechSynthesisVoice[]): TTSVoice[] {
  const english = voices.filter(v => v.lang.startsWith("en"));
  const list = english.length > 0 ? english : voices;
  return list.map(v => ({
    id: v.name,
    name: v.name,
    gender: v.name.toLowerCase().includes("female") || v.name.toLowerCase().includes("zira") || v.name.toLowerCase().includes("samantha") || v.name.toLowerCase().includes("victoria") ? "Female" : "Male",
    locale: v.lang,
  }));
}

const FALLBACK_VOICES: TTSVoice[] = [
  { id: "en-US-GuyNeural", name: "Guy (Male, US)", gender: "Male", locale: "en-US" },
  { id: "en-US-JennyNeural", name: "Jenny (Female, US)", gender: "Female", locale: "en-US" },
  { id: "en-US-AriaNeural", name: "Aria (Female, US)", gender: "Female", locale: "en-US" },
  { id: "en-US-DavisNeural", name: "Davis (Male, US)", gender: "Male", locale: "en-US" },
  { id: "en-GB-RyanNeural", name: "Ryan (Male, UK)", gender: "Male", locale: "en-GB" },
  { id: "en-GB-SoniaNeural", name: "Sonia (Female, UK)", gender: "Female", locale: "en-GB" },
];

// Synthesize using Web Speech API → record with MediaRecorder → return Blob
export async function synthesizeSpeech(
  text: string,
  voiceId = "en-US-GuyNeural",
  rate = "+0%"
): Promise<TTSResult> {
  // Parse rate string like "+10%" or "-5%" into a 0.5–2 range
  const rateNum = parseRateString(rate);

  // Try Web Speech API with MediaRecorder capture first
  try {
    return await synthesizeWithWebSpeech(text, voiceId, rateNum);
  } catch (e) {
    console.warn("Web Speech capture failed, trying StreamElements fallback:", e);
  }

  // Fallback: StreamElements TTS (free, no auth, returns mp3)
  try {
    return await synthesizeWithStreamElements(text, voiceId);
  } catch (e) {
    console.warn("StreamElements failed, trying TTS.monster:", e);
  }

  // Last resort: Google Translate TTS (short texts only)
  return await synthesizeWithGoogleTTS(text);
}

function parseRateString(rate: string): number {
  // "+10%" → 1.1, "-10%" → 0.9, "+0%" → 1.0
  const match = rate.match(/([+-]?\d+)%/);
  if (!match) return 1.0;
  return 1.0 + parseInt(match[1]) / 100;
}

// --- Strategy 1: Web Speech API + MediaRecorder ---
async function synthesizeWithWebSpeech(text: string, voiceId: string, rate: number): Promise<TTSResult> {
  // Get audio context + destination
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const recorder = new MediaRecorder(dest.stream, { mimeType: getSupportedMimeType() });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  return new Promise((resolve, reject) => {
    const synth = window.speechSynthesis;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = Math.max(0.5, Math.min(2, rate));

    // Match voice by name
    const voices = synth.getVoices();
    const match = voices.find(v => v.name === voiceId || v.name.includes(voiceId.replace("Neural", "").replace("en-US-", "").replace("en-GB-", "")));
    if (match) utter.voice = match;

    const wordBoundaries: WordBoundary[] = [];
    let wordOffset = 0;

    utter.onboundary = (e) => {
      if (e.name === "word") {
        const wordText = text.substring(e.charIndex, e.charIndex + (e.charLength || 5));
        wordBoundaries.push({
          text: wordText.trim(),
          offset: e.elapsedTime || wordOffset,
          duration: 300,
        });
        wordOffset += 300;
      }
    };

    utter.onend = () => {
      recorder.stop();
    };

    utter.onerror = (e) => {
      recorder.stop();
      reject(new Error(`Web Speech error: ${e.error}`));
    };

    recorder.onstop = () => {
      audioCtx.close();
      if (chunks.length === 0) {
        reject(new Error("No audio recorded"));
        return;
      }
      const mimeType = getSupportedMimeType();
      const audioBlob = new Blob(chunks, { type: mimeType });
      const durationMs = wordBoundaries.length > 0
        ? wordBoundaries[wordBoundaries.length - 1].offset + 500
        : text.split(/\s+/).length * 400;
      resolve({ audioBlob, wordBoundaries, durationMs });
    };

    recorder.start(100);
    synth.speak(utter);
  });
}

function getSupportedMimeType(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "audio/webm";
}

// --- Strategy 2: StreamElements TTS (free REST API, returns mp3) ---
async function synthesizeWithStreamElements(text: string, voiceId: string): Promise<TTSResult> {
  // Map Neural voice names to StreamElements voices
  const voiceMap: Record<string, string> = {
    "en-US-GuyNeural": "Brian",
    "en-US-JennyNeural": "Joanna",
    "en-US-AriaNeural": "Aria",
    "en-US-DavisNeural": "Matthew",
    "en-GB-RyanNeural": "Brian",
    "en-GB-SoniaNeural": "Amy",
  };
  const seVoice = voiceMap[voiceId] || "Brian";
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

// --- Strategy 3: Google Translate TTS (works for short texts) ---
async function synthesizeWithGoogleTTS(text: string): Promise<TTSResult> {
  // Split into chunks of max 200 chars
  const chunks = splitIntoChunks(text, 200);
  const blobs: Blob[] = [];
  const wordBoundaries: WordBoundary[] = [];
  let timeOffset = 0;

  for (const chunk of chunks) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=en&client=tw-ob`;
    const resp = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
    if (!resp.ok) throw new Error(`Google TTS failed: ${resp.status}`);
    blobs.push(await resp.blob());

    const words = chunk.split(/\s+/);
    const msPerWord = 400;
    words.forEach((word, i) => {
      wordBoundaries.push({ text: word, offset: timeOffset + i * msPerWord, duration: msPerWord });
    });
    timeOffset += words.length * msPerWord;
  }

  const audioBlob = new Blob(blobs, { type: "audio/mpeg" });
  return { audioBlob, wordBoundaries, durationMs: timeOffset + 500 };
}

function splitIntoChunks(text: string, maxLen: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxLen) {
      if (current) chunks.push(current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}
