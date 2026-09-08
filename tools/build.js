import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bestzip from 'bestzip';
import chalk from 'chalk';
import * as esbuild from 'esbuild';
import { Packer } from 'roadroller';
import { minify } from 'terser';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const bundlePath = path.join(dist, 'build.js');
const htmlPath = path.join(root, 'index.html');
const zipPath = path.join(root, 'build.zip');
const watch = process.argv.includes('--watch');
const minimize = process.argv.includes('--minify');
const roadroll = process.argv.includes('--roadroll');

fs.mkdirSync(dist, { recursive: true });

async function packageBuild() {
  let code = fs.readFileSync(bundlePath, 'utf8');

  if (minimize) {
    code = (await minify(code, {
      compress: { passes: 3 },
      mangle: true,
      module: true,
      toplevel: true,
      format: { comments: false },
    })).code;
  }

  if (roadroll) {
    const packer = new Packer([{ data: code, type: 'js', action: 'eval' }], {});
    await packer.optimize(2);
    const { firstLine, secondLine } = packer.makeDecoder();
    code = firstLine + secondLine;
  }

  fs.writeFileSync(bundlePath, code);
  fs.writeFileSync(htmlPath,
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Unicorn Puck</title><style>html,body,canvas{width:100%;height:100%;margin:0;background:#000;display:block;overflow:hidden}</style>' +
    '</head><body><canvas></canvas><script>' + code + '</script></body></html>');

  await bestzip({ cwd: root, source: 'index.html', destination: zipPath });
  const bytes = fs.statSync(zipPath).size;
  const size = `${bytes.toLocaleString()}/13,312 bytes`;
  console.log(`Build: ${bytes <= 13312 ? chalk.green(size) : chalk.yellow(size)}`);
}

const packagePlugin = {
  name: 'package-js13k',
  setup(build) {
    build.onEnd(async (result) => {
      if (!result.errors.length) await packageBuild();
    });
  },
};

const buildOptions = {
  entryPoints: [path.join(root, 'src/main.js')],
  outfile: bundlePath,
  bundle: true,
  minify: false,
  plugins: [packagePlugin],
};

if (watch) {
  const context = await esbuild.context(buildOptions);
  await context.watch();
  const host = '127.0.0.1';
  const server = await context.serve({ servedir: root, host, port: 8000 });
  console.log(`Development server: http://${host}:${server.port}`);
} else {
  await esbuild.build(buildOptions);
}
