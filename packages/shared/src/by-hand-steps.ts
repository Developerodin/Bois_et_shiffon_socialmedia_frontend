/**
 * How to post a story by hand from the web download. Shown in the web panel and written into the zip's steps.txt.
 * No server imports, so the client panel can use it. The phone has its own translated steps (posts.json
 * stories.byHandView), worded for frames saved straight to the phone.
 */
export const BY_HAND_STEPS = [
  "Unzip the download and send the frames to your phone.",
  "Open Instagram, tap + and choose Story.",
  "Add the frames in order, frame-1 first, as one story.",
  "If the story has a link, add a Link sticker and paste it.",
  "Post it, then come back and tap “I posted it”.",
];

/** The zip's steps.txt: the link (if any), then the numbered steps. */
export function stepsText(link: string | null | undefined) {
  return `${link ? `Link: ${link}` : "No link on this story."}\n\n${BY_HAND_STEPS.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n`;
}
