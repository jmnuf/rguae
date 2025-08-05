import { create_env, Factory, type Pointer } from './struct-builder-impl.ts';
import { get_base_url, } from './utils.ts';

(async function main() {
  const wasm = await WebAssembly.instantiateStreaming(fetch(get_base_url() + '/foo.wasm'), {
    env: create_env({
      js_printn_zstr_array(list_ptr: Pointer) {
        let buf = '';
        let ptr = list_ptr;
        let first = true;
        while (f.deref(ptr) != 0) {
          if (!first) buf += ' ';
          else first = false;
          buf += f.read_zstring(f.deref(ptr));
          ptr = (ptr + 4) as Pointer;
        }
        console.log('[WASM:printn]', buf);
      },

      js_printn_int(n) {
        console.log('[WASM:put_int]', n);
      },

      js_write_int(buf_ptr, buf_size, n) {
        const n_buf = new TextEncoder().encode(n.toString(10));
        if (buf_size < n_buf.length) throw new Error('Insufficient space for writing');
        const view = new DataView(memory.buffer);
        for (let i = 0; i < n_buf.length; ++i) {
          const ptr = buf_ptr + i;
          view.setUint8(ptr, n_buf[i]!);
        }
        return n_buf.length;
      },

      js_printn_flt(flt: number) {
        console.log('[WASM:put_flt]', flt);
      },

      randf() {
        return Math.random();
      },
    }),
  });

  console.log('WASM Loaded');

  const jinst = wasm.instance;
  const memory = wasm.instance.exports.memory as WebAssembly.Memory;
  const f = Factory(jinst);

  const cmain = jinst.exports.main as () => void;

  // @ts-ignore
  window.jinst = jinst;

  cmain();
})();
