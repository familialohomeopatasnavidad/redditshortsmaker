const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
const VOICE_LIST_URL = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;

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

import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

async function synthesize(text: string, voice: string, rate = "+0%", pitch = "+0Hz", volume = "+0%"): Promise<{ audio: Uint8Array; wordBoundaries: Array<{ text: string; offset: number; duration: number }> }> {
  const requestId = generateRequestId();
  const ssml = buildSSML(text, voice, rate, pitch, volume);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WSS_URL);
    const audioChunks: Uint8Array[] = [];
    const wordBoundaries: Array<{ text: string; offset: number; duration: number }> = [];

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("TTS WebSocket timeout after 30s"));
    }, 30000);

    ws.onopen = () => {
      ws.send(`Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`);
      ws.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`);
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        const msg = event.data;
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
        if (msg.includes("Path:turn.end")) {
          clearTimeout(timeout);
          ws.close();
          const totalLen = audioChunks.reduce((a, c) => a + c.length, 0);
          const result = new Uint8Array(totalLen);
          let offset = 0;
          for (const chunk of audioChunks) {
            result.set(chunk, offset);
            offset += chunk.length;
          }
          resolve({ audio: result, wordBoundaries });
        }
      } else if (event.data instanceof ArrayBuffer) {
        const view = new DataView(event.data);
        const headerLen = view.getUint16(0);
        const audioData = new Uint8Array(event.data, 2 + headerLen);
        if (audioData.length > 0) audioChunks.push(audioData);
      } else if (event.data instanceof Blob) {
        event.data.arrayBuffer().then((ab) => {
          const view = new DataView(ab);
          const headerLen = view.getUint16(0);
          const audioData = new Uint8Array(ab, 2 + headerLen);
          if (audioData.length > 0) audioChunks.push(audioData);
        });
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${String(err)}`));
    };

    ws.onclose = (event) => {
      if (!event.wasClean && audioChunks.length === 0) {
        clearTimeout(timeout);
        reject(new Error(`WebSocket closed unexpectedly: code ${event.code}`));
      }
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    
    // Voice listing endpoint
    if (url.searchParams.get("action") === "voices") {
      const resp = await fetch(VOICE_LIST_URL, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      const voices = await resp.json();
      // Filter to English voices and return a simplified list
      const englishVoices = voices
        .filter((v: any) => v.Locale?.startsWith("en-"))
        .map((v: any) => ({
          id: v.ShortName,
          name: v.FriendlyName || v.ShortName,
          gender: v.Gender,
          locale: v.Locale,
        }));
      return new Response(JSON.stringify(englishVoices), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Synthesis endpoint
    const body = await req.json();
    const { text, voice = "en-US-GuyNeural", rate = "+0%", pitch = "+0Hz", volume = "+0%" } = body;

    if (!text || typeof text !== "string" || text.length > 5000) {
      return new Response(JSON.stringify({ error: "text is required and must be under 5000 chars" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await synthesize(text, voice, rate, pitch, volume);

    // Use proper base64 encoding (no stack overflow)
    const b64 = base64Encode(result.audio);

    return new Response(JSON.stringify({
      audio_base64: b64,
      word_boundaries: result.wordBoundaries,
      format: "audio/mpeg",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("TTS error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
