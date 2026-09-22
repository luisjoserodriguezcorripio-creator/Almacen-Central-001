interface ClockProps {
  date: string;
  time: string;
}

/** Reloj en cabecera — visible en piso de almacén */
export function Clock({ date, time }: ClockProps) {
  return (
    <div className="text-right leading-tight">
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 capitalize">
        {date}
      </p>
      <p className="font-mono text-lg font-bold tabular-nums text-dc-blue dark:text-blue-300">
        {time}
      </p>
    </div>
  );
}
