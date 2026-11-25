/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set by vite.config.ts `define` — true in the `public` build mode (src/mode.ts). */
  readonly PUBLIC_BUILD: boolean;
}
