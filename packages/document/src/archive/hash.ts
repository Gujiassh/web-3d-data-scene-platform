const HEX = "0123456789abcdef";

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy);
  return hexFromBytes(new Uint8Array(digest));
}

function hexFromBytes(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) {
    output += HEX.charAt((byte >> 4) & 0x0f) + HEX.charAt(byte & 0x0f);
  }
  return output;
}
