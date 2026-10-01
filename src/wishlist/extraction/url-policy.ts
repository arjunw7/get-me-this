import { isIP } from "node:net";

import { ExtractionError } from "./errors";
import { classifyPublicAddress } from "./ip-policy";

const MAX_URL_LENGTH = 2_048;
const DNS_LABEL = /^(?:xn--)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function rawAuthorityHostname(input: string): string | null {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(input);
  if (!match) return null;
  const authority = match[1] ?? "";
  const hostPort = authority.slice(authority.lastIndexOf("@") + 1);
  if (hostPort.startsWith("[")) {
    const end = hostPort.indexOf("]");
    return end < 0 ? null : hostPort.slice(1, end);
  }
  return hostPort.split(":", 1)[0] ?? null;
}

export function parseDestinationUrl(input: string): URL {
  if (
    input.length > MAX_URL_LENGTH ||
    input.trim().length === 0 ||
    input !== input.trim() ||
    input.includes("\\")
  ) {
    throw new ExtractionError("invalid_url");
  }
  const rawHostname = rawAuthorityHostname(input);
  if (!rawHostname || rawHostname.includes("%")) {
    throw new ExtractionError("invalid_url");
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ExtractionError("invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ExtractionError("invalid_url");
  }
  if (url.username || url.password || url.hash) {
    throw new ExtractionError("invalid_url");
  }
  const expectedPort = url.protocol === "http:" ? "80" : "443";
  if (url.port && url.port !== expectedPort) {
    throw new ExtractionError("blocked_url");
  }

  const parsedHostname = url.hostname;
  const hostname = parsedHostname.startsWith("[")
    ? parsedHostname.slice(1, -1)
    : parsedHostname;
  if (!hostname || hostname.includes("%")) {
    throw new ExtractionError("invalid_url");
  }
  const family = isIP(hostname);
  if (/^(?:0x[0-9a-f]+|[0-9.]+)$/i.test(rawHostname)) {
    if (
      family !== 4 ||
      !/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(rawHostname) ||
      rawHostname !== hostname
    ) {
      throw new ExtractionError("invalid_url");
    }
  }
  if (family !== 0) {
    if (!classifyPublicAddress(hostname)) {
      throw new ExtractionError("blocked_url");
    }
  } else {
    const fqdn = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
    const labels = fqdn.split(".");
    if (
      fqdn.length > 253 ||
      labels.length < 2 ||
      labels.some((label) => !DNS_LABEL.test(label))
    ) {
      throw new ExtractionError("invalid_url");
    }
  }
  if (url.href.length > MAX_URL_LENGTH) {
    throw new ExtractionError("invalid_url");
  }
  return url;
}

export function destinationHostname(url: URL): string {
  return url.hostname.startsWith("[")
    ? url.hostname.slice(1, -1)
    : url.hostname;
}

export const EXTRACTION_MAX_URL_LENGTH = MAX_URL_LENGTH;
