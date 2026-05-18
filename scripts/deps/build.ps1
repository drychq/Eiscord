# 构建被 api/web 依赖的前置包（@eiscord/shared、@eiscord/media）。前置：依赖已安装。产出：两个包的 dist。
$ErrorActionPreference = "Stop"

pnpm --filter @eiscord/shared build
pnpm --filter @eiscord/media build
