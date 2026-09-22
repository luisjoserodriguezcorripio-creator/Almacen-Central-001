# Almacén Central 001 — Guía de red local (LAN)

Sistema interno para varios dispositivos en el **mismo WiFi**: PCs, laptops y celulares abren la web desde la **IP del servidor** y comparten datos en tiempo real.

---

## Requisitos

| Requisito | Detalle |
|-----------|---------|
| Node.js | Instalado en el PC que hará de **servidor** |
| Red | Todos los dispositivos en el **mismo WiFi** |
| Internet | **No obligatorio** para trabajar en LAN |
| Firewall | Puerto abierto en el servidor (ver sección errores) |

---

## Paso 1 — Iniciar el servidor (PC servidor)

Abre PowerShell en la carpeta del proyecto:

```powershell
cd C:\Users\lrruiz\Projects\Almacen-Central-001
.\serve-dashboard.ps1
```

Puerto distinto:

```powershell
.\serve-dashboard.ps1 -Port 8765
```

Al iniciar verás algo como:

```
========================================
  Almacén Central 001 — Servidor LAN
========================================
Escuchando en: 0.0.0.0:8080

En ESTE equipo:
  WMS:      http://localhost:8080/index.html
  Despacho: http://localhost:8080/despacho.html

Desde OTROS dispositivos (mismo WiFi):
  [Wi-Fi] http://192.168.1.50:8080/index.html
          http://192.168.1.50:8080/despacho.html
========================================
```

**Anota la IP** que aparece (ej. `192.168.1.50`). Esa es la dirección que usarán los demás equipos.

---

## Paso 2 — Abrir en el navegador

### En el PC servidor

- WMS: http://localhost:8080
- Despacho: http://localhost:8080/despacho.html

### En celular, laptop u otro PC (mismo WiFi)

Reemplaza `192.168.X.X` por la IP del servidor:

- WMS: `http://192.168.X.X:8080`
- Despacho: `http://192.168.X.X:8080/despacho.html`

> **No abras** `index.html` como archivo (`file://`). Siempre usa `http://IP:puerto`.

---

## Paso 3 — Credenciales

### Centro de mando WMS

| Rol | Usuario | Contraseña |
|-----|---------|------------|
| Administrador | `admin` | `JANSELCASTRO01` |
| Supervisor | `supervisor` | `SUPERVISOR01` |
| Operador | `operador` | `CASTRO01` |

### Portal Despacho (sesión separada)

| Rol | Usuario | Contraseña |
|-----|---------|------------|
| Preparador | `preparador` o `operador` | `CASTRO01` |
| Validador | `validador` o `supervisor` | `SUPERVISOR01` |

---

## Paso 4 — Cómo funciona la sincronización

```
┌─────────────┐     WiFi/LAN      ┌─────────────┐
│  Celular    │◄─────────────────►│ PC Servidor │
│  Preparador │   http://IP:8080  │  Node.js    │
└─────────────┘                   │  data/*.json│
┌─────────────┐                   └──────▲──────┘
│  Laptop     │◄────────────────────────┘
│  Validador  │        SSE tiempo real
└─────────────┘
┌─────────────┐
│  TV / PC    │  Dashboard y modo TV
└─────────────┘
```

1. El **servidor** guarda los datos en `data/` (JSON).
2. Cada dispositivo usa la web normal; al cambiar algo se envía al servidor.
3. El servidor avisa a **todos** por **SSE** (`/api/events`) — actualización casi instantánea.
4. Verás el badge **LAN** en la barra superior cuando el modo red está activo.

### Datos compartidos en red

- Despacho (pedidos preparador ↔ validador)
- Operaciones, Facturas, Productividad (Excel importado)
- Usuarios y áreas
- Configuración compartida (metas, filtros de sitio, etc.)
- Historial de administración

### Datos locales por dispositivo (no se comparten)

- Sesión de login
- Tema / módulo activo / preferencias de pantalla
- Bloqueo por intentos fallidos de login

---

## Paso 5 — Probar que funciona

### Prueba rápida (2 dispositivos)

1. Inicia `.\serve-dashboard.ps1` en el PC servidor.
2. En el **PC servidor**: abre Despacho → login como **preparador** → registra un pedido de prueba.
3. En el **celular** (mismo WiFi): abre `http://192.168.X.X:8080/despacho.html` → login como **validador**.
4. El pedido del preparador debe aparecer en el validador **sin recargar** (o en segundos).

### Prueba API (opcional)

En el navegador del servidor:

- http://localhost:8080/api/health — estado del servidor e IPs
- http://localhost:8080/api/data — todos los datos compartidos

---

## Paso 6 — Firewall (si otros equipos no conectan)

Windows suele bloquear conexiones entrantes. **Como Administrador**:

```powershell
cd C:\Users\lrruiz\Projects\Almacen-Central-001
.\scripts\open-firewall.ps1 -Port 8080
```

Luego reinicia el servidor y prueba de nuevo desde el celular.

---

## Errores comunes

| Problema | Solución |
|----------|----------|
| Otro dispositivo no abre la página | Verifica misma WiFi; usa IP del servidor, no `localhost`; abre firewall |
| `localhost` en el celular no funciona | En el celular usa `http://192.168.X.X:8080` (IP del PC servidor) |
| No aparece badge LAN | Debes usar `serve-dashboard.ps1` (servidor LAN), no abrir HTML directo |
| Datos no se sincronizan | Confirma `/api/health` responde; revisa que el badge LAN esté visible |
| Puerto ocupado | Usa otro: `.\serve-dashboard.ps1 -Port 8765` |
| IP cambió | La IP WiFi puede cambiar; al reiniciar el servidor muestra la IP actual |
| Guest WiFi aislado | Algunas redes "invitado" no ven otros dispositivos — usa WiFi principal |
| Antivirus bloquea Node | Permite `node.exe` en red privada |

### Obtener la IP manualmente (Windows)

```powershell
ipconfig
```

Busca **Adaptador de LAN inalámbrica Wi-Fi** → **Dirección IPv4** (ej. `192.168.1.50`).

---

## Estructura técnica

```
Almacen-Central-001/
├── serve-dashboard.ps1      ← Ejecutar esto
├── server/lan-server.js     ← Backend LAN (0.0.0.0 + API + SSE)
├── js/platform-lan-sync.js  ← Cliente sincronización
├── data/                    ← Datos compartidos (JSON)
│   ├── despacho.json
│   ├── operaciones.json
│   ├── facturas.json
│   └── ...
└── scripts/open-firewall.ps1
```

### API REST

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/api/health` | Estado e IPs LAN |
| GET | `/api/data` | Todos los datos |
| GET | `/api/data/despacho` | Un módulo |
| PUT | `/api/data/despacho` | Guardar `{ "data": { ... } }` |
| GET | `/api/events` | SSE — tiempo real |

### Tiempo real (SSE)

Cuando un dispositivo guarda datos, el servidor emite un evento `update` y los demás clientes actualizan automáticamente. Equivalente práctico a WebSockets para este sistema.

---

## Comando directo (sin PowerShell)

```powershell
node server/lan-server.js --port 8080
```

---

## Respaldo de datos LAN

Los datos de red están en la carpeta `data/`. Para respaldar, copia esa carpeta. Para restaurar, pega los JSON con el servidor detenido.

También puedes usar **Administración → Herramientas → Backup** dentro del WMS (se sincroniza con el servidor en modo LAN).
