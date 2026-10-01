import "server-only";

import { promises as dns } from "node:dns";
import net, { type Socket } from "node:net";
import tls from "node:tls";

import { ExtractionError } from "./errors";
import {
  classifyPublicAddress,
  compareCanonicalAddresses,
  type CanonicalAddress,
} from "./ip-policy";
import { destinationHostname, parseDestinationUrl } from "./url-policy";

const DNS_TIMEOUT_MS = 2_000;
const CONNECT_TIMEOUT_MS = 2_000;
const HEADER_TIMEOUT_MS = 2_000;
const BODY_IDLE_TIMEOUT_MS = 1_000;
const TOTAL_TIMEOUT_MS = 10_000;
const MAX_HEADER_BYTES = 16 * 1_024;
const MAX_HEADER_FIELDS = 100;
const MAX_DNS_ANSWERS = 32;
const MAX_REDIRECTS = 3;

export type TransportConsumer = "html" | "image";

export type ResolveAnswer = {
  readonly address: string;
  readonly family: number;
};

export type PinnedConnection = AsyncIterable<Uint8Array> & {
  readonly remoteAddress: string | undefined;
  write(bytes: Uint8Array): void;
  destroy(error?: Error): void;
};

export type TransportDependencies = {
  readonly resolve?: (
    hostname: string,
    signal: AbortSignal,
  ) => Promise<readonly ResolveAnswer[]>;
  readonly dial?: (input: {
    readonly address: CanonicalAddress;
    readonly hostname: string;
    readonly port: 80 | 443;
    readonly tls: boolean;
    readonly signal: AbortSignal;
  }) => Promise<PinnedConnection>;
  readonly now?: () => number;
};

export type GuardedResponse = {
  readonly finalUrl: string;
  readonly contentType: string;
  readonly charset: string | null;
  readonly body: Uint8Array;
};

type ParsedHeaders = {
  readonly status: number;
  readonly fields: ReadonlyMap<string, readonly string[]>;
};

function timeoutError(): ExtractionError {
  return new ExtractionError("timeout");
}

async function bounded<T>(
  promise: Promise<T>,
  milliseconds: number,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted || milliseconds <= 0) throw timeoutError();
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(timeoutError()), milliseconds);
    const onAbort = () => reject(timeoutError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    });
  });
}

function remaining(
  now: () => number,
  deadline: number,
  hopLimit: number,
): number {
  return Math.min(hopLimit, deadline - now());
}

async function systemResolve(
  hostname: string,
): Promise<readonly ResolveAnswer[]> {
  return await dns.lookup(hostname, { all: true, verbatim: true });
}

