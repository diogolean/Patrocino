import { hideStoredCaption } from "@mimelux/core/exclusive-video";

export function shownCaption(input: {
  caption: string;
  video: boolean;
  index: number;
  videoLabel: (n: number) => string;
  photoLabel: (n: number) => string;
}) {
  if (input.video) return input.videoLabel(input.index);
  if (hideStoredCaption(input.caption, false)) return input.photoLabel(input.index);
  return input.caption;
}
