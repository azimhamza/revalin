import { BadgeCheck, Droplets, Truck, Package } from 'lucide-react';

const TRUST_ITEMS = [
  { icon: BadgeCheck, label: 'Independently Verified' },
  { icon: Droplets, label: '>99% Purity' },
  { icon: Truck, label: 'Same-Day Dispatch' },
  { icon: Package, label: 'Free Shipping $250+' },
] as const;

export function TrustStrip() {
  return (
    <div className="w-full rounded-[12px] px-sides py-4 md:py-5" style={{ backgroundColor: '#0B2E2F' }}>
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 md:gap-x-10">
        {TRUST_ITEMS.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2 text-[#F4F1EA]">
            <Icon className="size-4 opacity-80" strokeWidth={1.5} />
            <span className="text-xs md:text-sm font-medium tracking-wide">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
