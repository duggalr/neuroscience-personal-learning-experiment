"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FileText, Target, RotateCcw } from "lucide-react";

const items = [
  { href: "/syllabus", label: "Syllabus", icon: BookOpen },
  { href: "/notes", label: "Notes", icon: FileText },
  { href: "/review", label: "Review", icon: RotateCcw },
  { href: "/quiz-results", label: "Quiz", icon: Target },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky bottom-0 z-10 border-t"
      style={{
        background: "color-mix(in oklch, var(--color-surface) 88%, transparent)",
        backdropFilter: "saturate(140%) blur(12px)",
        WebkitBackdropFilter: "saturate(140%) blur(12px)",
        borderColor: "var(--color-line)",
      }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className="flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors"
                style={{
                  color: active ? "var(--color-ink)" : "var(--color-faint)",
                }}
              >
                <Icon
                  size={18}
                  strokeWidth={active ? 2 : 1.6}
                  aria-hidden
                />
                <span
                  className="text-[0.6875rem]"
                  style={{
                    fontWeight: active ? 600 : 500,
                    letterSpacing: "0.01em",
                  }}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
