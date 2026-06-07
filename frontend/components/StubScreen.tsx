import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BottomNav } from "./BottomNav";

interface StubScreenProps {
  title: string;
  label?: string;
}

export function StubScreen({ title, label }: StubScreenProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto w-full max-w-md px-5 pt-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[0.8125rem]"
          style={{ color: "var(--color-muted)" }}
        >
          <ArrowLeft size={14} strokeWidth={1.8} />
          Today
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-6 pt-8">
        {label && <p className="label-caps mb-3">{label}</p>}
        <h1
          className="text-[1.625rem] font-medium tracking-[-0.015em]"
          style={{ color: "var(--color-ink)" }}
        >
          {title}
        </h1>
        <p
          className="mt-4 text-[0.9375rem]"
          style={{ color: "var(--color-muted)" }}
        >
          Coming soon — this surface will be designed after Today, Concept, and Quiz are locked.
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
