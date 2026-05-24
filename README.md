# LaTeX 课程报告工作目录

## 目录结构

- `src/main.tex`: 主文档入口
- `src/chapters/`: 章节拆分文件
- `src/figures/`: 图片资源
- `build/`: 编译中间文件
- `output/`: 最终 PDF 输出目录
- `.vscode/settings.json`: VS Code LaTeX Workshop 配置
- `latexmkrc`: 命令行编译配置

## 使用方式

1. 安装 TeX Live 或 MiKTeX。
2. 安装 VS Code 扩展 LaTeX Workshop。


3. 生成 PDF 在 `output/main.pdf`。
4. 中间文件会生成在 `build/`，脚本会自动清理 `src/` 下可能残留的编译产物。

## 构建脚本

仓库根目录提供了 `build.py`，用于在命令行上构建与清理：

- 构建：

```bash
python build.py build
```

- 清理中间文件：

```bash
python build.py clean
```

`build.py` 会优先读取 `.vscode/settings.json` 中的 `latex-workshop.latex.outDir` 与 `latex-workshop.latex.auxDir` 配置（若存在），默认输出目录为 `output/`，辅助目录为 `build/`。脚本依赖 `latexmk` 与 Python 3。
