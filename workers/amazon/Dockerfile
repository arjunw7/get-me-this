FROM node:24.21.0-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@10.28.0
COPY workers/amazon/package.json workers/amazon/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN pnpm exec playwright-core install --with-deps chromium
COPY src/wishlist/extraction/errors.ts src/wishlist/extraction/ip-policy.ts src/wishlist/extraction/url-policy.ts src/wishlist/extraction/transport.ts src/wishlist/extraction/browser-egress.ts src/wishlist/extraction/amazon-worker-http.ts src/wishlist/extraction/amazon-worker-protocol.ts src/wishlist/extraction/amazon-product.ts src/wishlist/extraction/result.ts src/wishlist/extraction/money.ts src/wishlist/extraction/limiter.ts ./src/wishlist/extraction/
COPY workers/amazon ./workers/amazon
RUN pnpm exec tsc -p workers/amazon/tsconfig.json
USER node
ENV PORT=8080
CMD ["node", "--conditions=react-server", "dist/amazon/workers/amazon/railway.js"]
