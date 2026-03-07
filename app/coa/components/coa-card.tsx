'use client';

import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { Batch } from '../providers/coa-provider';

export function COACard({ batch }: { batch: Batch }) {
  return (
    <div className="relative w-full aspect-[3/4] md:aspect-square bg-muted group overflow-hidden">
      {/* Default state */}
      <div className="flex flex-col justify-end h-full p-4 transition-all duration-300 max-md:hidden group-hover:opacity-0 group-hover:-translate-y-full group-focus-within:opacity-0 group-focus-within:-translate-y-full">
        <p className="text-sm uppercase font-semibold text-balance">
          {batch.product}
        </p>
        <p className="text-4xl font-semibold mt-1">{batch.purity}%</p>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          {batch.number}
        </p>
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 p-2 w-full pointer-events-none">
        <div className="flex absolute inset-x-3 bottom-3 flex-col gap-4 px-4 py-4 rounded-md transition-all duration-300 pointer-events-none bg-popover md:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 md:translate-y-1/3 group-hover:translate-y-0 group-focus-within:translate-y-0 group-hover:pointer-events-auto group-focus-within:pointer-events-auto max-md:pointer-events-auto">
          <div className="flex justify-between items-baseline">
            <p className="text-lg font-semibold">{batch.product}</p>
            <p className="text-sm text-muted-foreground">{batch.size}</p>
          </div>

          <div className="text-3xl font-semibold">{batch.purity}%</div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Batch</p>
              <p className="font-mono text-xs">{batch.number}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Date</p>
              <p className="text-xs">{batch.date}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Identity (MS)</p>
              <p className="text-xs font-medium">{batch.identity}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Endotoxin</p>
              <p className="text-xs font-medium">{batch.endotoxin}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sterility</p>
              <p className="text-xs font-medium">{batch.sterility}</p>
            </div>
          </div>

          <Button variant="default" size="sm" className="w-full" asChild>
            <a href={batch.pdfUrl} download>
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
