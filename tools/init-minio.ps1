# Initialize MinIO bucket for local dev (prefixes under folioFiles/ — see apps/server/src/lib/s3-paths.ts).
# Requires: docker compose up -d minio
# Usage: powershell -ExecutionPolicy Bypass -File .\tools\init-minio.ps1

$ErrorActionPreference = 'Stop'
$bucket = 'folio-mind'
$endpoint = 'http://localhost:9000'

Write-Host "Waiting for MinIO at $endpoint ..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    Invoke-WebRequest -Uri "$endpoint/minio/health/live" -UseBasicParsing -TimeoutSec 2 | Out-Null
    $ready = $true
    break
  } catch {
    Start-Sleep -Seconds 2
  }
}
if (-not $ready) {
  throw "MinIO is not reachable. Run: docker compose up -d minio"
}

docker run --rm --network folio-mind_default minio/mc:latest /bin/sh -c @"
mc alias set local http://minio:9000 minio miniosecret
mc mb -p local/$bucket || true
mc anonymous set download local/$bucket || true
echo OK bucket=$bucket
"@

Write-Host "MinIO bucket '$bucket' is ready."
