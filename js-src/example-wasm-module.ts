import { Factory, create_env } from './struct-builder-impl';
import type { Pointer } from './struct-builder-impl';
import { tryAsync, trySync, get_base_url } from './utils';

export type ModuleConfig = {
  cnv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};

export async function load_module({ cnv, ctx }: ModuleConfig) {
  // This should be enough memory for everyone
  const wasm_result = await tryAsync(() => WebAssembly.instantiateStreaming(
    fetch(get_base_url() + 'output.wasm'),
    {
      env: create_env({
        malloc: (size: number) => heap.malloc(size),
        realloc: (ptr: Pointer, size: number) => heap.realloc(ptr, size),
        free: (ptr: Pointer) => heap.free(ptr),

        printn: (zstr_ptr: Pointer) => console.log(factory.read_zstring(zstr_ptr)),
        printn_sv(sv_ptr: Pointer): void {
          const sv = new String_View(sv_ptr);
          console.log(sv['@object']);
          console.log(sv.toString());
        },

        printn_int(int: number) {
          console.log(int);
        },

        printn_zstrs(zstr_list_ptr: Pointer) {
          const zlist = new ZStr_List(zstr_list_ptr);
          const len = zlist.len.read();
          const items_ptr = zlist.items.ptr;
          let buf = '';
          for (let i = 0; i < len; ++i) {
            const offset = i * 4;
            const ptr_maybe = new DataView(memory.buffer).getInt32(items_ptr + offset, true);
            const str = factory.read_zstring(ptr_maybe as Pointer);
            if (i != 0) buf += ' ';
            buf += str;
          }
          console.log(buf);
        },

        printnf_void_list(fmt_ptr: Pointer, args_ptr: Pointer) {
          const args_list = new Void_List(args_ptr);
          const args: Pointer[] = [];
          for (let i = 0; i < args_list.len.read(); ++i) {
            const offset = i * 4;
            const ptr = factory.deref((args_list.items.ptr + offset) as Pointer);
            args.push(ptr);
          }
          const fmt = factory.read_zstring(fmt_ptr);
          let i = 0;
          let buf = '';
          while (i < fmt.length) {
            if (fmt[i] != '%') {
              buf += fmt[i++];
              continue;
            }
            ++i;
            const ptr = args.shift();
            if (ptr === undefined) {
              console.error('Insufficient arguments provided to printnf!');
              return;
            }
            if (fmt[i] != '{') {
              switch (fmt[i]) {
                case '%':
                  buf += '%';
                  break;
                case 's': {
                  buf += factory.read_zstring(ptr);
                } break;
                case 'b': {
                  const byte = new Uint8Array(memory.buffer.slice(ptr))[0]!;
                  console.log('[DEBUG]', byte);
                  buf += byte.toString(10);
                } break;
                case 'u': {
                  const n = new DataView(memory.buffer).getUint32(ptr, true);
                  buf += n.toString(10);
                } break;
                case 'i':
                case 'd': {
                  const n = new DataView(memory.buffer).getInt32(ptr, true);
                  buf += n.toString(10);
                } break;
                case 'F':
                case 'f': {
                  const n = new DataView(memory.buffer).getFloat32(ptr, true);
                  buf += n.toString(10);
                } break;
                case 'e': {
                  const n = new DataView(memory.buffer).getFloat32(ptr, true);
                  buf += n.toExponential().toLowerCase();
                } break;
                case 'E': {
                  const n = new DataView(memory.buffer).getFloat32(ptr, true);
                  buf += n.toExponential().toUpperCase();
                } break;
                case 'c': {
                  const byte = new DataView(memory.buffer).getUint8(ptr);
                  buf += String.fromCharCode(byte);
                } break;
                case 'p': {
                  buf += 'b' + ptr.toString(16);
                } break;
                default:
                  throw new Error(`Unsupported format specifier: ${fmt[i]}`);
              }
              i++
              continue;
            }
            i++;
            let struct_name = '';
            let closed = false;
            while (i < fmt.length) {
              if (fmt[i] == '}') {
                closed = true;
                i++;
                break;
              }
              struct_name += fmt[i++];
            }
            if (!closed) {
              console.error('Unclosed format braces, missing }!');
              return;
            }
            struct_name = struct_name.trim();
            if (struct_name.length == 0) {
              buf += ptr.toString(10);
              continue;
            }

            const known_structs = Object.keys(structs) as Array<keyof typeof structs>;
            const sname = known_structs.find(s => s.toLowerCase() === struct_name.toLowerCase());
            if (!sname) {
              buf += `0x${ptr.toString(16)}`;
              console.error(`Unknown struct: '${struct_name}' requested to be printed...`);
              continue;
            }
            const Struct = structs[sname]!;
            const struct = new Struct(ptr);
            const obj = struct['@object'];
            const stringified = JSON.stringify(obj, undefined, '    ');
            buf += `${sname} ${stringified}`;
          }

          console.log(buf);
        },

        clear_screen() {
          ctx.clearRect(0, 0, cnv.width, cnv.height);
        },

        draw_rect(rect_ptr: Pointer) {
          const r = (new Rect(rect_ptr))['@object'];
          ctx.fillRect(Math.floor(r.x), Math.floor(r.y), r.w, r.h);
        },

        clear_background(clr_ptr: Pointer) {
          const clr = new Color_Rgba(clr_ptr);
          const prv = ctx.fillStyle;
          ctx.fillStyle = clr.to_css_rgba();
          ctx.fillRect(0, 0, cnv.width, cnv.height);
          ctx.fillStyle = prv;
        },

        set_fill_rgba(color_ptr: Pointer) {
          const color = new Color_Rgba(color_ptr);
          ctx.fillStyle = color.to_css_rgba();
        },
      }),
    }
  ));
  if (!wasm_result.ok) {
    throw new Error('Failed to load wasm module', { cause: wasm_result.error });
  }
  const wasm = wasm_result.value;
  const memory = wasm.instance.exports.memory as WebAssembly.Memory;
  const factory = Factory(wasm.instance);
  const String_View = factory.struct_builder('String_View')
    .add_field('count', 'i32')
    .add_field('data', 'ptr')
    .add_method('toString', (s) => {
      return factory.read_sized_string(s.data.get(), s.count.read());
    })
    .add_method('@transform', (s) => {
      return factory.read_sized_string(s.data.get(), s.count.read());
    })
    .build();

  /*
  size_t len;
  size_t cap;
  void **items;
    */
  const Void_List = factory.struct_builder('Void_List')
    .add_field('len', 'i32')
    .add_field('cap', 'i32')
    .add_field('items', 'ref', 'ptr')
    .build();

  const ZStr_List = factory.struct_builder('ZStr_List')
    .add_field('len', 'i32')
    .add_field('cap', 'i32')
    .add_field('items', 'ref', 'zstring')
    .build();

  const Color_Rgba = factory.struct_builder('RGBa')
    .add_fields([
      ['r', 'u8'],
      ['g', 'u8'],
      ['b', 'u8'],
      ['a', 'u8'],
    ])
    .add_method('to_css_rgba', s => {
      const { r, g, b, a } = s['@object'];
      return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
    })
    .build();

  const Rect = factory.struct_builder('Rect')
    .add_fields([
      ['x', 'f32'],
      ['y', 'f32'],
      ['w', 'i32'],
      ['h', 'i32'],
    ])
    .build();

  const My_Window = factory.struct_builder('My_Window')
    .add_field('title', String_View)
    .add_field('bounds', Rect)
    .build();

  const structs = {
    String_View,
    Color_Rgba,
    Rect,
    My_Window,
  } as const;

  const funcs = {
    init: wasm.instance.exports.init as () => void,
    draw: wasm.instance.exports.draw as (dt: number) => void,
    get_window_handle: () => {
      const f = wasm.instance.exports.get_window_handle as () => Pointer;
      return new My_Window(f());
    },
    // print_window: (win: InstanceType<typeof My_Window>) => {
    //   const t = JSON.stringify(win['@object'], undefined, '    ');
    //   console.log(`My_Window ${t}`);
    // },

  } as const;

  const memcpy = (n: number, dest: Pointer, source: Pointer) => {
    const view = new DataView(memory.buffer);
    for (let i = 0; i < n; ++i) {
      view.setUint8(dest + i, view.getUint8(source + i));
    }
  };
  const memset = (n: number, dest: Pointer, byte: number) => {
    const view = new DataView(memory.buffer);
    for (let i = 0; i < n; ++i) {
      view.setUint8(dest + i, byte);
    }
  };

  const heap = {
    get base() {
      const heap_base = wasm.instance.exports.__heap_base as WebAssembly.Global<'i32'>;
      return heap_base.value;
    },
    get end() {
      const heap_end = wasm.instance.exports.__heap_end as WebAssembly.Global<'i32'>;
      return heap_end.value;
    },

    get size() {
      return this.end - this.base;
    },

    get unused_space() {
      return this.end - this.index;
    },

    index: 0,

    blocks: new Map<Pointer, { ptr: Pointer; unused: boolean; size: number; }>(),

    malloc(size: number) {
      // Align by 4 bytes
      size += size % 4;

      const heap_size = heap.unused_space;
      console.log(`[INFO] malloc(${size})`);
      if (size >= heap_size) {
        const b = heap.blocks.values().find(b => b.unused && b.size >= size);
        if (!b) throw new Error('Out of Memory: Use less memory, bro. Or download more RAM');
        if (b.size <= size * 2) {
          memset(b.size, b.ptr, 0);
          return b.ptr;
        }
        const hs = b.size / 2;
        let nb_s = hs, ob_s = hs;
        if (!Number.isInteger(hs)) {
          ob_s = Math.floor(hs) + 1;
          ob_s += ob_s % 4;
          nb_s = b.size - ob_s;
        }
        if (nb_s > 0) {
          const nb = { ptr: (b.ptr + hs) as Pointer, unused: true, size: nb_s };
          b.size = ob_s;
          b.unused = false;
          heap.blocks.set(nb.ptr, nb);
        }
        heap.blocks.set(b.ptr, b);
        memset(b.size, b.ptr, 0);
        return b.ptr;
      }
      const ptr = heap.index as Pointer;
      heap.blocks.set(ptr, { ptr, unused: false, size });
      heap.index += size;
      memset(size, ptr, 0);
      return ptr;
    },

    realloc(ptr: Pointer, size: number) {
      if (ptr == 0) return heap.malloc(size);
      const ob = heap.blocks.get(ptr);
      if (!ob) throw new Error('Trying to reallocate a block of memory that does not exist');
      const result = trySync(() => {
        const new_ptr = heap.malloc(size);
        memcpy(Math.min(ob.size, size), new_ptr, ptr);
        return new_ptr;
      });
      if (!result.ok) {
        throw new Error('Failed to reallocate an existing block of memory', { cause: result.error });
      }
      return result.value;
    },

    free(ptr: Pointer) {
      if (ptr == 0) {
        console.error('[ERROR] Attempting to free NULL pointer');
        return;
      }
      const block = heap.blocks.get(ptr);
      if (!block) {
        throw new Error('Trying to free a block of memory that does not exist in the heap');
      }
      block.unused = true;
      heap.blocks.set(block.ptr, block);
    },
  };
  heap.index = heap.base;

  // @ts-ignore Debug items
  window.jwasm = wasm; window.jmem = wasm.instance.exports.memory;

  return {
    funcs,
    structs,
    heap,
  };
}
