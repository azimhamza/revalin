'use client';

import { useCOA } from '../providers/coa-provider';
import { COAGrid } from './coa-grid';
import { COACard } from './coa-card';
import { Card } from '@/components/ui/card';

export function COAListContent() {
  const { filteredBatches } = useCOA();

  return (
    <>
      <div className="grid grid-cols-3 items-center mb-1 w-full pr-sides max-md:hidden">
        <div />
        <span className="place-self-center text-sm text-foreground/50">
          {filteredBatches.length} results
        </span>
        <div />
      </div>

      {filteredBatches.length > 0 ? (
        <COAGrid>
          {filteredBatches.map((batch) => (
            <COACard key={batch.id} batch={batch} />
          ))}
        </COAGrid>
      ) : (
        <Card className="flex mr-sides flex-1 items-center justify-center">
          <p className="text text-muted-foreground font-medium">
            No batches found
          </p>
        </Card>
      )}
    </>
  );
}
