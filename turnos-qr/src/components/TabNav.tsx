import type { AppTab } from '@/types/turno';

interface TabNavProps {
  active: AppTab;
  onChange: (tab: AppTab) => void;
}

const TABS: { id: AppTab; label: string; icon: string }[] = [
  { id: 'scan', label: 'Escanear', icon: '📷' },
  { id: 'history', label: 'Historial', icon: '📋' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
];

/** Navegación inferior — botones grandes para Zebra / móvil */
export function TabNav({ active, onChange }: TabNavProps) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 pb-[env(safe-area-inset-bottom)]"
      aria-label="Secciones"
    >
      <div className="mx-auto grid max-w-3xl grid-cols-3 gap-1 p-2">
        {TABS.map((tab) => {
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`flex min-h-[56px] flex-col items-center justify-center rounded-xl px-2 py-2 text-sm font-semibold transition ${
                selected
                  ? 'bg-dc-blue text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
              aria-current={selected ? 'page' : undefined}
            >
              <span className="text-xl" aria-hidden="true">
                {tab.icon}
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
