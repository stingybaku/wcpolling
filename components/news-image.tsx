"use client";

/**
 * Thumbnail for a news article image. Uses a plain <img> because news images
 * come from arbitrary external domains (next/image would need per-host
 * remotePatterns). Hides itself if the image fails to load.
 */
export function NewsImage({ src, size = 64 }: { src: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={(e) => { e.currentTarget.style.display = "none"; }}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        objectFit: "cover",
        borderRadius: "var(--r-sm)",
        background: "var(--bg-strong)",
      }}
    />
  );
}
