# 重建开发库 eiscord（drop → create → migrate → seed）。前置：docker postgres 可启动。产出：开发库重置为初始 demo 状态。
$ErrorActionPreference = "Stop"

docker compose up -d postgres
docker compose exec -T postgres sh -lc "dropdb -U eiscord --if-exists eiscord && createdb -U eiscord eiscord"
pnpm db:migrate
pnpm db:seed
