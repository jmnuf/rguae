
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export const Result = {
  Ok<T, E>(value: T): Result<T, E> {
    return { ok: true, value };
  },
  Err<T, E>(error: E): Result<T, E> {
    return { ok: false, error };
  },
} as const;

export const tryAsync = <T>(asyncFunc: () => Promise<T>): Promise<Result<T, Error>> =>
  asyncFunc()
    .then(value => Result.Ok<T, Error>(value))
    .catch(error => Result.Err(error as Error));

export const trySync = <T, E = Error>(syncFunc: () => T): Result<T, E> => {
  try {
    const value = syncFunc();
    return Result.Ok(value);
  } catch (error) {
    return Result.Err(error as E);
  }
}

