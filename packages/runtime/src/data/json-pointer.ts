import type { JsonValue } from "../types";

function tokens(pointer: string): string[] | null {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) return null;

  const values = pointer.slice(1).split("/");
  const decoded: string[] = [];
  for (const value of values) {
    if (/~(?:[^01]|$)/u.test(value)) return null;
    decoded.push(value.replaceAll("~1", "/").replaceAll("~0", "~"));
  }
  return decoded;
}

export function getJsonPointer(root: JsonValue, pointer: string): JsonValue | undefined {
  const path = tokens(pointer);
  if (path === null) return undefined;

  let current: JsonValue | undefined = root;
  for (const token of path) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/u.test(token)) return undefined;
      current = current[Number(token)];
    } else if (current !== null && typeof current === "object") {
      current = Object.prototype.hasOwnProperty.call(current, token) ? current[token] : undefined;
    } else {
      return undefined;
    }
  }
  return current;
}

export function setJsonPointer(
  root: JsonValue,
  pointer: string,
  value: JsonValue,
): JsonValue | null {
  const path = tokens(pointer);
  if (path === null) return null;
  if (path.length === 0) return cloneJson(value);

  const clone = cloneJson(root);
  let current: JsonValue = clone;
  for (let index = 0; index < path.length - 1; index += 1) {
    const token = path[index];
    if (token === undefined) return null;
    const next = getChild(current, token);
    if (next === undefined || next === null || typeof next !== "object") return null;
    current = next;
  }

  const finalToken = path.at(-1);
  if (finalToken === undefined) return null;
  if (Array.isArray(current)) {
    if (!/^(0|[1-9]\d*)$/u.test(finalToken)) return null;
    const arrayIndex = Number(finalToken);
    if (arrayIndex >= current.length) return null;
    current[arrayIndex] = cloneJson(value);
    return clone;
  }
  if (current !== null && typeof current === "object") {
    if (!Object.prototype.hasOwnProperty.call(current, finalToken)) return null;
    current[finalToken] = cloneJson(value);
    return clone;
  }
  return null;
}

function getChild(value: JsonValue, token: string): JsonValue | undefined {
  if (Array.isArray(value)) {
    if (!/^(0|[1-9]\d*)$/u.test(token)) return undefined;
    return value[Number(token)];
  }
  if (value !== null && typeof value === "object") {
    return Object.prototype.hasOwnProperty.call(value, token) ? value[token] : undefined;
  }
  return undefined;
}

export function cloneJson<T extends JsonValue>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneJson(item)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneJson(item)]),
    ) as T;
  }
  return value;
}
