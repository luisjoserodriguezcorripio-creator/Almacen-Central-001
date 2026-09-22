import { useCallback, useEffect } from 'react';
import type { ScanResult } from '@/types/turno';
import { useQrScanner } from '@/hooks/useQrScanner';
import { SuccessToast } from './SuccessToast';

interface ScannerPanelProps {
  onScan: (text: string) => void;
  lastScan: ScanResult | null;
  error: string | null;
  onClearError: () => void;
}

export function ScannerPanel({ onScan, lastScan, error, onClearError }: ScannerPanelProps) {
  const handleScan = useCallback(
    (text: string) => {
      onScan(text);
    },
    [onScan],
  );

  const { scannerId, active, cameraError, start, stop } = useQrScanner({ onScan: handleScan });

  /** Activación automática de cámara al abrir la pantalla */
  useEffect(() => {
    void start();
    return () => {
      void stop();
    };
  }, [start, stop]);

  return (
    <section className="space-y-4" aria-label="Lectura de código QR">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-panel dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Escanear QR</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Apunte la cámara al código del operador o equipo.
            </p>
          </div>
          <div className="flex gap-2">
            {!active ? (
              <button
                type="button"
                onClick={() => void start()}
                className="min-h-[52px] min-w-[160px] rounded-xl bg-dc-blue px-6 py-3 text-base font-bold text-white shadow-md hover:bg-dc-blue-dark"
              >
                Escanear QR
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void stop()}
                className="min-h-[52px] min-w-[160px] rounded-xl border-2 border-red-500 px-6 py-3 text-base font-bold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                Detener cámara
              </button>
            )}
          </div>
        </div>

        <div
          id={scannerId}
          className="mx-auto min-h-[280px] max-w-md overflow-hidden rounded-2xl bg-slate-900"
        />

        {(cameraError || error) && (
          <div
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            role="alert"
          >
            {cameraError || error}
            {error && (
              <button
                type="button"
                onClick={onClearError}
                className="ml-3 font-bold underline"
              >
                Cerrar
              </button>
            )}
          </div>
        )}

        {lastScan && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Contenido leído</p>
            <p className="mt-1 break-all font-mono text-sm text-slate-800 dark:text-slate-100">
              {lastScan.qrContent}
            </p>
          </div>
        )}
      </div>

      <SuccessToast
        visible={!!lastScan}
        turno={lastScan?.entry.turno ?? ''}
        qrContent={lastScan?.qrContent ?? ''}
      />

      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        Evita doble lectura: el mismo QR no generará otro turno en menos de 10 segundos.
      </p>
    </section>
  );
}
