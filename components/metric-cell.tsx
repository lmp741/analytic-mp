'use client';

import { formatDeltaPercent } from '@/lib/utils/number';
import { cn } from '@/lib/utils/cn';

type MetricCellProps = {
  value: string;
  deltaPct: number | null;
  isInverted?: boolean;
};

export function MetricCell({ value, deltaPct, isInverted = false }: MetricCellProps) {
  if (deltaPct === null || deltaPct === undefined || !Number.isFinite(deltaPct)) {
    return <div>{value}</div>;
  }

  const isPositive = isInverted ? deltaPct < 0 : deltaPct > 0;
  const deltaClass = isPositive ? 'text-emerald-600' : 'text-red-600';

  return (
    <div className="flex items-center gap-2">
      <span>{value}</span>
      <span className={cn('text-xs font-medium', deltaClass)}>
        {formatDeltaPercent(deltaPct)}
      </span>
    </div>
  );
}
