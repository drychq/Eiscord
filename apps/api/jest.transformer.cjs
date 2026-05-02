const ts = require('typescript');

module.exports = {
  process(sourceText, sourcePath) {
    const output = ts.transpileModule(sourceText, {
      compilerOptions: {
        emitDecoratorMetadata: true,
        esModuleInterop: true,
        experimentalDecorators: true,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node16,
        sourceMap: true,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    });

    return {
      code: output.outputText,
      map: output.sourceMapText,
    };
  },
};
