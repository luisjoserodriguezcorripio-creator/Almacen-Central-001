# Genera logo AC estilo emblema circular (como dc-logo-source.png)
Add-Type -AssemblyName System.Drawing

function Get-JcRed {
  param([double]$t)
  $r = [int](239 + (183 - 239) * $t)
  $g = [int](83 + (28 - 83) * $t)
  $b = [int](80 + (28 - 80) * $t)
  return [System.Drawing.Color]::FromArgb(255, $r, $g, $b)
}

function Write-JcBadgeLogo {
  param([int]$Size, [string]$OutPath)

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::Transparent)

  $cx = $Size / 2.0
  $cy = $Size / 2.0
  $outerR = $Size * 0.485
  $whiteR = $Size * 0.418
  $innerR = $Size * 0.387
  $whiteW = [Math]::Max(2, $Size * 0.039)

  # Sombra suave
  $shadowRect = New-Object System.Drawing.RectangleF ($cx - $outerR - 2), ($cy - $outerR + 2), ($outerR * 2 + 4), ($outerR * 2 + 4)
  $shadowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $shadowPath.AddEllipse($shadowRect)
  $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(48, 0, 0, 0))
  $g.FillPath($shadowBrush, $shadowPath)

  # Círculo exterior rojo con degradado
  $outerRect = New-Object System.Drawing.RectangleF ($cx - $outerR), ($cy - $outerR), ($outerR * 2), ($outerR * 2)
  $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
  $gp.AddEllipse($outerRect)
  $grad = New-Object System.Drawing.Drawing2D.PathGradientBrush($gp)
  $grad.CenterColor = [System.Drawing.Color]::FromArgb(255, 239, 83, 80)
  $grad.SurroundColors = ,([System.Drawing.Color]::FromArgb(255, 183, 28, 28))
  $grad.CenterPoint = New-Object System.Drawing.PointF ($cx - $outerR * 0.12), ($cy - $outerR * 0.18)
  $g.FillEllipse($grad, $outerRect)

  # Anillo blanco
  $whitePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), $whiteW
  $whitePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawEllipse($whitePen, ($cx - $whiteR), ($cy - $whiteR), ($whiteR * 2), ($whiteR * 2))

  # Interior rojo
  $innerRect = New-Object System.Drawing.RectangleF ($cx - $innerR), ($cy - $innerR), ($innerR * 2), ($innerR * 2)
  $gp2 = New-Object System.Drawing.Drawing2D.GraphicsPath
  $gp2.AddEllipse($innerRect)
  $grad2 = New-Object System.Drawing.Drawing2D.PathGradientBrush($gp2)
  $grad2.CenterColor = [System.Drawing.Color]::FromArgb(255, 239, 83, 80)
  $grad2.SurroundColors = ,([System.Drawing.Color]::FromArgb(255, 183, 28, 28))
  $grad2.CenterPoint = New-Object System.Drawing.PointF ($cx - $innerR * 0.1), ($cy - $innerR * 0.15)
  $g.FillEllipse($grad2, $innerRect)

  # Texto AC
  $fontSize = $Size * 0.33
  $font = New-Object System.Drawing.Font('Arial Black', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF 0, 0, $Size, $Size
  $g.DrawString('AC', $font, $brush, $rect, $sf)

  $dir = Split-Path $OutPath -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $g.Dispose(); $bmp.Dispose(); $font.Dispose(); $brush.Dispose()
  $whitePen.Dispose(); $grad.Dispose(); $grad2.Dispose(); $shadowBrush.Dispose(); $shadowPath.Dispose()
  Write-Host "OK $OutPath"
}

$base = Join-Path $PSScriptRoot '..\assets\img'
Write-JcBadgeLogo -Size 512 -OutPath (Join-Path $base 'dc-logo.png')
Write-JcBadgeLogo -Size 128 -OutPath (Join-Path $base 'dc-logo-128.png')
Write-JcBadgeLogo -Size 64 -OutPath (Join-Path $base 'dc-logo-64.png')
# Alias explícito AC (archivos jc-logo* por compatibilidad de rutas)
Write-JcBadgeLogo -Size 512 -OutPath (Join-Path $base 'jc-logo.png')
Write-JcBadgeLogo -Size 128 -OutPath (Join-Path $base 'jc-logo-128.png')
Write-JcBadgeLogo -Size 64 -OutPath (Join-Path $base 'jc-logo-64.png')
