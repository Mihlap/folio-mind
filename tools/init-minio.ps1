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
for p in folioFiles/originals folioFiles/previews folioFiles/processing folioFiles/exports folioFiles/media folioFiles/rag-sources; do
  echo '' | mc pipe local/$bucket/`$p/.keep || true
done
"@

$corsFile = Join-Path $PSScriptRoot 'minio-cors.json'
if (Test-Path $corsFile) {
  docker run --rm --network folio-mind_default -v "${corsFile}:/tmp/cors.json" minio/mc:latest /bin/sh -c "mc alias set local http://minio:9000 minio miniosecret && mc cors set local/$bucket /tmp/cors.json"
  Write-Host "MinIO CORS configured for localhost:5173"
}

Write-Host "MinIO bucket '$bucket' is ready."
