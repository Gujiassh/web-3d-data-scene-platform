const HEX = "0123456789abcdef";

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", owned);
  let output = "";
  for (const byte of new Uint8Array(digest)) {
    output += HEX.charAt((byte >> 4) & 0x0f) + HEX.charAt(byte & 0x0f);
  }
  return output;
}

export function ownedBytes(bytes: Uint8Array): Uint8Array {
  const output = new Uint8Array(bytes.byteLength);
  output.set(bytes);
  return output;
}
