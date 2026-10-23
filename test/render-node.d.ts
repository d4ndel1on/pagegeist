// Minimal Node typings for the render-* tests (the project does not load @types/node globally).
declare module 'node:fs' {
  export function writeFileSync(path: string, data: string): void;
}
declare module 'node:os' {
  export function tmpdir(): string;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
}
