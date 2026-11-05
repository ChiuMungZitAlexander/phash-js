import { phash } from "@phash-js/client";

declare global {
  interface Window {
    clientPhash: typeof phash;
  }
}

window.clientPhash = phash;
