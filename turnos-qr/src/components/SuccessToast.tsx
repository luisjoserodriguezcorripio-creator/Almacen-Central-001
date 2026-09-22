interface SuccessToastProps {
  visible: boolean;
  turno: string;
  qrContent: string;
}

/** Mensaje visual tras generar turno */
export function SuccessToast({ visible, turno, qrContent }: SuccessToastProps) {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-pulse rounded-2xl border-2 border-dc-green bg-emerald-50 p-5 text-center shadow-panel dark:border-emerald-600 dark:bg-emerald-950/40"
    >
      <p className="text-sm font-bold uppercase tracking-wide text-dc-green dark:text-emerald-300">
        Turno generado correctamente
      </p>
      <p className="mt-2 font-mono text-4xl font-extrabold text-slate-900 dark:text-white">{turno}</p>
      <p className="mt-3 break-all text-sm text-slate-600 dark:text-slate-300">
        QR: <strong>{qrContent}</strong>
      </p>
    </div>
  );
}
