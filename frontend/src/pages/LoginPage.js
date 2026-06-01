import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/calendar');
    } catch {
      setError('Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="15" stroke="#4f8ef7" strokeWidth="2"/>
            <circle cx="16" cy="16" r="6" fill="#4f8ef7"/>
            <path d="M16 4 L16 10" stroke="#4f8ef7" strokeWidth="2" strokeLinecap="round"/>
            <path d="M16 22 L16 28" stroke="#4f8ef7" strokeWidth="2" strokeLinecap="round"/>
            <path d="M4 16 L10 16" stroke="#4f8ef7" strokeWidth="2" strokeLinecap="round"/>
            <path d="M22 16 L28 16" stroke="#4f8ef7" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span style={styles.logoText}>RadioStation</span>
        </div>
        <p style={styles.subtitle}>Broadcast Management System</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          {error && <div style={styles.error}>{error}</div>}
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '10px', marginTop: 8 }}
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-primary)',
  },
  card: {
    background: 'var(--bg-panel)',
    border: '1px solid var(--border-bright)',
    borderRadius: 10,
    padding: '40px 36px',
    width: 340,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  logoText: {
    fontSize: 20,
    fontWeight: 600,
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
  },
  subtitle: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginBottom: 28,
    paddingLeft: 44,
  },
  form: { display: 'flex', flexDirection: 'column' },
  error: {
    background: 'var(--red-dim)',
    color: 'var(--red)',
    border: '1px solid var(--red-dim)',
    borderRadius: 4,
    padding: '8px 12px',
    marginBottom: 14,
    fontSize: 12,
  },
};
