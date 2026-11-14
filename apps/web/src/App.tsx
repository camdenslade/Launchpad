import { useEffect, useState } from "react";
import type { CurrentUser } from "@launchpad/contracts";
import { getCurrentUser, signOut } from "./api/auth.js";
import { UNAUTHORIZED_EVENT } from "./api/client.js";
import { Dashboard } from "./components/Dashboard.js";
import { SignInScreen } from "./components/SignInScreen.js";
import "./styles.css";

/** `undefined` = still checking, `null` = signed out. */
type AuthState = CurrentUser | null | undefined;

/**
 * Top level: decides between the sign-in screen and the dashboard.
 * The session lives in an httpOnly cookie the page can't read, so we ask
 * the API (`/auth/me`) who we are.
 */
function App() {
  const [user, setUser] = useState<AuthState>(undefined);

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
    return <main className="app muted">Loading…</main>;
  }

  if (user === null) {
    return <SignInScreen />;
  }

  return (
    <main className="app">
      <header className="app__header">
        <div>
          <h1>Launchpad</h1>
          <p className="muted">Developer platform</p>
        </div>
        <div className="user-menu">
          {user.avatarUrl && <img src={user.avatarUrl} alt="" width={28} height={28} />}
          <span>{user.name ?? user.login}</span>
          <button type="button" className="button button--quiet" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <Dashboard />
    </main>
  );
}

export default App;
