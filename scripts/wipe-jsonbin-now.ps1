$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$cfg = Get-Content (Join-Path $root 'data\site-config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$body = (@{
  version = 1
  updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  incidences = @()
  damages = @()
  securityIncidents = @()
  audits5s = @()
  equipmentInspections = @()
  equipmentRegistry = @{}
} | ConvertTo-Json -Compress)
$uri = 'https://api.jsonbin.io/v3/b/' + $cfg.averiasJsonBin.binId
$headers = @{ 'X-Master-Key' = $cfg.averiasJsonBin.accessKey; 'Content-Type' = 'application/json' }
$r = Invoke-WebRequest -Uri $uri -Method PUT -Headers $headers -Body $body -UseBasicParsing
Write-Output ('JSONBin wipe HTTP ' + $r.StatusCode)
