import { supabase } from "@/integrations/supabase/client";

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

export async function synthesizeSpeech(
  text: string,
  voice = "en-US-GuyNeural",
  rate = "+0%"
): Promise<TTSResult> {
  const { data, error } = await supabase.functions.invoke("tts-synthesize", {
    body: { text, voice, rate, pitch: "+0Hz", volume: "+0%" },
  });

  if (error) throw new Error(`TTS failed: ${error.message}`);
  if (!data?.audio_base64) throw new Error("No audio returned from TTS");

  // Decode base64 to blob
  const binaryStr = atob(data.audio_base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const audioBlob = new Blob([bytes], { type: "audio/mpeg" });

  const wordBoundaries: WordBoundary[] = data.word_boundaries || [];

  // Estimate duration from last word boundary
  let durationMs = 0;
  if (wordBoundaries.length > 0) {
    const last = wordBoundaries[wordBoundaries.length - 1];
    durationMs = last.offset + last.duration + 500; // add 500ms padding
  } else {
    // Fallback: estimate from word count
    const wordCount = text.split(/\s+/).length;
    durationMs = (wordCount / 150) * 60 * 1000;
  }

  return { audioBlob, wordBoundaries, durationMs };
}

export const VOICES = [
  { id: "en-US-GuyNeural", name: "Guy (Male, US)", style: "calm storytelling" },
  { id: "en-US-ChristopherNeural", name: "Christopher (Male, US)", style: "dramatic" },
  { id: "en-US-EricNeural", name: "Eric (Male, US)", style: "neutral" },
  { id: "en-US-JennyNeural", name: "Jenny (Female, US)", style: "friendly" },
  { id: "en-US-AriaNeural", name: "Aria (Female, US)", style: "engaging" },
  { id: "en-GB-RyanNeural", name: "Ryan (Male, UK)", style: "professional" },
];
