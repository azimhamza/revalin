'use client';

import { cn } from '@/lib/utils';
import { usePeptide } from '../providers/peptide-provider';

export function TopicFilter({ className }: { className?: string }) {
  const { uniqueTopics, selectedTopic, setSelectedTopic } = usePeptide();

  const hasSelection = selectedTopic !== 'all';

  return (
    <div
      className={cn(
        'border border-[#0B2E2F]/12 bg-[#F4F1EA]/78 px-4 py-4 text-[#0B2E2F]',
        className,
      )}
    >
      <h3 className="mb-4 text-[10px] uppercase tracking-[0.22em] text-[#0B2E2F]/55">
        Topics{' '}
        {hasSelection && <span className="text-[#0B2E2F]/40">(1)</span>}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {uniqueTopics.map((topic) => {
          const isSelected = selectedTopic === topic;
          return (
            <li key={topic}>
              <button
                onClick={() => setSelectedTopic(topic)}
                className={cn(
                  'flex w-full text-left text-sm transition-all cursor-pointer md:hover:translate-x-1 md:hover:text-[#0B2E2F]',
                  isSelected
                    ? 'font-medium translate-x-1 text-[#0B2E2F]'
                    : hasSelection
                      ? 'text-[#0B2E2F]/45'
                      : 'text-[#0B2E2F]/72',
                )}
                aria-pressed={isSelected}
                aria-label={`Filter by topic: ${topic}`}
              >
                {topic}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
