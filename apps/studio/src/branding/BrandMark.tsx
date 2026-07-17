import type { AriaAttributes } from "react";

export interface BrandMarkProps {
  readonly className?: string;
  readonly size?: number;
  readonly "aria-hidden"?: AriaAttributes["aria-hidden"];
  readonly "aria-label"?: string;
}

export function BrandMark({
  className,
  size = 24,
  "aria-hidden": ariaHidden = true,
  "aria-label": ariaLabel,
}: BrandMarkProps) {
  const hidden = ariaHidden === true || ariaHidden === "true";

  return (
    <svg
      aria-hidden={ariaHidden}
      aria-label={hidden ? undefined : ariaLabel}
      className={className}
      focusable="false"
      height={size}
      role={hidden ? undefined : "img"}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#111715" height="24" rx="4" width="24" />
      <path d="M3 3H18V7H7V12H3Z" fill="#F4F6F5" />
      <path d="M21 12V21H6V17H17V12Z" fill="#F4F6F5" />
      <path d="M12 8L16 12L12 16L8 12Z" fill="#4CC4BA" />
    </svg>
  );
}
