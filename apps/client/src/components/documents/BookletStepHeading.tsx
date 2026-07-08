export function BookletStepHeading({ step, title }: { step: number; title: string }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      <span className="text-slate-400">{step}. </span>
      {title}
    </h4>
  );
}
