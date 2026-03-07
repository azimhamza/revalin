'use client';

import { cn } from '@/lib/utils';
import { useResearch } from '../providers/research-provider';

export function ResearchCategoryFilter({ className }: { className?: string }) {
  const { uniqueTags, selectedTag, setSelectedTag } = useResearch();

  const hasSelection = selectedTag !== 'all';

  return (
    <div className={cn('px-3 py-4 rounded-lg bg-muted', className)}>
      <h3 className="mb-4 font-semibold">
        Categories{' '}
        {hasSelection && <span className="text-foreground/50">(1)</span>}
      </h3>
      <ul className="flex flex-col gap-1">
        {uniqueTags.map((tag) => {
          const isSelected = selectedTag === tag;
          return (
            <li key={tag}>
              <button
                onClick={() => setSelectedTag(tag)}
                className={cn(
                  'flex w-full text-left transition-all transform cursor-pointer font-sm md:hover:translate-x-1 md:hover:opacity-80',
                  isSelected
                    ? 'font-medium translate-x-1'
                    : hasSelection
                      ? 'opacity-50'
                      : ''
                )}
                aria-pressed={isSelected}
                aria-label={`Filter by category: ${tag}`}
              >
                {tag}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
