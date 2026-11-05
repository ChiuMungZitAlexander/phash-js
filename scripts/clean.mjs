import { rm } from "node:fs/promises";
import { basename, join } from "node:path";

const workspace = process.cwd();
if (!["core", "client", "server"].includes(basename(workspace))) {
  throw new Error("Run clean from a library workspace.");
}
await rm(join(workspace, "dist"), { recursive: true, force: true });
