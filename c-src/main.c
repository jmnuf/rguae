#include <stddef.h>
#include <stdarg.h>

extern void *malloc(unsigned long);
extern void *realloc(void*, unsigned long);

extern void eprintn(char *buf);
extern size_t js_write_u32(char *buf, size_t buf_size, unsigned int n);
extern size_t js_write_i32(char *buf, size_t buf_size, int n);
extern size_t js_write_f32(char *buf, size_t buf_size, float n);

int str_eq(const char *a, const char *b) {
  int equal = 1;
  while (*a != 0 && *b != 0) {
    if (*a != *b) {
      return 0;
    }
    a += 1;
    b += 1;
  }
  return *a == *b;
}

size_t strlen(const char* s) {
  size_t len = 0;
  while (*s) {
    s++;
    len++;
  }
  return len;
}

typedef struct {
  size_t len;
  size_t cap;
  void **items;
} Void_List;

typedef struct {
  size_t len;
  size_t cap;
  char **items;
} ZStr_List;

typedef struct {
  size_t len;
  size_t cap;
  char *items;
} String_Builder;
#define sb_append_ch(sb, ch) list_append(sb, ch)
#define sb_append_null(sb) list_append(sb, 0)
#define sb_append(sb, str) zstr_foreach(str, __it) list_append(sb, *__it)
#define sb_append_i32(sb, i32) \
  do { \
    size_t n = js_write_i32((sb)->items + (sb)->len, (sb)->cap - (sb)->len, i32); \
    (sb)->len += n; \
  } while (0)

#define sb_append_u32(sb, u32) \
  do { \
    size_t n = js_write_u32((sb)->items + (sb)->len, (sb)->cap - (sb)->len, u32); \
    (sb)->len += n; \
  } while (0)


#define LIST_CAP_START 512

#define list_append(l, item)				\
  do {							\
    if ((l)->cap == (l)->len) {				\
      (l)->cap = (l)->cap == 0 ? 512 : ((l)->cap * 2);	\
      (l)->items = realloc((l)->items, (l)->cap);	\
    }							\
    (l)->items[(l)->len++] = (item);			\
  } while (0)

typedef struct {
  size_t count;
  char* data;
} String_View;

typedef struct {
  float x, y;
} Vec2;

typedef struct {
  size_t len;
  size_t cap;
  Vec2 *items;
} Vec2_List;

typedef struct {
  Vec2 pos;
  int w, h;
} Rect;

typedef struct {
  unsigned char r, g, b, a;
} Color_RGBa;
#define rgba(red,green,blue,alpha) ((Color_RGBa) { .r = red, .g = green, .b = blue, .a = alpha })
#define rgb(r,g,b) rgba(r,g,b, 255)

typedef struct {
  String_View title;
  Rect bounds;
} My_Window;

void My_Window_set_bounds(My_Window *window, int x, int y, int w, int h) {
  window->bounds.pos.x = x;
  window->bounds.pos.y = y;
  window->bounds.w = w;
  window->bounds.h = h;
}

extern void printn(char* message);
extern void printn_zstrs(ZStr_List*);
extern void printn_int(size_t);
extern void printnf_void_list(char *fmt, Void_List args);
extern void printn_sv(String_View* message);
extern void set_fill_rgba(Color_RGBa color);
extern void clear_screen();
extern void clear_background(Color_RGBa color);
extern void draw_rect(Rect bounds);
#define zstr_to_sv(zstr) ((String_View) { .count = strlen(zstr), .data = zstr })

#define zstr_foreach(zstr, it) for (char *it = zstr; it != NULL; ++it)

