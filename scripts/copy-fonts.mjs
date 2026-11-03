import fs from "fs";
import path from "path";

const root = path.resolve("node_modules/@fontsource/outfit/files");
const out = path.resolve("fonts");
fs.mkdirSync(out, { recursive: true });

const wanted = fs.readdirSync(root).filter((name) =>
  /^outfit-latin(?:-ext)?-(300|400|500)-normal\.woff2$/.test(name)
);

if (wanted.length !== 6) {
  console.error("expected 6 Outfit woff2 files, found " + wanted.length);
  process.exit(1);
}

for (const name of wanted) {
  fs.copyFileSync(path.join(root, name), path.join(out, name));
}

fs.copyFileSync(
  path.resolve("node_modules/@fontsource/outfit/LICENSE"),
  path.join(out, "OFL.txt")
);

console.log(wanted.sort().join("\n"));
