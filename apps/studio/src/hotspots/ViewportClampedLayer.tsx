import { useLayoutEffect, useRef, useState, type AriaRole, type PropsWithChildren } from "react";

import type { HotspotScreenAnchor } from "@web3d/runtime";

type FloatingPlacement = "above" | "beside";

interface ViewportClampedLayerProps {
  readonly anchor: HotspotScreenAnchor;
  readonly ariaLabel?: string;
  readonly className: string;
  readonly placement: FloatingPlacement;
  readonly fallbackWidth: number;
  readonly fallbackHeight: number;
  readonly gap?: number;
  readonly margin?: number;
  readonly role?: AriaRole;
}

interface FloatingPosition {
  readonly key: string;
  readonly left: number;
  readonly top: number;
}

export function ViewportClampedLayer({
  anchor,
  ariaLabel,
  children,
  className,
  placement,
  fallbackWidth,
  fallbackHeight,
  gap = 10,
  margin = 12,
  role,
}: PropsWithChildren<ViewportClampedLayerProps>) {
  const elementRef = useRef<HTMLDivElement>(null);
  const key = `${anchor.clientX}:${anchor.clientY}:${placement}`;
  const fallback = calculatePosition({
    anchor,
    placement,
    width: fallbackWidth,
    height: fallbackHeight,
    gap,
    margin,
    key,
  });
  const [measured, setMeasured] = useState<FloatingPosition>(fallback);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (element === null) return;

    const measure = (): void => {
      const bounds = element.getBoundingClientRect();
      const next = calculatePosition({
        anchor,
        placement,
        width: bounds.width || fallbackWidth,
        height: bounds.height || fallbackHeight,
        gap,
        margin,
        key,
      });
      setMeasured((current) =>
        current.key === next.key && current.left === next.left && current.top === next.top
          ? current
          : next,
      );
    };

    measure();
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measure());
    observer?.observe(element);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [anchor, fallbackHeight, fallbackWidth, gap, key, margin, placement]);

  const position = measured.key === key ? measured : fallback;
  return (
    <div
      ref={elementRef}
      aria-label={ariaLabel}
      className={className}
      role={role}
      style={{ left: position.left, top: position.top }}
    >
      {children}
    </div>
  );
}

function calculatePosition({
  anchor,
  placement,
  width,
  height,
  gap,
  margin,
  key,
}: {
  readonly anchor: HotspotScreenAnchor;
  readonly placement: FloatingPlacement;
  readonly width: number;
  readonly height: number;
  readonly gap: number;
  readonly margin: number;
  readonly key: string;
}): FloatingPosition {
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;

  let left = anchor.clientX + gap;
  if (left + width > viewportWidth - margin) left = anchor.clientX - gap - width;

  let top = anchor.clientY - height / 2;
  if (placement === "above") {
    top = anchor.clientY - gap - height;
    if (top < margin) top = anchor.clientY + gap;
  }

  return {
    key,
    left: clamp(left, margin, Math.max(margin, viewportWidth - margin - width)),
    top: clamp(top, margin, Math.max(margin, viewportHeight - margin - height)),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
