// KitHub logo: a chip with a K, the anti-static theme's mark (issue #34). Decorative: the
// "KitHub" text next to it carries the name.
// public/favicon.svg is the same chip with a charcoal frame on purpose: without it the pale pink chip
// and grey pins disappear on a light browser tab. The frame insets the chip, so its dot sits at (8.5, 10.5).
const PIN_X = [8, 13, 18, 23];

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <g fill="#b8bec8">
        {PIN_X.map((x) => (
          <g key={x}>
            <rect x={x} y="1" width="2.4" height="5" />
            <rect x={x} y="26" width="2.4" height="5" />
          </g>
        ))}
      </g>
      <rect x="3" y="5" width="26" height="22" fill="#f2a7c3" />
      <circle cx="7.5" cy="9.5" r="1.6" fill="#23262e" />
      <path
        d="M12.5 10v12M12.5 16.5l7-6.5M15 14.5l5 7.5"
        stroke="#23262e"
        strokeWidth="2.8"
        strokeLinecap="square"
        fill="none"
      />
    </svg>
  );
}
