import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-12 w-full min-w-0 rounded-lg border border-border bg-surface px-4 text-base text-fg shadow-none outline-none transition-[border-color,box-shadow] duration-[var(--motion-quick)] placeholder:text-subtle",
        "focus-visible:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/30",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
