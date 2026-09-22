import type { TurnoEntry } from '@/types/turno';

/** Datos de ejemplo para pruebas en almacén */
export const SAMPLE_ENTRIES: TurnoEntry[] = [
  {
    id: 'sample-1',
    turno: 'T-0001',
    fecha: new Date().toISOString().slice(0, 10),
    hora: '08:15:22',
    qrContent: 'OPERADOR-JUAN-PEREZ-DESPACHO-A',
    estado: 'VALIDADO',
    createdAt: Date.now() - 7200000,
  },
  {
    id: 'sample-2',
    turno: 'T-0002',
    fecha: new Date().toISOString().slice(0, 10),
    hora: '08:18:05',
    qrContent: 'OPERADOR-MARIA-LOPEZ-DESPACHO-B',
    estado: 'PENDIENTE',
    createdAt: Date.now() - 5400000,
  },
  {
    id: 'sample-3',
    turno: 'T-0003',
    fecha: new Date().toISOString().slice(0, 10),
    hora: '09:02:41',
    qrContent: 'MONTACARGAS-ZEBRA-DC-07',
    estado: 'PENDIENTE',
    createdAt: Date.now() - 3600000,
  },
];

export const SAMPLE_COUNTER = 3;
