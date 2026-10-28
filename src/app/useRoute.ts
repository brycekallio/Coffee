import { useCallback, useEffect, useState } from "react";
import { parsePath, toPath, type Route } from "./routes";

// The Electron build loads dist/index.html over file://, where the pathname is a path
// on disk — so there the route lives in the hash instead. On the web it's a real path,
// served by the SPA catch-all in netlify.toml.
const useHash = typeof window !== "undefined" && window.location.protocol === "file:";

function currentPath(): string {
  return useHash ? window.location.hash.slice(1) || "/" : window.location.pathname;
}

function currentRoute(): Route {
  return parsePath(currentPath()) ?? { page: "contacts" };
}

/**
 * The route, kept in the URL so the back button, refresh and shared links work —
 * which matters most in the installed PWA, where Back otherwise leaves the app.
 */
export function useRoute() {
  const [route, setRoute] = useState<Route>(currentRoute);

  useEffect(() => {
    // An unknown path was rendered as the contact list; make the URL say so.
    if (!parsePath(currentPath())) window.history.replaceState(null, "", useHash ? "#/" : "/");

    const onChange = () => setRoute(currentRoute());
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, []);

  const navigate = useCallback((next: Route, { replace = false }: { replace?: boolean } = {}) => {
    const path = toPath(next);
    if (path !== currentPath()) {
      const url = useHash ? `#${path}` : path;
      if (replace) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    }
    setRoute(parsePath(path) ?? { page: "contacts" });
    window.scrollTo(0, 0);
  }, []);

  return { route, navigate };
}
