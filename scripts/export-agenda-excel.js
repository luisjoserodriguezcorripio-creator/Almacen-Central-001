const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const seed = JSON.parse(fs.readFileSync(path.join(root, 'data', 'agenda-seed.json'), 'utf8'));

const puestos = [
  ['supervisor_inventario', 'Supervisor de Inventario'],
  ['digitadora_inventario', 'Digitadora de Inventario'],
  ['coordinador_almacen', 'Coordinador Almacén'],
  ['auxiliar_despacho', 'Auxiliar de Despacho'],
  ['supervisor_despacho', 'Supervisor de Despacho'],
  ['supervisor_validadores', 'Supervisor de Validadores'],
  ['supervisor_devoluciones', 'Supervisor de Devoluciones'],
  ['coordinador_recepcion', 'Coordinador Recepción'],
  ['supervisora_oficina', 'Supervisora de Oficina']
];
const puestoMap = Object.fromEntries(puestos);

const rows = (seed.templates || []).map(function (t) {
  return {
    id: t.id,
    puesto: t.puesto,
    puesto_nombre: puestoMap[t.puesto] || t.puesto,
    nombre_persona: '',
    numero: t.numero,
    frecuencia: t.frecuencia,
    actividad: t.actividad,
    minutos: t.minutos
  };
});

const wb = XLSX.utils.book_new();

const personas = [
  ['puesto', 'puesto_nombre', 'nombre_persona', 'notas'],
  ...puestos.map(function (pair) {
    return [pair[0], pair[1], '', 'Escriba aqui el nombre del responsable'];
  })
];
const wsPersonas = XLSX.utils.aoa_to_sheet(personas);
wsPersonas['!cols'] = [{ wch: 26 }, { wch: 30 }, { wch: 28 }, { wch: 40 }];
XLSX.utils.book_append_sheet(wb, wsPersonas, 'Personas por puesto');

const ws = XLSX.utils.json_to_sheet(rows, {
  header: ['id', 'puesto', 'puesto_nombre', 'nombre_persona', 'numero', 'frecuencia', 'actividad', 'minutos']
});
ws['!cols'] = [
  { wch: 28 }, { wch: 26 }, { wch: 28 }, { wch: 28 },
  { wch: 8 }, { wch: 14 }, { wch: 70 }, { wch: 10 }
];
XLSX.utils.book_append_sheet(wb, ws, 'Actividades');

const legend = [
  ['INSTRUCCIONES'],
  ['1. En la hoja Personas por puesto escriba el nombre_persona de cada supervisor/responsable.'],
  ['2. Si un puesto tiene VARIAS personas a medir por separado, duplique la fila del puesto y ponga un nombre distinto en cada una.'],
  ['3. En Actividades puede dejar nombre_persona vacio: se tomara el de Personas por puesto.'],
  ['4. Si quiere personalizar actividades por persona, copie las filas del puesto y ponga el nombre en cada bloque.'],
  ['5. frecuencia: DIARIA | INTER_DIARIA | SEMANAL'],
  ['6. Nueva actividad: id vacio + puesto + nombre_persona + numero + frecuencia + actividad + minutos'],
  ['7. Eliminar: borre la fila.'],
  ['8. Cuando termine, reenvie este archivo. Mediremos el avance de cada persona por separado.'],
  [''],
  ['CODIGOS DE PUESTO', 'Nombre'],
  ...puestos.map(function (pair) { return [pair[0], pair[1]]; })
];
const ws2 = XLSX.utils.aoa_to_sheet(legend);
ws2['!cols'] = [{ wch: 100 }, { wch: 32 }];
XLSX.utils.book_append_sheet(wb, ws2, 'Instrucciones');

const out = path.join(root, 'data', 'agenda-actividades-editar.xlsx');
XLSX.writeFile(wb, out);
console.log('OK', out, 'actividades=', rows.length, 'puestos=', puestos.length);
