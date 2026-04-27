import Avatar from './Avatar';
import Icon from './Icon';
import type { Language } from '../../core/types';

interface Props {
  email: string | null;
  language: Language;
  onLangToggle: () => void;
  onAvatarClick?: () => void;
}

export default function TopAppBar({ email, language, onLangToggle, onAvatarClick }: Props) {
  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 'var(--topbar-height)',
        backgroundColor: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--space-margin)',
        maxWidth: 720,
        margin: '0 auto',
        zIndex: 40,
      }}
    >
      <Avatar email={email} onClick={onAvatarClick} />
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 20,
          color: 'var(--primary)',
          letterSpacing: '-0.01em',
        }}
      >
        GalGal
      </div>
      <button
        onClick={onLangToggle}
        aria-label="toggle language"
        title={language === 'en' ? 'switch to Hebrew' : 'switch to English'}
        style={{
          minHeight: 40,
          width: 40,
          height: 40,
          padding: 0,
          borderRadius: '50%',
          color: 'var(--primary)',
          backgroundColor: 'transparent',
          border: '1px solid transparent',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="translate" size={22} />
      </button>
    </header>
  );
}
