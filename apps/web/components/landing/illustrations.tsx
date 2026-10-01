/**
 * Inline SVG illustrations of gym equipment.
 *
 * Drawn as vectors rather than shipped as photographs so they stay sharp at any
 * size, add no network request or third-party image licence to the repo, and can
 * be recoloured from the brand palette via currentColor and CSS variables.
 */

interface IconProps {
  size?: number;
}

function Dumbbell({
  x,
  y,
  width,
  fill,
  opacity,
}: {
  x: number;
  y: number;
  width: number;
  fill: string;
  opacity?: number | string;
}) {
  const height = width * 0.44;
  const plate = Math.max(width * 0.2, 10);

  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity}>
      <rect x={0} y={height / 2 - 4} width={width} height={8} rx={4} fill={fill} />
      <rect x={plate * 0.5} y={0} width={plate} height={height} rx={3} fill={fill} />
      <rect
        x={width - plate * 1.5}
        y={0}
        width={plate}
        height={height}
        rx={3}
        fill={fill}
      />
      <rect x={plate * 1.7} y={height * 0.18} width={plate * 0.7} height={height * 0.64} rx={2} fill={fill} opacity="0.7" />
      <rect
        x={width - plate * 2.4}
        y={height * 0.18}
        width={plate * 0.7}
        height={height * 0.64}
        rx={2}
        fill={fill}
        opacity="0.7"
      />
    </g>
  );
}

/** Hero tile: a two-tier dumbbell rack on a gym floor. */
export function RackArt() {
  return (
    <svg viewBox="0 0 320 400" role="img" aria-label="A two-tier rack of dumbbells in a gym">
      <rect width="320" height="400" fill="var(--brand-tint-strong)" />
      <rect y="318" width="320" height="82" fill="var(--brand)" opacity="0.3" />
      <path d="M0 318h320" stroke="var(--brand-deep)" strokeOpacity="0.2" strokeWidth="2" />

      {/* uprights */}
      <rect x="54" y="86" width="13" height="236" rx="6.5" fill="var(--brand-deep)" opacity="0.7" />
      <rect x="253" y="86" width="13" height="236" rx="6.5" fill="var(--brand-deep)" opacity="0.7" />

      {/* shelves */}
      <rect x="42" y="176" width="236" height="11" rx="5.5" fill="var(--brand-deep)" opacity="0.55" />
      <rect x="42" y="264" width="236" height="11" rx="5.5" fill="var(--brand-deep)" opacity="0.55" />

      {/* dumbbells, heaviest at the bottom */}
      <Dumbbell x={70} y={196} width={62} fill="var(--brand-deep)" />
      <Dumbbell x={150} y={196} width={50} fill="var(--brand-deep)" opacity="0.75" />
      <Dumbbell x={66} y={222} width={52} fill="var(--brand-deep)" opacity="0.85" />
      <Dumbbell x={136} y={222} width={40} fill="var(--brand-deep)" opacity="0.6" />

      <Dumbbell x={74} y={130} width={70} fill="var(--brand-deep)" opacity="0.8" />
      <Dumbbell x={164} y={130} width={56} fill="var(--brand-deep)" opacity="0.65" />
      <Dumbbell x={72} y={282} width={78} fill="var(--brand-deep)" />
      <Dumbbell x={168} y={282} width={60} fill="var(--brand-deep)" opacity="0.9" />
    </svg>
  );
}

/** Hero tile: a kettlebell. */
export function KettlebellArt() {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label="A kettlebell">
      <rect width="200" height="200" fill="var(--brand-tint-strong)" />
      <ellipse cx="100" cy="164" rx="62" ry="9" fill="var(--brand-deep)" opacity="0.15" />

      {/* handle */}
      <path
        d="M74 84V66a26 26 0 0 1 52 0v18"
        fill="none"
        stroke="var(--brand-deep)"
        strokeWidth="11"
        strokeLinecap="round"
        opacity="0.8"
      />
      {/* body */}
      <path
        d="M62 84h76a10 10 0 0 1 10 11l-4 44a20 20 0 0 1-20 17H76a20 20 0 0 1-20-17l-4-44a10 10 0 0 1 10-11z"
        fill="var(--brand-deep)"
        opacity="0.85"
      />
      <path d="M78 96h44l-3 33H81z" fill="var(--brand)" opacity="0.35" />
    </svg>
  );
}

/** Hero tile: a rolled exercise mat with resistance bands. */
export function MatArt() {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label="A rolled exercise mat with resistance bands">
      <rect width="200" height="200" fill="var(--brand-tint-strong)" />

      {/* bands */}
      <circle cx="64" cy="62" r="20" fill="none" stroke="var(--brand-deep)" strokeWidth="7" opacity="0.35" />
      <circle cx="64" cy="62" r="30" fill="none" stroke="var(--brand-deep)" strokeWidth="7" opacity="0.2" />

      {/* rolled mat */}
      <rect x="52" y="96" width="120" height="62" rx="31" fill="var(--brand-deep)" opacity="0.85" />
      <ellipse cx="82" cy="127" rx="15" ry="31" fill="var(--brand-tint-strong)" />
      <ellipse cx="82" cy="127" rx="8" ry="20" fill="var(--brand-deep)" opacity="0.35" />
      <path d="M104 100v54M124 100v54M144 100v54" stroke="var(--brand)" strokeWidth="4" opacity="0.25" />
    </svg>
  );
}

/** Small line icons used on the feature cards. */
export function UsersIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CardIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <path d="M1 10h22" strokeLinecap="round" />
    </svg>
  );
}

export function CalendarIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m9 16 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ClipboardIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="m9 14 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DumbbellIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UserIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShieldIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LogoMark({ size = 32 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path
        d="M9 16h14M9 16v-3.5M9 16v3.5M23 16v-3.5M23 16v3.5M12.5 16v-2M19.5 16v2"
        stroke="var(--accent-contrast)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}