import { SessionContext } from "@/app/session";
import AppShell from "@/app/AppShell";
import { ContactsProvider } from "@/features/contacts/ContactsProvider";
import { ProfileProvider } from "@/features/profile/ProfileProvider";
import type { AppUser } from "@/lib/appSession";
import DemoBanner from "./DemoBanner";
import { SIGN_UP_PATH } from "./mode";
import { USER, USER_ID } from "./sampleData";

const DEMO_USER: AppUser = { id: USER_ID, email: USER.email, name: USER.name };

/**
 * The signed-in app with the auth gate swapped out: same providers, same AppShell, same
 * pages -- only the session is fixed to the sample student and the data comes from the
 * in-memory demo client. No Clerk, no linkIdentity.
 */
export default function DemoApp() {
  return (
    <SessionContext.Provider value={DEMO_USER}>
      <ProfileProvider>
        <ContactsProvider>
          <AppShell
            banner={<DemoBanner />}
            signOutLabel="Sign up free"
            onSignOut={() => window.location.assign(SIGN_UP_PATH)}
          />
        </ContactsProvider>
      </ProfileProvider>
    </SessionContext.Provider>
  );
}
