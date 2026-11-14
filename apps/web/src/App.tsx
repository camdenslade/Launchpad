import { useEffect, useState } from "react";
import type { CurrentUser } from "@launchpad/contracts";
import { getCurrentUser, signOut } from "./api/auth.js";
import { UNAUTHORIZED_EVENT } from "./api/client.js";
import { BRAND } from "./brand.js";
import { LogoMark, LogoWide } from "./components/brand/Logo.js";
import { CloudAccountsPage } from "./components/cloud/CloudAccountsPage.js";
import { Dashboard } from "./components/Dashboard.js";
import { ProjectPage } from "./components/project/ProjectPage.js";
import { linkProps, matchPath, usePathname } from "./lib/router.js";
import { SignInScreen } from "./components/SignInScreen.js";
import "./styles.css";

const NAV = [
  { path: "/", label: "Projects" },
  { path: "/cloud", label: "Cloud" }
];

/** `undefined` = still checking, `null` = signed out. */
type AuthState = CurrentUser | null | undefined;

/**
 * Top level: decides between the sign-in screen and the app shell.
 * The session lives in an httpOnly cookie the page can't read, so we ask
 * the API (`/auth/me`) who we are.
 */
function App() {
  const [user, setUser] = useState<AuthState>(undefined);
  const pathname = usePathname();

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null));

    // Any API call that returns 401 (e.g. session expired) signs us out.
    const handleUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  async function handleSignOut() {
    await signOut().catch(() => undefined);
    setUser(null);
  }

  if (user === undefined) {
    return (
      <div className="splash" aria-busy="true">
        <LogoMark size={40} title={`Loading ${BRAND.name}`} />
      </div>
    );
  }

  if (user === null) {
    return <SignInScreen />;
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar__inner">
          <div className="topbar__left">
            <a {...linkProps("/")} className="topbar__home" aria-label={`${BRAND.name} home`}>
              <LogoWide size={20} />
            </a>
            <nav className="topbar__nav" aria-label="Main">
              {NAV.map((item) => (
                <a
                  key={item.path}
                  {...linkProps(item.path)}
                  className={`nav-link${isActive(item.path, pathname) ? " nav-link--active" : ""}`}
                  aria-current={isActive(item.path, pathname) ? "page" : undefined}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="user-menu">
            {user.avatarUrl && <img className="user-menu__avatar" src={user.avatarUrl} alt="" />}
            <span className="user-menu__name">{user.name ?? user.login}</span>
            <button type="button" className="button button--ghost" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="page">
        <Routes pathname={pathname} user={user} />
      </main>
    </>
  );
}

/** Picks the page for the current URL. */
function Routes({ pathname, user }: { pathname: string; user: CurrentUser }) {
  const project = matchPath("/projects/:id", pathname);
  if (project?.id) return <ProjectPage key={project.id} projectId={project.id} currentUser={user} />;
  if (pathname === "/cloud") return <CloudAccountsPage />;
  return <Dashboard />;
}

/** "Projects" stays highlighted on project detail pages. */
function isActive(path: string, pathname: string): boolean {
  return path === "/" ? pathname === "/" || pathname.startsWith("/projects/") : pathname.startsWith(path);
}

export default App;
