import { isIP } from "node:net";

type AddressFamily = 4 | 6;

export type CanonicalAddress = {
  readonly address: string;
  readonly family: AddressFamily;
  readonly bytes: Uint8Array;
};

type Cidr = readonly [network: bigint, prefix: number];

const V4_DENY_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.31.196.0/24",
  "192.52.193.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "192.175.48.0/24",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
] as const;

// Only 2000::/3 is admitted, then the complete IANA special-purpose entries
// inside that global-unicast envelope are conservatively denied.
const V6_DENY_CIDRS = [
  "2001::/23",
  "2001:db8::/32",
  "2002::/16",
  "2620:4f:8000::/48",
  "3fff::/20",
] as const;

function parseV4(value: string): { number: bigint; bytes: Uint8Array } | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const bytes = new Uint8Array(4);
  let number = BigInt(0);
  for (let index = 0; index < parts.length; index += 1) {
    if (!/^(?:0|[1-9]\d{0,2})$/.test(parts[index] ?? "")) return null;
    const part = Number(parts[index]);
    if (part > 255) return null;
    bytes[index] = part;
    number = (number << BigInt(8)) | BigInt(part);
  }
  return { number, bytes };
}

function expandV6(value: string): Uint16Array | null {
  if (value.includes("%") || value.includes(".")) return null;
  const halves = value.toLowerCase().split("::");
  if (halves.length > 2) return null;
  const read = (half: string): number[] | null => {
    if (half === "") return [];
    const words = half.split(":");
    if (words.some((word) => !/^[0-9a-f]{1,4}$/.test(word))) return null;
    return words.map((word) => Number.parseInt(word, 16));
  };
  const left = read(halves[0] ?? "");
  const right = read(halves[1] ?? "");
  if (!left || !right) return null;
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < (halves.length === 2 ? 1 : 0)) return null;
  return Uint16Array.from([...left, ...Array(missing).fill(0), ...right]);
}

function parseV6(value: string): { number: bigint; bytes: Uint8Array } | null {
  const words = expandV6(value);
  if (!words) return null;
  const bytes = new Uint8Array(16);
  let number = BigInt(0);
  words.forEach((word, index) => {
    bytes[index * 2] = word >>> 8;
    bytes[index * 2 + 1] = word & 0xff;
    number = (number << BigInt(16)) | BigInt(word);
  });
  return { number, bytes };
}

function parseCidr(cidr: string, family: AddressFamily): Cidr {
  const [address, prefixText] = cidr.split("/");
  const parsed = family === 4 ? parseV4(address) : parseV6(address);
  if (!parsed) throw new Error("Invalid static CIDR policy");
  return [parsed.number, Number(prefixText)];
}

const V4_DENY = V4_DENY_CIDRS.map((cidr) => parseCidr(cidr, 4));
const V6_DENY = V6_DENY_CIDRS.map((cidr) => parseCidr(cidr, 6));

function inCidr(value: bigint, bits: number, [network, prefix]: Cidr): boolean {
  if (prefix === 0) return true;
  return value >> BigInt(bits - prefix) === network >> BigInt(bits - prefix);
}

function canonicalV6(bytes: Uint8Array): string {
  const words = Array.from(
    { length: 8 },
    (_, index) => ((bytes[index * 2] ?? 0) << 8) | (bytes[index * 2 + 1] ?? 0),
  );
  let bestStart = -1;
  let bestLength = 0;
  for (let start = 0; start < words.length;) {
    if (words[start] !== 0) {
      start += 1;
      continue;
    }
    let end = start;
    while (end < words.length && words[end] === 0) end += 1;
    if (end - start > bestLength && end - start >= 2) {
      bestStart = start;
      bestLength = end - start;
    }
    start = end;
  }
  if (bestStart < 0) return words.map((word) => word.toString(16)).join(":");
  const left = words
    .slice(0, bestStart)
    .map((word) => word.toString(16))
    .join(":");
  const right = words
    .slice(bestStart + bestLength)
    .map((word) => word.toString(16))
    .join(":");
  return `${left}::${right}`;
}

/** Returns a canonical address only when it is publicly routable by policy. */
export function classifyPublicAddress(value: string): CanonicalAddress | null {
  const family = isIP(value);
  if (family === 4) {
    const parsed = parseV4(value);
    if (!parsed || V4_DENY.some((cidr) => inCidr(parsed.number, 32, cidr))) {
      return null;
    }
    return {
      address: Array.from(parsed.bytes).join("."),
      family: 4,
      bytes: parsed.bytes,
    };
  }
  if (family === 6) {
    const parsed = parseV6(value);
    if (!parsed) return null;
    const globalUnicast: Cidr = parseCidr("2000::/3", 6);
    if (
      !inCidr(parsed.number, 128, globalUnicast) ||
      V6_DENY.some((cidr) => inCidr(parsed.number, 128, cidr))
    ) {
      return null;
    }
    return {
      address: canonicalV6(parsed.bytes),
      family: 6,
      bytes: parsed.bytes,
    };
  }
  return null;
}

export function compareCanonicalAddresses(
  left: CanonicalAddress,
  right: CanonicalAddress,
): number {
  if (left.family !== right.family) return left.family - right.family;
  for (let index = 0; index < left.bytes.length; index += 1) {
    const difference = (left.bytes[index] ?? 0) - (right.bytes[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export const ADDRESS_POLICY_RANGES = {
  ipv4Denied: V4_DENY_CIDRS,
  ipv6Admitted: "2000::/3",
  ipv6Denied: V6_DENY_CIDRS,
} as const;
