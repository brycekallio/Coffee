/**
 * Demo bootstrap, loaded as its own chunk and only when the URL is /demo -- real users
 * never download the sample data. Importing this module is what arms the demo: it
 * installs the in-memory database and the network guard before anything can render.
 */
import { installDemoClient } from "@/lib/supabase";
import { createDemoClient } from "./demoClient";
import { installNetworkGuard } from "./networkGuard";

installDemoClient(createDemoClient({ readOnly: true }));
installNetworkGuard();

export { default as DemoApp } from "./DemoApp";
