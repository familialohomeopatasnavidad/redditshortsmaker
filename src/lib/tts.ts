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

// Use the browser's built-in SpeechSynthesis API
// We calculate word boundaries based on speech rate since
// the boundary event timing varies by browser
export async function synthesizeSpeech(
  text: string,
  voiceName?: string,
  rate = 1.0
): Promise<TTSResult> {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error("Speech synthesis not supported in this browser."));
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Try to set voice
    const voices = window.speechSynthesis.getVoices();
    if (voiceName) {
      const match = voices.find(v => v.name === voiceName || v.name.includes(voiceName));
      if (match) utterance.voice = match;
    }

    // Collect word boundaries from the boundary event
    const boundaries: WordBoundary[] = [];
    utterance.onboundary = (e) => {
      if (e.name === "word") {
        const word = text.substring(e.charIndex, e.charIndex + e.charLength);
        boundaries.push({
          text: word,
          offset: e.elapsedTime, // ms
          duration: 200, // estimate, will be refined
        });
      }
    };

    // We need to capture audio via MediaRecorder + AudioContext
    // Unfortunately, SpeechSynthesis doesn't output to a capturable stream
    // So we'll use a hybrid approach: speak to get timing, then generate
    // a silent placeholder audio of the right duration.
    // The actual audio will be the browser playing speech live during preview,
    // and for the final video, we record system audio.

    // ALTERNATIVE: Record via AudioContext destination
    const audioContext = new AudioContext();
    const dest = audioContext.createMediaStreamDestination();
    const mediaRecorder = new MediaRecorder(dest.stream, {
      mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm",
    });

    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    // Since SpeechSynthesis doesn't connect to AudioContext,
    // we'll time the speech and generate word boundaries,
    // then use a workaround for the audio file.
    
    let startTime = 0;

    utterance.onstart = () => {
      startTime = performance.now();
    };

    utterance.onend = () => {
      const totalDuration = performance.now() - startTime;
      
      // Refine boundary durations
      for (let i = 0; i < boundaries.length - 1; i++) {
        boundaries[i].duration = boundaries[i + 1].offset - boundaries[i].offset;
      }
      if (boundaries.length > 0) {
        boundaries[boundaries.length - 1].duration = 300;
      }

      // If no boundaries were captured (some browsers don't fire boundary events),
      // generate approximate boundaries from word positions
      if (boundaries.length === 0) {
        const words = text.split(/\s+/).filter(Boolean);
        const msPerWord = totalDuration / words.length;
        words.forEach((word, i) => {
          boundaries.push({
            text: word,
            offset: i * msPerWord,
            duration: msPerWord,
          });
        });
      }

      audioContext.close();

      // Create a silent audio blob as placeholder
      // The real audio comes from the browser's speech synthesis playing live
      // For video assembly, we'll need to re-synthesize or use a different approach
      const sampleRate = 24000;
      const numSamples = Math.ceil((totalDuration / 1000) * sampleRate);
      const wavBlob = createSilentWav(numSamples, sampleRate);

      resolve({
        audioBlob: wavBlob,
        wordBoundaries: boundaries,
        durationMs: totalDuration,
      });
    };

    utterance.onerror = (e) => {
      audioContext.close();
      reject(new Error(`Speech synthesis error: ${e.error}`));
    };

    window.speechSynthesis.speak(utterance);
  });
}

// Create a WAV file with silence (placeholder)
function createSilentWav(numSamples: number, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, numSamples * 2, true);
  // Data is zeros (silence)

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// Get available voices (browser-specific)
export function getAvailableVoices(): { id: string; name: string }[] {
  if (!window.speechSynthesis) return [];
  const voices = window.speechSynthesis.getVoices();
  return voices
    .filter(v => v.lang.startsWith("en"))
    .map(v => ({ id: v.name, name: `${v.name} (${v.lang})` }))
    .slice(0, 15);
}

// Preload voices (needed in some browsers)
export function preloadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };
    // Fallback timeout
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 2000);
  });
}
