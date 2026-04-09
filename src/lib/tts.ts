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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Fetch available voices from Edge TTS
export async function getAvailableVoices(): Promise<TTSVoice[]> {
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/functions/v1/tts-synthesize?action=voices`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    if (!resp.ok) throw new Error(`Voice list failed: ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.error("Failed to fetch voices:", err);
    // Return fallback voices
    return [
      { id: "en-US-GuyNeural", name: "Guy (Male, US)", gender: "Male", locale: "en-US" },
      { id: "en-US-JennyNeural", name: "Jenny (Female, US)", gender: "Female", locale: "en-US" },
      { id: "en-US-AriaNeural", name: "Aria (Female, US)", gender: "Female", locale: "en-US" },
      { id: "en-US-DavisNeural", name: "Davis (Male, US)", gender: "Male", locale: "en-US" },
      { id: "en-GB-RyanNeural", name: "Ryan (Male, UK)", gender: "Male", locale: "en-GB" },
      { id: "en-GB-SoniaNeural", name: "Sonia (Female, UK)", gender: "Female", locale: "en-GB" },
    ];
  }
}

// Synthesize speech using Edge TTS via the edge function
export async function synthesizeSpeech(
  text: string,
  voiceId = "en-US-GuyNeural",
  rate = "+0%"
): Promise<TTSResult> {
  const resp = await fetch(
    `${SUPABASE_URL}/functions/v1/tts-synthesize`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ text, voice: voiceId, rate }),
    }
  );

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(errData.error || `TTS failed: ${resp.status}`);
  }

  const data = await resp.json();

  // Decode base64 audio to blob
  const binaryStr = atob(data.audio_base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const audioBlob = new Blob([bytes], { type: "audio/mpeg" });

  const wordBoundaries: WordBoundary[] = data.word_boundaries || [];

  // Calculate total duration from word boundaries
  let durationMs = 0;
  if (wordBoundaries.length > 0) {
    const last = wordBoundaries[wordBoundaries.length - 1];
    durationMs = last.offset + last.duration + 200;
  } else {
    // Estimate from audio size (~6KB/s for 48kbps mp3)
    durationMs = (audioBlob.size / 6) * 1000 / 1024;
  }

  return { audioBlob, wordBoundaries, durationMs };
}
