import { useState, FormEvent } from 'react';

interface Props {
  onComplete: (token: string) => void;
  onSubmit: (username: string, password: string, serverName: string) => Promise<{ token: string }>;
}

export function OnboardingScreen({ onComplete, onSubmit }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [serverName, setServerName] = useState('Breeze');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const result = await onSubmit(username.trim(), password, serverName.trim() || 'Breeze');
      onComplete(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card login-card-wide" onSubmit={handleSubmit}>
        <h1>Welcome to Breeze</h1>
        <p className="login-tagline">You're the first visitor. Set up your server and create the admin account.</p>

        <label className="field-label">Server name</label>
        <input
          type="text"
          placeholder="My Server"
          value={serverName}
          onChange={(e) => setServerName(e.target.value)}
          maxLength={48}
        />

        <label className="field-label">Admin username</label>
        <input
          type="text"
          placeholder="Your name"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={24}
          autoFocus
        />

        <label className="field-label">Password</label>
        <input
          type="password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <label className="field-label">Confirm password</label>
        <input
          type="password"
          placeholder="Repeat password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        {error && <p className="form-error">{error}</p>}

        <button
          type="submit"
          disabled={loading || username.trim().length < 2 || !password || !confirm}
        >
          {loading ? 'Setting up…' : 'Create server'}
        </button>
      </form>
    </div>
  );
}