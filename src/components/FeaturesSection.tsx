import { motion } from "framer-motion";
import { MessageSquareText, Mic2, Subtitles, Gamepad2, Music, Download } from "lucide-react";

const features = [
  { icon: MessageSquareText, title: "Reddit Scraper", desc: "Pulls top stories from any subreddit using the public API — no keys needed." },
  { icon: Mic2, title: "AI Voiceover", desc: "Edge-TTS generates natural narration with word-level timing." },
  { icon: Subtitles, title: "Styled Captions", desc: "MrBeast-style word-by-word highlights, burned into the video." },
  { icon: Gamepad2, title: "Gaming Footage", desc: "Minecraft parkour clips auto-selected and looped to match duration." },
  { icon: Music, title: "Background Music", desc: "Lofi tracks mixed at 12% volume with a 2-second fade-out." },
  { icon: Download, title: "Ready to Upload", desc: "1080×1920 MP4 exported and ready for YouTube Shorts, TikTok, or Reels." },
];

export default function FeaturesSection() {
  return (
    <section className="py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.h2
          className="font-heading text-3xl sm:text-4xl font-bold text-center mb-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          End-to-end pipeline
        </motion.h2>
        <motion.p
          className="text-muted-foreground text-center mb-16 max-w-xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ delay: 0.1 }}
        >
          From Reddit post to finished video — zero manual steps.
        </motion.p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              className="group p-6 rounded-2xl border border-border bg-card/50 hover:bg-card transition-colors"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ delay: i * 0.08 }}
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <f.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-heading font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
