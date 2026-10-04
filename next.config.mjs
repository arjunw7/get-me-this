/** @type {import("next").NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/invite/preview/*/image": [
      "./app/tokens.css",
      "./app/fonts/*-share-*.ttf",
      "./public/assets/brand/gift-mark.svg",
    ],
  },
};

export default nextConfig;
