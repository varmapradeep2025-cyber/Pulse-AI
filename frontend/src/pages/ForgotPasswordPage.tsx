import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { resetPassword } from "../lib/auth";
import { ROUTES } from "../routes";

function AlertCircleIcon() {
  return (
    <svg
      className="auth-error__icon"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg
      className="auth-success__icon"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      await resetPassword(email.trim());
      // Always show generic success message to prevent account enumeration
      setSubmitted(true);
    } catch (err) {
      // In case of rate limits or service error, communicate safely without leaking email existence
      if (err instanceof Error && err.message.toLowerCase().includes("rate limit")) {
        setError("Too many recovery requests. Please wait a few minutes before trying again.");
      } else {
        // Generic failure or safe completion to prevent enumeration
        setSubmitted(true);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <header className="auth-card__header">
          <div className="auth-brand-badge">
            <span className="auth-brand-badge__icon" aria-hidden="true">
              🏥
            </span>
            <span>Pulse AI</span>
          </div>
          <h1 className="auth-card__title">Reset your password</h1>
          <p className="auth-card__subtitle">
            Enter your registered email and we'll send you a secure link to reset your password.
          </p>
        </header>

        {submitted ? (
          <div className="auth-success" role="status" aria-live="polite">
            <CheckCircleIcon />
            <div>
              <strong>Recovery link sent</strong>
              <p>
                If an account exists for <strong>{email}</strong>, a password reset link has been dispatched. Please check your inbox and spam folder.
              </p>
            </div>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label htmlFor="recovery-email" className="auth-label">
                Email address
              </label>
              <input
                id="recovery-email"
                type="email"
                name="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={loading}
                className="auth-input"
              />
            </div>

            {error && (
              <div className="auth-error" role="alert" aria-live="polite">
                <AlertCircleIcon />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <span className="auth-spinner" aria-hidden="true" />
                  <span>Sending reset link...</span>
                </>
              ) : (
                "Send Reset Link"
              )}
            </button>
          </form>
        )}

        <footer className="auth-card__footer">
          <p className="auth-back-wrapper">
            <Link to={ROUTES.login} className="auth-back-link">
              <span aria-hidden="true">←</span> Back to sign in
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
