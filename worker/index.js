import { handleApiRequest } from "./supabase-api.js";
import { STATIC_ASSETS } from "./static-assets.js";

const WORKER_RELEASE = "hermes-whatsapp-v1";

function withReleaseHeader(response) {
  const headers = new Headers(response.headers);
  headers.set("x-hihunt-release", WORKER_RELEASE);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function embeddedAssetResponse(request, pathname) {
  const isNavigation =
    request.method === "GET" &&
    (pathname === "/" || request.headers.get("accept")?.includes("text/html"));
  const asset = STATIC_ASSETS[pathname === "/" || isNavigation ? "/index.html" : pathname];
  if (!asset) return null;
  return new Response(request.method === "HEAD" ? null : asset.body, {
    headers: {
      "content-type": asset.contentType,
      "cache-control": pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return withReleaseHeader(await handleApiRequest(request, env));

    if (env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) return response;
    }

    return embeddedAssetResponse(request, url.pathname) || new Response("Not found", { status: 404 });
  },
};
