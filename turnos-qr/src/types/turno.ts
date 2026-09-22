/** Estado de un turno en cola de despacho */
export type TurnoStatus = 'PENDIENTE' | 'VALIDADO';

/** Registro persistido en LocalStorage */
export interface TurnoEntry {
  id: string;
  turno: string;
  fecha: string;
  hora: string;
  qrContent: string;
  estado: TurnoStatus;
  createdAt: number;
}

/** Estado global de la aplicación */
export interface TurnosState {
  counter: number;
  entries: TurnoEntry[];
}

/** KPIs del dashboard diario */
export interface DashboardStats {
  totalHoy: number;
  validados: number;
  pendientes: number;
}

export type AppTab = 'scan' | 'history' | 'dashboard';

export interface ScanResult {
  qrContent: string;
  entry: TurnoEntry;
}
