export type Ok<T> = { readonly _tag: "ok"; readonly value: T };
export type Err<E> = { readonly _tag: "err"; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { _tag: "ok", value };
}

export function err<E>(error: E): Err<E> {
  return { _tag: "err", error };
}

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r._tag === "ok";
}

export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return r._tag === "err";
}
