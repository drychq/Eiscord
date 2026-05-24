# When build starts from the workspace root, keep outputs out of src.
$out_dir = 'output';
$aux_dir = 'build';

# Use xelatex for CJK support
$xelatex = 'xelatex -synctex=1 -interaction=nonstopmode -file-line-error %O %S';

# Keep going to surface as many errors as possible in one run.
$force_mode = 1;
$silent = 0;
