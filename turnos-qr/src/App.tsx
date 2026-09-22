import { useState } from 'react';
import type { AppTab } from '@/types/turno';
import { useClock } from '@/hooks/useClock';
import { useTheme } from '@/hooks/useTheme';
import { useTurnos } from '@/hooks/useTurnos';
import { Header } from '@/components/Header';
import { TabNav } from '@/components/TabNav';
import { ScannerPanel } from '@/components/ScannerPanel';
import { HistoryTable } from '@/components/HistoryTable';
import { DashboardPanel } from '@/components/DashboardPanel';
import { ExportBar } from '@/components/ExportBar';

export default function App() {
  const [tab, setTab] = useState<AppTab>('scan');
  const { date, time } = useClock();
  const { dark, toggle } = useTheme();
  const {
    entries,
    counter,
    stats,
    lastScan,
    error,
    registerScan,
    validateTurno,
    resetCounter,
    loadSamples,
    clearError,
  } = useTurnos();

  return (
    <div className="min-h-screen bg-slate-100 pb-28 dark:bg-slate-950">
      <Header date={date} time={time} dark={dark} onToggleTheme={toggle} />

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {tab === 'scan' && (
          <ScannerPanel
            onScan={registerScan}
            lastScan={lastScan}
            error={error}
            onClearError={clearError}
          />
        )}

        {tab === 'history' && (
          <>
            <HistoryTable entries={entries} onValidate={validateTurno} />
            <ExportBar
              entries={entries}
              onResetCounter={resetCounter}
              onLoadSamples={loadSamples}
            />
          </>
        )}

        {tab === 'dashboard' && (
          <>
            <DashboardPanel stats={stats} counter={counter} />
            <ExportBar
              entries={entries}
              onResetCounter={resetCounter}
              onLoadSamples={loadSamples}
            />
          </>
        )}

        <p className="text-center text-xs text-slate-400">
          <a href="../index.html" className="underline hover:text-dc-blue">
            ← Volver al centro de mando
          </a>
        </p>
      </main>

      <TabNav active={tab} onChange={setTab} />
    </div>
  );
}
