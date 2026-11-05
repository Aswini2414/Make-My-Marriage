"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/Button";
import { DateField } from "@/components/form/DateField";
import { FormBanner } from "@/components/form/FormBanner";
import { Select } from "@/components/form/Select";
import { TextArea } from "@/components/form/TextArea";
import { TextField } from "@/components/form/TextField";
import { CheckIcon, DeleteIcon, LockIcon } from "@/components/icons";
import { DiscardPrompt } from "@/components/ui/DiscardPrompt";
import { Drawer } from "@/components/ui/Drawer";
import { useDiscardGuard } from "@/components/ui/useDiscardGuard";
import { addYears, formatShortDate } from "@/lib/dates";
import { deleteJson, fieldErrors, patchJson, postJson } from "@/lib/api-client";
import type { Me } from "@/modules/tasks/format";
import {
  createTaskSchema,
  DUE_YEARS_AHEAD,
  DUE_YEARS_BACK,
  updateTaskSchema,
} from "@/modules/tasks/schema";
import type { TaskItem } from "@/modules/tasks/types";

export type TaskMember = { userId: string; name: string; role: "admin" | "manager" };
export type TaskEvent = { id: string; name: string; date: string };

type Values = {
  title: string;
  assigneeId: string;
  dueDate: string;
  eventId: string;
  note: string;
};

type Props = {
  /** The task being edited, or undefined to add a new one. */
  task?: TaskItem;
  /** The title to start with, from the empty-state templates. */
  initialTitle?: string;
  me: Me;
  members: TaskMember[];
  events: TaskEvent[];
  today: string;
  /** Whether this person may mark the task done or reopen it. */
  canChange: boolean;
  /** A status change for this task is on its way to the server. */
  togglePending: boolean;
  onToggle: () => void;
  onSaved: (task: TaskItem) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
};

const label = (text: string, required?: boolean) => (required ? `${text} *` : text);

const ROLE_LABEL = { admin: "Admin", manager: "Manager" } as const;

function initialValues(task: TaskItem | undefined, title: string | undefined, me: Me): Values {
  return {
    title: task?.title ?? title ?? "",
    assigneeId: task?.assignee.id ?? me.userId,
    dueDate: task?.dueDate ?? "",
    eventId: task?.eventId ?? "",
    note: task?.note ?? "",
  };
}

