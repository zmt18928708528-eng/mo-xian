export function BrushLine({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        className="brush-stroke"
        d="M2 7 C 36 2, 72 10, 110 6 S 176 2, 238 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
