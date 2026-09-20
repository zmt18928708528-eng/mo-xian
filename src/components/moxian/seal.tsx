import { cn } from "@/lib/utils";

export function SealMark({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-9 text-sm" : "size-11 text-base";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex items-center justify-center rounded-sm bg-seal font-display font-semibold tracking-widest text-seal-fg shadow-[0_1px_0_color-mix(in_oklab,black_25%,transparent)]",
        box,
        className,
      )}
      style={{ transform: "rotate(-3deg)" }}
    >
      墨线
    </span>
  );
}
