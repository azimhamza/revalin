import Link from 'next/link';
import { cn } from '@/lib/utils';
import { SidebarLinks } from './product-sidebar-links';

interface LegalSidebarItem {
  label: string;
  href: string;
}

interface LegalSidebarProps {
  title: string;
  subtitle: string;
  keyPoints: string[];
  sectionLinks: LegalSidebarItem[];
  className?: string;
}

export function LegalSidebar({ title, subtitle, keyPoints, sectionLinks, className }: LegalSidebarProps) {
  return (
    <aside className={cn('grid sticky top-0 grid-cols-3 h-screen min-h-max pl-sides pt-top-spacing', className)}>
      <div className="flex flex-col col-span-3 xl:col-span-2 gap-4">
        <div className="pl-2">
          <h2 className="text-2xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground leading-tight">{subtitle}</p>
        </div>

        <div className="rounded border border-foreground/15 bg-muted/30 p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Key Points</p>
          <ul className="mt-3 pl-4 space-y-2 text-sm leading-tight list-disc">
            {keyPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>

        <div className="pl-2">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">On This Page</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {sectionLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="leading-tight transition-colors hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="col-span-3 self-end">
        <SidebarLinks className="flex-col-reverse py-sides" size="sm" />
      </div>
    </aside>
  );
}
