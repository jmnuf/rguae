
export type Splat<T> = { [K in keyof T]: T[K] } & unknown;
export type NativeType = 'ptr' | 'i32' | 'u32' | 'f32' | 'i64' | 'u64' | 'i8' | 'u8' | 'zstring';
export type Pointer = number & { readonly __tag: 'native:pointer' };

type StructField<FT extends NativeType> = {
  [K in NativeType]: K extends 'ptr'
  ? { kind: K; readonly ptr: Pointer; get(): Pointer }
  : K extends 'zstring'
  ? { kind: K; readonly ptr: Pointer; len(): number; read(): string; overwrite(index: number, byte: number): boolean; bytes(): Uint8Array; }
  : K extends 'f32' | 'i32' | 'u32'
  ? { kind: K; readonly ptr: Pointer; read(): number; write(n: number): void; bytes(): Uint8Array; }
  : K extends 'i64' | 'u64'
  ? { kind: K; readonly ptr: Pointer; read(): bigint; write(n: number | bigint): void; bytes(): Uint8Array; }
  : K extends 'u8' | 'i8'
  ? { kind: K; readonly ptr: Pointer; read(): number; write(n: number): void; }
  : never;
}[FT];

type StructMethod<Fn extends (...args: any[]) => any> =
  Fn extends (...args: infer Args) => any
  ? Args extends [infer _Head, ...infer Tail]
  ? (...args: Tail) => ReturnType<Fn>
  : Fn
  : Fn
  ;

type FieldKind = NativeType | StructT<string, any>;
type FieldKindToFieldObj<T extends FieldKind> =
  T extends NativeType
  ? StructField<T>
  : T extends StructT<string, any>
  ? InstanceType<T>
  : T;
type ArrayOfFieldsToObj<
  Arr extends Array<[string, FieldKind]>,
  Acc extends Record<string, FieldKind>
> = Arr extends []
  ? Acc
  : Arr extends [infer Head extends [string, FieldKind]]
  ? (Acc & { [K in Head[0]]: FieldKindToFieldObj<Head[1]> })
  : Arr extends [infer Head extends [string, FieldKind], ...infer Tail extends Array<[string, FieldKind]>]
  ? ArrayOfFieldsToObj<Tail, (Acc & { [K in Head[0]]: FieldKindToFieldObj<Head[1]> })>
  : Acc
  ;


type StructT<
  Name extends string,
  Fields extends Record<string, StructField<NativeType> | Record<string, unknown> | ((...args: any) => any)>
> = {
  name: Name;
  size: number;
  '@sizeof': number;
  sizeof: number;
  new(ptr: Pointer): Splat<BaseStruct & Fields & {
    readonly ptr: Pointer;
    readonly '@object': {
      [K in keyof Fields]: Fields[K] extends StructField<'ptr'>
      ? ReturnType<Fields[K]['get']>
      : Fields[K] extends StructField<Exclude<NativeType, 'ptr'>>
      ? ReturnType<Fields[K]['read']>
      : Fields[K] extends Struct<StructT<string, { '@transform': (...args: any) => any }>>
      ? ReturnType<Fields[K]['@transform']>
      : Fields[K] extends Struct<StructT<string, any>>
      ? Fields[K]['@object']
      : Fields[K] extends (...args: any[]) => any
      ? never
      : Fields[K];
    };
  }>;
};
type Struct<S extends StructT<string, any>> = InstanceType<S>;


type StructBuilder<
  Name extends string,
  Fields extends Record<string, StructField<any>>
> = {
  add_field<FName extends string, Type extends FieldKind>(
    field_name: FName, ref_flag: 'ref', field_type: Type
  ): StructBuilder<Name, Fields & { [K in FName]: FieldKindToFieldObj<Type>; }>;
  add_field<FName extends string, Type extends FieldKind>(
    field_name: FName, field_type: Type
  ): StructBuilder<Name, Fields & { [K in FName]: FieldKindToFieldObj<Type>; }>;

  add_fields<const NewFields extends Array<[string, FieldKind]>>(fields: NewFields): StructBuilder<Name, Fields & ArrayOfFieldsToObj<NewFields, {}>>;

  add_method<MName extends string, Fn extends (s: Struct<StructT<Name, Fields & { [K in MName]: StructMethod<Fn> }>>, ...args: any[]) => any>(method_name: MName, method_impl: Fn): StructBuilder<Name, Fields & { [K in MName]: StructMethod<Fn> }>;

  build(): StructT<Name, Fields>;
};


function read_zstring_from_memory(m: WebAssembly.Memory, ptr: Pointer): string {
  let buf: number[] = [];
  let cur: number = ptr;
  const buffer = new Uint8Array(m.buffer);
  while (buffer[cur] != 0) {
    buf.push(buffer[cur++]!);
  }
  return new TextDecoder().decode(Uint8Array.from(buf));
}

