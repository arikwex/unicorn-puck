import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
const reoptimize = process.argv.includes('--reoptimize');

// Roadroller model parameters from a long `roadroller -OO` search. Packing
// with fixed parameters is deterministic (no +-20 byte run-to-run wobble)
// and fast. As the code drifts, `npm run build -- --reoptimize` searches
// again starting from these and prints any better set to paste in here.
const ROADROLLER_PARAMS = {
  numAbbreviations: 32,
  recipLearningRate: 2090,
  modelMaxCount: 5,
  modelRecipBaseCount: 29,
  precision: 15,
  sparseSelectors: [0, 1, 2, 3, 5, 7, 11, 13, 25, 42, 113, 142],
};

fs.mkdirSync(dist, { recursive: true });

async function packageBuild() {
  let code = fs.readFileSync(bundlePath, 'utf8');

  if (minimize) {
    code = (await minify(code, {
      // Size-only assumptions that hold for this codebase: property reads
      // have no side effects, and true/false can ship as 1/0 (nothing
      // compares strictly against a boolean literal).
      compress: { passes: 3, pure_getters: true, booleans_as_integers: true },
      mangle: true,
      module: true,
      toplevel: true,
      format: { comments: false },
    })).code;
  }

  if (roadroll) {
    // allowFreeVars: a smaller decoder that leaves a few single-letter
    // globals behind -- harmless on a page with nothing else on it.
    const packer = new Packer([{ data: code, type: 'js', action: 'eval' }], { ...ROADROLLER_PARAMS, allowFreeVars: true });
    const { best } = await packer.optimize(reoptimize ? 2 : 0);
    if (reoptimize) console.log('Roadroller params:', JSON.stringify(best));
    const { firstLine, secondLine } = packer.makeDecoder();
    code = firstLine + secondLine;
  }

  fs.writeFileSync(bundlePath, code);
  // Browsers infer <html>/<head>/<body>. canvas.js sizes the canvas to the
  // window in pixels, so the CSS only has to kill margins and scrollbars.
  fs.writeFileSync(htmlPath,
    '<title>PEGACORN BLOOD</title><style>body{margin:0;overflow:hidden;background:#224}canvas{display:block}</style>' +
    '<canvas></canvas><script>' + code + '</script>');

  // Native zip with -X: no macOS extra file attributes (~50 bytes).
  fs.rmSync(zipPath, { force: true });
  execFileSync('zip', ['-q', '-X', zipPath, 'index.html'], { cwd: root });
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
