import { useEffect, useState } from 'react';

type Props = {
  src: string;
  alt: string;
  layout: 'vertical' | 'horizontal';
  eager?: boolean;
  /** Задержка fade-in для каскадного появления (мс). */
  staggerMs?: number;
};

export function DocumentPageThumbnail({ src, alt, layout, eager, staggerMs = 0 }: Props) {
  const loading = eager ? 'eager' : 'lazy';
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  const fadeClass = `block bg-white object-contain transition-opacity duration-300 ease-out ${
    loaded ? 'opacity-100' : 'opacity-0'
  }`;

  const style = staggerMs > 0 ? { transitionDelay: `${staggerMs}ms` } : undefined;

  if (layout === 'horizontal') {
    return (
      <img
        src={src}
        alt={alt}
        loading={loading}
        style={style}
        onLoad={() => setLoaded(true)}
        className={`${fadeClass} h-14 w-auto max-w-[5.5rem]`}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      style={style}
      onLoad={() => setLoaded(true)}
      className={`${fadeClass} h-auto w-full`}
    />
  );
}

export function isThumbnailEager(page: number, initialPages = 15) {
  return page <= initialPages;
}
