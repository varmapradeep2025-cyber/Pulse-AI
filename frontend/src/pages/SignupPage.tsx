import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { signUp } from "../lib/auth";
import { ROUTES } from "../routes";

export default function SignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from ?? ROUTES.citizen;
  const isHospitalAccess = from.startsWith(ROUTES.hospital);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const data = await signUp(email, password, fullName);

      if (data.session) {
        navigate(from, { replace: true });
      } else {
        alert(
          "Account created. Please check your email to confirm your account."
        );
        navigate(ROUTES.login, { replace: true, state: { from } });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create account."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Create your Pulse AI account</h1>
        <p>Get personalized healthcare assistance.</p>

        {isHospitalAccess && (
          <p className="demo-note">
            Demo access: hospital roles and restrictions are not enforced.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <label>
            Full name
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </label>

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
              minLength={6}
              required
            />
          </label>

          {error && <p role="alert">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p>
          Already have an account?{" "}
          <Link to={ROUTES.login} state={{ from }}>
            Sign in
          </Link>
        </p>

        <p>
          <Link to={ROUTES.home}>← Back to Pulse AI home</Link>
        </p>
      </div>
    </main>
  );
}