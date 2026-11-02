import type { ComponentProps } from "react";
import { Button } from "@/components/Button";

/** Full-width plum pill. When disabled it turns a lighter plum, as in the Stitch designs. */
export function SubmitButton({ className = "", ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      type="submit"
      size="lg"
      className={`w-full disabled:bg-plum/70 disabled:opacity-100 ${className}`}
      {...props}
    />
  );
}
