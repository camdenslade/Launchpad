import { useEffect, useState } from "react";

/**
 * Tiny client-side router: the current path lives in the URL, and
 * `navigate()` changes it without a page reload. Enough for a handful of
 * pages; swap for React Router when routes need params/nesting.
 */
const NAVIGATE_EVENT = "launchpad:navigate";

export function navigate(path: string): void {
  if (path === window.location.pathname) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

export function usePathname(): string {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", update); // back/forward buttons
    window.addEventListener(NAVIGATE_EVENT, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(NAVIGATE_EVENT, update);
    };
  }, []);

  return pathname;
}

/** Props for an <a> that navigates client-side but still works as a real link. */
export function linkProps(path: string) {
  return {
    href: path,
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      // Let ctrl/cmd-click open a new tab as usual.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      navigate(path);
    }
  };
}
