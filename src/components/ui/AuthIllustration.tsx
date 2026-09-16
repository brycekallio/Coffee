import { useRef } from "react";

/**
 * Generates the decorative particle field once. Deliberately non-deterministic (random
 * size/position/timing per particle) — must run exactly once per mount, via the lazy-ref
 * pattern below, rather than during render (useMemo's callback still counts as render).
 */
function generateParticles() {
  return Array.from({ length: 35 }, (_, i) => {
    const size = 2 + Math.random() * 3;
    const left = Math.random() * 100;
    const delay = Math.random() * 20;
    const duration = 15 + Math.random() * 25;
    const riseHeight = 10 + Math.random() * 20;
    const isAlt = i % 3 === 0;
    const colors = [
      "rgba(0, 229, 255, 0.7)",
      "rgba(0, 229, 255, 0.4)",
      "rgba(0, 255, 198, 0.5)",
      "rgba(124, 77, 255, 0.4)",
      "rgba(0, 168, 168, 0.5)",
      "rgba(79, 195, 247, 0.3)",
    ];
    const color = colors[i % colors.length];

    return (
      <div
        key={i}
        className="particle"
        style={{
          width: size,
          height: size,
          left: `${left}%`,
          bottom: `-${riseHeight}px`,
          backgroundColor: color,
          boxShadow: `0 0 ${size * 2}px ${color}`,
          animation: `${isAlt ? "particle-rise-alt" : "particle-rise"} ${duration}s linear ${delay}s infinite`,
        }}
      />
    );
  });
}

