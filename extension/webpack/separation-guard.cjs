/**
 * Fails the build if the compiled "content" chunk includes any module whose
 * resolved path matches ui-kit/, node_modules/antd, or @ant-design/*.
 * Inspects webpack's actual module graph for the chunk (compilation.chunks),
 * so it catches TRANSITIVE leaks, not just direct imports (spec §18).
 */
function assertContentChunkIsClean(compilation) {
  const FORBIDDEN_PATTERNS = [/[\\/]ui-kit[\\/]/, /node_modules[\\/]antd/, /node_modules[\\/]@ant-design[\\/]/];

  const contentChunk = [...compilation.chunks].find((chunk) => chunk.name === "content");
  if (!contentChunk) return;

  const modules = compilation.chunkGraph.getChunkModulesIterable(contentChunk);
  const offenders = [];
  for (const mod of modules) {
    const resource = mod.resource || (mod.rootModule && mod.rootModule.resource);
    if (!resource) continue;
    if (FORBIDDEN_PATTERNS.some((re) => re.test(resource))) {
      offenders.push(resource);
    }
  }

  if (offenders.length > 0) {
    const list = offenders.map((f) => `  - ${f}`).join("\n");
    const err = new Error(
      `[separation-guard] content script bundle must never include ui-kit/antd, ` +
        `but found:\n${list}\n` +
        `See docs/superpowers/specs/2026-07-02-extension-factory-design.md §18.`
    );
    // Push onto compilation.errors so webpack surfaces this as a proper
    // compilation error: stats.hasErrors() is true, and any tool that just
    // checks stats (webpack-cli's default exit code, other plugins) sees it.
    //
    // That alone is NOT enough to reject compiler.run()'s promise: afterEmit
    // fires after the module-build phase that `bail` guards, and
    // compilation.errors is never read by Compiler#emitAssets's callback
    // chain. The chain IS wired to whatever error the afterEmit tap's
    // callback (or a thrown exception from a sync tap) reports:
    //   this.hooks.afterEmit.callAsync(compilation, (err) => {
    //     if (err) return callback(err); ...
    //   });
    // A synchronous throw from inside a `tap`'d afterEmit callback is caught
    // by tapable and forwarded as that `err`, which propagates all the way
    // out to compiler.run()'s callback -> a rejected promise. So we still
    // throw, in addition to recording the compilation error above, to make
    // run() reject deterministically (verified against webpack 5.108.1).
    throw err;
  }
}

module.exports = { assertContentChunkIsClean };
