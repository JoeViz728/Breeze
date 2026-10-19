import { useState, FormEvent, useEffect } from 'react';

interface Props {
  serverName: string;
  serverDescription: string;
  loginDisabled?: boolean;
  loginNotice?: string;
  onLogin: (username: string, password?: string) => void;
  onCheckUsername: (username: string) => Promise<boolean>;
  connected: boolean;
  error: string | null;
}

export function LoginScreen({
  serverName,
  serverDescription,
  loginDisabled = false,
  loginNotice = '',
  onLogin,
  onCheckUsername,
  connected,
  error,
}: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const trimmed = username.trim();
    if (trimmed.length < 2) {
      setRequiresPassword(false);
      return;
    }

    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const needs = await onCheckUsername(trimmed);
        setRequiresPassword(needs);
        if (!needs) setPassword('');
      } catch {
        setRequiresPassword(false);
      } finally {
        setChecking(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [username, onCheckUsername]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = username.trim();
    if (trimmed.length < 2) return;
    if (requiresPassword && !password) return;
    onLogin(trimmed, requiresPassword ? password : undefined);
  }

  return (
    <div className="login-screen">
      <div className="login-window">
        {error && (
          <div className="login-toast" role="alert">
            {error}
          </div>
        )}
        <form className="login-card" onSubmit={handleSubmit}>
          <h1>{serverName}</h1>
          {loginDisabled ? (
            <p className="login-maintenance">
              {loginNotice || 'Login is temporarily disabled.'}
            </p>
          ) : (
            serverDescription && <p className="login-tagline">{serverDescription}</p>
          )}
          {loginDisabled && (
            <p className="login-hint">Administrators can still sign in with a password.</p>
          )}
          {requiresPassword && (
            <p className="login-hint">Welcome back. Enter your password to continue.</p>
          )}
          <input
            type="text"
            placeholder="Your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={24}
            autoFocus
          />
          {requiresPassword && (
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
          <button
            type="submit"
            disabled={
              !connected ||
              checking ||
              username.trim().length < 2 ||
              (requiresPassword && !password) ||
              (loginDisabled && !requiresPassword)
            }
          >
            {!connected ? 'Connecting…' : requiresPassword ? 'Sign in' : loginDisabled ? 'Join unavailable' : 'Join'}
          </button>
        </form>
      </div>
      <footer className="login-footer">
        <span className="login-footer-brand">Breeze</span>
        <span className="login-footer-tagline">A calm space to chat.</span>
        <span className="login-footer-year">2026</span>
      </footer>
    </div>
  );
}