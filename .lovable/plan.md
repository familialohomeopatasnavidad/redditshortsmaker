
## Functional Reddit Shorts Generator — What's Feasible

### Architecture (no Python/Docker — Lovable constraints)
- **Frontend**: React UI (your tool, not marketing)
- **Backend**: Supabase Edge Functions (Deno/TypeScript)
- **Video processing**: FFmpeg.wasm (runs in browser)

### What will work end-to-end:

1. **Reddit Fetcher** → Edge function proxies `reddit.com/r/{sub}/top.json` (avoids CORS)
   - Filters by score, word count, text-only, SFW
   - Cleans markdown, edits, links
   - Caches used post IDs in localStorage

2. **TTS Voiceover** → Edge function calls Microsoft's free speech synthesis endpoint (same backend edge-tts uses, reimplemented in TypeScript)
   - Returns WAV audio blob
   - Natural-sounding voice, multiple voice options

3. **Caption Timing** → Calculated client-side using words-per-minute rate from audio duration
   - 2-4 words per segment, MrBeast-style appearance
   - Burned into video via FFmpeg.wasm ASS subtitle filter

4. **Video Assembly** → FFmpeg.wasm in-browser
   - User uploads Minecraft clips + music via drag-and-drop (stored in browser memory)
   - Clips get cropped to 9:16, looped to match audio
   - Vignette overlay, background music at 12%, 2s fade-out
   - Output: 1080×1920 H.264 MP4

5. **UI** (tool-focused, no marketing fluff):
   - **Setup tab**: Upload background clips + music tracks (persisted in IndexedDB)
   - **Generate tab**: Pick subreddit, set count, hit generate
   - **Live progress**: Real stage-by-stage updates
   - **Results**: Video preview player + download button for each

### Honest limitations:
- **FFmpeg.wasm is slow** — a 60s video may take 2-5 minutes to render in-browser (vs seconds on a real server). No way around this without a server.
- **TTS quality** — Microsoft's free endpoint is good but not Eleven Labs tier
- **No batch of 5** — processing 5 videos sequentially in-browser would take 10-25 min. I'd cap at 1-3.
- **File size** — user needs to upload their own Minecraft clips (can't bundle them)

### Steps:
1. Enable Lovable Cloud
2. Build edge function: Reddit fetcher proxy
3. Build edge function: TTS synthesis  
4. Build the tool UI (upload clips, generate, download)
5. Integrate FFmpeg.wasm for in-browser video assembly
6. Wire everything together with real progress tracking

Want me to proceed, or would you prefer a different approach for any part?
