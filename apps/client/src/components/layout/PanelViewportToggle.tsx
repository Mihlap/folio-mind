type Props = {
  side: 'left' | 'right';
  expanded: boolean;
  onClick: () => void;
  title: string;
  className?: string;

  syncedToWorkspace?: boolean;
};

function ChevronIcon({ pointLeft }: { pointLeft: boolean }) {
  return (
    <svg
      viewBox="0 0 8 12"
      className="h-2.5 w-1 shrink-0"
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {pointLeft ? (
        <path
          d="M6.5 1 1.5 6l5 5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M1.5 1 6.5 6l-5 5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export function PanelViewportToggle({
  side,
  expanded,
  onClick,
  title,
  className,
  syncedToWorkspace = false,
}: Props) {
  const pointLeft = side === 'left' ? expanded : !expanded;

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={[
        'z-50 flex h-11 w-2.5 -translate-y-1/2 cursor-pointer items-center justify-center border border-slate-300 bg-[#e9eef5] text-slate-600 shadow-sm hover:border-slate-400 hover:bg-slate-200 hover:text-slate-800',
        syncedToWorkspace ? 'fixed top-[var(--panel-toggle-top)]' : 'absolute top-1/2',
        syncedToWorkspace && side === 'left'
          ? 'left-[calc(var(--panel-toggle-left-edge)-0.625rem)]'
          : '',
        syncedToWorkspace && side === 'right' ? 'left-[var(--panel-toggle-right-left)]' : '',
        !syncedToWorkspace && side === 'left'
          ? 'absolute right-0 rounded-r-sm rounded-l-none border-l-0'
          : '',
        !syncedToWorkspace && side === 'right'
          ? 'absolute left-0 rounded-l-sm rounded-r-none border-r-0'
          : '',
        syncedToWorkspace && side === 'left' ? 'rounded-r-sm rounded-l-none border-l-0' : '',
        syncedToWorkspace && side === 'right' ? 'rounded-l-sm rounded-r-none border-r-0' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <ChevronIcon pointLeft={pointLeft} />
    </button>
  );
}
