import type { TurnoEntry } from '@/types/turno';

interface HistoryTableProps {
  entries: TurnoEntry[];
  onValidate: (id: string) => void;
}

function StatusBadge({ estado }: { estado: TurnoEntry['estado'] }) {
  const isOk = estado === 'VALIDADO';
  return (
    <span
      className={`inline-flex min-w-[96px] justify-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
        isOk
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
          : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
      }`}
    >
      {estado}
    </span>
  );
}

export function HistoryTable({ entries, onValidate }: HistoryTableProps) {
  if (!entries.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
        <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">Sin registros aún</p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Escanee un código QR para generar el primer turno.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel dark:border-slate-800 dark:bg-slate-900">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Turno</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Hora</th>
              <th className="px-4 py-3">QR leído</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-4 py-3 font-mono font-bold text-dc-blue dark:text-blue-300">
                  {entry.turno}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{entry.fecha}</td>
                <td className="px-4 py-3 font-mono whitespace-nowrap">{entry.hora}</td>
                <td className="max-w-[180px] truncate px-4 py-3" title={entry.qrContent}>
                  {entry.qrContent}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge estado={entry.estado} />
                </td>
                <td className="px-4 py-3">
                  {entry.estado === 'PENDIENTE' ? (
                    <button
                      type="button"
                      onClick={() => onValidate(entry.id)}
                      className="min-h-[44px] rounded-xl bg-dc-green px-4 py-2 text-xs font-bold uppercase text-white hover:bg-dc-green-dark"
                    >
                      Validar
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
