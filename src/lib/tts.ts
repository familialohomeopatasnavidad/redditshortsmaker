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

// Edge TTS WebSocket config (runs in browser — no server restrictions)
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;

function generateRequestId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSSML(text: string, voice: string, rate: string, pitch: string, volume: string): string {
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
    <voice name='${voice}'>
      <prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>
        ${escapeXml(text)}
      </prosody>
    </voice>
  </speak>`;
}

// Fetch available voices from the edge function (HTTP — works fine)
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

// Synthesize speech via Edge TTS WebSocket — runs in the BROWSER
export async function synthesizeSpeech(
  text: string,
  voiceId = "en-US-GuyNeural",
  rate = "+0%"
): Promise<TTSResult> {
  const requestId = generateRequestId();
  const ssml = buildSSML(text, voiceId, rate, "+0Hz", "+0%");

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WSS_URL);
    const audioChunks: Uint8Array[] = [];
    const wordBoundaries: WordBoundary[] = [];

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("TTS WebSocket timeout after 30s"));
    }, 30000);

    ws.onopen = () => {
      // Send config
      ws.send(
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`
      );
      // Send SSML request
      ws.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`);
    };

    ws.onmessage = async (event) => {
      if (typeof event.data === "string") {
        const msg = event.data;
        // Parse word boundary metadata
        if (msg.includes("Path:audio.metadata")) {
          try {
            const jsonStr = msg.substring(msg.indexOf("{"));
            const metadata = JSON.parse(jsonStr);
            if (metadata.Metadata) {
              for (const m of metadata.Metadata) {
                if (m.Type === "WordBoundary") {
                  wordBoundaries.push({
                    text: m.Data.text.Text,
                    offset: m.Data.Offset / 10000, // 100ns ticks → ms
                    duration: m.Data.Duration / 10000,
                  });
                }
              }
            }
          } catch {}
        }
        // End of stream
        if (msg.includes("Path:turn.end")) {
          clearTimeout(timeout);
          ws.close();
          // Concat audio
          const totalLen = audioChunks.reduce((a, c) => a + c.length, 0);
          const audio = new Uint8Array(totalLen);
          let offset = 0;
          for (const chunk of audioChunks) {
            audio.set(chunk, offset);
            offset += chunk.length;
          }
          const audioBlob = new Blob([audio], { type: "audio/mpeg" });
          let durationMs = 0;
          if (wordBoundaries.length > 0) {
            const last = wordBoundaries[wordBoundaries.length - 1];
            durationMs = last.offset + last.duration + 200;
          } else {
            durationMs = (audio.length / 6) * 1000 / 1024;
          }
          resolve({ audioBlob, wordBoundaries, durationMs });
        }
      } else {
        // Binary audio data (ArrayBuffer or Blob)
        let ab: ArrayBuffer;
        if (event.data instanceof Blob) {
          ab = await event.data.arrayBuffer();
        } else {
          ab = event.data as ArrayBuffer;
        }
        const view = new DataView(ab);
        const headerLen = view.getUint16(0);
        const audioData = new Uint8Array(ab, 2 + headerLen);
        if (audioData.length > 0) audioChunks.push(audioData);
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Edge TTS WebSocket connection failed"));
    };

    ws.onclose = (event) => {
      if (!event.wasClean && audioChunks.length === 0) {
        clearTimeout(timeout);
        reject(new Error(`WebSocket closed unexpectedly: code ${event.code}`));
      }
    };
  });
}
