/**
 * Material Symbols Outlined wrapper.
 * Names match Google's icon catalog: https://fonts.google.com/icons
 *
 * Usage:
 *   <Icon name="calendar_today" />
 *   <Icon name="favorite" filled />
 *   <Icon name="mic" size={28} color="white" />
 */

interface Props {
  name: string;
  filled?: boolean;
  size?: number;
  color?: string;
  className?: string;
}

export default function Icon({ name, filled, size = 24, color, className }: Props) {
  const cls = `material-symbols-outlined${filled ? ' fill' : ''}${className ? ' ' + className : ''}`;
  return (
    <span
      aria-hidden
      className={cls}
      style={{
        fontSize: size,
        color,
        lineHeight: 1,
      }}
    >
      {name}
    </span>
  );
}
