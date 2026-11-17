Add-Type -AssemblyName System.Drawing
$src = Join-Path $PSScriptRoot '..\assets\img\login-inventario-poster.jpg'
$dst = Join-Path $PSScriptRoot '..\assets\img\login-inventario-poster-sm.jpg'
$src = [System.IO.Path]::GetFullPath($src)
$dst = [System.IO.Path]::GetFullPath($dst)
$img = [System.Drawing.Image]::FromFile($src)
$tw = 960
$th = [int][math]::Round($img.Height * ($tw / [double]$img.Width))
$bmp = New-Object System.Drawing.Bitmap $tw, $th
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img, 0, 0, $tw, $th)
$g.Dispose()
$img.Dispose()
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]55)
$bmp.Save($dst, $codec, $ep)
$bmp.Dispose()
Write-Output ("OK " + (Get-Item $dst).Length)
