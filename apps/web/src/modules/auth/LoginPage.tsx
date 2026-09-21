import { useState, type FormEvent } from "react";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { APP_NAME, APP_RELEASE_LABEL } from "../../shared/version.ts";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email, password, organizationSlug);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to sign in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-brand">
        <p className="login-kicker">Industrial weighbridge operations</p>
        <h1>Trinetra Systems</h1>
        <p className="login-tagline">
          Smart Weighbridge Automation & Material Intelligence Platform
        </p>
        <div className="beam" aria-hidden="true">
          <span className="beam-cell" />
        </div>
        <p className="login-note">Authorized personnel only. Sign in with your site account.</p>
        <p className="login-version">
          {APP_NAME} {APP_RELEASE_LABEL}
        </p>
      </section>

      <section className="login-panel">
        <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
          <h2>Sign in</h2>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <label htmlFor="organizationSlug">Organization (optional)</label>
          <input
            id="organizationSlug"
            name="organizationSlug"
            type="text"
            autoComplete="organization"
            value={organizationSlug}
            onChange={(event) => setOrganizationSlug(event.target.value)}
            placeholder="Leave blank when your email is unique"
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
