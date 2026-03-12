'use client';

import { cn } from '@/lib/utils';
import Image, { ImageProps } from 'next/image';
import { useEffect, useState } from 'react';

export function BlurUpImage({ className, src, onLoad, ...props }: ImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const srcKey = typeof src === 'string' ? src : src.src;

  useEffect(() => {
    setIsLoaded(false);
  }, [srcKey]);

  return (
    <Image
      {...props}
      src={src}
      onLoad={event => {
        setIsLoaded(true);
        onLoad?.(event);
      }}
      className={cn(
        'transition duration-500 ease-out',
        isLoaded ? 'blur-0 scale-100 opacity-100' : 'blur-lg scale-[1.02] opacity-70',
        className
      )}
    />
  );
}
