import { useEffect, useRef } from "react";

export function SegmentOption(props: {
  readonly checked: boolean;
  readonly label: string;
  readonly name: string;
  readonly onChange: () => void;
}) {
  return (
    <label>
      <input
        aria-label={props.label}
        checked={props.checked}
        name={props.name}
        type="radio"
        onChange={props.onChange}
      />
      <span>{props.label}</span>
    </label>
  );
}

export function ColorControl(props: {
  readonly disabled?: boolean;
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
  const preview = (value: string): void => {
    const canonical = value.toUpperCase();
    pendingRef.current = canonical;
    props.onPreview(canonical);
  };
  const commit = (value: string): void => {
    if (pendingRef.current === null) return;
    const canonical = value.toUpperCase();
    pendingRef.current = null;
    commitRef.current(canonical);
  };
  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    const onChange = (): void => commit(input.value);
    input.addEventListener("change", onChange);
    return () => input.removeEventListener("change", onChange);
  }, []);
  return (
    <label className="scene-settings-field scene-color-control">
      <span>{props.label}</span>
      <input
        ref={inputRef}
        aria-label={props.label}
        disabled={props.disabled}
        type="color"
        value={props.value}
        onBlur={(event) => commit(event.currentTarget.value)}
        onInput={(event) => preview(event.currentTarget.value)}
      />
    </label>
  );
}

export function RangeControl(props: {
  readonly label: string;
  readonly previewCancellation: number;
  readonly value: number;
  readonly onCancel: () => void;
  readonly onCommit: (value: number) => void;
  readonly onPreview: (value: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<number | null>(null);
  const commitPending = (input: HTMLInputElement): void => {
    if (pendingRef.current === null) return;
    const value = Number(input.value);
    pendingRef.current = null;
    delete input.dataset["scenePreviewActive"];
    props.onCommit(value);
  };
  const cancelPending = (input: HTMLInputElement): void => {
    if (pendingRef.current === null) return;
    pendingRef.current = null;
    delete input.dataset["scenePreviewActive"];
    props.onCancel();
  };
  useEffect(() => {
    pendingRef.current = null;
    const input = inputRef.current;
    if (input !== null) delete input.dataset["scenePreviewActive"];
  }, [props.previewCancellation]);
  return (
    <label className="scene-settings-field scene-range-control">
      <span>{props.label}</span>
      <input
        ref={inputRef}
        aria-label={props.label}
        max="5"
        min="0"
        step="0.1"
        type="range"
        value={props.value}
        onBlur={(event) => commitPending(event.currentTarget)}
        onChange={(event) => {
          const value = Number(event.currentTarget.value);
          pendingRef.current = value;
          event.currentTarget.dataset["scenePreviewActive"] = "true";
          props.onPreview(value);
        }}
        onKeyUp={(event) => {
          if (RANGE_ADJUSTMENT_KEYS.has(event.key)) commitPending(event.currentTarget);
        }}
        onPointerCancel={(event) => cancelPending(event.currentTarget)}
        onPointerUp={(event) => commitPending(event.currentTarget)}
      />
      <output>{props.value.toFixed(1)}</output>
    </label>
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
