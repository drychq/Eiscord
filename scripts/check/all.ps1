# 质量门：typecheck → lint → test。前置：依赖已安装。产出：任一步失败则非零退出。
$ErrorActionPreference = "Stop"

pnpm typecheck
pnpm lint
pnpm test
