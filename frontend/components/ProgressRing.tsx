/*
  Refined progress ring. Thin stroke, accent fill, tabular numerals inside.
  Linear-style precision — no chunky stroke, no decoration.
  Fills by `ratio` (0..1); center content is caller-supplied.
*/

import type { ReactNode } from "react";

interface ProgressRingProps {
  ratio: number; // 0..1 arc fill
  centerValue: ReactNode; // big center number/text
  centerLabel: string; // small caps below
  size?: number;
  strokeWidth?: number;
}

export function ProgressRing({
  ratio,
  centerValue,
  centerLabel,
  size = 168,
  strokeWidth = 3,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, ratio));
  const offset = circumference * (1 - clamped);

  return (
    <div
      className="relative inline-grid place-items-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset var(--duration-slow) var(--ease-out-quart)",
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-1">
          <span
            className="tabular-nums text-[2.5rem] font-medium leading-none tracking-[-0.02em]"
            style={{ color: "var(--color-ink)" }}
          >
            {centerValue}
          </span>
          <span
            className="text-xs uppercase"
            style={{
              color: "var(--color-faint)",
              letterSpacing: "var(--tracking-label)",
              fontWeight: 600,
            }}
          >
            {centerLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
