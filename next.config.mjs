/** @type {import("next").NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/s/*/preview": [
      "./app/tokens.css",
      "./app/fonts/*-share-*.ttf",
      "./public/assets/brand/gift-mark.svg",
    ],
    "/invite/preview/*/image": [
      "./app/tokens.css",
      "./app/fonts/*-share-*.ttf",
      "./public/assets/brand/gift-mark.svg",
    ],
  },
};

export default nextConfig;
