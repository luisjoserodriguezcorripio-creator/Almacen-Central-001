@echo off
setlocal
REM Exporta la hoja «Reporte Diario» a CSV sin DRM para cargar en el portal Recepción.
set "SRC=%~1"
if "%SRC%"=="" set "SRC=%USERPROFILE%\Downloads\Planilla de Recepcion de contenedores 2026.xlsx"
set "OUT=%~dp0..\data\reporte-diario-upload.csv"

echo Origen: %SRC%
echo Destino: %OUT%

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$src='%SRC%'; $out='%OUT%';" ^
  "if (-not (Test-Path -LiteralPath $src)) { throw 'No se encontro el Excel: ' + $src };" ^
  "$excel=New-Object -ComObject Excel.Application; $excel.Visible=$false; $excel.DisplayAlerts=$false;" ^
  "try {" ^
  "  $wb=$excel.Workbooks.Open($src);" ^
  "  $ws=$null; foreach($s in $wb.Worksheets){ if($s.Name -eq 'Reporte Diario'){ $ws=$s; break } };" ^
  "  if(-not $ws){ throw 'No existe la hoja Reporte Diario' };" ^
  "  $ws.Copy(); $nwb=$excel.ActiveWorkbook;" ^
  "  $nws=$nwb.Worksheets.Item(1);" ^
  "  $last=3; for($r=4; $r -le 8000; $r++){ $v=[string]$nws.Cells.Item($r,5).Text; if($v -and $v.Trim() -ne ''){ $last=$r } elseif(($r-$last) -gt 40){ break } };" ^
  "  $nws.Range(($last+1).ToString() + ':' + ($last+50000).ToString()).EntireRow.Delete() | Out-Null;" ^
  "  if(Test-Path -LiteralPath $out){ Remove-Item -LiteralPath $out -Force };" ^
  "  $nwb.SaveAs($out, 6);" ^
  "  $nwb.Close($false); $wb.Close($false);" ^
  "  Write-Host ('OK filas hasta ' + $last);" ^
  "} catch { Write-Host ('ERROR: ' + $_.Exception.Message); exit 1 } finally { $excel.Quit(); Start-Sleep -Seconds 1; Get-Process EXCEL -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }"

if errorlevel 1 (
  echo Fallo al exportar.
  exit /b 1
)
echo Listo. Cargue este CSV en Recepción: %OUT%
endlocal
