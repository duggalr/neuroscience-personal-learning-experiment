/*
  Strip OpenAI web-search citation markers from tutor output.
  The Responses API wraps inline citations in private-use-area delimiters
  (U+E200 start, U+E201 end, U+E202 separator) that the ChatGPT UI renders as
  footnotes. In raw text they appear as garbage, so we remove them.
  (Later we can render real source links from the response annotations.)
*/

const CITE_GROUP = new RegExp("\\uE200[\\s\\S]*?\\uE201", "g"); // complete span
const CITE_TRAILING = new RegExp("\\uE200[\\s\\S]*$", "g"); // unclosed, still streaming
const PUA = new RegExp("[\\uE200-\\uE20F]", "g"); // any stray delimiter

export function stripCitations(text: string): string {
  if (!text) return text;
  return text.replace(CITE_GROUP, "").replace(CITE_TRAILING, "").replace(PUA, "");
}

export const LESSON_COMPLETE_MARKER = "[[LESSON_COMPLETE]]";

// Clean a tutor turn for DISPLAY: strip citations + the lesson-complete control
// marker (and any partial marker still streaming in).
export function cleanTutorText(text: string): string {
  if (!text) return text;
  return stripCitations(text)
    .replace(/\[\[LESSON_COMPLETE\]\]/g, "")
    .replace(/\[\[[A-Z_]*$/g, "")
    .trimEnd();
}

export function hasLessonComplete(text: string): boolean {
  return text.includes(LESSON_COMPLETE_MARKER);
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
