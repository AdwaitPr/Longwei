import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowRight, Check } from "lucide-react";
import { SECTIONS, NAV_LINKS } from "../lib/config";
import { sstep } from "../three/utils";

export interface OverlayHandle {
  update: (p: number) => void;
}

interface Props {
  mobile: boolean;
  reduced: boolean;
  onNavigate: (p: number) => void;
}

const HERO_WORDS = ["Ancient.", "Eternal.", "Alive."];

const Overlay = forwardRef<OverlayHandle, Props>(function Overlay(
  { mobile, reduced, onNavigate },
  ref
) {
  const panelRefs = useRef<(HTMLElement | null)[]>([]);
  const innerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const cueRef = useRef<HTMLDivElement | null>(null);
  const railFillRef = useRef<HTMLDivElement | null>(null);
  const railIdxRef = useRef<HTMLSpanElement | null>(null);
  const lastIdx = useRef("00");

  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "error" | "done">("idle");

  useImperativeHandle(ref, () => ({
    update(p: number) {
      SECTIONS.forEach((sec, i) => {
        const el = panelRefs.current[i];
        const inner = innerRefs.current[i];
        if (!el || !inner) return;
        const [a, b] = sec.range;
        let vis: number;
        if (sec.id === "hero") {
          vis = 1 - sstep(0.085, 0.112, p);
        } else if (sec.id === "finale") {
          vis = sstep(a + 0.004, a + 0.032, p);
        } else {
          vis = sstep(a + 0.004, a + 0.03, p) * (1 - sstep(b - 0.032, b - 0.002, p));
        }
        el.style.opacity = vis.toFixed(3);
        const y = (1 - vis) * (reduced ? 8 : 34);
        inner.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
        el.style.visibility = vis <= 0.004 ? "hidden" : "visible";
        if (sec.id === "finale") {
          el.style.pointerEvents = vis > 0.6 ? "auto" : "none";
        }
      });

      // hero word parallax drift
      const hp = 1 - sstep(0.085, 0.112, p);
      wordRefs.current.forEach((w, i) => {
        if (!w) return;
        const dir = i === 1 ? -1 : 1;
        const dy = reduced ? 0 : (p - 0.03) * 220 * dir * (i === 1 ? 0.5 : 1);
        const dx = reduced ? 0 : Math.sin(p * 12 + i * 2.1) * 10 * dir;
        w.style.transform = `translate3d(${dx.toFixed(1)}px, ${(dy * hp).toFixed(1)}px, 0)`;
      });

      if (cueRef.current) {
        cueRef.current.style.opacity = (1 - sstep(0.004, 0.035, p)).toFixed(3);
      }
      if (railFillRef.current) {
        railFillRef.current.style.transform = `scaleY(${p.toFixed(4)})`;
      }
      if (railIdxRef.current) {
        let cur = "00";
        for (const s of SECTIONS) {
          if (p >= s.range[0] - 0.02 && p <= s.range[1] + 0.03) cur = s.index;
        }
        if (cur !== lastIdx.current) {
          lastIdx.current = cur;
          railIdxRef.current.textContent = cur;
        }
      }
    },
  }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setState("error");
      return;
    }
    try {
      localStorage.setItem("longwei_waitlist", email);
    } catch {
      /* private mode */
    }
    setState("done");
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      {/* ---------------- navbar ---------------- */}
      <header className="absolute inset-x-0 top-0 z-50">
        <div className="pointer-events-auto bg-gradient-to-b from-[#0a0405]/85 to-transparent">
          <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-5 md:h-[72px] md:px-10">
            <button
              onClick={() => onNavigate(0)}
              className="group flex items-baseline gap-2.5"
              aria-label="Longwei — back to top"
            >
              <span className="font-brush text-[22px] leading-none text-[#e3b95f] transition-colors group-hover:text-[#f2d38a]">
                龍威
              </span>
              <span className="font-display text-[15px] font-medium tracking-[0.42em] text-[#f3ead9]/90">
                LONGWEI
              </span>
            </button>
            <nav className="hidden items-center gap-9 md:flex" aria-label="Sections">
              {NAV_LINKS.slice(0, 4).map((l) => (
                <button
                  key={l.label}
                  onClick={() => onNavigate(l.p)}
                  className="text-[11px] font-light uppercase tracking-[0.34em] text-[#f3ead9]/55 transition-colors hover:text-[#e3b95f]"
                >
                  {l.label}
                </button>
              ))}
            </nav>
            <button
              onClick={() => onNavigate(0.94)}
              className="rounded-full border border-[#d4a743]/35 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.28em] text-[#e3b95f] transition-all hover:border-[#d4a743]/70 hover:bg-[#d4a743]/10 md:px-5"
            >
              Join the Waitlist
            </button>
          </div>
        </div>
      </header>

      {/* ---------------- progress rail ---------------- */}
      <div className="absolute right-6 top-1/2 z-50 hidden -translate-y-1/2 flex-col items-center gap-4 md:flex">
        <span className="text-[10px] font-light tracking-[0.3em] text-[#e3b95f]/70">
          <span ref={railIdxRef}>00</span>
        </span>
        <div className="relative h-28 w-px overflow-hidden bg-white/10">
          <div
            ref={railFillRef}
            className="absolute inset-x-0 top-0 h-full origin-top bg-gradient-to-b from-[#f2d38a] via-[#d4a743] to-[#a4161a]"
            style={{ transform: "scaleY(0)" }}
          />
        </div>
        <span className="text-[10px] font-light tracking-[0.3em] text-[#f3ead9]/30">06</span>
      </div>

      {/* ---------------- panels ---------------- */}
      {SECTIONS.map((sec, i) => {
        /* ------- HERO ------- */
        if (sec.id === "hero") {
          return (
            <section
              key={sec.id}
              ref={(el) => {
                panelRefs.current[i] = el;
              }}
              className="absolute inset-0"
              aria-label="Longwei — hero"
            >
              <div ref={(el) => {
                innerRefs.current[i] = el;
              }} className="absolute inset-0">
                {/* wordmark lockup above the ring */}
                <div className="absolute inset-x-0 top-[10.5%] flex flex-col items-center gap-3 md:top-[10%]">
                  <span className="text-[10px] font-light uppercase tracking-[0.5em] text-[#e3b95f]/70">
                    {sec.overline}
                  </span>
                  <div className="flex items-center gap-4 md:gap-7">
                    <span className="hairline w-10 md:w-20" />
                    <h1 className="gold-text font-display text-4xl font-semibold tracking-[0.3em] md:text-6xl">
                      LONGWEI
                    </h1>
                    <span className="hairline w-10 md:w-20" />
                  </div>
                </div>
                {/* the three words hovering through the ring */}
                <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center">
                  <div className="flex w-[92vw] max-w-[1050px] items-baseline justify-between px-2 md:px-10">
                    {HERO_WORDS.map((w, wi) => (
                      <span
                        key={w}
                        ref={(el) => {
                          wordRefs.current[wi] = el;
                        }}
                        className={`font-display text-[6.5vw] leading-none md:text-7xl ${
                          wi === 1
                            ? "gold-text font-semibold italic"
                            : "font-light text-[#f3ead9]/90"
                        }`}
                        style={{ textShadow: "0 4px 40px rgba(10,4,5,0.9)" }}
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
                {/* caption below the ring */}
                <p className="absolute inset-x-0 bottom-[12.5%] mx-auto max-w-[300px] text-center text-[13px] font-light leading-relaxed text-[#f3ead9]/60 md:bottom-[11%] md:max-w-sm md:text-sm">
                  Five thousand years of Chinese craft, reborn as collectible art —
                  awaken the dragon below.
                </p>
              </div>
            </section>
          );
        }

        /* ------- FINALE / CTA ------- */
        if (sec.id === "finale") {
          return (
            <section
              key={sec.id}
              ref={(el) => {
                panelRefs.current[i] = el;
              }}
              className="absolute inset-0"
              aria-label="Enter Longwei — join the waitlist"
            >
              <div className="absolute inset-0 flex items-center justify-center px-5">
                <div
                  ref={(el) => {
                    innerRefs.current[i] = el;
                  }}
                  className="glass-panel relative w-full max-w-xl rounded-3xl px-6 py-10 text-center md:px-14 md:py-14"
                >
                  <span className="font-brush pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 text-[86px] leading-none text-[#e3b95f]/10 md:text-[110px]">
                    {sec.mark}
                  </span>
                  <span className="text-[10px] font-light uppercase tracking-[0.5em] text-[#e3b95f]/80">
                    {sec.index} · {sec.overline} · {sec.cn}
                  </span>
                  <h2 className="gold-text mx-auto mt-4 font-display text-5xl font-semibold leading-[1.05] md:text-7xl">
                    {sec.title}
                  </h2>
                  <p className="ivory-dim mx-auto mt-5 max-w-md text-sm font-light leading-relaxed md:text-[15px]">
                    {sec.copy}
                  </p>

                  {state === "done" ? (
                    <div className="mx-auto mt-8 flex max-w-md items-center justify-center gap-3 rounded-full border border-[#57b08a]/40 bg-[#57b08a]/10 px-6 py-4">
                      <Check className="h-4 w-4 text-[#8fe3c0]" strokeWidth={2.4} />
                      <p className="text-sm font-light text-[#8fe3c0]">
                        You are on the ledger. The gate opens for you first.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={submit} className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setState("idle");
                        }}
                        placeholder="your@email.com"
                        aria-label="Email address"
                        className={`h-12 flex-1 rounded-full border bg-[#0a0405]/55 px-5 text-sm font-light text-[#f3ead9] placeholder:text-[#f3ead9]/30 focus:outline-none ${
                          state === "error"
                            ? "border-[#e5383b]/70"
                            : "border-[#d4a743]/25 focus:border-[#d4a743]/60"
                        }`}
                      />
                      <button
                        type="submit"
                        className="btn-gold flex h-12 items-center justify-center gap-2 rounded-full px-7 text-[11px] font-semibold uppercase tracking-[0.24em]"
                      >
                        Join the Waitlist
                        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </button>
                    </form>
                  )}
                  {state === "error" && (
                    <p className="mt-3 text-xs font-light text-[#e5383b]">
                      That address does not look right — try again.
                    </p>
                  )}
                  <p className="mt-6 text-[10px] font-light uppercase tracking-[0.3em] text-[#f3ead9]/35">
                    First drop · 300 numbered pieces · {sec.note}
                  </p>
                </div>
              </div>
            </section>
          );
        }

        /* ------- STANDARD SECTIONS ------- */
        const firstImg = sec.images[0];
        return (
          <section
            key={sec.id}
            ref={(el) => {
              panelRefs.current[i] = el;
            }}
            className="absolute inset-0"
            aria-label={sec.overline}
          >
            <div className="absolute inset-0 flex items-center justify-center px-5">
              <div
                ref={(el) => {
                  innerRefs.current[i] = el;
                }}
                className="relative w-full max-w-xl text-center"
              >
                {/* brush watermark on the central axis */}
                <span className="font-brush pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 text-[46vw] leading-none text-[#e3b95f]/[0.05] md:text-[24rem]">
                  {sec.mark}
                </span>

                <div className="glass-panel rounded-3xl px-6 py-9 md:px-12 md:py-12">
                  {mobile && firstImg && (
                    <img
                      src={firstImg.src}
                      alt={firstImg.alt}
                      loading="lazy"
                      className="mx-auto mb-6 h-36 w-64 rounded-xl border border-[#d4a743]/25 object-cover"
                    />
                  )}
                  <div className="flex items-center justify-center gap-3">
                    <span className="hairline w-8" />
                    <span className="text-[10px] font-light uppercase tracking-[0.46em] text-[#e3b95f]/85">
                      {sec.index} · {sec.overline} · {sec.cn}
                    </span>
                    <span className="hairline w-8" />
                  </div>
                  <h2 className="mt-5 font-display text-4xl font-semibold leading-[1.08] text-[#f3ead9] md:text-[3.4rem]">
                    {sec.title}
                  </h2>
                  <div className="mx-auto mt-5 flex w-24 items-center gap-2">
                    <span className="hairline flex-1" />
                    <span className="block h-1.5 w-1.5 rotate-45 bg-[#d4a743]" />
                    <span className="hairline flex-1" />
                  </div>
                  <p className="ivory-dim mx-auto mt-5 max-w-lg text-sm font-light leading-[1.85] md:text-[15px]">
                    {sec.copy}
                  </p>
                  {sec.chips && (
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                      {sec.chips.map((c) => (
                        <span
                          key={c}
                          className="chip rounded-full px-3.5 py-1.5 text-[10.5px] font-light tracking-[0.14em] text-[#e3b95f]/85"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-7 text-[10px] font-light uppercase tracking-[0.32em] text-[#f3ead9]/35">
                    {sec.note}
                  </p>
                </div>
              </div>
            </div>
          </section>
        );
      })}

      {/* ---------------- scroll cue ---------------- */}
      <div
        ref={cueRef}
        className="absolute inset-x-0 bottom-6 z-40 flex flex-col items-center gap-2.5"
      >
        <span className="text-[9px] font-light uppercase tracking-[0.5em] text-[#e3b95f]/60">
          Scroll to awaken the dragon
        </span>
        <div className="relative h-10 w-px overflow-hidden bg-white/10">
          <span className="cue-dot absolute left-0 top-0 h-4 w-px bg-gradient-to-b from-transparent via-[#e3b95f] to-[#a4161a]" />
        </div>
      </div>
    </div>
  );
});

export default Overlay;
