import { load_module } from './example-wasm-module';
import { tryAsync, trySync } from './utils';

console.clear();

const appDiv = document.querySelector<HTMLDivElement>('#app')!;
const cnv = document.createElement('canvas');
{
  const factor = 90;
  cnv.width = 16 * factor;
  cnv.height = 9 * factor;
}
const ctx = cnv.getContext('2d')!;

appDiv.appendChild(cnv);
const result = await tryAsync(() => load_module({
  cnv, ctx,
}));
if (!result.ok) {
  console.log('Failed to execute main');
  console.error(result.error);
} else {
  const mod = result.value;
  const {
    init,
    draw,
    get_window_handle,
  } = mod.funcs;
  const w = get_window_handle();

  w.bounds.w.write(cnv.width);
  w.bounds.h.write(cnv.height);

  init();

  console.log('[INFO] HEAP: available_space =', mod.heap.unused_space);
  console.log('[INFO] HEAP: total_size =', mod.heap.size);

  let running = false;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState == 'hidden' && running) {
      running = false;
      cancelAnimationFrame(handle);
    } else if (document.visibilityState == 'visible' && !running) {
      running = true;
      handle = requestAnimationFrame(start);
    }
  });

  let prev_frame_time = 0;
  const start = (time: number) => {
    running = true;
    prev_frame_time = time;

    handle = requestAnimationFrame(safeStep);
  };
  let handle = requestAnimationFrame(start);

  function step(time: number) {
    if (!running) return;
    const dt = (time - prev_frame_time) / 1000;
    prev_frame_time = time;
    if (dt < 0.02) {
      draw(dt);
    } else if (dt >= 10) {
      console.warn('Very long time between frames', dt);
    }
    handle = requestAnimationFrame(step);
  }
  const safeStep = (t: number) => {
    const result = trySync(() => step(t));
    if (result.ok) {
      cancelAnimationFrame(handle);
    } else {
      console.error(result.error);
    }
    handle = requestAnimationFrame(safeStep);
  }
}
