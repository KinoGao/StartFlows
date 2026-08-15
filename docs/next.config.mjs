import { createMDX } from "fumadocs-mdx/next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const withMDX = createMDX();
const docsRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  output: "standalone",
  outputFileTracingRoot: docsRoot,
  turbopack: { root: docsRoot },
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [{ source: "/favicon.ico", destination: "/api/site-icon" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default withMDX(config);
