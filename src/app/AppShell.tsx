import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import Logo from "@/components/ui/Logo";
import ContactsPage from "@/features/contacts/ContactsPage";
import { useProfile } from "@/features/profile/profileContext";
import { useContacts } from "@/features/contacts/contactsContext";
import { clearCachedUserId } from "@/lib/appSession";
import { supabase } from "@/lib/supabase";
import { initialsFromName } from "@/lib/utils";
import type { Page } from "@/types";
import { useSession } from "./session";
import { useRoute } from "./useRoute";

// Contacts is the landing page, so it stays in the entry chunk. Everything else loads
// on first visit — Analytics alone pulls in Recharts.
const ContactDetailsPage = lazy(() => import("@/features/contacts/ContactDetailsPage"));
const ApplicationsPage = lazy(() => import("@/features/applications/ApplicationsPage"));
const AnalyticsPage = lazy(() => import("@/features/analytics/AnalyticsPage"));
const SettingsPage = lazy(() => import("@/features/profile/SettingsPage"));
const OnboardingPage = lazy(() => import("@/features/profile/OnboardingPage"));
const WatchlistPage = lazy(() => import("@/pages/WatchlistPage"));
const OutreachEmailsPage = lazy(() => import("@/pages/OutreachEmailsPage"));
const JdScorerPage = lazy(() => import("@/pages/JdScorerPage"));

function PageFallback() {
  return (
    <div className="flex justify-center py-24" role="status" aria-label="Loading">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-glow/20 border-t-glow/70" />
    </div>
  );
}

/**
 * The signed-in app: top nav and whichever page is open. Every feature owns its own
 * data, so all this holds is navigation state and the nav's outreach badge.
 */
