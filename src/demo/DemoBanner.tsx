/**
 * The demo's one persistent message, pinned above the nav (AppShell puts it inside its
 * sticky header). Says what this is, and gives the way out. A plain link on purpose:
 * leaving the demo is a full page load, which is what resets demo mode.
 */
export default function DemoBanner() {
  return (
    <div className="bg-depth-2" role="status">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-1.5 md:px-6">
        <p className="min-w-0 text-[13px] leading-snug text-white/70">
          <span className="font-medium text-white">Demo</span>
          <span className="hidden sm:inline"> · Sample data, nothing you do is saved.</span>
          <span className="sm:hidden"> · Sample data</span>
        </p>
        <a
          href="/"
          className="flex-shrink-0 rounded-lg bg-white px-3 py-1 text-[13px] font-semibold text-depth-0 transition-opacity hover:opacity-90"
        >
          Sign up free
        </a>
      </div>
    </div>
  );
}
