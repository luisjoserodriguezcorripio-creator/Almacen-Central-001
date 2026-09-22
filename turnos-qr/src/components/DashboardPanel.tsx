import type { DashboardStats } from '@/types/turno';
import { formatTurnoNumber } from '@/utils/storage';

interface DashboardPanelProps {
  stats: DashboardStats;
  counter: number;
}

export function DashboardPanel({ stats, counter }: DashboardPanelProps) {
  const cards = [
    {
      label: 'Turnos hoy',
      value: stats.totalHoy,
      className: 'from-dc-blue to-blue-700',
    },
    {
      label: 'Validados',
      value: stats.validados,
      className: 'from-dc-green to-emerald-700',
    },
    {
      label: 'Pendientes',
      value: stats.pendientes,
      className: 'from-red-500 to-red-700',
    },
  ];

  return (
    <section className="space-y-4" aria-label="Dashboard de turnos">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-500 dark:text-slate-400">Próximo turno</p>
        <p className="mt-1 font-mono text-4xl font-extrabold text-dc-blue dark:text-blue-300">
          {formatTurnoNumber(counter + 1)}
        </p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Último emitido:{' '}
          <strong>{counter > 0 ? formatTurnoNumber(counter) : '—'}</strong>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.label}
            className={`rounded-2xl bg-gradient-to-br ${card.className} p-4 text-white shadow-panel`}
          >
            <p className="text-sm font-medium text-white/85">{card.label}</p>
            <p className="mt-2 text-4xl font-extrabold tabular-nums">{card.value}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
