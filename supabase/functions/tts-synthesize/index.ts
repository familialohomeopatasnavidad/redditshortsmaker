const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface WordBoundary {
  text: string;
  offset: number;
  duration: number;
}

const VOICES = [
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

function uint8ArrayToBase64(arr: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

function parseRateString(rate: string): number {
  const match = rate.match(/([+-]?\d+)%/);
  if (!match) return 1;
  return 1 + parseInt(match[1], 10) / 100;
}

function splitText(text: string, maxChars = 180): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const sentences = normalized.match(/[^.!?]+[.!?]?/g) ?? [normalized];
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    if (trimmedSentence.length <= maxChars) {
      const candidate = current ? `${current} ${trimmedSentence}` : trimmedSentence;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        pushCurrent();
        current = trimmedSentence;
      }
      continue;
    }

    const words = trimmedSentence.split(/\s+/);
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        pushCurrent();
        current = word;
      }
    }
  }

  pushCurrent();
  return chunks;
}

function mapVoiceToLang(voice: string): string {
  if (voice.startsWith("en-GB")) return "en-GB";
  if (voice.startsWith("en-AU")) return "en-AU";
  if (voice.startsWith("en-CA")) return "en-CA";
  return "en";
}

async function fetchTtsChunk(text: string, lang: string): Promise<Uint8Array> {
  const encodedText = encodeURIComponent(text);
  const urls = [
    `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodedText}`,
    `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodedText}`,
  ];

  let lastError = "Unknown TTS error";

  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "audio/mpeg,audio/*,*/*",
        },
      });

      if (!resp.ok) {
        lastError = `${resp.status} ${await resp.text()}`;
        continue;
      }

      return new Uint8Array(await resp.arrayBuffer());
    } catch (error) {
      lastError = String(error);
    }
  }

  throw new Error(`All TTS providers failed: ${lastError}`);
}

function buildEstimatedWordBoundaries(text: string, durationMs: number): WordBoundary[] {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    if (url.searchParams.get("action") === "voices") {
      return new Response(JSON.stringify(VOICES), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { text, voice = "en-US-GuyNeural", rate = "+0%" } = body;

    if (!text || typeof text !== "string" || text.trim().length === 0 || text.length > 5000) {
      return new Response(JSON.stringify({ error: "text is required and must be under 5000 chars" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chunks = splitText(text);
    const lang = mapVoiceToLang(voice);
    const audioChunks: Uint8Array[] = [];

    for (const chunk of chunks) {
      audioChunks.push(await fetchTtsChunk(chunk, lang));
    }

    const audio = concatUint8Arrays(audioChunks);
    const durationMs = Math.max(1000, Math.round(text.split(/\s+/).filter(Boolean).length * (380 / parseRateString(rate))));
    const wordBoundaries = buildEstimatedWordBoundaries(text, durationMs);

    return new Response(JSON.stringify({
      audio_base64: uint8ArrayToBase64(audio),
      word_boundaries: wordBoundaries,
      duration_ms: durationMs,
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
