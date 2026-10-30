import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { updateUserPassword } from "../lib/auth";
import { ROUTES } from "../routes";

function EyeIcon() {
  return (
    <svg
      className="auth-eye-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      className="auth-eye-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

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

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkRecoverySession() {
      // 1. Check if Supabase session is active
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        if (data.session) {
          setHasValidSession(true);
        } else {
          // Check if URL hash contains recovery token
          const hash = window.location.hash;
          if (hash.includes("type=recovery") || hash.includes("access_token")) {
            setHasValidSession(true);
          } else {
            setHasValidSession(false);
          }
        }
        setCheckingSession(false);
      }
    }

    checkRecoverySession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasValidSession(true);
      }
      setCheckingSession(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await updateUserPassword(password);
      setSuccess(true);
      // Wait 2.5s and redirect to login
      setTimeout(() => {
        navigate(ROUTES.login, { replace: true });
      }, 2500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update password. Please request a new reset link."
      );
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
          <h1 className="auth-card__title">Create new password</h1>
          <p className="auth-card__subtitle">
            Enter a secure password for your Pulse AI account.
          </p>
        </header>

        {checkingSession ? (
          <p className="appointment-muted">Verifying recovery link...</p>
        ) : !hasValidSession ? (
          <div className="auth-error-panel" role="alert">
            <AlertCircleIcon />
            <div>
              <strong>Recovery link invalid or expired</strong>
              <p>
                This password recovery link is either invalid, has expired, or has already been used. Please request a new recovery link.
              </p>
            </div>
            <Link to={ROUTES.forgotPassword} className="btn btn--primary btn--full" style={{ marginTop: "1rem" }}>
              Request New Link
            </Link>
          </div>
        ) : success ? (
          <div className="auth-success" role="status" aria-live="polite">
            <CheckCircleIcon />
            <div>
              <strong>Password updated successfully!</strong>
              <p>Your password has been changed. Redirecting you to sign in...</p>
            </div>
            <Link to={ROUTES.login} className="btn btn--primary btn--full" style={{ marginTop: "1rem" }}>
              Sign In Now
            </Link>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label htmlFor="new-password" className="auth-label">
                New password
              </label>
              <div className="auth-input-wrapper">
                <input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  name="new-password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                  disabled={loading}
                  className="auth-input auth-input--password"
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-controls="new-password"
                  aria-pressed={showPassword}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="confirm-password" className="auth-label">
                Confirm new password
              </label>
              <div className="auth-input-wrapper">
                <input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  name="confirm-password"
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={8}
                  required
                  disabled={loading}
                  className="auth-input auth-input--password"
                />
              </div>
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
                  <span>Updating password...</span>
                </>
              ) : (
                "Update Password"
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
