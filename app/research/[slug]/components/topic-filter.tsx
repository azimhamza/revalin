'use client';

import { cn } from '@/lib/utils';
import { usePeptide } from '../providers/peptide-provider';

export function TopicFilter({ className }: { className?: string }) {
  const { uniqueTopics, selectedTopic, setSelectedTopic } = usePeptide();

  const hasSelection = selectedTopic !== 'all';

  return (
    <div className={cn('px-3 py-4 rounded-lg bg-muted', className)}>
      <h3 className="mb-4 font-semibold">
        Topics{' '}
        {hasSelection && <span className="text-foreground/50">(1)</span>}
      </h3>
      <ul className="flex flex-col gap-1">
        {uniqueTopics.map((topic) => {
          const isSelected = selectedTopic === topic;
          return (
            <li key={topic}>
              <button
                onClick={() => setSelectedTopic(topic)}
                className={cn(
                  'flex w-full text-left transition-all transform cursor-pointer font-sm md:hover:translate-x-1 md:hover:opacity-80',
                  isSelected
                    ? 'font-medium translate-x-1'
                    : hasSelection
                      ? 'opacity-50'
                      : ''
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
