import path from 'node:path';
import indexHtml from './index.html';
import fooHtml from './foo.html';

const PORT = 8080;
Bun.serve({
  port: PORT,
  development: true,
  routes: {
    '/favicon.ico': Bun.file('./pub/favicon.ico'),
    '/': indexHtml,
    '/foo': fooHtml,
    '/output.wasm': Bun.file('./output.wasm'),
    '/foo.wasm': Bun.file('./foo.wasm'),
    '/js-src/struct-builder-impl.ts': async () => {
      const output = await Bun.build({
        entrypoints: ['./js-src/struct-builder-impl.ts'],
        format: 'esm',
        tsconfig: './tsconfig.json',
        minify: false,
        target: 'browser',
        outdir: './pub',
      });
      const artifact = output.outputs.find(a => a.kind == 'entry-point')!;
      return new Response(Bun.file(artifact.path), {
        status: 200,
        headers: {
          'Content-Type': 'application/javascript'
        },
      });
    },
  },
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const f = Bun.file(path.join('./pub', pathname));
    if (!await f.exists()) {
      return new Response('Not Found', { status: 404 });
    }
    if (req.method.toLowerCase() != 'get') {
      return new Response(undefined, {
        status: 405,
      });
    }
    return new Response(f);
  },
});
console.log(`Running in http://localhost:${PORT}/`);