export default function AuthIllustration() {
  const particlesRef = useRef<ReturnType<typeof generateParticles> | null>(null);
  if (particlesRef.current === null) particlesRef.current = generateParticles();
  const particles = particlesRef.current;

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <style>{`
        /* ── Pot tilt ── */
        @keyframes auth-pot-tilt {
          0%, 10%   { transform: rotate(0deg); }
          26%, 70%  { transform: rotate(24deg); }
          84%, 100% { transform: rotate(0deg); }
        }

        /* ── Stream: flows from spout into mug ── */
        @keyframes auth-stream-main {
          0%, 18%  { opacity: 0; stroke-dashoffset: 70; }
          30%      { opacity: 1; stroke-dashoffset: 0; }
          68%      { opacity: 1; stroke-dashoffset: 0; }
          78%      { opacity: 0; stroke-dashoffset: -70; }
          100%     { opacity: 0; stroke-dashoffset: -70; }
        }
        @keyframes auth-stream-core {
          0%, 20%  { opacity: 0; stroke-dashoffset: 50; }
          32%      { opacity: 1; stroke-dashoffset: 0; }
          67%      { opacity: 1; stroke-dashoffset: 0; }
          77%      { opacity: 0; stroke-dashoffset: -50; }
          100%     { opacity: 0; stroke-dashoffset: -50; }
        }

        /* ── Mug liquid fill ── */
        @keyframes auth-liquid-fill {
          0%, 24%   { transform: scaleY(0); }
          64%, 74%  { transform: scaleY(1); }
          92%, 100% { transform: scaleY(0); }
        }
        @keyframes auth-liquid-sheen {
          0%, 100% { opacity: 0.15; }
          50%      { opacity: 0.38; }
        }

        /* ── Network nodes rise from mug ── */
        @keyframes auth-node-a {
          0%, 38%  { opacity: 0; transform: translate(0px, 0px) scale(0); }
          48%      { opacity: 1; transform: translate(-58px, -52px) scale(1); }
          72%      { opacity: 1; transform: translate(-58px, -52px) scale(1); }
          84%      { opacity: 0; transform: translate(-58px, -72px) scale(0.5); }
          100%     { opacity: 0; transform: translate(-58px, -72px) scale(0); }
        }
        @keyframes auth-node-b {
          0%, 40%  { opacity: 0; transform: translate(0px, 0px) scale(0); }
          50%      { opacity: 1; transform: translate(0px, -80px) scale(1); }
          72%      { opacity: 1; transform: translate(0px, -80px) scale(1); }
          84%      { opacity: 0; transform: translate(0px, -105px) scale(0.5); }
          100%     { opacity: 0; transform: translate(0px, -105px) scale(0); }
        }
        @keyframes auth-node-c {
          0%, 42%  { opacity: 0; transform: translate(0px, 0px) scale(0); }
          52%      { opacity: 1; transform: translate(62px, -48px) scale(1); }
          72%      { opacity: 1; transform: translate(62px, -48px) scale(1); }
          84%      { opacity: 0; transform: translate(62px, -68px) scale(0.5); }
          100%     { opacity: 0; transform: translate(62px, -68px) scale(0); }
        }
        @keyframes auth-node-d {
          0%, 46%  { opacity: 0; transform: translate(0px, 0px) scale(0); }
          56%      { opacity: 1; transform: translate(-105px, -118px) scale(1); }
          72%      { opacity: 1; transform: translate(-105px, -118px) scale(1); }
          84%      { opacity: 0; transform: translate(-105px, -142px) scale(0.5); }
          100%     { opacity: 0; transform: translate(-105px, -142px) scale(0); }
        }
        @keyframes auth-node-e {
          0%, 48%  { opacity: 0; transform: translate(0px, 0px) scale(0); }
          58%      { opacity: 1; transform: translate(22px, -148px) scale(1); }
          72%      { opacity: 1; transform: translate(22px, -148px) scale(1); }
          84%      { opacity: 0; transform: translate(22px, -175px) scale(0.5); }
          100%     { opacity: 0; transform: translate(22px, -175px) scale(0); }
        }
        @keyframes auth-node-f {
          0%, 50%  { opacity: 0; transform: translate(0px, 0px) scale(0); }
          60%      { opacity: 1; transform: translate(108px, -128px) scale(1); }
          72%      { opacity: 1; transform: translate(108px, -128px) scale(1); }
          84%      { opacity: 0; transform: translate(108px, -155px) scale(0.5); }
          100%     { opacity: 0; transform: translate(108px, -155px) scale(0); }
        }

        /* ── Network edge lines draw in ── */
        @keyframes auth-edge-draw {
          0%, 48%  { opacity: 0; stroke-dashoffset: 160; }
          60%      { opacity: 0.65; stroke-dashoffset: 0; }
          72%      { opacity: 0.65; stroke-dashoffset: 0; }
          84%      { opacity: 0; stroke-dashoffset: 0; }
          100%     { opacity: 0; }
        }
        @keyframes auth-edge-draw-2 {
          0%, 50%  { opacity: 0; stroke-dashoffset: 160; }
          62%      { opacity: 0.5; stroke-dashoffset: 0; }
          72%      { opacity: 0.5; stroke-dashoffset: 0; }
          84%      { opacity: 0; }
          100%     { opacity: 0; }
        }
        @keyframes auth-edge-draw-3 {
          0%, 52%  { opacity: 0; stroke-dashoffset: 160; }
          64%      { opacity: 0.4; stroke-dashoffset: 0; }
          72%      { opacity: 0.4; stroke-dashoffset: 0; }
          84%      { opacity: 0; }
          100%     { opacity: 0; }
        }

        /* ── Node pulse ── */
        @keyframes auth-node-pulse {
          0%, 100% { r: 7; opacity: 1; }
          50%      { r: 9; opacity: 0.8; }
        }

        /* ── CSS classes ── */
        .auth-pot-group {
          transform-box: fill-box;
          transform-origin: right center;
          animation: auth-pot-tilt 9s ease-in-out infinite;
        }
        .auth-stream-main {
          stroke-dasharray: 70;
          stroke-dashoffset: 70;
          animation: auth-stream-main 9s ease-in-out infinite;
        }
        .auth-stream-core {
          stroke-dasharray: 50;
          stroke-dashoffset: 50;
          animation: auth-stream-core 9s ease-in-out infinite;
        }
        .auth-liquid {
          transform-box: fill-box;
          transform-origin: center bottom;
          animation: auth-liquid-fill 9s ease-in-out infinite;
        }
        .auth-liquid-sheen {
          animation: auth-liquid-sheen 2.8s ease-in-out infinite;
        }
        /* Node origins all start from mug rim center */
        .auth-node-origin {
          transform-origin: 160px 195px;
        }
        .auth-node-a { animation: auth-node-a 9s ease-in-out infinite; }
        .auth-node-b { animation: auth-node-b 9s ease-in-out infinite; }
        .auth-node-c { animation: auth-node-c 9s ease-in-out infinite; }
        .auth-node-d { animation: auth-node-d 9s ease-in-out infinite; }
        .auth-node-e { animation: auth-node-e 9s ease-in-out infinite; }
        .auth-node-f { animation: auth-node-f 9s ease-in-out infinite; }
        .auth-edge-ab { stroke-dasharray: 160; animation: auth-edge-draw   9s ease-in-out infinite; }
        .auth-edge-bc { stroke-dasharray: 160; animation: auth-edge-draw   9s ease-in-out infinite; }
        .auth-edge-ad { stroke-dasharray: 160; animation: auth-edge-draw-2 9s ease-in-out infinite; }
        .auth-edge-be { stroke-dasharray: 160; animation: auth-edge-draw-2 9s ease-in-out infinite; }
        .auth-edge-cf { stroke-dasharray: 160; animation: auth-edge-draw-3 9s ease-in-out infinite; }
        .auth-edge-df { stroke-dasharray: 160; animation: auth-edge-draw-3 9s ease-in-out infinite; }
      `}</style>

      {/* Base depth */}
      <div className="absolute inset-0 bg-depth-0" />

      {/* Living canvas */}
      <div className="absolute inset-0 living-canvas-auth" />

      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,229,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.15) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      {/* Central glow behind form */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_45%,rgba(0,229,255,0.08),transparent_70%)]" />

      {/* ── Coffee + Network Animation ── */}
      <div
        className="absolute pointer-events-none select-none"
        style={{
          bottom: "1%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "380px",
          height: "420px",
          opacity: 0.62,
        }}
      >
        <svg
          viewBox="0 0 320 400"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ overflow: "visible" }}
        >
          <defs>
            <filter id="auth-glow-strong" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="auth-glow-soft" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="auth-stream-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00E5FF" stopOpacity="1" />
              <stop offset="100%" stopColor="#00FFC6" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id="auth-liquid-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#00B8D9" stopOpacity="0.5" />
            </linearGradient>
            <clipPath id="auth-mug-clip">
              <rect x="95" y="218" width="130" height="100" rx="9" />
            </clipPath>
          </defs>

          {/* ═══════════════════════════════
              NETWORK NODES + EDGES
              All positioned relative to mug rim center (160, 215)
              Nodes animate translateX/Y outward from that origin
          ════════════════════════════════ */}

          {/* Edge: A ↔ B */}
          <line
            className="auth-node-origin auth-edge-ab"
            x1="102" y1="163" x2="160" y2="135"
            stroke="rgba(0,229,255,0.55)" strokeWidth="1.3"
          />
          {/* Edge: B ↔ C */}
          <line
            className="auth-node-origin auth-edge-bc"
            x1="160" y1="135" x2="222" y2="167"
            stroke="rgba(0,229,255,0.55)" strokeWidth="1.3"
          />
          {/* Edge: A ↔ D */}
          <line
            className="auth-node-origin auth-edge-ad"
            x1="102" y1="163" x2="55" y2="77"
            stroke="rgba(0,255,198,0.45)" strokeWidth="1.1"
          />
          {/* Edge: B ↔ E */}
          <line
            className="auth-node-origin auth-edge-be"
            x1="160" y1="135" x2="182" y2="67"
            stroke="rgba(0,255,198,0.45)" strokeWidth="1.1"
          />
          {/* Edge: C ↔ F */}
          <line
            className="auth-node-origin auth-edge-cf"
            x1="222" y1="167" x2="268" y2="87"
            stroke="rgba(79,195,247,0.4)" strokeWidth="1.0"
          />
          {/* Edge: D ↔ F (long cross edge) */}
          <line
            className="auth-node-origin auth-edge-df"
            x1="55" y1="77" x2="268" y2="87"
            stroke="rgba(79,195,247,0.3)" strokeWidth="1.0"
          />

          {/* NODE A */}
          <g className="auth-node-origin auth-node-a" filter="url(#auth-glow-strong)">
            <circle cx="160" cy="215" r="7" fill="#00E5FF" fillOpacity="0.9" />
            <circle cx="160" cy="215" r="11" fill="none" stroke="rgba(0,229,255,0.35)" strokeWidth="1.5" />
          </g>
          {/* NODE B */}
          <g className="auth-node-origin auth-node-b" filter="url(#auth-glow-strong)">
            <circle cx="160" cy="215" r="8.5" fill="#00FFC6" fillOpacity="0.85" />
            <circle cx="160" cy="215" r="13" fill="none" stroke="rgba(0,255,198,0.3)" strokeWidth="1.5" />
          </g>
          {/* NODE C */}
          <g className="auth-node-origin auth-node-c" filter="url(#auth-glow-strong)">
            <circle cx="160" cy="215" r="7" fill="#00E5FF" fillOpacity="0.9" />
            <circle cx="160" cy="215" r="11" fill="none" stroke="rgba(0,229,255,0.35)" strokeWidth="1.5" />
          </g>
          {/* NODE D — smaller, secondary */}
          <g className="auth-node-origin auth-node-d" filter="url(#auth-glow-soft)">
            <circle cx="160" cy="215" r="5.5" fill="#4FC3F7" fillOpacity="0.8" />
            <circle cx="160" cy="215" r="9" fill="none" stroke="rgba(79,195,247,0.3)" strokeWidth="1.2" />
          </g>
          {/* NODE E */}
          <g className="auth-node-origin auth-node-e" filter="url(#auth-glow-soft)">
            <circle cx="160" cy="215" r="6" fill="#00FFC6" fillOpacity="0.75" />
            <circle cx="160" cy="215" r="9.5" fill="none" stroke="rgba(0,255,198,0.3)" strokeWidth="1.2" />
          </g>
          {/* NODE F */}
          <g className="auth-node-origin auth-node-f" filter="url(#auth-glow-soft)">
            <circle cx="160" cy="215" r="5.5" fill="#4FC3F7" fillOpacity="0.8" />
            <circle cx="160" cy="215" r="9" fill="none" stroke="rgba(79,195,247,0.3)" strokeWidth="1.2" />
          </g>

          {/* ═══════════════════════════════
              MUG
          ════════════════════════════════ */}
          {/* Mug body */}
          <rect
            x="92" y="215"
            width="136" height="104"
            rx="10"
            fill="rgba(2,13,18,0.93)"
            stroke="rgba(0,229,255,0.35)"
            strokeWidth="1.8"
            filter="url(#auth-glow-soft)"
          />

          {/* Liquid fill */}
          <rect
            className="auth-liquid"
            x="95" y="218"
            width="130" height="100"
            rx="9"
            fill="url(#auth-liquid-grad)"
            fillOpacity="0.42"
            clipPath="url(#auth-mug-clip)"
          />

          {/* Liquid top sheen */}
          <ellipse
            className="auth-liquid-sheen"
            cx="160" cy="220"
            rx="62" ry="5.5"
            fill="rgba(0,229,255,0.55)"
            clipPath="url(#auth-mug-clip)"
          />

          {/* Mug handle */}
          <path
            d="M 228 232 C 268 232 268 284 228 284"
            stroke="rgba(0,229,255,0.32)"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            filter="url(#auth-glow-soft)"
          />

          {/* Mug rim */}
          <rect
            x="84" y="204"
            width="152" height="16"
            rx="8"
            fill="rgba(2,13,18,0.95)"
            stroke="rgba(0,229,255,0.42)"
            strokeWidth="1.8"
            filter="url(#auth-glow-soft)"
          />

          {/* ═══════════════════════════════
              STREAM
          ════════════════════════════════ */}
          {/* Glow halo */}
          <path
            className="auth-stream-main"
            d="M 138 158 C 138 178 148 192 152 208"
            stroke="rgba(0,229,255,0.5)"
            strokeWidth="9"
            strokeLinecap="round"
            filter="url(#auth-glow-strong)"
          />
          {/* Core stream */}
          <path
            className="auth-stream-core"
            d="M 138 158 C 138 178 148 192 152 208"
            stroke="url(#auth-stream-grad)"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* ═══════════════════════════════
              COFFEE POT
          ════════════════════════════════ */}
          <g className="auth-pot-group">
            {/* Body */}
            <ellipse
              cx="175" cy="100"
              rx="60" ry="46"
              fill="rgba(2,13,18,0.93)"
              stroke="rgba(0,229,255,0.35)"
              strokeWidth="1.8"
              filter="url(#auth-glow-soft)"
            />
            {/* Body sheen */}
            <ellipse cx="162" cy="83" rx="28" ry="19" fill="rgba(0,229,255,0.04)" />

            {/* Spout — left side */}
            <path
              d="M 118 115 C 98 128 90 144 100 157 C 106 165 120 167 128 163"
              stroke="rgba(0,229,255,0.33)"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="rgba(2,13,18,0.95)"
              filter="url(#auth-glow-soft)"
            />

            {/* Handle — right side */}
            <path
              d="M 230 88 C 262 88 262 116 230 116"
              stroke="rgba(0,229,255,0.32)"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
              filter="url(#auth-glow-soft)"
            />

            {/* Lid */}
            <ellipse
              cx="175" cy="57"
              rx="44" ry="10"
              fill="rgba(2,13,18,0.93)"
              stroke="rgba(0,229,255,0.33)"
              strokeWidth="1.8"
              filter="url(#auth-glow-soft)"
            />
            {/* Lid knob */}
            <line x1="175" y1="47" x2="175" y2="40"
              stroke="rgba(0,229,255,0.42)" strokeWidth="2" strokeLinecap="round" />
            <circle
              cx="175" cy="35" r="7"
              fill="rgba(2,13,18,0.93)"
              stroke="rgba(0,229,255,0.42)"
              strokeWidth="1.8"
              filter="url(#auth-glow-soft)"
            />
          </g>
        </svg>
      </div>

      {/* Particles */}
      {particles}

      {/* Depth vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,transparent_30%,rgba(8,20,24,0.7)_100%)]" />
    </div>
  );
}
