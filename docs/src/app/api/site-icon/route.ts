import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const target =
    appFaviconUrl(request.url) || new URL("/logo.svg", request.url);
  return NextResponse.redirect(target, {
    status: 307,
    headers: {
      "Cache-Control":
        "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

function appFaviconUrl(requestUrl: string) {
  const value = process.env.VOZEB_PRO_APP_URL?.trim();
  if (!value) return null;
  try {
    const appUrl = new URL(value);
    if (appUrl.protocol !== "http:" && appUrl.protocol !== "https:")
      return null;
    appUrl.pathname =
      `${appUrl.pathname.replace(/\/+$/, "")}/favicon.ico`.replace(
        /^\/\//,
        "/",
      );
    appUrl.search = "";
    appUrl.hash = "";
    const localFavicon = new URL("/favicon.ico", requestUrl);
    return appUrl.toString() === localFavicon.toString() ? null : appUrl;
  } catch {
    return null;
  }
}
