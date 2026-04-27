import { useState } from 'react';
import GroundingScript from './GroundingScript';
import Icon from '../ui/Icon';
import type { Language } from '../../core/types';
import { getStrings } from '../../core/i18n';

export default function GroundingButton({ language }: { language: Language }) {
  const t = getStrings(language);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t.grounding.label}
        style={{
          position: 'fixed',
          bottom: 'calc(var(--bottomnav-height) + var(--space-4))',
          insetInlineEnd: 'var(--space-4)',
          width: 56,
          height: 56,
          minHeight: 56,
          borderRadius: '50%',
          backgroundColor: 'var(--tertiary-container)',
          color: 'var(--on-tertiary-container)',
          border: 'none',
          fontSize: 22,
          padding: 0,
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          zIndex: 50,
        }}
        title={t.grounding.label}
      >
        <Icon name="anchor" size={26} />
      </button>
      {open && <GroundingScript language={language} onClose={() => setOpen(false)} />}
    </>
  );
}