/** The Add task and Edit task drawer: one form for both. */
export function TaskDrawer({
  task,
  initialTitle,
  me,
  members,
  events,
  today,
  canChange,
  togglePending,
  onToggle,
  onSaved,
  onDeleted,
  onClose,
}: Props) {
  const editing = !!task;
  const [initial] = useState(() => initialValues(task, initialTitle, me));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const changed = (Object.keys(values) as (keyof Values)[]).filter((k) => values[k] !== initial[k]);
  const guard = useDiscardGuard({ dirty: changed.length > 0, busy, onClose });

  // Escape and the backdrop first cancel the delete question, the way "Keep task" does.
  function requestClose() {
    if (busy) return;
    if (confirmingDelete) return setConfirmingDelete(false);
    guard.requestClose();
  }

  const set = (key: keyof Values) => (value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((current) => {
      const rest = { ...current };
      delete rest[key];
      return rest;
    });
  };

  const assigneeOptions = members.map((m) => ({
    value: m.userId,
    label: `${m.name} (${ROLE_LABEL[m.role]})`,
  }));
  // Someone who has left the wedding can still be the assignee of an old task.
  if (task && !members.some((m) => m.userId === task.assignee.id)) {
    assigneeOptions.push({ value: task.assignee.id, label: `${task.assignee.name} (removed)` });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBanner(undefined);
    // An edit sends only what changed, so a task whose assignee has left can still be renamed.
    const parsed = editing
      ? updateTaskSchema.safeParse(Object.fromEntries(changed.map((k) => [k, values[k]])))
      : createTaskSchema.safeParse(values);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const result = editing
      ? await patchJson<{ task: TaskItem }>(`/api/tasks/${task.id}`, parsed.data)
      : await postJson<{ task: TaskItem }>("/api/tasks", parsed.data);
    setBusy(false);
    if (result.ok) return onSaved(result.data.task);
    if (result.error.fields) setErrors(result.error.fields);
    else setBanner(result.error.message);
  }

  async function remove() {
    if (!task || busy) return;
    setBusy(true);
    const result = await deleteJson(`/api/tasks/${task.id}`);
    setBusy(false);
    // Already gone (deleted by someone else): the list should drop it too.
    if (result.ok || result.error.code === "NOT_FOUND") return onDeleted(task.id);
    setConfirmingDelete(false);
    setBanner(result.error.message);
  }

  const done = task?.status === "done";

  let footer;
  if (guard.confirming) {
    footer = <DiscardPrompt onKeep={guard.keepEditing} onDiscard={guard.discard} />;
  } else if (confirmingDelete) {
    footer = (
      <div role="alert" className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-body">Delete this task?</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="md"
            className="h-11"
            autoFocus
            onClick={() => setConfirmingDelete(false)}
            disabled={busy}
          >
            Keep task
          </Button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="flex h-11 items-center gap-1.5 rounded-full bg-error px-5 text-sm font-medium whitespace-nowrap text-surface transition-colors hover:bg-error/90 disabled:pointer-events-none disabled:opacity-60"
          >
            <DeleteIcon className="text-base" />
            Delete task
          </button>
        </div>
      </div>
    );
  } else {
    footer = (
      <div className="flex items-center justify-between gap-3">
        {editing ? (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={busy}
            className="-ml-2 flex h-11 items-center gap-1.5 rounded-full px-2 text-xs font-medium text-error transition-colors hover:text-error/80 disabled:pointer-events-none disabled:opacity-50"
          >
            <DeleteIcon className="text-base" />
            Delete task
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={guard.requestClose}
            disabled={busy}
            className="flex h-11 items-center px-3 text-sm font-medium text-ink-body transition-colors hover:text-plum disabled:opacity-50"
          >
            Cancel
          </button>
          <Button
            type="submit"
            form="task-form"
            size="md"
            className="h-11 px-6"
            disabled={busy || (editing && changed.length === 0)}
          >
            {editing ? "Save changes" : "Save task"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Drawer
      width="narrow"
      title={
        <>
          {editing ? "Edit" : "Add"} <em className="text-champagne-deep">task</em>
        </>
      }
      subtitle={editing ? "Change who, what or when" : "Give it an owner and a date"}
      onClose={requestClose}
      footer={footer}
    >
      <form
        id="task-form"
        onSubmit={submit}
        noValidate
        method="post"
        className="flex flex-col gap-4"
      >
        {banner && <FormBanner>{banner}</FormBanner>}

        {editing && (
          <div className="rounded-input border border-border bg-ivory p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-body">
                Status is currently{" "}
                <span className="font-medium text-plum">{done ? "Done" : "To do"}</span>
              </p>
              <Button
                type="button"
                variant="outline"
                size="md"
                className="h-11 shrink-0"
                disabled={!canChange || togglePending}
                onClick={onToggle}
              >
                {!done && <CheckIcon className="text-base" />}
                {done ? "Reopen task" : "Mark as done"}
              </Button>
            </div>
            {!canChange && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-secondary">
                <LockIcon className="shrink-0 text-sm" />
                Only the assignee or an Admin can mark this done.
              </p>
            )}
          </div>
        )}

        <TextField
          id="title"
          caps
          label={label("Task title", true)}
          placeholder="e.g. Confirm the caterer's menu"
          autoComplete="off"
          value={values.title}
          onChange={(e) => set("title")(e.target.value)}
          error={errors.title}
        />
        <Select
          id="assigneeId"
          caps
          label={label("Assigned to", true)}
          options={assigneeOptions}
          value={values.assigneeId}
          onChange={(e) => set("assigneeId")(e.target.value)}
          error={errors.assigneeId}
        />
        <DateField
          id="dueDate"
          caps
          label={label("Due date", true)}
          value={values.dueDate}
          today={today}
          min={addYears(today, -DUE_YEARS_BACK)}
          max={addYears(today, DUE_YEARS_AHEAD)}
          onChange={set("dueDate")}
          error={errors.dueDate}
        />
        <Select
          id="eventId"
          caps
          optional
          label="Linked event"
          placeholder="All events"
          options={events.map((e) => ({
            value: e.id,
            label: `${e.name} (${formatShortDate(e.date)})`,
          }))}
          value={values.eventId}
          onChange={(e) => set("eventId")(e.target.value)}
          error={errors.eventId}
        />
        <TextArea
          id="note"
          caps
          optional
          label="Note"
          placeholder="Add a note…"
          rows={3}
          value={values.note}
          onChange={(e) => set("note")(e.target.value)}
          error={errors.note}
        />
      </form>
    </Drawer>
  );
}