function systemDial(input: {
  readonly address: CanonicalAddress;
  readonly hostname: string;
  readonly port: 80 | 443;
  readonly tls: boolean;
  readonly signal: AbortSignal;
}): Promise<PinnedConnection> {
  return new Promise((resolve, reject) => {
    if (input.signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    let socket: Socket;
    const abort = () => fail(new Error("aborted"));
    const finish = () => {
      socket.removeListener("error", fail);
      input.signal.removeEventListener("abort", abort);
      resolve(socket as PinnedConnection);
    };
    const fail = (error: Error) => {
      input.signal.removeEventListener("abort", abort);
      socket.destroy();
      reject(error);
    };
    // Passing the selected numeric address prevents a library or proxy from
    // performing another lookup. Every call constructs a fresh socket.
    if (input.tls) {
      socket = tls.connect({
        host: input.address.address,
        port: input.port,
        servername: input.hostname,
        rejectUnauthorized: true,
        ALPNProtocols: ["http/1.1"],
      });
      socket.once("secureConnect", finish);
    } else {
      socket = net.createConnection({
        host: input.address.address,
        port: input.port,
        signal: input.signal,
      });
      socket.once("connect", finish);
    }
    socket.once("error", fail);
    socket.setKeepAlive(false);
    input.signal.addEventListener("abort", abort, { once: true });
  });
}

export async function resolvePinnedAddress(
  hostname: string,
  dependencies: TransportDependencies,
  signal: AbortSignal,
  deadline: number,
): Promise<CanonicalAddress> {
  const literal = classifyPublicAddress(hostname);
  if (net.isIP(hostname) !== 0) {
    if (!literal) throw new ExtractionError("blocked_url");
    return literal;
  }
  const now = dependencies.now ?? Date.now;
  let answers: readonly ResolveAnswer[];
  try {
    answers = await bounded(
      (dependencies.resolve ?? systemResolve)(hostname, signal),
      remaining(now, deadline, DNS_TIMEOUT_MS),
      signal,
    );
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError("unavailable");
  }
  if (answers.length === 0) throw new ExtractionError("unavailable");
  if (answers.length > MAX_DNS_ANSWERS) {
    throw new ExtractionError("blocked_url");
  }
  const approved: CanonicalAddress[] = [];
  for (const answer of answers) {
    if (answer.family !== 4 && answer.family !== 6) {
      throw new ExtractionError("blocked_url");
    }
    const address = classifyPublicAddress(answer.address);
    if (!address || address.family !== answer.family) {
      throw new ExtractionError("blocked_url");
    }
    approved.push(address);
  }
  const unique = new Map(
    approved.map((address) => [
      `${address.family}:${address.address}`,
      address,
    ]),
  );
  return [...unique.values()].sort(compareCanonicalAddresses)[0]!;
}

function hostHeader(url: URL): string {
  const hostname = destinationHostname(url);
  return net.isIP(hostname) === 6 ? `[${hostname}]` : hostname;
}

function requestBytes(url: URL, consumer: TransportConsumer): Uint8Array {
  const accept =
    consumer === "html"
      ? "text/html, application/xhtml+xml"
      : "image/jpeg, image/png, image/webp";
  const path = `${url.pathname || "/"}${url.search}`;
  const request = [
    `GET ${path} HTTP/1.1`,
    `Host: ${hostHeader(url)}`,
    `Accept: ${accept}`,
    "Accept-Encoding: identity",
    "Connection: close",
    "User-Agent: GetMeThis-LinkExtractor/1.0",
    "",
    "",
  ].join("\r\n");
  return new TextEncoder().encode(request);
}

function parseHeaders(bytes: Uint8Array): ParsedHeaders {
  const text = new TextDecoder("latin1").decode(bytes);
  const lines = text.split("\r\n");
  const statusMatch = /^HTTP\/1\.[01] ([1-5]\d{2})(?: |$)/.exec(
    lines.shift() ?? "",
  );
  if (!statusMatch) throw new ExtractionError("unavailable");
  const headerLines = lines.filter((line) => line.length > 0);
  if (headerLines.length > MAX_HEADER_FIELDS) {
    throw new ExtractionError("too_large");
  }
  const mutable = new Map<string, string[]>();
  for (const line of headerLines) {
    if (/^[ \t]/.test(line)) throw new ExtractionError("unavailable");
    const separator = line.indexOf(":");
    if (separator <= 0) throw new ExtractionError("unavailable");
    const name = line.slice(0, separator).toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name)) {
      throw new ExtractionError("unavailable");
    }
    const value = line.slice(separator + 1).trim();
    const values = mutable.get(name) ?? [];
    values.push(value);
    mutable.set(name, values);
  }
  return { status: Number(statusMatch[1]), fields: mutable };
}

function singleHeader(headers: ParsedHeaders, name: string): string | null {
  const values = headers.fields.get(name);
  if (!values || values.length === 0) return null;
  if (values.length !== 1) throw new ExtractionError("unavailable");
  return values[0] ?? null;
}

function parseContentType(
  header: string | null,
  consumer: TransportConsumer,
): { type: string; charset: string | null } {
  if (!header) throw new ExtractionError("unsupported_content");
  const [rawType, ...parameters] = header.split(";");
  const type = rawType!.trim().toLowerCase();
  const allowed =
    consumer === "html"
      ? new Set(["text/html", "application/xhtml+xml"])
      : new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(type)) throw new ExtractionError("unsupported_content");
  let charset: string | null = null;
  for (const parameter of parameters) {
    const match = /^\s*charset\s*=\s*"?([^"\s;]+)"?\s*$/i.exec(parameter);
    if (match) charset = match[1]!.toLowerCase();
  }
  if (
    consumer === "html" &&
    charset !== null &&
    !["utf-8", "utf8", "iso-8859-1", "windows-1252"].includes(charset)
  ) {
    throw new ExtractionError("unsupported_content");
  }
  return { type, charset };
}

