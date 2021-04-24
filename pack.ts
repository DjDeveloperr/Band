export function pack(input: string, output: string) {
  const bin = Deno.readFileSync(input);
  Deno.writeTextFileSync(
    output,
    `const BINARY=new Uint8Array([${bin.join(",")}]);export default BINARY;`
  );
}

if (import.meta.main) {
  pack(Deno.args[0], Deno.args[1]);
}
