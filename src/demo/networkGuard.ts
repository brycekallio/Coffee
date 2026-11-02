/**
 * Backstop for demo mode: the demo makes no cross-origin requests, so block any that a
 * code path forgot about. The demo client already answers every database, storage and AI
 * call in memory; this catches raw `fetch` calls (a LinkedIn preview, a resume download),
 * beacons and XMLHttpRequest, which would otherwise leave the page.
 *
 * Same-origin requests stay allowed: the page's own assets are the demo's only network.
 */
export class DemoNetworkBlockedError extends Error {
  constructor(url: string) {
    super(`The demo does not make network requests (blocked ${url}).`);
    this.name = "DemoNetworkBlockedError";
  }
}

function targetOf(input: RequestInfo | URL, origin: string): URL {
  const raw = input instanceof Request ? input.url : String(input);
  return new URL(raw, origin);
}

export function installNetworkGuard(target: Window & typeof globalThis = window): void {
  const origin = target.location.origin;
  const realFetch = target.fetch.bind(target);

  target.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = targetOf(input, origin);
    if (url.origin !== origin) {
      console.warn(`[demo] blocked fetch to ${url.origin}`);
      return Promise.reject(new DemoNetworkBlockedError(url.origin));
    }
    return realFetch(input, init);
  };

  const realBeacon = target.navigator.sendBeacon?.bind(target.navigator);
  target.navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
    if (targetOf(url, origin).origin !== origin) {
      console.warn("[demo] blocked beacon");
      return false;
    }
    return realBeacon ? realBeacon(url, data) : false;
  };

  // XMLHttpRequest is the other way a library reaches the network. Refuse cross-origin
  // targets at open(), before anything is sent. (Image and script loads are not covered;
  // the demo renders none from other origins.)
  const xhr = target.XMLHttpRequest?.prototype;
  if (xhr) {
    const realOpen = xhr.open;
    xhr.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      const dest = targetOf(url, origin);
      if (dest.origin !== origin) {
        console.warn(`[demo] blocked XMLHttpRequest to ${dest.origin}`);
        throw new DemoNetworkBlockedError(dest.origin);
      }
      return (realOpen as (...args: unknown[]) => void).call(this, method, url, ...rest);
    } as typeof xhr.open;
  }
}
