interface HeaderProps {
  date: string;
  time: string;
  dark: boolean;
  onToggleTheme: () => void;
}

export function Header({ date, time, dark, onToggleTheme }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <div className="mx-auto flex max-w-3xl items-start justify-between gap-3 px-4 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-dc-green">Almacén Central DC</p>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white sm:text-2xl">
            Control de Turnos de Despacho
          </h1>
        </div>
        <div className="flex items-start gap-3">
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 capitalize">
              {date}
            </p>
            <p className="font-mono text-lg font-bold tabular-nums text-dc-blue dark:text-blue-300">
              {time}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg dark:border-slate-700 dark:bg-slate-800"
            aria-label={dark ? 'Modo claro' : 'Modo oscuro'}
          >
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
    </header>
  );
}
