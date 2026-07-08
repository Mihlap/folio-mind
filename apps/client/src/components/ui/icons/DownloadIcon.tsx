type Props = {
  className?: string;
};
export function DownloadIcon({ className = 'h-3.5 w-3.5' }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path d="M10 3v9" strokeLinecap="round" />
      <path d="M6.5 9.5 10 13l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16h12" strokeLinecap="round" />
    </svg>
  );
}
