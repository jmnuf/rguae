#! /bin/sh

set -x

clang --target=wasm32 -O3 -nostdlib \
      -Wl,--no-entry \
      -Wl,--allow-undefined \
      -Wl,--export-all \
      -o ./pub/foo.wasm ./c-src/foo.c
      

clang --target=wasm32 -O2 -nostdlib \
      -Wl,--no-entry \
      -Wl,--allow-undefined \
      -Wl,--export=__indirect_function_table \
      -Wl,--export=__heap_base \
      -Wl,--export=__heap_end \
      -Wl,--export-all \
      -Wl,--export=get_window_handle \
      -Wl,--export=init \
      -Wl,--export=draw \
      -o ./pub/output.wasm ./c-src/main.c
