import { useEffect, useRef, useState } from 'react';

type Props = {
  src: string;
  alt: string;
  layout: 'vertical' | 'horizontal';
  eager?: boolean; 
  staggerMs?: number;
};

export function DocumentPageThumbnail({ src, alt, layout, eager, staggerMs = 0 }: Props) {
  const loading = eager ? 'eager' : 'lazy';
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setErrored(false);
    if (!imgRef.current?.complete) {
      setLoaded(false);
    }
  }, [src]);

  const handleImgLoad = () => setLoaded(true);
  const handleImgError = () => setErrored(true);

  if (errored) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 text-[10px] text-slate-400 ${
          layout === 'horizontal' ? 'h-14 w-[5.5rem]' : 'aspect-[3/4] w-full'
        }`}
      >
        ?
      </div>
    );
  }

  const fadeClass = `block bg-white object-contain transition-opacity duration-300 ease-out ${
    loaded ? 'opacity-100' : 'opacity-0'
  }`;

  const style = staggerMs > 0 ? { transitionDelay: `${staggerMs}ms` } : undefined;

  if (layout === 'horizontal') {
    return (
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading={loading}
        style={style}
        onLoad={handleImgLoad}
        onError={handleImgError}
        className={`${fadeClass} h-14 w-auto max-w-[5.5rem]`}
      />
    );
  }

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      loading={loading}
      style={style}
      onLoad={handleImgLoad}
      onError={handleImgError}
      className={`${fadeClass} h-auto w-full`}
    />
  );
}

export function isThumbnailEager(page: number, initialPages = 15) {
  return page <= initialPages;
}
