import { handleApiRequest } from "./supabase-api.js";

async function requestBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body) || typeof req.body === "string") return req.body;
    return JSON.stringify(req.body);
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

export default async function handler(req, res) {
  const protocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = req.headers.host || "localhost";
  const request = new Request(`${protocol}://${host}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: await requestBody(req),
  });
  const response = await handleApiRequest(request, process.env);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}
