const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function nanoid(size = 21): string {
  let result = "";
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < size; i++) {
    result += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return result;
}
