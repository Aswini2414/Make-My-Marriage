import type { ReactNode } from "react";
import { Monogram } from "./parts";

/** A small centred card with a title and a line of text: "link not valid", "too many attempts". */
export function NoticeCard({
  plain,
  italic,
  children,
}: {
  plain: string;
  italic: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="w-full space-y-4 rounded-2xl border border-border bg-surface p-7 text-center shadow-sm sm:space-y-5 sm:p-10">
        <Monogram />
        <div className="space-y-2 pt-1 sm:space-y-2.5">
          <h1 className="font-display text-2xl leading-tight text-ink sm:text-3xl">
            {plain} <span className="text-plum italic">{italic}</span>
          </h1>
          <p className="mx-auto max-w-sm px-2 text-xs leading-relaxed text-ink-secondary sm:text-sm">
            {children}
          </p>
        </div>
        <div className="mx-auto h-px w-8 bg-border sm:w-12" />
        <p className="text-[11px] text-ink-secondary sm:text-xs">Make My Marriage</p>
      </div>
    </main>
  );
}