function concat(chunks: readonly Uint8Array[], length: number): Uint8Array {
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function decodeChunked(input: Uint8Array, maximum: number): Uint8Array | null {
  const output: Uint8Array[] = [];
  let outputLength = 0;
  let offset = 0;
  while (offset < input.length) {
    let lineEnd = -1;
    for (let index = offset; index + 1 < input.length; index += 1) {
      if (input[index] === 13 && input[index + 1] === 10) {
        lineEnd = index;
        break;
      }
    }
    if (lineEnd < 0) return null;
    if (lineEnd - offset > 128) throw new ExtractionError("too_large");
    const line = new TextDecoder("ascii").decode(input.slice(offset, lineEnd));
    const sizeText = line.split(";", 1)[0] ?? "";
    if (!/^[0-9a-fA-F]+$/.test(sizeText)) {
      throw new ExtractionError("unavailable");
    }
    const size = Number.parseInt(sizeText, 16);
    if (!Number.isSafeInteger(size)) throw new ExtractionError("too_large");
    offset = lineEnd + 2;
    if (size === 0) {
      if (input.length < offset + 2) return null;
      return concat(output, outputLength);
    }
    if (outputLength + size > maximum) throw new ExtractionError("too_large");
    if (input.length < offset + size + 2) return null;
    if (input[offset + size] !== 13 || input[offset + size + 1] !== 10) {
      throw new ExtractionError("unavailable");
    }
    output.push(input.slice(offset, offset + size));
    outputLength += size;
    offset += size + 2;
  }
  return null;
}

async function readResponse(
  connection: PinnedConnection,
  url: URL,
  consumer: TransportConsumer,
  maximumBodyBytes: number,
  signal: AbortSignal,
  deadline: number,
  now: () => number,
): Promise<{
  headers: ParsedHeaders;
  body: Uint8Array;
  contentType: { type: string; charset: string | null } | null;
}> {
  connection.write(requestBytes(url, consumer));
  const iterator = connection[Symbol.asyncIterator]();
  let headerBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array();
  const bodyChunks: Uint8Array[] = [];
  let bodyLength = 0;
  let headers: ParsedHeaders | null = null;
  let contentType: { type: string; charset: string | null } | null = null;
  let maximumWireBytes = maximumBodyBytes;
  let expectedLength: number | null = null;
  let chunked = false;

  const appendBody = (chunk: Uint8Array) => {
    if (chunk.length === 0) return;
    bodyLength += chunk.length;
    if (bodyLength > maximumWireBytes) {
      throw new ExtractionError("too_large");
    }
    if (!chunked && expectedLength !== null && bodyLength > expectedLength) {
      throw new ExtractionError("unavailable");
    }
    bodyChunks.push(chunk);
  };

  while (true) {
    const limit = headers ? BODY_IDLE_TIMEOUT_MS : HEADER_TIMEOUT_MS;
    const next = await bounded(
      iterator.next(),
      remaining(now, deadline, limit),
      signal,
    );
    if (next.done) break;
    const chunk = next.value;
    if (!headers) {
      const buffered = concat(
        [headerBuffer, chunk],
        headerBuffer.length + chunk.length,
      );
      let headerEnd = -1;
      for (let index = 0; index + 3 < buffered.length; index += 1) {
        if (
          buffered[index] === 13 &&
          buffered[index + 1] === 10 &&
          buffered[index + 2] === 13 &&
          buffered[index + 3] === 10
        ) {
          headerEnd = index + 4;
          break;
        }
      }
      if (headerEnd < 0) {
        if (buffered.length > MAX_HEADER_BYTES) {
          throw new ExtractionError("too_large");
        }
        headerBuffer = buffered;
        continue;
      }
      if (headerEnd > MAX_HEADER_BYTES) throw new ExtractionError("too_large");
      headers = parseHeaders(buffered.slice(0, headerEnd - 2));
      const encoding = singleHeader(headers, "content-encoding");
      if (encoding && encoding.toLowerCase() !== "identity") {
        throw new ExtractionError("unsupported_content");
      }
      const transferEncoding = singleHeader(headers, "transfer-encoding");
      chunked = transferEncoding?.toLowerCase() === "chunked";
      if (transferEncoding && !chunked)
        throw new ExtractionError("unavailable");
      const lengthHeader = singleHeader(headers, "content-length");
      if (lengthHeader) {
        if (!/^(?:0|[1-9]\d*)$/.test(lengthHeader)) {
          throw new ExtractionError("unavailable");
        }
        expectedLength = Number(lengthHeader);
        if (
          !Number.isSafeInteger(expectedLength) ||
          expectedLength > maximumBodyBytes
        ) {
          throw new ExtractionError("too_large");
        }
      }
      if (chunked && expectedLength !== null)
        throw new ExtractionError("unavailable");
      if (headers.status >= 300 && headers.status < 400) {
        return { headers, body: new Uint8Array(), contentType: null };
      }
      if (headers.status < 200 || headers.status >= 300) {
        throw new ExtractionError("unavailable");
      }
      contentType = parseContentType(
        singleHeader(headers, "content-type"),
        consumer,
      );
      maximumWireBytes = chunked
        ? maximumBodyBytes + 256 * 1_024
        : maximumBodyBytes;
      appendBody(buffered.slice(headerEnd));
    } else {
      appendBody(chunk);
    }

    if (!chunked && expectedLength !== null && bodyLength === expectedLength) {
      return {
        headers,
        body: concat(bodyChunks, bodyLength),
        contentType,
      };
    }
  }
  if (!headers) throw new ExtractionError("unavailable");
  const body = concat(bodyChunks, bodyLength);
  if (chunked) {
    const decoded = decodeChunked(body, maximumBodyBytes);
    if (!decoded) throw new ExtractionError("unavailable");
    return { headers, body: decoded, contentType };
  }
  if (expectedLength !== null && body.length !== expectedLength) {
    throw new ExtractionError("unavailable");
  }
  return { headers, body, contentType };
}

export async function guardedRequest(
  input: string,
  consumer: TransportConsumer,
  dependencies: TransportDependencies = {},
  options: { readonly signal?: AbortSignal; readonly deadline?: number } = {},
): Promise<GuardedResponse> {
  const now = dependencies.now ?? Date.now;
  const deadline = options.deadline ?? now() + TOTAL_TIMEOUT_MS;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener("abort", abort, { once: true });
  const totalTimer = setTimeout(abort, Math.max(0, deadline - now()));
  let current = parseDestinationUrl(input);
  const maximumBodyBytes =
    consumer === "html" ? 1 * 1_024 * 1_024 : 5 * 1_024 * 1_024;
  try {
    for (let redirects = 0; ; redirects += 1) {
      if (controller.signal.aborted || now() >= deadline) throw timeoutError();
      const hostname = destinationHostname(current);
      const selected = await resolvePinnedAddress(
        hostname,
        dependencies,
        controller.signal,
        deadline,
      );
      let connection: PinnedConnection | null = null;
      const dialController = new AbortController();
      const abortDial = () => dialController.abort();
      if (controller.signal.aborted) dialController.abort();
      else
        controller.signal.addEventListener("abort", abortDial, { once: true });
      const dialPromise = Promise.resolve().then(() =>
        (dependencies.dial ?? systemDial)({
          address: selected,
          hostname,
          port: current.protocol === "https:" ? 443 : 80,
          tls: current.protocol === "https:",
          signal: dialController.signal,
        }),
      );
      try {
        connection = await bounded(
          dialPromise,
          remaining(now, deadline, CONNECT_TIMEOUT_MS),
          controller.signal,
        );
        const peer = connection.remoteAddress
          ? classifyPublicAddress(connection.remoteAddress)
          : null;
        if (!peer || compareCanonicalAddresses(peer, selected) !== 0) {
          throw new ExtractionError("blocked_url");
        }
        const response = await readResponse(
          connection,
          current,
          consumer,
          maximumBodyBytes,
          controller.signal,
          deadline,
          now,
        );
        if (response.headers.status >= 300 && response.headers.status < 400) {
          if (redirects >= MAX_REDIRECTS) {
            throw new ExtractionError("unavailable");
          }
          const location = singleHeader(response.headers, "location");
          if (!location) throw new ExtractionError("unavailable");
          let next: URL;
          try {
            next = parseDestinationUrl(new URL(location, current).href);
          } catch (error) {
            if (error instanceof ExtractionError) throw error;
            throw new ExtractionError("invalid_url");
          }
          if (current.protocol === "https:" && next.protocol === "http:") {
            throw new ExtractionError("blocked_url");
          }
          current = next;
          continue;
        }
        if (!response.contentType)
          throw new ExtractionError("unsupported_content");
        return {
          finalUrl: current.href,
          contentType: response.contentType.type,
          charset: response.contentType.charset,
          body: response.body,
        };
      } catch (error) {
        dialController.abort();
        void dialPromise.then(
          (lateConnection) => lateConnection.destroy(),
          () => undefined,
        );
        if (error instanceof ExtractionError) throw error;
        if (controller.signal.aborted) throw timeoutError();
        throw new ExtractionError("unavailable");
      } finally {
        controller.signal.removeEventListener("abort", abortDial);
        connection?.destroy();
      }
    }
  } finally {
    clearTimeout(totalTimer);
    options.signal?.removeEventListener("abort", abort);
  }
}

export const TRANSPORT_LIMITS = {
  dnsAnswers: MAX_DNS_ANSWERS,
  redirects: MAX_REDIRECTS,
  headerBytes: MAX_HEADER_BYTES,
  headerFields: MAX_HEADER_FIELDS,
  htmlBytes: 1 * 1_024 * 1_024,
  imageBytes: 5 * 1_024 * 1_024,
  totalMs: TOTAL_TIMEOUT_MS,
  dnsMs: DNS_TIMEOUT_MS,
  connectMs: CONNECT_TIMEOUT_MS,
  headersMs: HEADER_TIMEOUT_MS,
  bodyIdleMs: BODY_IDLE_TIMEOUT_MS,
} as const;
