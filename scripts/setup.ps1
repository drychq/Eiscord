# 一键初始化本地开发环境。前置：Docker 可用。产出：.env、docker 依赖、Prisma Client、迁移、演示数据。
$ErrorActionPreference = "Stop"

if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
}

docker compose up -d postgres redis minio minio-init

Write-Host "等待 PostgreSQL 就绪..."
$ready = $false
for ($i = 1; $i -le 30; $i++) {
    docker compose exec -T postgres pg_isready -U eiscord -d eiscord *> $null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    Write-Error "PostgreSQL 在 30 秒内未就绪，请检查 docker compose logs postgres"
    exit 1
}

pnpm db:generate
pnpm exec prisma migrate deploy --schema=prisma/schema.prisma
pnpm db:seed

Write-Host "✓ 环境初始化完成。下一步：pnpm dev"
