/**
 * The sign-in illustration: a kettle pours into a cup and a few contacts connect above it
 * ("coffee?" is the app's whole idea). Drawn flat in the app's own depth tones, cyan only
 * where the app uses it (the coffee and the contacts), no glow, gradient or outline.
 *
 * It is an ordinary block, not a background: the page gives it a box in the left column
 * (or a band above the card on phones) and the SVG scales to that box, so it can never sit
 * under the form. The resting state (kettle tilted, stream running, cup full, contacts
 * connected) is what people with `prefers-reduced-motion` see; the loop lives in
 * `.pour-*` rules in index.css and only applies when motion is allowed.
 */
export default function AuthIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 420"
      className={className}
      role="img"
      aria-label="A kettle pouring coffee into a cup, with a few contacts connecting above it"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <clipPath id="pour-opening">
          <ellipse cx="170" cy="250" rx="100" ry="16" />
        </clipPath>
      </defs>

      {/* ── Contacts (network) ── */}
      <g className="pour-network" fill="none">
        <g className="pour-link" stroke="#00E5FF" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round">
          <path d="M112 214 L62 170" />
          <path d="M112 214 L120 150" />
          <path d="M62 170 L120 150" />
          <path d="M112 214 L128 242" />
        </g>
        <circle className="pour-node pour-node-1" cx="112" cy="214" r="7" fill="#00E5FF" />
        <circle className="pour-node pour-node-2" cx="62" cy="170" r="5" fill="#00E5FF" fillOpacity="0.8" />
        <circle className="pour-node pour-node-3" cx="120" cy="150" r="5.5" fill="#00E5FF" fillOpacity="0.9" />
        <circle className="pour-node pour-node-4" cx="36" cy="228" r="4" fill="#00E5FF" fillOpacity="0.6" />
        <path className="pour-link" d="M62 170 L36 228" stroke="#00E5FF" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* ── Cup and saucer ── */}
      <ellipse cx="170" cy="399" rx="124" ry="13" fill="var(--color-depth-2)" />
      <ellipse cx="170" cy="394" rx="104" ry="9" fill="var(--color-depth-3)" />
      {/* handle */}
      <path
        d="M266 272 H288 Q322 272 322 306 Q322 340 288 340 H256"
        fill="none"
        stroke="var(--color-depth-3)"
        strokeWidth="15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* body */}
      <path
        d="M70 250 H270 L258 346 Q252 390 214 390 H126 Q88 390 82 346 Z"
        fill="var(--color-depth-3)"
      />
      <path
        d="M226 258 H270 L258 346 Q252 390 214 390 H204 Q232 340 226 258 Z"
        fill="var(--color-depth-2)"
        fillOpacity="0.7"
      />
      <path d="M90 270 Q94 326 104 356" fill="none" stroke="#fff" strokeOpacity="0.1" strokeWidth="6" strokeLinecap="round" />
      {/* opening, coffee, rim */}
      <ellipse cx="170" cy="250" rx="100" ry="16" fill="var(--color-depth-0)" />
      <g clipPath="url(#pour-opening)">
        <ellipse className="pour-coffee" cx="170" cy="252" rx="98" ry="14" fill="#00E5FF" fillOpacity="0.92" />
        <g className="pour-ripple-wrap">
          <ellipse className="pour-ripple" cx="171" cy="252" rx="14" ry="3.4" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.6" />
        </g>
      </g>
      <ellipse cx="170" cy="250" rx="100" ry="16" fill="none" stroke="#fff" strokeOpacity="0.14" strokeWidth="2" />

      {/* ── Stream ── */}
      <path
        className="pour-stream"
        d="M171 124 V252"
        pathLength="100"
        fill="none"
        stroke="#00E5FF"
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* ── Kettle (rotates about its centre, placed at 330,110) ── */}
      <g transform="translate(330 110)">
        <g className="pour-kettle">
          {/* handle */}
          <path
            d="M66 -36 H92 Q124 -36 124 0 Q124 36 92 36 H66"
            fill="none"
            stroke="var(--color-depth-3)"
            strokeWidth="15"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* gooseneck spout */}
          <path
            d="M-64 32 C-104 32 -112 -8 -132 -32 C-140 -42 -146 -47 -152 -54"
            fill="none"
            stroke="var(--color-depth-3)"
            strokeWidth="15"
            strokeLinecap="round"
          />
          {/* body */}
          <path
            d="M-72 -38 Q-72 -62 -48 -62 H48 Q72 -62 72 -38 V40 Q72 64 48 64 H-48 Q-72 64 -72 40 Z"
            fill="var(--color-depth-3)"
          />
          <path
            d="M24 -62 H48 Q72 -62 72 -38 V40 Q72 64 48 64 H24 Q40 0 24 -62 Z"
            fill="var(--color-depth-2)"
            fillOpacity="0.7"
          />
          <path d="M-54 -34 Q-58 0 -54 34" fill="none" stroke="#fff" strokeOpacity="0.1" strokeWidth="6" strokeLinecap="round" />
          {/* lid and knob */}
          <rect x="-44" y="-76" width="88" height="16" rx="8" fill="var(--color-depth-3)" />
          <circle cx="0" cy="-86" r="9" fill="#00E5FF" />
        </g>
      </g>
    </svg>
  );
}
