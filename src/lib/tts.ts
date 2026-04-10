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

// ─── Microsoft Edge TTS (runs fully in browser via WebSocket) ────────────────
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
const VOICE_LIST_URL = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;

const FALLBACK_VOICES: TTSVoice[] = [
  { id: "en-US-GuyNeural", name: "Guy (Male, US)", gender: "Male", locale: "en-US" },
  { id: "en-US-JennyNeural", name: "Jenny (Female, US)", gender: "Female", locale: "en-US" },
  { id: "en-US-AriaNeural", name: "Aria (Female, US)", gender: "Female", locale: "en-US" },
  { id: "en-US-DavisNeural", name: "Davis (Male, US)", gender: "Male", locale: "en-US" },
  { id: "en-US-ChristopherNeural", name: "Christopher (Male, US)", gender: "Male", locale: "en-US" },
  { id: "en-US-EricNeural", name: "Eric (Male, US)", gender: "Male", locale: "en-US" },
  { id: "en-US-SteffanNeural", name: "Steffan (Male, US)", gender: "Male", locale: "en-US" },
  { id: "en-US-MichelleNeural", name: "Michelle (Female, US)", gender: "Female", locale: "en-US" },
  { id: "en-GB-RyanNeural", name: "Ryan (Male, UK)", gender: "Male", locale: "en-GB" },
  { id: "en-GB-SoniaNeural", name: "Sonia (Female, UK)", gender: "Female", locale: "en-GB" },
  { id: "en-AU-WilliamNeural", name: "William (Male, AU)", gender: "Male", locale: "en-AU" },
  { id: "en-AU-NatashaNeural", name: "Natasha (Female, AU)", gender: "Female", locale: "en-AU" },
];

export async function getAvailableVoices(): Promise<TTSVoice[]> {
  try {
    const resp = await fetch(VOICE_LIST_URL, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const voices: any[] = await resp.json();
    const english = voices
      .filter((v) => v.Locale?.startsWith("en-"))
      .map((v) => ({
        id: v.ShortName,
        name: v.FriendlyName || v.ShortName,
        gender: v.Gender,
        locale: v.Locale,
      }));
    return english.length > 0 ? english : FALLBACK_VOICES;
  } catch (e) {
    console.warn("Could not fetch voice list, using fallback:", e);
    return FALLBACK_VOICES;
  }
}

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

function parseRateString(rate: string): number {
  const match = rate.match(/([+-]?\d+)%/);
  if (!match) return 1.0;
  return 1.0 + parseInt(match[1]) / 100;
}

// Synthesize via browser WebSocket to Microsoft Edge TTS
export async function synthesizeSpeech(
  text: string,
  voiceId = "en-US-GuyNeural",
  rate = "+0%",
  pitch = "+0Hz",
  volume = "+0%"
): Promise<TTSResult> {
  const requestId = generateRequestId();
  const ssml = buildSSML(text, voiceId, rate, pitch, volume);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WSS_URL);
    const audioChunks: Uint8Array[] = [];
    const wordBoundaries: WordBoundary[] = [];

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Edge TTS WebSocket timeout after 30s"));
    }, 30000);

    ws.onopen = () => {
      // Send config
      ws.send(
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: {
                    sentenceBoundaryEnabled: "false",
                    wordBoundaryEnabled: "true",
                  },
                  outputFormat: "audio-24khz-48kbitrate-mono-mp3",
                },
              },
            },
          })
      );
      // Send SSML
      ws.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`);
    };

    ws.onmessage = async (event) => {
      if (typeof event.data === "string") {
        const msg = event.data;
        // Parse word boundaries
        if (msg.includes("Path:audio.metadata")) {
          try {
            const jsonStr = msg.substring(msg.indexOf("{"));
            const metadata = JSON.parse(jsonStr);
            if (metadata.Metadata) {
              for (const m of metadata.Metadata) {
                if (m.Type === "WordBoundary") {
                  wordBoundaries.push({
                    text: m.Data.text.Text,
                    offset: m.Data.Offset / 10000,
                    duration: m.Data.Duration / 10000,
                  });
                }
              }
            }
          } catch {}
        }
        // End of audio stream
        if (msg.includes("Path:turn.end")) {
          clearTimeout(timeout);
          ws.close();
          const totalLen = audioChunks.reduce((a, c) => a + c.length, 0);
          const result = new Uint8Array(totalLen);
          let off = 0;
          for (const chunk of audioChunks) {
            result.set(chunk, off);
            off += chunk.length;
          }
          const audioBlob = new Blob([result], { type: "audio/mpeg" });
          const durationMs =
            wordBoundaries.length > 0
              ? wordBoundaries[wordBoundaries.length - 1].offset +
                wordBoundaries[wordBoundaries.length - 1].duration +
                300
              : text.split(/\s+/).length * (400 / parseRateString(rate));

          resolve({ audioBlob, wordBoundaries, durationMs });
        }
      } else if (event.data instanceof Blob) {
        // Browser WebSocket delivers binary frames as Blobs
        const ab = await event.data.arrayBuffer();
        const view = new DataView(ab);
        if (ab.byteLength < 2) return;
        const headerLen = view.getUint16(0);
        if (2 + headerLen > ab.byteLength) return;
        const audioData = new Uint8Array(ab, 2 + headerLen);
        if (audioData.length > 0) audioChunks.push(audioData);
      } else if (event.data instanceof ArrayBuffer) {
        const view = new DataView(event.data);
        if (event.data.byteLength < 2) return;
        const headerLen = view.getUint16(0);
        if (2 + headerLen > event.data.byteLength) return;
        const audioData = new Uint8Array(event.data, 2 + headerLen);
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
