export function unicodeScalarLength(value: string): number {
  return [...value].length;
}

export function limitUnicodeScalars(value: string, maximum: number): string {
  const scalars = [...value];
  return scalars.length <= maximum ? value : scalars.slice(0, maximum).join("");
}
