import { useId } from 'react';

export function TrashIcon({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const clipId = useId();

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden
    >
      <g clipPath={`url(#${clipId})`}>
        <path
          d="M2 17.9916V5.94336L17.0313 5.94336V9.95942V17.9916C17.0313 18.5241 16.7674 19.0349 16.2976 19.4114C15.8277 19.788 15.1905 19.9996 14.5261 19.9996H4.50522C3.84079 19.9996 3.20358 19.788 2.73376 19.4114C2.26394 19.0349 2 18.5241 2 17.9916Z"
          fill="currentColor"
        />
        <path
          d="M18.3972 4.91012L18.4835 2.88493L14.1418 2.87978L12.9368 1.86348L6.73275 1.85685L5.45831 2.86948L1.10562 2.86939L1.01937 4.89459L18.3972 4.91012Z"
          fill="currentColor"
        />
      </g>
      <defs>
        <clipPath id={clipId}>
          <rect width="20" height="20" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
