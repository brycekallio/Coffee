interface LogoProps {
  size?: "sm" | "lg";
  /** Large logo only: "start" left-aligns the stack (the sign-in page's hero column). */
  align?: "center" | "start";
}

function CoffeeCupIcon({ px }: { px: number }) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ filter: "drop-shadow(0 0 6px rgba(0,229,255,0.55))" }}
    >
      {/* Steam: organic S-curves */}
      <path d="M9 6 c-1,-1.5 1,-3 0,-4.5" />
      <path d="M13 6 c-1,-1.5 1,-3 0,-4.5" />
      {/* Cup body */}
      <path d="M3 9h14v8a3 3 0 01-3 3H6a3 3 0 01-3-3V9z" />
      {/* Handle: C-curve */}
      <path d="M17 11c3 0 3 6 0 6" />
    </svg>
  );
}

export default function Logo({ size = "sm", align = "center" }: LogoProps) {
  if (size === "lg") {
    return (
      <div className={`flex flex-col gap-3 ${align === "start" ? "items-start" : "items-center"}`}>
        <span className="text-glow">
          <CoffeeCupIcon px={56} />
        </span>
        <span className="text-4xl font-bold tracking-tight text-white">Coffee?</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-glow">
        <CoffeeCupIcon px={28} />
      </span>
      <span className="hidden text-base font-bold tracking-tight text-white md:inline">Coffee?</span>
    </div>
  );
}
