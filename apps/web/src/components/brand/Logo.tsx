import { useId } from "react";
import { BRAND } from "../../brand.js";

/**
 * Launchpad brand.
 *  - <LogoMark />: the rocket alone. The primary logo (favicon, avatars,
 *    sign-in screen, anywhere square).
 *  - <LogoWide />: rocket + "Launchpad" wordmark. Used in the top bar.
 *
 * Static copies for use outside the app live in /public/brand.
 */

const BODY =
  "M76 75 L104 72 C118 55 150 20 215 10 L274 9 Q281 9 281 16 C282 72 265 122 230 154 L202 172 L200 188 L162 236 Q158 240 150 239 Q145 238 145 232 L145 176 L166 158 C205 128 236 95 239 58 C240 46 232 42 215 42 L202 44 C175 48 150 60 138 75 L100 120 L40 120 Q31 120 36 113 L70 78 Q72 75 76 75 Z";
const FLAME =
  "M7 255 C20 212 40 167 75 154 C100 145 120 167 113 190 C105 217 55 240 7 255 Z";

interface LogoMarkProps {
  /** Rendered height in px; width follows the mark's aspect ratio. */
  size?: number;
  className?: string;
  /** Pass a label when the mark stands alone; omit when next to the wordmark. */
  title?: string;
}

export function LogoMark({ size = 24, className, title }: LogoMarkProps) {
  // Unique gradient id so several marks on one page don't collide.
  const gradientId = `lp-flame-${useId()}`;

  return (
    <svg
      className={className}
      viewBox="-4 -4 292 268"
      height={size}
      width={(size * 292) / 268}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#3FE09A" />
          <stop offset="1" stopColor="#7DF5C4" />
        </linearGradient>
      </defs>
      <path fill="currentColor" d={BODY} />
      <path fill={`url(#${gradientId})`} d={FLAME} />
    </svg>
  );
}

export function LogoWide({ size = 22 }: { size?: number }) {
  return (
    <span className="logo-wide" style={{ fontSize: size }} aria-label={BRAND.name}>
      <LogoMark size={size * 1.05} />
      <span className="logo-wide__text" aria-hidden="true">
        {BRAND.name}
      </span>
    </span>
  );
}
