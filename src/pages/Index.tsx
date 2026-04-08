import { useRef } from "react";
import HeroSection from "@/components/HeroSection";
import FeaturesSection from "@/components/FeaturesSection";
import DemoSection from "@/components/DemoSection";
import SetupSection from "@/components/SetupSection";

export default function Index() {
  const demoRef = useRef<HTMLDivElement>(null);
  const scrollToDemo = () => demoRef.current?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <HeroSection onScrollToDemo={scrollToDemo} />
      <FeaturesSection />
      <DemoSection ref={demoRef} />
      <SetupSection />

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        Reddit Shorts Generator · Built with FastAPI + FFmpeg + edge-tts
      </footer>
    </div>
  );
}
