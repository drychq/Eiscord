#!/usr/bin/env python3
"""Build helper for this repo using latexmk.

Features:
- Read output/aux directories from .vscode/settings.json if present
- Commands: build (default), clean
- Options: --src, --out
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
VSCODE_SETTINGS = ROOT / '.vscode' / 'settings.json'


def load_settings():
    outdir = ROOT / 'output'
    auxdir = ROOT / 'build'
    clean_patterns = [
        '*.aux', '*.bbl', '*.bcf', '*.blg', '*.fdb_latexmk', '*.fls', '*.log',
        '*.out', '*.run.xml', '*.synctex.gz', '*.toc'
    ]
    if VSCODE_SETTINGS.exists():
        try:
            data = json.loads(VSCODE_SETTINGS.read_text(encoding='utf-8'))
            raw_out = data.get('latex-workshop.latex.outDir')
            raw_aux = data.get('latex-workshop.latex.auxDir')
            raw_clean = data.get('latex-workshop.latex.clean.fileTypes')
            if raw_out:
                raw_out = str(raw_out).replace('%WORKSPACE_FOLDER%', str(ROOT))
                outdir = Path(raw_out)
            if raw_aux:
                raw_aux = str(raw_aux).replace('%WORKSPACE_FOLDER%', str(ROOT))
                auxdir = Path(raw_aux)
            if raw_clean and isinstance(raw_clean, list):
                clean_patterns = raw_clean
        except Exception:
            pass
    return outdir, auxdir, clean_patterns


def check_latexmk():
    if shutil.which('latexmk') is None:
        print('latexmk not found in PATH. Please install latexmk.', file=sys.stderr)
        return False
    return True


def run_build(main_tex: Path, outdir: Path, auxdir: Path) -> int:
    outdir.mkdir(parents=True, exist_ok=True)
    auxdir.mkdir(parents=True, exist_ok=True)
    cmd = [
        'latexmk',
        '-xelatex',
        '-synctex=1',
        '-interaction=nonstopmode',
        '-file-line-error',
        f'-auxdir={auxdir}',
        f'-outdir={outdir}',
        str(main_tex)
    ]
    print('Running:', ' '.join(cmd))
    proc = subprocess.run(cmd)
    return proc.returncode


def run_clean(main_tex: Path, outdir: Path, auxdir: Path) -> int:
    # latexmk -C honors -outdir/-auxdir
    cmd = [
        'latexmk',
        '-C',
        f'-auxdir={auxdir}',
        f'-outdir={outdir}',
        str(main_tex)
    ]
    print('Cleaning with:', ' '.join(cmd))
    proc = subprocess.run(cmd)
    return proc.returncode


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description='Build LaTeX project using latexmk')
    p.add_argument('command', nargs='?', choices=['build', 'clean'], default='build')
    p.add_argument('--src', help='Main tex file (relative to repo root)', default='main.tex')
    p.add_argument('--out', help='Output PDF path or directory', default=None)
    return p.parse_args()


def main() -> int:
    args = parse_args()
    outdir, auxdir, _ = load_settings()
    # if user passed --out and it's a file, set outdir accordingly
    if args.out:
        out_path = Path(args.out)
        if out_path.suffix == '.pdf':
            outdir = out_path.parent
        else:
            outdir = out_path
    main_tex = ROOT / args.src
    if not main_tex.exists():
        # try src/main.tex
        alt = ROOT / 'src' / args.src
        if alt.exists():
            main_tex = alt
        else:
            print(f'Main TeX file not found: {args.src}', file=sys.stderr)
            return 2

    if not check_latexmk():
        return 3

    if args.command == 'build':
        rc = run_build(main_tex, outdir, auxdir)
        if rc == 0:
            pdf = outdir / (main_tex.stem + '.pdf')
            if pdf.exists():
                print('Build succeeded. PDF at:', pdf)
            else:
                print('Build finished but PDF not found at expected location:', pdf)
        return rc
    else:
        return run_clean(main_tex, outdir, auxdir)


if __name__ == '__main__':
    raise SystemExit(main())
