/**
 * Restart mascot — a soft round blue blob with a calm smile.
 * Custom inline SVG, no asset deps. Three expressions:
 *   - 'idle'    : neutral calm smile (default)
 *   - 'smile'   : eyes slightly closed, bigger smile (used on completions)
 *   - 'wink'    : one eye closed, side-tilted smile
 *
 * The blob is sky-blue with a lilac inner-glow accent — matches the brand
 * palette (תכלת + סגול לילך).
 */

export type MascotMood = 'idle' | 'smile' | 'wink';

interface Props {
  mood?: MascotMood;
  size?: number;
  /** Adds a subtle "bob" loop for the dashboard hero. Off by default. */
  bob?: boolean;
}

export default function Mascot({ mood = 'idle', size = 72, bob = false }: Props) {
  const animation = bob ? 'mascot-bob 3.6s ease-in-out infinite' : undefined;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      role="img"
      aria-label="Restart mascot"
      style={{ display: 'block', overflow: 'visible', animation }}
    >
      {/* soft outer glow */}
      <defs>
        <radialGradient id="restart-mascot-glow" cx="50%" cy="38%" r="60%">
          <stop offset="0%" stopColor="var(--secondary-pale, #F2EAF7)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <linearGradient id="restart-mascot-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary-container, #BFDDEE)" />
          <stop offset="100%" stopColor="var(--primary, #5BA3D0)" />
        </linearGradient>
      </defs>

      {/* glow halo */}
      <circle cx="40" cy="40" r="38" fill="url(#restart-mascot-glow)" opacity="0.7" />

      {/* body */}
      <ellipse
        cx="40"
        cy="42"
        rx="28"
        ry="26"
        fill="url(#restart-mascot-body)"
      />

      {/* lilac soft highlight — top right */}
      <ellipse
        cx="50"
        cy="28"
        rx="9"
        ry="6"
        fill="var(--secondary-pale, #F2EAF7)"
        opacity="0.55"
      />

      {/* face */}
      <Face mood={mood} />
    </svg>
  );
}

function Face({ mood }: { mood: MascotMood }) {
  const eyeFill = 'var(--text, #2A3340)';
  const mouthStroke = 'var(--text, #2A3340)';

  if (mood === 'smile') {
    return (
      <>
        {/* eyes — closed happy crescents */}
        <path
          d="M30 38 Q33 35 36 38"
          stroke={eyeFill}
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M44 38 Q47 35 50 38"
          stroke={eyeFill}
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
        />
        {/* big smile */}
        <path
          d="M30 48 Q40 56 50 48"
          stroke={mouthStroke}
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
        />
        {/* cheek blush — lilac dots */}
        <ellipse cx="26" cy="48" rx="3" ry="2" fill="var(--secondary, #B695C9)" opacity="0.45" />
        <ellipse cx="54" cy="48" rx="3" ry="2" fill="var(--secondary, #B695C9)" opacity="0.45" />
      </>
    );
  }

  if (mood === 'wink') {
    return (
      <>
        <circle cx="33" cy="38" r="2.2" fill={eyeFill} />
        <path
          d="M44 38 Q47 35 50 38"
          stroke={eyeFill}
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M31 47 Q41 53 50 47"
          stroke={mouthStroke}
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
        />
      </>
    );
  }

  // idle — neutral calm
  return (
    <>
      <circle cx="33" cy="38" r="2.2" fill={eyeFill} />
      <circle cx="47" cy="38" r="2.2" fill={eyeFill} />
      <path
        d="M32 47 Q40 51 48 47"
        stroke={mouthStroke}
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
    </>
  );
}
