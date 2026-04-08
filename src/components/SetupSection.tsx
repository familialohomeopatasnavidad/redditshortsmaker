import { motion } from "framer-motion";
import { Terminal, Copy, Check } from "lucide-react";
import { useState } from "react";

function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="terminal-bg rounded-xl p-4 text-xs font-mono text-muted-foreground overflow-x-auto border border-border">
        {code}
      </pre>
      <button
        onClick={copy}
        className="absolute top-3 right-3 p-1.5 rounded-md bg-secondary/80 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export default function SetupSection() {
  return (
    <section className="py-24 px-4 border-t border-border">
      <div className="max-w-3xl mx-auto">
        <motion.div
          className="flex items-center justify-center gap-2 mb-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Terminal className="w-5 h-5 text-primary" />
          <h2 className="font-heading text-3xl font-bold">Get started</h2>
        </motion.div>
        <motion.p
          className="text-muted-foreground text-center mb-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
        >
          One command. That's it.
        </motion.p>

        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">1. Clone & add your clips</p>
            <CopyBlock code={`git clone https://github.com/your-repo/reddit-shorts.git\ncd reddit-shorts\n\n# Drop Minecraft parkour clips into:\nmkdir -p backgrounds/minecraft\n\n# Drop lofi music tracks into:\nmkdir -p assets/music`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">2. Launch</p>
            <CopyBlock code="docker-compose up --build" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">3. Open</p>
            <CopyBlock code="http://localhost:8000" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
