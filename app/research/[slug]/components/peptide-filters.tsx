'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SidebarLinks } from '@/components/layout/sidebar/product-sidebar-links';
import { PeptideInfo } from './peptide-info';
import { TopicFilter } from './topic-filter';
import { usePeptide } from '../providers/peptide-provider';

export function PeptideDesktopFilters({ className }: { className?: string }) {
  const { selectedTopic, setSelectedTopic } = usePeptide();

  const filterCount = selectedTopic !== 'all' ? 1 : 0;

  return (
    <aside
      className={cn(
        'grid sticky top-0 grid-cols-3 h-screen min-h-max pl-sides pt-top-spacing',
        className
      )}
    >
      <div className="flex flex-col col-span-3 xl:col-span-2 gap-4">
        <div className="flex justify-between items-baseline pl-2 -mb-2">
          <h2 className="text-2xl font-semibold">
            Filter{' '}
            {filterCount > 0 && (
              <span className="text-foreground/50">({filterCount})</span>
            )}
          </h2>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Clear all filters"
            className={cn(
              'font-medium text-foreground/50 hover:text-foreground/60 transition-opacity',
              filterCount === 0 && 'opacity-0 pointer-events-none'
            )}
            onClick={() => setSelectedTopic('all')}
          >
            Clear
          </Button>
        </div>
        <PeptideInfo />
        <TopicFilter />
      </div>

      <div className="col-span-3 self-end">
        <SidebarLinks className="flex-col-reverse py-sides" size="sm" />
      </div>
    </aside>
  );
}
