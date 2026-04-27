/* oxlint-disable eslint/no-extend-native, unicorn/no-array-reverse, unicorn/no-array-sort */

const arrayPrototype = Array.prototype as Array<unknown> & {
  toReversed?: <T>(this: readonly T[]) => T[];
  toSorted?: <T>(this: readonly T[], compareFn?: (left: T, right: T) => number) => T[];
  toSpliced?: <T>(this: readonly T[], start: number, deleteCount?: number, ...items: T[]) => T[];
  with?: <T>(this: readonly T[], index: number, value: T) => T[];
};

function toReversed<T>(this: readonly T[]): T[] {
  return [...this].reverse();
}

function toSorted<T>(this: readonly T[], compareFn?: (left: T, right: T) => number): T[] {
  return [...this].sort(compareFn);
}

function toSpliced<T>(this: readonly T[], start: number, deleteCount?: number, ...items: T[]): T[] {
  const copy = [...this];
  if (arguments.length === 1) {
    copy.splice(start);
  } else if (arguments.length === 2) {
    copy.splice(start, deleteCount);
  } else {
    copy.splice(start, deleteCount ?? copy.length - start, ...items);
  }
  return copy;
}

function arrayWith<T>(this: readonly T[], index: number, value: T): T[] {
  const copy = [...this];
  const normalizedIndex = Math.trunc(index);
  const actualIndex = normalizedIndex >= 0 ? normalizedIndex : copy.length + normalizedIndex;
  if (actualIndex < 0 || actualIndex >= copy.length) {
    throw new RangeError("Array index out of range");
  }
  copy[actualIndex] = value;
  return copy;
}

if (!arrayPrototype.toReversed) {
  Object.defineProperty(Array.prototype, "toReversed", {
    configurable: true,
    writable: true,
    value: toReversed,
  });
}

if (!arrayPrototype.toSorted) {
  Object.defineProperty(Array.prototype, "toSorted", {
    configurable: true,
    writable: true,
    value: toSorted,
  });
}

if (!arrayPrototype.toSpliced) {
  Object.defineProperty(Array.prototype, "toSpliced", {
    configurable: true,
    writable: true,
    value: toSpliced,
  });
}

if (!arrayPrototype.with) {
  Object.defineProperty(Array.prototype, "with", {
    configurable: true,
    writable: true,
    value: arrayWith,
  });
}
