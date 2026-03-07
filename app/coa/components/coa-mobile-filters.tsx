'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { COAProductFilter } from './coa-product-filter';
import { useCOA } from '../providers/coa-provider';

export function COAMobileFilters() {
  const { filteredBatches, selectedProduct, setSelectedProduct } = useCOA();

  const filterCount = selectedProduct !== 'all' ? 1 : 0;

  return (
    <div className="pt-top-spacing bg-background md:hidden overflow-x-clip">
      <Drawer>
        <div className="grid grid-cols-3 items-center px-4 py-3">
          <DrawerTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="justify-self-start text-sm font-semibold text-foreground"
            >
              Filters{' '}
              {filterCount > 0 && (
                <span className="text-foreground/50">({filterCount})</span>
              )}
            </Button>
          </DrawerTrigger>

          <span className="place-self-center text-sm text-foreground/50">
            {filteredBatches.length} results
          </span>

          <div />
        </div>

        <DrawerContent className="h-[80vh]">
          <DrawerHeader className="flex justify-between items-center">
            <DrawerTitle>
              Filters{' '}
              {filterCount > 0 && (
                <span className="text-muted-foreground">({filterCount})</span>
              )}
            </DrawerTitle>
            <Button
              size="sm"
              variant="ghost"
              className={cn(
                'font-medium text-foreground/50 hover:text-foreground/60 transition-opacity',
                filterCount === 0 && 'opacity-0 pointer-events-none'
              )}
              disabled={filterCount === 0}
              onClick={() => setSelectedProduct('all')}
            >
              Clear
            </Button>
          </DrawerHeader>
          <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-6">
            <COAProductFilter />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
