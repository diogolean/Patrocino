import { captionLooksLikeFilename } from "@mimelux/core/exclusive-video";
import type { Post } from "@/lib/gateway";

export function PostVisual({
  post,
  locked,
  testId,
  autoPlay = false,
  lockedClassName = "scale-105 blur-[10px]",
}: {
  post: Post;
  locked: boolean;
  testId?: string;
  autoPlay?: boolean;
  lockedClassName?: string;
}) {
  function shield(event: { preventDefault: () => void }) {
    event.preventDefault();
  }
  if (post.playback && !locked) {
    return (
      <video
        data-testid={testId}
        src={post.playback}
        poster={post.poster || post.image}
        muted
        autoPlay={autoPlay}
        loop
        playsInline
        controls
        controlsList="nodownload"
        disablePictureInPicture
        preload="metadata"
        draggable={false}
        onContextMenu={shield}
        onDragStart={shield}
        className="media-shield h-full w-full bg-black object-cover"
      />
    );
  }
  const src = post.playback ? post.poster || post.image : post.image;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={post.mediaType === "video" || captionLooksLikeFilename(post.caption) ? "" : post.caption}
      loading="lazy"
      decoding="async"
      draggable={false}
      onContextMenu={shield}
      onDragStart={shield}
      className={`media-shield h-full w-full object-cover transition duration-500 ${locked ? lockedClassName : ""}`}
    />
  );
}
