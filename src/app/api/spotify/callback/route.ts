import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state"); // tournamentId
  const error = request.nextUrl.searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;

  // Handle Spotify errors
  if (error) {
    const message = error === "access_denied"
      ? "You denied access to Spotify. Go back to the scorekeeper and try again if you'd like to connect."
      : `Spotify returned an error: ${error}. Go back to the scorekeeper and try again.`;

    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head><title>Spotify Connection Failed</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: system-ui, sans-serif; background: #09090b; color: #fafafa; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
  .card { max-width: 420px; text-align: center; }
  h1 { font-size: 1.5rem; color: #ef4444; margin-bottom: 12px; }
  p { color: #a1a1aa; line-height: 1.6; margin-bottom: 24px; }
  a { display: inline-block; background: #27272a; color: #fafafa; text-decoration: none; padding: 10px 24px; border-radius: 9999px; font-size: 0.875rem; font-weight: 500; }
  a:hover { background: #3f3f46; }
</style>
</head>
<body>
  <div class="card">
    <h1>Spotify Connection Failed</h1>
    <p>${message}</p>
    ${state ? `<a href="${baseUrl}/projects/beer-olympics/${state}/scorekeeper">Back to Scorekeeper</a>` : `<a href="${baseUrl}/projects/beer-olympics">Back to Tournaments</a>`}
  </div>
</body>
</html>`,
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code || !state) {
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head><title>Spotify Error</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: system-ui, sans-serif; background: #09090b; color: #fafafa; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
  .card { max-width: 420px; text-align: center; }
  h1 { font-size: 1.5rem; color: #ef4444; margin-bottom: 12px; }
  p { color: #a1a1aa; line-height: 1.6; margin-bottom: 24px; }
  a { display: inline-block; background: #27272a; color: #fafafa; text-decoration: none; padding: 10px 24px; border-radius: 9999px; font-size: 0.875rem; font-weight: 500; }
  a:hover { background: #3f3f46; }
</style>
</head>
<body>
  <div class="card">
    <h1>Something Went Wrong</h1>
    <p>Missing authorization code or tournament ID. This can happen if the link expired or was opened incorrectly. Try connecting Spotify again from the scorekeeper.</p>
    <a href="${baseUrl}/projects/beer-olympics">Back to Tournaments</a>
  </div>
</body>
</html>`,
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head><title>Spotify Not Configured</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: system-ui, sans-serif; background: #09090b; color: #fafafa; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
  .card { max-width: 420px; text-align: center; }
  h1 { font-size: 1.5rem; color: #ef4444; margin-bottom: 12px; }
  p { color: #a1a1aa; line-height: 1.6; margin-bottom: 24px; }
  code { background: #27272a; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
  a { display: inline-block; background: #27272a; color: #fafafa; text-decoration: none; padding: 10px 24px; border-radius: 9999px; font-size: 0.875rem; font-weight: 500; }
  a:hover { background: #3f3f46; }
</style>
</head>
<body>
  <div class="card">
    <h1>Spotify Not Configured</h1>
    <p>The server is missing <code>SPOTIFY_CLIENT_ID</code> or <code>SPOTIFY_CLIENT_SECRET</code> environment variables. Add them in Vercel or your <code>.env.local</code> file and redeploy.</p>
    <a href="${baseUrl}/projects/beer-olympics/${state}/scorekeeper">Back to Scorekeeper</a>
  </div>
</body>
</html>`,
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  const redirectUri = `${baseUrl}/api/spotify/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const errData = await tokenRes.text();
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head><title>Spotify Token Error</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: system-ui, sans-serif; background: #09090b; color: #fafafa; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
  .card { max-width: 420px; text-align: center; }
  h1 { font-size: 1.5rem; color: #ef4444; margin-bottom: 12px; }
  p { color: #a1a1aa; line-height: 1.6; margin-bottom: 24px; }
  pre { background: #27272a; padding: 12px; border-radius: 8px; font-size: 0.75rem; overflow-x: auto; text-align: left; color: #ef4444; }
  a { display: inline-block; background: #27272a; color: #fafafa; text-decoration: none; padding: 10px 24px; border-radius: 9999px; font-size: 0.875rem; font-weight: 500; }
  a:hover { background: #3f3f46; }
</style>
</head>
<body>
  <div class="card">
    <h1>Failed to Connect Spotify</h1>
    <p>Spotify rejected the token exchange. This usually means the authorization code expired (they only last 60 seconds) or the redirect URI doesn't match what's configured in your Spotify app.</p>
    <pre>${errData.slice(0, 300)}</pre>
    <a href="${baseUrl}/projects/beer-olympics/${state}/scorekeeper">Try Again</a>
  </div>
</body>
</html>`,
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  const tokens = await tokenRes.json();

  // Store tokens on the tournament
  await prisma.tournament.update({
    where: { id: state },
    data: {
      spotifyAccessToken: tokens.access_token,
      spotifyRefreshToken: tokens.refresh_token,
      spotifyTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });

  // Success — show confirmation and auto-close the tab
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head><title>Spotify Connected</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: system-ui, sans-serif; background: #09090b; color: #fafafa; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
  .card { max-width: 420px; text-align: center; }
  h1 { font-size: 1.5rem; color: #10b981; margin-bottom: 12px; }
  p { color: #a1a1aa; line-height: 1.6; }
</style>
</head>
<body>
  <div class="card">
    <h1>Spotify Connected!</h1>
    <p>You can close this tab. The scorekeeper will update automatically.</p>
  </div>
  <script>window.close();</script>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}