function count_zstring_length_from_memory(m: WebAssembly.Memory, ptr: Pointer): number {
  let cur: number = ptr;
  const buffer = new Uint8Array(m.buffer);
  while (buffer[cur] != 0) {
    ++cur;
  }
  return cur - ptr;
}

export function Factory(mod: WebAssembly.Instance) {
  const memory = mod.exports.memory as WebAssembly.Memory;

  const read_sized_string = (ptr: Pointer, size: number) => new TextDecoder().decode(new Uint8Array(memory.buffer.slice(ptr, ptr + size)));
  const read_zstring = read_zstring_from_memory.bind(undefined, memory);
  const count_zstring_len = count_zstring_length_from_memory.bind(undefined, memory);
  const struct_builder = create_struct_builder(memory);
  const deref = (ptr: Pointer) => new DataView(memory.buffer).getInt32(ptr, true) as Pointer;

  return {
    read_sized_string,
    read_zstring,
    count_zstring_len,
    struct_builder,
    deref,
  };
}

class BaseStruct {
  readonly '@sizeof': number;
  readonly ptr: Pointer;
  constructor(ptr: Pointer, bytes_size: number) {
    this.ptr = ptr;
    this["@sizeof"] = bytes_size;
  }

};

function get_size(item: 'ref' | FieldKind | StructT<string, {}>): number {
  if (typeof item === 'string') {
    switch (item) {
      case 'ref':
      case 'ptr':
      case 'i32':
      case 'u32':
      case 'f32':
      case 'zstring':
        return 4;
      case 'i64':
      case 'u64':
        return 8;
      case 'i8':
      case 'u8':
        return 1;
    }
  }
  return item["@sizeof"];
}

function create_struct_builder(mem: WebAssembly.Memory): {
  <SName extends string>(name: SName): StructBuilder<SName, {}>;
} {

  return <SName extends string>(name: SName) => {
    const fields: Array<{ name: string; size: number; create: (ptr: Pointer) => StructField<NativeType> | Struct<StructT<string, any>> }> = [];
    const methods: Array<{ name: string; fn: (s: any, ...args: any[]) => any; }> = [];
    const builder: StructBuilder<SName, {}> = {
      // @ts-ignore fuk u typescript
      add_field(name, f0: FieldKind | 'ref', f1) {
        const offset = fields.reduce((acc, fd) => acc + fd.size, 0);
        if (typeof f0 == 'string') {
          fields.push(create_field_setup({
            mem, name,
            offset,
            kind: f0,
            subkind: f1,
          }));
          return builder as any;
        }
        fields.push(create_field_setup({
          mem, name,
          offset,
          kind: f0,
        }));
        return builder as any;
      },

      add_fields(new_fields) {
        for (const [n, f] of new_fields) {
          this.add_field(n, f);
        }
        return builder as any;
      },

      add_method(name, fn) {
        methods.push({ name, fn, });
        return builder as any;
      },

      build() {
        const final_size = fields.reduce((acc, cur) => acc + cur.size, 0);
        const Struct = class extends BaseStruct {
          static override get name() { return name; };
          static get size() { return final_size; };
          static get sizeof() { return final_size; };
          static get '@sizeof'() { return final_size; };
          declare '@object': any;

          constructor(ptr: Pointer) {
            super(ptr, final_size);
            let transformer: (() => any) | null = null;
            for (const m of methods) {
              const fn = m.fn.bind(this, this);
              if (m.name === '@transform') {
                transformer = fn;
              }
              Object.defineProperty(this, m.name, {
                configurable: true,
                enumerable: false,
                writable: false,
                value: fn,
              });
            }

            for (const f of fields) {
              Object.defineProperty(this, f.name, {
                configurable: true,
                enumerable: true,
                writable: false,
                value: f.create(ptr),
              });
            }

            if (transformer == null) {
              Object.defineProperty(this, '@object', {
                configurable: true,
                enumerable: true,
                get() {
                  const obj = {} as Record<string, any>;
                  for (const f of fields) {
                    const n = f.name;
                    const o = (this as any)[n];
                    if ('@transform' in o) {
                      obj[n] = o['@transform']();
                      continue;
                    }
                    if ('@object' in o) {
                      obj[n] = o['@object'];
                      continue;
                    }
                    if ('get' in o) {
                      obj[n] = o.get();
                      continue;
                    }
                    obj[n] = o.read();
                  }
                  return obj;
                },
              });
            } else {
              Object.defineProperty(this, '@object', {
                configurable: true,
                enumerable: true,
                get() { return transformer(); },
              });
            }
          }
        };
        return Struct;
      },
    };
    return builder;
  };
}

type FieldSetup = { name: string; size: number; create: (ptr: Pointer) => StructField<NativeType> | Struct<StructT<string, any>> };

type CreateFieldSetupOpt = {
  mem: WebAssembly.Memory;
  offset?: number;
  name: string;
} & ({
  kind: 'ref';
  subkind: FieldKind;
} | {
  kind: FieldKind;
});

