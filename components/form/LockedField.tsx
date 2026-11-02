import { LockIcon } from "@/components/icons";

/** A value the person can see but not change, such as the email an invite was sent to. */
export function LockedField({
  id,
  label,
  value,
  large,
}: {
  id: string;
  label: string;
  value: string;
  large?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className={`block ${large ? "mb-1.5 text-sm" : "mb-2 text-xs"} font-medium text-ink`}
      >
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          id={id}
          name={id}
          type="email"
          value={value}
          readOnly
          className="h-12 w-full cursor-not-allowed rounded-input border border-border bg-lilac px-4 pr-10 text-sm text-ink-secondary select-none focus:outline-none"
        />
        <LockIcon className="absolute right-3.5 text-base text-ink-secondary" />
      </div>
    </div>
  );
}
