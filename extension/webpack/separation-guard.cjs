// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
/**
 * Fails the build if any compiled chunk whose name starts with "content"
 * includes a module whose resolved path matches ui-kit/, node_modules/antd,
 * or @ant-design/*. Inspects webpack's actual module graph for each such
 * chunk (compilation.chunks), so it catches TRANSITIVE leaks, not just
 * direct imports (spec §18).
 *
 * The template ships one content-script entry (content: src/content/content.ts),
 * but matching on a name prefix rather than the single literal chunk name
 * means an app that adds further content-script entries (e.g. content-panel,
 * content-acquire) is covered automatically, without having to remember to
 * update this guard.
 */
function assertContentChunkIsClean(compilation) {
  const FORBIDDEN_PATTERNS = [/[\\/]ui-kit[\\/]/, /node_modules[\\/]antd/, /node_modules[\\/]@ant-design[\\/]/];

  const contentChunks = [...compilation.chunks].filter(
    (chunk) => typeof chunk.name === "string" && chunk.name.startsWith("content")
  );
  if (contentChunks.length === 0) return;

  // Production mode enables module concatenation ("scope hoisting"): many
  // modules that would otherwise each be a separate entry in the chunk's
  // module list get merged into a single ConcatenatedModule. That wrapper's
  // own `.resource` is undefined, and `.rootModule.resource` only reflects
  // the ONE module the concatenation was rooted at (e.g. content.ts itself) —
  // so checking only `resource`/`rootModule.resource` silently skips every
  // other module folded into the concatenation. ConcatenatedModule exposes
  // those inner modules via `.modules`, so walk into it explicitly rather
  // than relying on the wrapper's own resource.
  function* resourcesOf(mod) {
    if (Array.isArray(mod.modules)) {
      for (const inner of mod.modules) {
        yield* resourcesOf(inner);
      }
      return;
    }
    const resource = mod.resource || (mod.rootModule && mod.rootModule.resource);
    if (resource) yield resource;
  }

  const offenders = [];
  for (const contentChunk of contentChunks) {
    const modules = compilation.chunkGraph.getChunkModulesIterable(contentChunk);
    for (const mod of modules) {
      for (const resource of resourcesOf(mod)) {
        if (FORBIDDEN_PATTERNS.some((re) => re.test(resource))) {
          offenders.push(`${contentChunk.name}: ${resource}`);
        }
      }
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