function create_field_setup(opt: CreateFieldSetupOpt): FieldSetup {
  const {
    mem, offset = 0, name,
  } = opt;
  if (typeof opt.kind == 'string') {
    const f0 = opt.kind;
    const size = get_size(f0);
    switch (f0) {
      case 'ref':
        const f1 = opt.subkind;
        const f1_setup = create_field_setup({ mem, name, kind: f1 });
        return ({
          name, size,
          create(base_ptr) {
            const ptr = new DataView(mem.buffer, base_ptr + offset).getInt32(0, true) as Pointer;
            return f1_setup.create(ptr);
          },
        });

      case 'ptr':
        return ({
          name, size,
          create(base_ptr) {
            const ptr = (base_ptr + offset) as Pointer;
            return {
              kind: 'ptr',
              get ptr() { return ptr },
              get: () => new DataView(mem.buffer, ptr).getInt32(0, true) as Pointer,
            };
          },
        });

      case 'zstring':
        return ({
          name, size,
          create(base_ptr) {
            const ptr = (base_ptr + offset) as Pointer;
            return {
              kind: 'zstring',
              get ptr() { return ptr; },
              read: read_zstring_from_memory.bind(undefined, mem, ptr),
              len: count_zstring_length_from_memory.bind(undefined, mem, ptr),
              bytes() {
                const len = count_zstring_length_from_memory(mem, ptr);
                return new Uint8Array(mem.buffer.slice(ptr, ptr + len));
              },
              overwrite(index, byte) {
                const len = count_zstring_length_from_memory(mem, ptr);
                if (index >= len) return false;
                if (index < 0) return false;
                const bytes = new Uint8ClampedArray(mem.buffer.slice(ptr, ptr + len));
                bytes[index] = byte;
                return true;
              },
            };
          },
        });

      case 'i32':
      case 'u32':
      case 'f32':
        return ({
          name, size,
          create: (base_ptr) => {
            const ptr = (base_ptr + offset) as Pointer;
            type ViewType = 'Int32' | 'Uint32' | 'Float32';
            let method_names: { reader: `get${ViewType}`; writer: `set${ViewType}`; };
            if (f0 == 'i32') {
              method_names = { reader: 'getInt32', writer: 'setInt32' };
            } else if (f0 == 'u32') {
              method_names = { reader: 'getUint32', writer: 'setUint32' };
            } else if (f0 == 'f32') {
              method_names = { reader: 'getFloat32', writer: 'setFloat32' };
            }
            return {
              kind: f0,
              get ptr() { return ptr },
              read() {
                const view = new DataView(mem.buffer, ptr);
                return view[method_names.reader](0, true);
              },
              write(n: number) {
                const view = new DataView(mem.buffer, ptr);
                view[method_names.writer](0, n, true);
              },
              bytes() {
                return new Uint8Array(mem.buffer.slice(ptr, ptr + 4));
              },
            };
          },
        });

      case 'i64':
      case 'u64':
        return ({
          name, size,
          create(base_ptr) {
            const ptr = (base_ptr + offset) as Pointer;
            type ViewType = 'BigInt64' | 'BigUint64';
            let method_names: { reader: `get${ViewType}`; writer: `set${ViewType}`; };
            if (f0 == 'i64') {
              method_names = { reader: 'getBigInt64', writer: 'setBigInt64' };
            } else {
              method_names = { reader: 'getBigUint64', writer: 'setBigUint64' };
            }

            return {
              kind: f0,
              get ptr() { return ptr },
              read() {
                const view = new DataView(mem.buffer, ptr);
                return view[method_names.reader](0, true);
              },
              write(n: number | bigint) {
                const view = new DataView(mem.buffer, ptr);
                if (typeof n == 'number') n = BigInt(n);
                return view[method_names.writer](0, n, true);
              },
              bytes() {
                return new Uint8Array(mem.buffer.slice(ptr, ptr + 8));
              },
            };
          },
        });

      case 'i8':
      case 'u8':
        return ({
          name, size,
          create: (base_ptr) => {
            const ptr = (base_ptr + offset) as Pointer;
            const get_buf = f0 == 'i8'
              ? () => new Int8Array(mem.buffer, ptr)
              : () => new Uint8Array(mem.buffer, ptr);
            const read = () => get_buf()[0]!;
            return {
              kind: f0,
              get ptr() { return ptr },
              read,
              write(n: number) {
                const buf = get_buf();
                buf[0] = n;
              },
            };
          },
        });

    }
  }
  const F0 = opt.kind;
  return ({
    name, size: F0["@sizeof"],
    create: ptr => new F0((ptr + offset) as Pointer),
  });
}



export function create_env<const T extends Record<string, (...args: any[]) => any>>(env: T): Record<string, (...args: any[]) => any> {
  return new Proxy(env, {
    get(target: any, property) {
      if (property in target) return target[property];
      return (...args: any[]) => {
        throw new Error(`'TODO: Implement ${String(property)} with args: [${args.join(', ')}]`);
      };
    }
  });
}
