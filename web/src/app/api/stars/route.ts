import { NextResponse } from "next/server";

// Cache the star count server-side for 10 min so we never hit GitHub rate limits
// and the client gets a fast response.
export const revalidate = 600;

function repoSlug(): string | null {
  // Accept either NEXT_PUBLIC_REPO_URL (full URL) or owner/repo.
  const raw = process.env.NEXT_PUBLIC_REPO_URL ?? "";
  const m = raw.match(/github\.com\/([^/]+\/[^/?#]+)/i);
  if (m) return m[1].replace(/\.git$/, "");
  if (/^[\w.-]+\/[\w.-]+$/.test(raw)) return raw;
  return null;
}

export async function GET() {
  const slug = repoSlug();
  if (!slug) {
    return NextResponse.json({ stars: null });
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${slug}`, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 600 },
    });
    if (!res.ok) return NextResponse.json({ stars: null });
    const data = await res.json();
    return NextResponse.json({
      stars: data.stargazers_count ?? null,
      url: `https://github.com/${slug}`,
    });
  } catch {
    return NextResponse.json({ stars: null });
  }
}
