import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { panel: 'src/panel/index.tsx' },
  format: ['iife'],
  outDir: 'dist',
  target: 'es2020',
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  noExternal: [/.*/],
  esbuildOptions(options) {
    options.define = options.define || {};
    options.define['process.env.NODE_ENV'] = JSON.stringify('production');
    // Ensure process exists before any bundled code runs (extension panel has no Node)
    options.banner = {
      js: "(function(){if(typeof globalThis.process==='undefined'){globalThis.process={env:{NODE_ENV:'production'}}};})();",
    };
  },
});
