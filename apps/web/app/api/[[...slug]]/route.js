import { NextResponse } from "next/server";

const API_BASE = (process.env.API_PROXY_TARGET || "http://127.0.0.1:4000").replace(/\/$/, "");

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host"
]);

function upstreamPath(slug) {
  const parts = Array.isArray(slug) ? slug : [];
  const tail = parts.filter(Boolean).join("/");
  return tail ? `/api/${tail}` : "/api";
}

/** @param {import("next/server").NextRequest} req */
async function proxy(req, context) {
  const { slug } = await context.params;
  const path = upstreamPath(slug);
  const upstreamUrl = `${API_BASE}${path}${new URL(req.url).search || ""}`;

  const outHeaders = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      outHeaders.set(key, value);
    }
  });

  /** @type {RequestInit} */
  const init = {
    method: req.method,
    headers: outHeaders,
    redirect: "manual"
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  let res;
  try {
    res = await fetch(upstreamUrl, init);
  } catch (e) {
    const detail = e?.cause?.message || e?.message || "network error";
    return NextResponse.json(
      {
        error: `Cannot reach the API (${detail}). Start vems-api and ensure API_PROXY_TARGET points to it (default http://127.0.0.1:4000).`
      },
      { status: 503 }
    );
  }

  const resHeaders = new Headers();
  res.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "transfer-encoding") {
      resHeaders.set(key, value);
    }
  });

  return new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: resHeaders
  });
}

export async function GET(req, ctx) {
  return proxy(req, ctx);
}
export async function POST(req, ctx) {
  return proxy(req, ctx);
}
export async function PUT(req, ctx) {
  return proxy(req, ctx);
}
export async function PATCH(req, ctx) {
  return proxy(req, ctx);
}
export async function DELETE(req, ctx) {
  return proxy(req, ctx);
}
export async function HEAD(req, ctx) {
  return proxy(req, ctx);
}
export async function OPTIONS(req, ctx) {
  return proxy(req, ctx);
}
