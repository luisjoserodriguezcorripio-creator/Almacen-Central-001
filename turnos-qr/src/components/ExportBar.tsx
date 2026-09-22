import type { TurnoEntry } from '@/types/turno';
import { exportToCsv, exportToXlsx } from '@/utils/export';

interface ExportBarProps {
  entries: TurnoEntry[];
  onResetCounter: () => void;
  onLoadSamples: () => void;
}

export function ExportBar({ entries, onResetCounter, onLoadSamples }: ExportBarProps) {
  const disabled = entries.length === 0;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <button
        type="button"
        disabled={disabled}
        onClick={() => exportToXlsx(entries)}
        className="min-h-[52px] flex-1 rounded-xl bg-dc-blue px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-dc-blue-dark disabled:cursor-not-allowed disabled:opacity-40"
      >
        Exportar Excel (.xlsx)
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => exportToCsv(entries)}
        className="min-h-[52px] flex-1 rounded-xl border-2 border-dc-blue bg-white px-5 py-3 text-sm font-bold text-dc-blue hover:bg-blue-50 dark:bg-slate-900 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Exportar CSV
      </button>
      <button
        type="button"
        onClick={onResetCounter}
        className="min-h-[52px] rounded-xl border-2 border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        Reiniciar numeración
      </button>
      <button
        type="button"
        onClick={onLoadSamples}
        className="min-h-[52px] rounded-xl border-2 border-dashed border-slate-300 px-5 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        Cargar datos de prueba
      </button>
    </div>
  );
}
