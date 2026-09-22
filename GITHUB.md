# Subir este proyecto a GitHub

## Requisitos

- [Git](https://git-scm.com/) instalado
- Cuenta en [GitHub](https://github.com)

## Importante

El repositorio debe ser **solo la carpeta `Almacen-Central-001`**, no todo el Escritorio.

Abre PowerShell **dentro de esta carpeta**:

```powershell
cd C:\Users\lrruiz\Projects\Almacen-Central-001
```

## Paso 1 — Verificar antes de subir

```powershell
node scripts\verify-platform.js
```

Debe decir: `All checks passed`.

## Paso 2 — Inicializar Git (solo la primera vez)

```powershell
cd C:\Users\lrruiz\Projects\Almacen-Central-001
git init
git add .
git status
```

Revisa que **no** aparezcan:

- `data/*.json` (datos del servidor LAN)
- `ACCESO-RED.txt` (tu IP personal)
- `.env` con claves secretas
- Archivos `.xlsx` de prueba

## Paso 3 — Primer commit

```powershell
git commit -m "WMS Almacén Central — plataforma web con LAN y despacho"
```

## Paso 4 — Crear repo en GitHub

1. Entra a https://github.com/new
2. Nombre ejemplo: `wms-almacen-central`
3. **No** marques README (ya existe aquí)
4. Crear repositorio

## Paso 5 — Conectar y subir

Reemplaza `TU_USUARIO` y `TU_REPO`:

```powershell
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

## Qué incluye el repositorio

| Incluido | Excluido (.gitignore) |
|----------|------------------------|
| Código HTML, CSS, JS | `node_modules/` |
| Servidor LAN (`server/`) | `data/*.json` |
| Scripts y documentación | `ACCESO-RED.txt` (tu IP) |
| Plantillas en `plantilla/` | `.env`, `*.apk`, `*.lnk` |
| Video login principal | Clips extra de `assets/video/` |

## Credenciales demo

Las contraseñas en README son **solo para demostración**. Cámbialas antes de usar en producción pública.

## Clonar en otro PC

```powershell
git clone https://github.com/TU_USUARIO/TU_REPO.git
cd TU_REPO
.\serve-dashboard.ps1
```

Abrir: http://localhost:8080
