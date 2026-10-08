import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mupdf ships a WASM binary that must load from node_modules via native require;
  // bundling it breaks build-time page-data collection (missing .wasm asset path).
  serverExternalPackages: ["mupdf"],
  experimental: {
    // Setup uploads (test paper, markscheme, worked solutions) are Server
    // Actions, which default to a 1 MB body cap — far too small for real exam
    // PDFs. 25 MB turned out to be too small as well: a scanned markscheme at
    // full resolution goes well past it, and the rejection happens inside
    // Next.js before any of our code runs, so it surfaces as a bare 500 with no
    // explanation. Keep this in step with MAX_UPLOAD_MB in
    // lib/assessment/upload-limits.ts, which is what the UI checks against.
    serverActions: { bodySizeLimit: "150mb" },
  },
};

export default nextConfig;
