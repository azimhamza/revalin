'use client';

import { cn } from '@/lib/utils';
import { usePeptide } from '../providers/peptide-provider';

export function PeptideInfo({ className }: { className?: string }) {
  const { peptide } = usePeptide();

  return (
    <div className={cn('px-3 py-4 rounded-lg bg-muted', className)}>
      <h3 className="mb-3 font-semibold">{peptide.name}</h3>
      <p className="text-xs text-muted-foreground mb-3">{peptide.fullName}</p>
      <dl className="space-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Sequence</dt>
          <dd className="font-mono break-all mt-0.5">{peptide.sequence}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Molecular Weight</dt>
          <dd className="font-medium mt-0.5">{peptide.molecularWeight}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">CAS</dt>
          <dd className="font-mono mt-0.5">{peptide.cas}</dd>
        </div>
      </dl>
    </div>
  );
}
