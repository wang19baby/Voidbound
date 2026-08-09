// Voidbound TS→JS 打包 (M1 最小: 不做 code-split, 不做 tree-shake, 不做 sourcemap)
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');

mkdirSync('dist', { recursive: true });
copyFileSync('src/index.html', 'dist/index.html');

const config = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'dist/main.js',
  format: 'esm',
  target: ['es2022'],
  platform: 'browser',
  sourcemap: false,
  minify: false,
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log('esbuild watching... (dist/main.js + dist/index.html)');
} else {
  await esbuild.build(config);
  console.log('esbuild build done -> dist/main.js + dist/index.html');
}