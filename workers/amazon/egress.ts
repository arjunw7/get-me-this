import { createBrowserEgress } from "../../src/wishlist/extraction/browser-egress";
const { server, shutdown } = createBrowserEgress();
server.listen(Number(process.env.PORT ?? 8080), process.env.HOST ?? "0.0.0.0");
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
