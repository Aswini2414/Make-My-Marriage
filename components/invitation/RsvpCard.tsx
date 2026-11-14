"use client";

import { InfoOutlineIcon } from "@/components/icons";
import { formatDayMonth } from "@/lib/dates";
import type { DraftAnswer, InvitationEvent } from "@/modules/rsvp/page-state";
import { AnswerToggle } from "./AnswerToggle";
import { Stepper } from "./Stepper";

type Props = {
  event: InvitationEvent;
  answer: DraftAnswer;
  max: number;
  invalid: boolean;
  disabled: boolean;
  onChoose: (attending: boolean) => void;
  onCount: (n: number) => void;
};

/** One event's question: the title and date, the two-way answer, and the head count if coming. */
export function RsvpCard({ event, answer, max, invalid, disabled, onChoose, onCount }: Props) {
  const title = `title-${event.id}`;
  const error = `error-${event.id}`;
  return (
    <section
      className={`space-y-3 rounded-card bg-surface p-4 shadow-card sm:p-5 ${
        invalid ? "border-2 border-error-border" : "border border-border"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id={title} className="min-w-0 font-display text-lg break-words text-ink sm:text-xl">
          {event.name}
        </h3>
        {invalid ? (
          <span className="shrink-0 text-xs font-medium text-error">Answer required</span>
        ) : (
          <span className="shrink-0 text-xs text-ink-secondary">{formatDayMonth(event.date)}</span>
        )}
      </div>
      <AnswerToggle
        name={`answer-${event.id}`}
        labelledBy={title}
        describedBy={invalid ? error : undefined}
        value={answer ? answer.attending : null}
        invalid={invalid}
        disabled={disabled}
        onChange={onChoose}
      />
      {answer?.attending && (
        <Stepper
          labelId={`people-${event.id}`}
          value={answer.headcount}
          max={max}
          disabled={disabled}
          onChange={onCount}
        />
      )}
      {invalid && (
        <p id={error} className="flex items-center gap-1.5 pt-1 text-xs font-medium text-error">
          <InfoOutlineIcon className="shrink-0 text-sm" />
          Please choose Attending or Not attending.
        </p>
      )}
    </section>
  );
}
