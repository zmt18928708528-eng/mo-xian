export function InkField() {
  return (
    <>
      <div className="ink-grain" aria-hidden="true" />
      <div
        className="ink-mark pointer-events-none fixed -left-8 top-24 hidden text-[14rem] lg:block"
        aria-hidden="true"
      >
        墨
      </div>
      <div
        className="pointer-events-none fixed right-6 top-28 hidden font-display text-sm tracking-[0.6em] text-subtle/30 [writing-mode:vertical-rl] xl:block"
        aria-hidden="true"
      >
        一纸墨线 · 取影成章
      </div>
    </>
  );
}
