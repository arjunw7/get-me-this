import "server-only";
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { ExtractionError, extractionErrorResponse } from "./errors";
import { ExtractionLimiter } from "./limiter";
import { productBrowserTarget } from "./product-browser-protocol";
import { amazonTarget } from "./amazon-worker-protocol";
export type AmazonJob = (target: URL, signal: AbortSignal) => Promise<unknown>;
export function createAmazonWorker(
  secret: string,
  job: AmazonJob,
  productJob?: AmazonJob,
) {
  if (secret.length < 32) throw new Error("Worker authentication is missing");
  const expected = Buffer.from(`Bearer ${secret}`);
  const limiter = new ExtractionLimiter({
    processRate: 10,
    userRate: 10,
    userConcurrency: 1,
    processConcurrency: 1,
  });
  const server = http.createServer(
    { maxHeaderSize: 8192, headersTimeout: 2000, requestTimeout: 2000 },
    (req, res) => {
      const send = (status: number, value: unknown) => {
        if (res.destroyed || res.writableEnded) return;
        const body = JSON.stringify(value);
        if (Buffer.byteLength(body) > 16384) {
          res.writeHead(502, { "content-type": "application/json" });
          res.end(JSON.stringify({ code: "too_large" }));
          return;
        }
        res.writeHead(status, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        res.end(body);
      };
      if (req.url === "/health" && req.method === "GET") {
        send(200, { status: "ready" });
        return;
      }
      const supplied = Buffer.from(req.headers.authorization ?? "");
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      ) {
        send(401, { code: "unavailable" });
        return;
      }
      const generic =
        req.url === "/extract-product" && productJob !== undefined;
      const maximumInput = generic ? 4096 : 1024;
      if ((!generic && req.url !== "/extract") || req.method !== "POST") {
        send(404, { code: "unsupported_content" });
        return;
      }
      if (
        !req.headers["content-type"]?.startsWith("application/json") ||
        Number(req.headers["content-length"] ?? 0) > maximumInput
      ) {
        send(413, { code: "too_large" });
        return;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      const abort = () => controller.abort();
      req.once("aborted", abort);
      res.once("close", () => {
        if (!res.writableEnded) abort();
      });
      let permit: ReturnType<typeof limiter.acquire> | undefined;
      void (async () => {
        try {
          const chunks: Buffer[] = [];
          let bytes = 0;
          for await (const chunk of req) {
            bytes += chunk.length;
            if (bytes > maximumInput) throw new ExtractionError("too_large");
            chunks.push(chunk);
          }
          const target = (generic ? productBrowserTarget : amazonTarget)(
            JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
          );
          permit = limiter.acquire("worker");
          if (!permit.ok) {
            send(503, { code: "unavailable" });
            return;
          }
          const value = await (generic ? productJob! : job)(
            target,
            controller.signal,
          );
          if (controller.signal.aborted) throw new ExtractionError("timeout");
          send(200, value);
        } catch (error) {
          const safe =
            error instanceof ExtractionError
              ? error
              : new ExtractionError("extraction_failed");
          send(
            safe.code === "timeout" ? 504 : 422,
            extractionErrorResponse(safe),
          );
        } finally {
          clearTimeout(timer);
          req.removeListener("aborted", abort);
          if (permit?.ok) permit.permit.release();
        }
      })();
    },
  );
  server.on("clientError", (_error, socket) => socket.destroy());
  server.maxConnections = 32;
  return server;
}
