import { Car } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { VehicleDetail } from '@/types';

export function VehicleSwitcher({ vehicles, selectedId, onSelect }: { vehicles: VehicleDetail[]; selectedId: string | undefined; onSelect: (id: string) => void }) {
  if (vehicles.length < 2) return null;
  return (
    <div role="tablist" aria-label="Your vehicles" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {vehicles.map((v) => {
        const active = v.id === selectedId;
        return (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(v.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              active ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-navy-700 ring-navy-200 hover:bg-navy-50',
            )}
          >
            <Car className="h-4 w-4" aria-hidden />
            <span className="font-mono tracking-tight">{v.registration}</span>
          </button>
        );
      })}
    </div>
  );
}
