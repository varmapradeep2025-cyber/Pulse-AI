import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { signIn } from "../lib/auth";
import { ROUTES } from "../routes";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from ?? ROUTES.citizen;
  const isHospitalAccess = from.startsWith(ROUTES.hospital);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to sign in."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Welcome back</h1>
        <p>Sign in to your Pulse AI account.</p>

        {isHospitalAccess && (
          <p className="demo-note">
            Demo access: most hospital pages are not role-restricted. The staff
            Queue still requires an authorized appointment staff account.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error && <p role="alert">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p>
          Don't have an account?{" "}
          <Link to="/signup" state={{ from }}>
            Create one
          </Link>
        </p>

        <p>
          <Link to={ROUTES.home}>← Back to Pulse AI home</Link>
        </p>
      </div>
    </main>
  );
}