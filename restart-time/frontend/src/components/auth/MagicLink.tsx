import { useState } from 'react';
import { sendMagicLink } from '../../core/auth';
import { getStrings } from '../../core/i18n';
import type { Language } from '../../core/types';

export default function MagicLink({ language }: { language: Language }) {
  const t = getStrings(language);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await sendMagicLink(email.trim());
      setSent(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ marginTop: 'var(--space-8)', textAlign: 'center' }}>
      <h1>{t.appTitle}</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-6)' }}>{t.tagline}</p>
      {sent ? (
        <p>{t.linkSent}</p>
      ) : (
        <form
          onSubmit={submit}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.enterEmail}
            required
            autoFocus
          />
          <button type="submit" disabled={submitting || !email.trim()}>
            {t.sendLink}
          </button>
          {error && <p style={{ color: 'var(--accent-error)' }}>{error}</p>}
        </form>
      )}
    </div>
  );
}
