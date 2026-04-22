"use client";

export function VideoEmbed({
  url,
  title,
}: {
  url: string;
  title?: string;
}) {
  let embedUrl = url;

  const ytMatch = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/,
  );
  if (ytMatch) embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;

  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch)
    embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;

  return (
    <div className="mb-4">
      {title && (
        <div className="text-caption text-text-muted mb-2">{title}</div>
      )}
      <div
        className="relative w-full rounded-card overflow-hidden border border-border-subtle"
        style={{ paddingBottom: "56.25%" }}
      >
        <iframe
          src={embedUrl}
          title={title ?? "Video"}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}
