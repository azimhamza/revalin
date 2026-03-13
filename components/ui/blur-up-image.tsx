'use client';

import { cn } from '@/lib/utils';
import Image, { ImageProps } from 'next/image';
import { useEffect, useState } from 'react';

const loadedImageSrcs = new Set<string>();

function getImageSrcKey(src: ImageProps['src']): string {
  if (typeof src === 'string') return src;
  if ('src' in src && typeof src.src === 'string') return src.src;
  if ('default' in src && src.default && typeof src.default.src === 'string') return src.default.src;
  return '';
}

export function BlurUpImage({ className, src, onLoad, ...props }: ImageProps) {
  const srcKey = getImageSrcKey(src);
  const [isLoaded, setIsLoaded] = useState(() => loadedImageSrcs.has(srcKey));

  useEffect(() => {
    setIsLoaded(loadedImageSrcs.has(srcKey));
  }, [srcKey]);

  return (
    <Image
      {...props}
      src={src}
      onLoad={event => {
        if (srcKey) {
          loadedImageSrcs.add(srcKey);
        }
        setIsLoaded(true);
        onLoad?.(event);
      }}
      className={cn(
        'transition duration-300 ease-out will-change-transform',
        isLoaded ? 'blur-0 scale-100 opacity-100' : 'blur-sm scale-[1.01] opacity-80',
        className
      )}
    />
  );
}
