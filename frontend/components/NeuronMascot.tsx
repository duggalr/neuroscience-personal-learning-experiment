"use client";

// Neo — the app's neuron mascot. A friendly cell body (soma) with a dendrite tuft and an
// axon tail, drawn as inline SVG in the brand palette so it scales crisp and can later
// react to progress. `mood` is wired for future expressions (idle / happy / thinking / sad).
export type MascotMood = "idle" | "happy" | "thinking" | "sad";

export function NeuronMascot({
  mood = "idle",
  size = 76,
  className,
}: {
  mood?: MascotMood;
  size?: number;
  className?: string;
}) {
  const accent = "var(--color-accent)";
  const tint = "var(--color-accent-tint)";
  const ink = "var(--color-ink)";

  // Mouth path per mood.
  const mouth =
    mood === "happy"
      ? "M40 62 Q50 72 60 62" // big smile
      : mood === "sad"
      ? "M40 66 Q50 58 60 66" // frown
      : mood === "thinking"
      ? "M42 64 H58" // flat, focused
      : "M41 62 Q50 69 59 62"; // gentle idle smile

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      role="img"
      aria-label="Neo, your neuroscience study buddy"
    >
      {/* Dendrites — branches off the top/sides of the soma */}
      <g stroke={accent} strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M34 30 L24 16 M24 16 L18 12 M24 16 L28 8" />
        <path d="M50 24 L50 8 M50 8 L44 4 M50 8 L56 4" />
        <path d="M66 30 L76 16 M76 16 L82 12 M76 16 L72 8" />
        <path d="M30 40 L14 36 M14 36 L9 32 M14 36 L9 41" />
      </g>

      {/* Axon — tail to the lower right ending in terminal boutons */}
      <path
        d="M64 64 Q82 70 86 86"
        stroke={accent}
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="86" cy="86" r="4" fill={accent} />
      <circle cx="92" cy="80" r="2.6" fill={accent} />
      <circle cx="80" cy="92" r="2.6" fill={accent} />

      {/* Soma — the cell body / face */}
      <circle cx="50" cy="48" r="22" fill={tint} stroke={accent} strokeWidth="3.5" />

      {/* Eyes */}
      {mood === "happy" ? (
        <g stroke={ink} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M40 45 Q43.5 41 47 45" />
          <path d="M53 45 Q56.5 41 60 45" />
        </g>
      ) : (
        <g fill={ink}>
          <circle cx="43.5" cy="45" r="3.1" />
          <circle cx="56.5" cy="45" r="3.1" />
        </g>
      )}

      {/* Mouth */}
      <path d={mouth} stroke={ink} strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}
