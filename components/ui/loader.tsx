import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

const loaderVariants = cva('flex items-center justify-center', {
  variants: {
    kind: {
      dots: '',
      spinner: '',
    },
    size: {
      sm: 'space-x-0.5',
      default: 'space-x-1',
      lg: 'space-x-1.5',
    },
  },
  defaultVariants: {
    kind: 'dots',
    size: 'default',
  },
});

const squareVariants = cva('bg-current rounded-[1px]', {
  variants: {
    size: {
      sm: 'size-1',
      default: 'size-1.5',
      lg: 'size-2',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

export interface LoaderProps extends VariantProps<typeof loaderVariants> {
  className?: string;
}

const spinnerVariants = cva('animate-spin rounded-full border-solid border-current border-r-transparent', {
  variants: {
    size: {
      sm: 'size-4 border-2',
      default: 'size-5 border-2',
      lg: 'size-6 border-2',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

function Loader({ size, kind, className }: LoaderProps) {
  if (kind === 'spinner') {
    return (
      <div className={cn(loaderVariants({ size, kind }), className)}>
        <div className={cn(spinnerVariants({ size }))} />
      </div>
    );
  }

  return (
    <div className={cn(loaderVariants({ size, kind }), className)}>
      {[0, 1, 2].map(index => (
        <motion.div
          key={index}
          className={cn(squareVariants({ size }))}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: index * 0.2,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

export { Loader, loaderVariants };
