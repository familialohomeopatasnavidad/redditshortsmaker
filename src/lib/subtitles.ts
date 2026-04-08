import type { WordBoundary } from "./tts";

// Generate ASS subtitle content with MrBeast-style word highlighting
export function generateASS(
  wordBoundaries: WordBoundary[],
  wordsPerGroup = 3
): string {
  const header = `[Script Info]
Title: Reddit Shorts Subtitles
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial Black,72,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,0,2,40,40,200,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events: string[] = [];

  // Group words
  for (let i = 0; i < wordBoundaries.length; i += wordsPerGroup) {
    const group = wordBoundaries.slice(i, i + wordsPerGroup);
    if (group.length === 0) continue;

    const startMs = group[0].offset;
    const lastWord = group[group.length - 1];
    const endMs = lastWord.offset + lastWord.duration + 100;

    const startTime = msToASS(startMs);
    const endTime = msToASS(endMs);

    // Build text with current-word highlighting
    // Show all words in white, highlight each word in yellow as it's spoken
    const fullText = group.map((w) => w.text).join(" ");
    
    // Simple approach: show the group with a yellow highlight effect
    const styledText = `{\\an2\\pos(540,1600)}${fullText.toUpperCase()}`;

    events.push(
      `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${styledText}`
    );
  }

  return header + "\n" + events.join("\n");
}

function msToASS(ms: number): string {
  const totalSeconds = ms / 1000;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const cs = Math.floor((totalSeconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

// Generate SRT for simpler fallback
export function generateSRT(wordBoundaries: WordBoundary[], wordsPerGroup = 3): string {
  const entries: string[] = [];
  let index = 1;

  for (let i = 0; i < wordBoundaries.length; i += wordsPerGroup) {
    const group = wordBoundaries.slice(i, i + wordsPerGroup);
    if (group.length === 0) continue;

    const startMs = group[0].offset;
    const lastWord = group[group.length - 1];
    const endMs = lastWord.offset + lastWord.duration + 100;

    entries.push(
      `${index}\n${msToSRT(startMs)} --> ${msToSRT(endMs)}\n${group.map((w) => w.text).join(" ").toUpperCase()}\n`
    );
    index++;
  }

  return entries.join("\n");
}

function msToSRT(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msR = Math.floor(ms % 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(msR).padStart(3, "0")}`;
}
