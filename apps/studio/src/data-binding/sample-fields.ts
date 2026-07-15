import type { JsonPrimitive, JsonValue } from "@web3d/runtime";

import type { SampleField } from "./types";

export function enumerateSampleFields(value: JsonValue): readonly SampleField[] {
  const fields: SampleField[] = [];
  appendFields(value, "", fields);
  return fields.sort((left, right) => compare(left.pointer, right.pointer));
}

export function isCanonicalJsonPointer(pointer: string): boolean {
  if (pointer === "") return true;
  if (!pointer.startsWith("/")) return false;
  return pointer
    .slice(1)
    .split("/")
    .every((segment) => !/~(?:[^01]|$)/u.test(segment));
}

function appendFields(value: JsonValue, pointer: string, fields: SampleField[]): void {
  if (isPrimitive(value)) {
    fields.push({ pointer, value, valueType: valueType(value) });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendFields(item, `${pointer}/${index}`, fields));
    return;
  }
  const record = value as Record<string, JsonValue>;
  Object.keys(record)
    .sort(compare)
    .forEach((key) =>
      appendFields(record[key]!, `${pointer}/${escapePointerSegment(key)}`, fields),
    );
}

function escapePointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function isPrimitive(value: JsonValue): value is JsonPrimitive {
  return value === null || typeof value !== "object";
}

function valueType(value: JsonPrimitive): SampleField["valueType"] {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  return "boolean";
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
