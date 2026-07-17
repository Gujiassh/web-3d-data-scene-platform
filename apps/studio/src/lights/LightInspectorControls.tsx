import { useEffect, useRef } from "react";

export function LightColorControl(props: {
  readonly disabled: boolean;
  readonly label: string;
  readonly previewCancellation: number;
  readonly value: string;
  readonly onCommit: (value: string) => void;
  readonly onPreview: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<string | null>(null);
  const commitRef = useRef(props.onCommit);
  useEffect(() => {
    commitRef.current = props.onCommit;
  }, [props.onCommit]);
  useEffect(() => {
    pendingRef.current = null;
  }, [props.previewCancellation]);
  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    const commit = (): void => {
      if (pendingRef.current === null) return;
      const value = input.value.toUpperCase();
      pendingRef.current = null;
      commitRef.current(value);
    };
    input.addEventListener("change", commit);
    return () => input.removeEventListener("change", commit);
  }, []);

  return (
    <input
      ref={inputRef}
      aria-label={props.label}
      disabled={props.disabled}
      type="color"
      value={props.value}
      onBlur={(event) => {
        if (pendingRef.current === null) return;
        const value = event.currentTarget.value.toUpperCase();
        pendingRef.current = null;
        commitRef.current(value);
      }}
      onInput={(event) => {
        const value = event.currentTarget.value.toUpperCase();
        pendingRef.current = value;
        props.onPreview(value);
      }}
    />
  );
}

export function LightRangeControl(props: {
  readonly disabled: boolean;
  readonly label: string;
  readonly max: number;
  readonly min: number;
  readonly previewCancellation: number;
  readonly step: number;
  readonly value: number;
  readonly onCancel: () => void;
  readonly onCommit: (value: number) => void;
  readonly onPreview: (value: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<number | null>(null);
  const commitRef = useRef(props.onCommit);
  const cancelRef = useRef(props.onCancel);
  useEffect(() => {
    commitRef.current = props.onCommit;
    cancelRef.current = props.onCancel;
  }, [props.onCancel, props.onCommit]);
  useEffect(() => {
    pendingRef.current = null;
  }, [props.previewCancellation]);
  const commit = (input: HTMLInputElement): void => {
    if (pendingRef.current === null) return;
    const value = Number(input.value);
    pendingRef.current = null;
    commitRef.current(value);
  };
  return (
    <input
      ref={inputRef}
      aria-label={props.label}
      disabled={props.disabled}
      max={props.max}
      min={props.min}
      step={props.step}
      type="range"
      value={props.value}
      onBlur={(event) => commit(event.currentTarget)}
      onChange={(event) => {
        const value = Number(event.currentTarget.value);
        pendingRef.current = value;
        props.onPreview(value);
      }}
      onKeyUp={(event) => {
        if (RANGE_ADJUSTMENT_KEYS.has(event.key)) commit(event.currentTarget);
      }}
      onPointerCancel={() => {
        if (pendingRef.current === null) return;
        pendingRef.current = null;
        cancelRef.current();
      }}
      onPointerUp={(event) => commit(event.currentTarget)}
    />
  );
}

const RANGE_ADJUSTMENT_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
]);
