import path from 'node:path';
import { rm, mkdir, readdir } from 'node:fs/promises';

const folder_exists = async (path: string) => {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
};

const $ = Bun.$.cwd(__dirname);
console.log('[INFO] Building website...');

const dist_path = path.join(__dirname, 'dist');
if (await folder_exists(dist_path)) {
  console.log('[CMD] rmdir', 'dist');
  await rm(dist_path, {
    recursive: true,
    force: true,
  })
}

console.log('[CMD] mkdir dist');
await mkdir(dist_path);

console.log('[CMD]', `bun build index.html foo.html --minify --outdir=dist`);
await $`bun build index.html foo.html --minify --outdir=${dist_path}`;

const pub_files = await readdir(path.join(__dirname, 'pub'), {
  recursive: true,
});
for (const fname of pub_files) {
  const file_path = path.join(__dirname, 'pub', fname);
  const src = Bun.file(file_path);
  const dst = Bun.file(path.join(__dirname, 'dist', fname));
  dst.write(src);
  console.log('[CMD] copy -o', path.join('dist', fname), path.join('pub', fname));
}
