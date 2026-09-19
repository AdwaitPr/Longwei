import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { Experience } from "./three/experience";
import Overlay, { type OverlayHandle } from "./components/Overlay";

gsap.registerPlugin(ScrollTrigger);

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<OverlayHandle | null>(null);
  const spaceRef = useRef<HTMLDivElement | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const [loadP, setLoadP] = useState(0);
  const [ready, setReady] = useState(false);
  const [gone, setGone] = useState(false);

  const mobile = useMemo(
    () =>
      window.innerWidth < 820 ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),
    []
  );
  const reduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  useEffect(() => {
    if (!canvasRef.current || !spaceRef.current) return;

    const exp = new Experience({
      canvas: canvasRef.current,
      mobile,
      reduced,
      onLoadProgress: (v) => setLoadP(v),
      onReady: () => window.setTimeout(() => setReady(true), reduced ? 150 : 650),
    });

    const lenis = new Lenis({
      lerp: reduced ? 0.16 : 0.09,
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.4,
    });
    lenisRef.current = lenis;
    lenis.on("scroll", ScrollTrigger.update);

    const st = ScrollTrigger.create({
      trigger: spaceRef.current,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => exp.setProgress(self.progress),
    });

    const tick = (time: number, deltaTime: number) => {
      lenis.raf(time * 1000);
      exp.update(deltaTime / 1000, time);
      if (exp.smoothP >= 0) overlayRef.current?.update(exp.smoothP);
    };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      st.kill();
      lenis.destroy();
      exp.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready) {
      const t = window.setTimeout(() => setGone(true), 1100);
      return () => window.clearTimeout(t);
    }
  }, [ready]);

  const navigate = (p: number) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    lenisRef.current?.scrollTo(p * max, {
      duration: reduced ? 0.4 : 2.4,
      easing: (t: number) => 1 - Math.pow(1 - t, 4),
    });
  };

  return (
    <div className="grain relative">
      {/* scroll runway — the page's only scrollable height */}
      <div
        ref={spaceRef}
        aria-hidden="true"
        style={{ height: reduced ? "900vh" : "1150vh" }}
      />

      {/* pinned stage: 3D canvas + DOM overlay */}
      <div className="fixed inset-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        />
        <Overlay ref={overlayRef} mobile={mobile} reduced={reduced} onNavigate={navigate} />
      </div>
      <div className="vignette" aria-hidden="true" />

      {/* preloader */}
      {!gone && (
        <div
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-7 bg-[#0a0405]"
          style={{
            opacity: ready ? 0 : 1,
            transition: "opacity 0.9s cubic-bezier(0.4, 0, 0.2, 1)",
            pointerEvents: ready ? "none" : "auto",
          }}
          aria-hidden={ready}
        >
          <div className="flex items-baseline gap-3">
            <span className="font-brush text-5xl text-[#e3b95f]">龍威</span>
            <span className="font-display text-xl font-medium tracking-[0.5em] text-[#f3ead9]">
              LONGWEI
            </span>
          </div>
          <div className="relative h-14 w-14">
            <svg viewBox="0 0 56 56" className="loader-ring h-full w-full">
              <circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                stroke="url(#lg)"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeDasharray="95 55"
              />
              <defs>
                <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#57b08a" />
                  <stop offset="55%" stopColor="#c9202c" />
                  <stop offset="100%" stopColor="#e3b95f" />
                </linearGradient>
              </defs>
            </svg>
            <span className="breathe absolute inset-0 flex items-center justify-center font-brush text-lg text-[#e3b95f]/80">
              龍
            </span>
          </div>
          <div className="h-px w-44 overflow-hidden bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-[#57b08a] via-[#c9202c] to-[#e3b95f] transition-[width] duration-300"
              style={{ width: `${Math.round(loadP * 100)}%` }}
            />
          </div>
          <span className="text-[9px] font-light uppercase tracking-[0.5em] text-[#f3ead9]/40">
            Awakening
          </span>
        </div>
      )}
    </div>
  );
}
