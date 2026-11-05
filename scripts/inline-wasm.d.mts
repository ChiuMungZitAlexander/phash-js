export default function inlineWasm(): {
  name: string;
  enforce: "pre";
  resolveId(source: string, importer?: string): string | null;
  load(id: string): string | null;
  transform(code: string, id: string): { code: string; map: null } | null;
};
