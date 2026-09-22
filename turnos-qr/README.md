# Control de Turnos de Despacho (QR)

Portal React para generar turnos consecutivos al escanear códigos QR en almacén.

## Requisitos

- Node.js 18+
- Cámara (celular, tablet, PC o Zebra con navegador)
- HTTPS o `localhost` para acceso a cámara

## Desarrollo

```bash
cd turnos-qr
npm install
npm run dev
```

Abre `http://localhost:5174`

## Producción (integrar con el WMS)

```bash
cd turnos-qr
npm install
npm run build
```

Genera la carpeta `../turnos/` lista para GitHub Pages junto a los demás portales.

Desde la raíz del proyecto también puedes usar:

```bash
npm run turnos:dev
npm run turnos:build
```

## Funciones

- Escaneo QR con cámara (`html5-qrcode`)
- Turnos T-0001, T-0002… persistidos en LocalStorage
- Estados PENDIENTE / VALIDADO
- Dashboard diario, historial, export CSV/XLSX
- Anti-duplicado 10 s, beep de confirmación, modo oscuro, reloj en vivo

## Datos de prueba

En **Historial** o **Dashboard**, pulse **Cargar datos de prueba** para ver registros de ejemplo.
