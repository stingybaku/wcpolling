import type { CSSProperties, FC, SVGProps } from "react";
import * as Flags from "country-flag-icons/react/3x2";
import { fifaToFlagKey } from "@/lib/fifa-flags";

// `country-flag-icons` exposes every flag as a named SVG component keyed by its
// ISO2 / subdivision code (e.g. `BR`, `US`, `GB_ENG`). We access them by key so
// flags render as real SVGs on every OS instead of OS emoji glyphs (Windows has
// none, which is why the emoji path showed bare "BR"/"US" letter pairs).
type FlagComponent = FC<SVGProps<SVGSVGElement> & { title?: string }>;
const FLAGS = Flags as unknown as Record<string, FlagComponent>;

type TeamFlagProps = {
  /** FIFA 3-letter code (e.g. "BRA", "ENG"). */
  code: string;
  /** Rendered width in px; height follows the 3:2 aspect ratio. */
  size?: number;
  rounded?: boolean;
  style?: CSSProperties;
  className?: string;
};

export function TeamFlag({ code, size = 16, rounded = true, style, className }: TeamFlagProps) {
  const Flag = FLAGS[fifaToFlagKey(code)];

  // Unmapped / unknown code → visible 3-letter pill so nothing silently vanishes.
  if (!Flag) {
    return (
      <span
        className={className}
        title={code}
        style={{
          display: "inline-block",
          flexShrink: 0,
          fontSize: Math.max(8, Math.round(size * 0.5)),
          fontWeight: 700,
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.02em",
          lineHeight: 1,
          padding: "1px 3px",
          borderRadius: 3,
          background: "var(--bg-strong)",
          color: "var(--muted)",
          verticalAlign: "middle",
          ...style,
        }}
      >
        {code}
      </span>
    );
  }

  return (
    <Flag
      title={code}
      className={className}
      style={{
        width: size,
        height: "auto",
        flexShrink: 0,
        display: "inline-block",
        verticalAlign: "middle",
        borderRadius: rounded ? 2 : 0,
        boxShadow: "0 0 0 0.5px rgba(0,0,0,0.12)",
        ...style,
      }}
    />
  );
}