#define printnf(...) printnf_vargs(__VA_ARGS__, NULL)
void printnf_vargs(char *fmt, ...) {
  va_list args;
  static Void_List printnf_args = {0};
  static String_Builder extra_bytes = {0};
  printnf_args.len = 0;
  extra_bytes.len = 0;
  Void_List *a = &printnf_args;
  String_Builder *b = &extra_bytes;

  va_start(args, fmt);
  size_t i = 0;
  char c = 0;
  while ((c = fmt[i++]) != 0) {
    if (c != '%') continue;
    c = fmt[i++];
    if (c == '%') continue;
    switch (c) {
    case 's': {
      char *str = va_arg(args, char *);
      size_t idx = extra_bytes.len;
      if (str != NULL) {
	zstr_foreach(str, it) {
	  list_append(b, *it);
	}
      } else {
	sb_append_null(b);
      }
      list_append(a, &extra_bytes.items[idx]);
    } break;
    case 'b': {
      int data = va_arg(args, int);
      char byte = ((char*)(&data))[0];
      size_t idx = extra_bytes.len;
      list_append(b, byte);
      list_append(a, &extra_bytes.items[idx]);
    } break;
    case 'u': {
      unsigned int u = va_arg(args, unsigned int);
      size_t idx = extra_bytes.len;
      char *raw = (char *)&u;
      for (int i = 0; i < 4; ++i) sb_append_ch(b, raw[i]);
      list_append(a, &extra_bytes.items[idx]);
    } break;
    case 'i':
    case 'd': {
      int d = va_arg(args, int);
      size_t idx = extra_bytes.len;
      char *raw = (char *)&d;
      for (int i = 0; i < 4; ++i) sb_append_ch(b, raw[i]);
      list_append(a, &extra_bytes.items[idx]);
    } break;
    case 'F':
    case 'E':
    case 'e':
    case 'f': {
      float flt = (float)va_arg(args, double);
      size_t idx = extra_bytes.len;
      char *raw = (char *)&flt;
      for (int i = 0; i < 4; ++i) sb_append_ch(b, raw[i]);
      list_append(a, &extra_bytes.items[idx]);
    } break;
    case 'c': {
      int data = va_arg(args, int);
      char ch = ((char*)(&data))[0];
      size_t idx = extra_bytes.len;
      sb_append_ch(b, ch);
      list_append(a, &extra_bytes.items[idx]);
    } break;
    case '{': {
      void *ptr = va_arg(args, void*);
      size_t idx = extra_bytes.len;
      char *raw = (char *)&ptr;
      for (int i = 0; i < 4; ++i) sb_append_ch(b, raw[i]);
      list_append(a, &extra_bytes.items[idx]);
      while ((c = fmt[i++]) != '}') { }
      if (c != '}') eprintn("Missing closing brace in struct name format specifier");
    } break;
    case 'p': {
      void *ptr = va_arg(args, void*);
      size_t idx = extra_bytes.len;
      char *raw = (char *)&ptr;
      for (int i = 0; i < 4; ++i) sb_append_ch(b, raw[i]);
      list_append(a, &extra_bytes.items[idx]);
    } break;
    default:
      eprintn("Unsupported format specifier!");
      break;
    }
  }
  va_end(args);
  printnf_void_list(fmt, printnf_args);
}

Vec2 pos = {0};
Vec2 vel = { -100, 100 };
My_Window window = {0};

My_Window *get_window_handle(void) {
  return &window;
}

void init(void) {
  printn("Hello, world!");
  window.title = zstr_to_sv("Foo, Bar");

  pos.x = window.bounds.w / 2;
  pos.y = window.bounds.h / 2;

  Color_RGBa clr = rgba(51, 51, 51, 255);
  printnf("BG Color = %{Color_RGBa}", &clr);
  printnf("r = %b, g = %b, b = %b, a = %b", clr.r, clr.g, clr.b, clr.a);
  
  printn("Wtf bro!");
  clear_background(rgba(51, 51, 51, 255));
}

void draw(float dt) {
  clear_background(rgba(51, 51, 51, 250));
  Rect bounds = window.bounds;

  set_fill_rgba(rgb(255, 0, 0));
  Rect rect = {
    pos,
    100, 100
  };
  draw_rect(rect);
  float mult = -1.1;

  pos.x += vel.x * dt;
  if (pos.x + rect.w > bounds.w) {
    pos.x = bounds.w - rect.w - 0.25;
    vel.x *= mult;
  } else if (pos.x < 0) {
    pos.x = 0.05;
    vel.x *= mult;
  }

  pos.y += vel.y * dt;
  if (pos.y + rect.h > bounds.h) {
    pos.y = bounds.h - rect.h - 0.25;
    vel.y *= mult;
  } else if (pos.y < 0) {
    pos.y = 0.05;
    vel.y *= mult;
  }
}

