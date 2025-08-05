#include <stddef.h>

typedef struct {
  size_t len;
  size_t cap;
  char *items;
} String_Builder;

extern void js_printn_zstr_array(char **messages);
extern int js_write_int(char *buf, size_t buf_len, int n);
extern int js_printn_int(int n);
extern int js_printn_flt(float n);
extern int js_crash(char *message);
extern float randf(void);
#define printn(...) js_printn_zstr_array(((char*[]) { __VA_ARGS__, NULL }))

#define MEM_SIZE (1024*2*2)
static char MEM[MEM_SIZE];

#define sb_append_ch(sb, ch) \
  do { \
    if ((sb)->len == (sb)->cap) js_crash("Out of Memory"); \
    (sb)->items[(sb)->len++] = ch; \
  } while (0)
#define sb_append_null(sb) sb_append_ch(sb, ((char)0))
#define sb_append(sb, str) iter_str(str, __it) sb_append_ch(sb, *__it)
#define iter_str(zstr, it) for (char *it = zstr; *it != 0; ++it)

int main() {
  char *a = "a-b-c-d-e";
  char *b = "1-2-3-4-5";
  printn(a, b);

  String_Builder sb = { .cap = 1024, .items = MEM };
  sb_append(&sb, "This is a number: ");
  sb.len += js_write_int(sb.items + sb.len, MEM_SIZE - sb.len, 69);
  sb_append_ch(&sb, '.');
  sb_append_null(&sb);
  printn("Built text:", sb.items);

  printn("Hello, World!");
  js_printn_flt(randf());
}
