'use client';

import { cn } from '@/lib/utils';
import { useResearch } from '../providers/research-provider';

export function ResearchCategoryFilter({ className }: { className?: string }) {
  const { uniqueTags, selectedTag, setSelectedTag } = useResearch();

  const hasSelection = selectedTag !== 'all';

  return (
    <div
      className={cn(
        'border border-[#0B2E2F]/12 bg-[#F4F1EA]/78 px-4 py-4 text-[#0B2E2F]',
        className,
      )}
    >
      <h3 className="mb-4 text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
        Categories{' '}
        {hasSelection && <span className="text-[#0B2E2F]/40">(1)</span>}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {uniqueTags.map((tag) => {
          const isSelected = selectedTag === tag;
          return (
            <li key={tag}>
              <button
                onClick={() => setSelectedTag(tag)}
                className={cn(
                  'flex w-full text-left text-sm transition-all cursor-pointer md:hover:translate-x-1 md:hover:text-[#0B2E2F]',
                  isSelected
                    ? 'font-medium translate-x-1 text-[#0B2E2F]'
                    : hasSelection
                      ? 'text-[#0B2E2F]/45'
                      : 'text-[#0B2E2F]/72',
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
