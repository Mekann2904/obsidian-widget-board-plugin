const ts = require('typescript');

module.exports = {
  process(src, filename) {
    const { outputText } = ts.transpileModule(src, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2018,
        sourceMap: true,
      },
      fileName: filename,
    });
    return { code: outputText };
  },
};
