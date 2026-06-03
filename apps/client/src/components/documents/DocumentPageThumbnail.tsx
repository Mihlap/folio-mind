type Props = {
  src: string;
  alt: string;
  layout: 'vertical' | 'horizontal';
  eager?: boolean;
};

export function DocumentPageThumbnail({ src, alt, layout, eager }: Props) {
  const loading = eager ? 'eager' : 'lazy';

  if (layout === 'horizontal') {
    return (
      <img
        src={src}
        alt={alt}
        loading={loading}
        className="block h-14 w-auto max-w-[5.5rem] bg-white object-contain"
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      className="block h-auto w-full bg-white object-contain"
    />
  );
}

export function isThumbnailEager(page: number, initialPages = 15) {
  return page <= initialPages;
}
