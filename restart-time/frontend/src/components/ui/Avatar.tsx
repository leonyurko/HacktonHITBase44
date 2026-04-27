/**
 * Initials-in-a-circle avatar. Deterministic per email so colors are stable
 * across sessions but vary between users.
 */

interface Props {
  email: string | null;
  size?: number;
  onClick?: () => void;
}

function initialsFrom(email: string | null): string {
  if (!email) return '?';
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._\-+]/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? '?').toUpperCase();
}

function colorFor(email: string | null): string {
  // Stable hash → pick from a calm palette (no red).
  const palette = ['#476648', '#7a9b7a', '#80543b', '#bb876b', '#76593a', '#5c4225'];
  if (!email) return palette[0];
  let hash = 0;
  for (const ch of email) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

export default function Avatar({ email, size = 40, onClick }: Props) {
  const initials = initialsFrom(email);
  const bg = colorFor(email);
  return (
    <button
      onClick={onClick}
      aria-label={email ?? 'profile'}
      style={{
        width: size,
        height: size,
        minHeight: size,
        padding: 0,
        borderRadius: '50%',
        backgroundColor: bg,
        color: 'white',
        border: '1px solid var(--border)',
        fontSize: size * 0.4,
        fontWeight: 600,
        fontFamily: 'var(--font-display)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
      }}
    >
      {initials}
    </button>
  );
}