export default function AppShell({
  onSignOut,
  signOutLabel = "Sign out",
  banner,
}: {
  /** What the profile menu's last item does. App passes Clerk's signOut; the demo sends you to sign up. */
  onSignOut: () => void | Promise<void>;
  signOutLabel?: string;
  /** Pinned above the nav, inside the sticky header (the demo's "sample data" bar). */
  banner?: ReactNode;
}) {
  const user = useSession();
  const { profile, needsOnboarding } = useProfile();

  const { route, navigate } = useRoute();
  const page = route.page;
  const selectedContactId = route.contactId ?? "";
  const setPage = (next: Page) => navigate({ page: next });
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [networkDropdownOpen, setNetworkDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dueOutreachCount, setDueOutreachCount] = useState(0);

  // First load decides whether to start in onboarding. Adjusting state during render
  // (rather than in an effect) avoids painting the contact list for one frame first.
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  if (profile && !onboardingChecked) {
    setOnboardingChecked(true);
    // replace, not push: Back from onboarding shouldn't land on a page the user never chose.
    if (needsOnboarding) navigate({ page: "onboarding" }, { replace: true });
  }

  useEffect(() => {
    supabase
      .from("scheduled_outreach")
      .select("id")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString())
      .then(({ data }) => setDueOutreachCount(data?.length ?? 0));
  }, []);

  async function signOut() {
    setProfileMenuOpen(false);
    clearCachedUserId();
    // Signing out unmounts this tree (App drops to the auth page), which discards every
    // feature's state — nothing to reset by hand.
    await onSignOut();
  }

  function openDetails(contactId: string) {
    navigate({ page: "contact_details", contactId });
  }

  function handleFollowUp() {
    setPage("outreach_emails");
  }

  // Every screen names itself in an h1; the line under it states the screen's finding.
  const { contacts } = useContacts();
  const openContact = contacts.find((c) => c.id === selectedContactId);
  const { title, subtitle } = ((): { title: string | null; subtitle?: string } => {
    switch (page) {
      case "contacts":
        return { title: "Network", subtitle: `${contacts.length} ${contacts.length === 1 ? "person" : "people"}` };
      case "contact_details":
        return {
          title: openContact ? [openContact.first_name, openContact.last_name].filter(Boolean).join(" ") || "Contact" : "Contact",
          subtitle: openContact ? [openContact.title, openContact.company].filter(Boolean).join(" · ") : undefined,
        };
      case "network_watchlist":
        return { title: "Watchlist", subtitle: "People you want to meet, and when to reach out." };
      case "outreach_emails":
        return {
          title: "Outreach",
          subtitle: dueOutreachCount > 0 ? `${dueOutreachCount} ${dueOutreachCount === 1 ? "message is" : "messages are"} due now.` : "Nothing due right now.",
        };
      case "applications":
        return { title: "Applications" };
      case "jd_scorer":
        return { title: "Job description match", subtitle: "Paste a posting to see how your resume lines up." };
      case "analytics":
        return { title: "Analytics" };
      case "settings":
        return { title: "Settings" };
      default:
        return { title: null }; // onboarding has its own full-screen layout
    }
  })();

  const profileLabel = profile?.full_name?.trim() || user.email?.split("@")[0] || "User";
  const avatarText = initialsFromName(profileLabel);

  const navLinkCls = (active: boolean) =>
    `relative px-3 py-2 rounded-lg text-[13px] font-medium cursor-pointer transition duration-200 ${
      // Active by brightness and a neutral step, never the accent: cyan is for data.
      active
        ? "text-white bg-white/[0.07]"
        : "text-white/60 hover:text-white hover:bg-white/[0.04]"
    }`;

  return (
    <div className="min-h-screen text-white">

      {/* Top Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.04] bg-depth-0">
        {banner}
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 md:px-6">
          {/* Left: Logo + Nav Links */}
          <div className="flex items-center gap-1 md:gap-1.5">
            <button
              onClick={() => { setPage("contacts"); }}
              className="mr-3 md:mr-5 cursor-pointer transition-opacity hover:opacity-80"
            >
              <Logo size="sm" />
            </button>

            {/* Desktop nav links */}
            <div className="hidden items-center gap-0.5 md:flex">
              {/* Network dropdown */}
              <div className="relative">
                <button
                  onClick={() => setNetworkDropdownOpen((v) => !v)}
                  className={navLinkCls(page === "contacts" || page === "contact_details" || page === "network_watchlist")}
                >
                  <span className="flex items-center gap-1">
                    Network
                    <svg className={`h-3 w-3 transition-transform duration-200 ${networkDropdownOpen ? "rotate-180" : ""} ${page === "contacts" || page === "contact_details" || page === "network_watchlist" ? "text-white/60" : "text-white/30"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </button>
                {networkDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setNetworkDropdownOpen(false)} />
                    <div className="absolute left-0 z-50 mt-2 w-52 overflow-hidden rounded-xl bg-depth-1/95 border border-white/[0.06] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                      <div className="p-1.5">
                        <button
                          onClick={() => { setPage("contacts"); setNetworkDropdownOpen(false); }}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors cursor-pointer ${page === "contacts" || page === "contact_details" ? "bg-glow/[0.08] text-glow font-medium" : "text-white/60 hover:bg-white/[0.04] hover:text-white"}`}
                        >
                          <svg className={`h-4 w-4 ${page === "contacts" || page === "contact_details" ? "text-glow/70" : "text-white/30"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Contacts
                        </button>
                        <button
                          onClick={() => { setPage("network_watchlist"); setNetworkDropdownOpen(false); }}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors cursor-pointer ${page === "network_watchlist" ? "bg-glow/[0.08] text-glow font-medium" : "text-white/60 hover:bg-white/[0.04] hover:text-white"}`}
                        >
                          <svg className={`h-4 w-4 ${page === "network_watchlist" ? "text-glow/70" : "text-white/30"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Watchlist
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={() => { setPage("outreach_emails"); }}
                className={`${navLinkCls(page === "outreach_emails")} relative`}
              >
                Outreach
                {dueOutreachCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-glow px-1 text-[11px] font-bold text-depth-0">
                    {dueOutreachCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => { setPage("applications"); }}
                className={navLinkCls(page === "applications")}
              >
                Applications
              </button>

              <button
                onClick={() => { setPage("jd_scorer"); }}
                className={navLinkCls(page === "jd_scorer")}
              >
                JD Comparison
              </button>

              <button
                onClick={() => { setPage("analytics"); }}
                className={navLinkCls(page === "analytics")}
              >
                Analytics
              </button>
            </div>
          </div>

          {/* Right: Profile + Mobile hamburger */}
          <div className="flex items-center gap-2">
            {/* Settings icon (desktop) */}
            <button
              onClick={() => { setPage("settings"); }}
              className={`hidden md:flex items-center justify-center h-8 w-8 rounded-lg transition duration-200 cursor-pointer ${page === "settings" ? "bg-white/[0.07] text-white" : "text-white/60 hover:text-white hover:bg-white/[0.04]"}`}
              title="Settings"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {/* Divider */}
            <div className="hidden md:block h-5 w-px bg-white/[0.06]" />

            {/* Profile menu */}
            <div className="relative">
              <button
                onClick={() => setProfileMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-2 py-1.5 transition duration-200 hover:bg-white/[0.06] border border-transparent hover:border-white/[0.06] md:gap-2.5 md:px-2.5 cursor-pointer"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.08] text-[11px] font-bold text-white/80">
                  {avatarText}
                </div>
                <div className="hidden text-left lg:block">
                  <div className="text-[13px] font-medium text-white/80 leading-tight">{profileLabel}</div>
                </div>
                <svg className={`hidden md:block h-3 w-3 text-white/20 transition-transform duration-200 ${profileMenuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {profileMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProfileMenuOpen(false)} />
                  <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl bg-depth-1/95 border border-white/[0.06] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                    {/* Profile header in dropdown */}
                    <div className="px-4 py-3 border-b border-white/[0.06]">
                      <div className="text-sm font-medium text-white/80">{profileLabel}</div>
                      <div className="font-data text-white/30 mt-0.5">{user.email}</div>
                    </div>
                    <div className="p-1.5">
                      <button
                        onClick={() => { setPage("settings"); setProfileMenuOpen(false); }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-white/60 transition-colors hover:bg-white/[0.04] hover:text-white cursor-pointer"
                      >
                        <svg className="h-4 w-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Settings
                      </button>
                      <button
                        onClick={() => { setProfileMenuOpen(false); signOut(); }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-white/60 transition-colors hover:bg-white/[0.04] hover:text-white cursor-pointer"
                      >
                        <svg className="h-4 w-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        {signOutLabel}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="inline-flex items-center justify-center rounded-lg bg-white/[0.03] p-2 transition duration-200 hover:bg-white/[0.06] md:hidden cursor-pointer"
              aria-label="Open menu"
            >
              <div className="relative h-4 w-4">
                <span className={`absolute left-0 h-0.5 w-4 rounded bg-white/50 transition duration-300 ${mobileMenuOpen ? "top-[7px] rotate-45" : "top-0.5"}`} />
                <span className={`absolute left-0 top-[7px] h-0.5 w-4 rounded bg-white/50 transition duration-300 ${mobileMenuOpen ? "opacity-0 scale-0" : "opacity-100"}`} />
                <span className={`absolute left-0 h-0.5 w-4 rounded bg-white/50 transition duration-300 ${mobileMenuOpen ? "top-[7px] -rotate-45" : "top-[13px]"}`} />
              </div>
            </button>
          </div>
        </div>

        {/* Mobile menu — slide down */}
        <div
          className={`overflow-hidden transition duration-300 ease-out md:hidden ${mobileMenuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
        >
          <div className="border-t border-white/[0.04] px-4 pb-4 pt-2 space-y-0.5">
            <button onClick={() => { setPage("contacts"); setMobileMenuOpen(false); }} className={`${navLinkCls(page === "contacts" || page === "contact_details")} block w-full text-left py-2.5`}>
              <span className="flex items-center gap-3">
                <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Network
              </span>
            </button>
            <button onClick={() => { setPage("network_watchlist"); setMobileMenuOpen(false); }} className={`${navLinkCls(page === "network_watchlist")} block w-full text-left py-2.5`}>
              <span className="flex items-center gap-3">
                <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                Watchlist
              </span>
            </button>
            <button onClick={() => { setPage("outreach_emails"); setMobileMenuOpen(false); }} className={`${navLinkCls(page === "outreach_emails")} block w-full text-left py-2.5`}>
              <span className="flex items-center gap-3">
                <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                Outreach
                {dueOutreachCount > 0 && <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-glow px-1.5 text-[10px] font-bold text-depth-0">{dueOutreachCount}</span>}
              </span>
            </button>
            <button onClick={() => { setPage("applications"); setMobileMenuOpen(false); }} className={`${navLinkCls(page === "applications")} block w-full text-left py-2.5`}>
              <span className="flex items-center gap-3">
                <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Applications
              </span>
            </button>
            <button onClick={() => { setPage("jd_scorer"); setMobileMenuOpen(false); }} className={`${navLinkCls(page === "jd_scorer")} block w-full text-left py-2.5`}>
              <span className="flex items-center gap-3">
                <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                JD Comparison
              </span>
            </button>
            <button onClick={() => { setPage("analytics"); setMobileMenuOpen(false); }} className={`${navLinkCls(page === "analytics")} block w-full text-left py-2.5`}>
              <span className="flex items-center gap-3">
                <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                Analytics
              </span>
            </button>
            <div className="my-2 h-px bg-white/[0.04]" />
            <button onClick={() => { setPage("settings"); setMobileMenuOpen(false); }} className={`${navLinkCls(page === "settings")} block w-full text-left py-2.5`}>
              <span className="flex items-center gap-3">
                <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Settings
              </span>
            </button>
          </div>
        </div>
      </nav>

      <div className="page-enter">
        {title ? (
          <header className="mx-auto max-w-7xl px-4 pb-6 pt-8 md:px-6">
            <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-white/60">{subtitle}</p> : null}
          </header>
        ) : null}
        <Suspense fallback={<PageFallback />}>

        {/* APPLICATIONS PAGE */}
        {page === "applications" ? <ApplicationsPage /> : null}

        {/* ANALYTICS PAGE */}
        {page === "analytics" ? <AnalyticsPage /> : null}

        {/* NETWORK PAGE */}
        {page === "contacts" ? <ContactsPage openDetails={openDetails} onFollowUp={handleFollowUp} /> : null}

        {/* DETAILS PAGE */}
        {page === "contact_details" ? (
          <ContactDetailsPage
            contactId={selectedContactId}
            onBack={() => setPage("contacts")}
          />
        ) : null}

        {/* OUTREACH EMAILS PAGE */}
        {page === "outreach_emails" ? <OutreachEmailsPage /> : null}

        {/* JD SCORER PAGE */}
        {page === "jd_scorer" ? <JdScorerPage onGoToSettings={() => setPage("settings")} /> : null}

        {/* NETWORK WATCHLIST PAGE */}
        {page === "network_watchlist" ? <WatchlistPage /> : null}

        {/* ONBOARDING PAGE */}
        {page === "onboarding" ? (
          profile ? <OnboardingPage onDone={() => setPage("contacts")} /> : <PageFallback />
        ) : null}

        {/* SETTINGS PAGE */}
        {page === "settings" ? (
          profile ? <SettingsPage onContactsImported={() => setPage("contacts")} /> : <PageFallback />
        ) : null}

        </Suspense>

      </div>
    </div>
  );
}
