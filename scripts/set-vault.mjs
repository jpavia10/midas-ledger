/* Replace the encrypted book in index.html.
   Usage: node scripts/set-vault.mjs vault.json
   vault.json is { v, iter, salt, iv, ct }. No password, no plaintext. */
import crypto from "crypto";
import fs from "fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/set-vault.mjs vault.json");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));
for (const key of ["v", "iter", "salt", "iv", "ct"]) {
  if (data[key] == null || data[key] === "") {
    console.error("missing " + key);
    process.exit(1);
  }
}
if (!Number.isFinite(data.iter) || data.iter < 1) {
  console.error("bad iter");
  process.exit(1);
}

const json = JSON.stringify({
  v: data.v,
  iter: data.iter,
  salt: data.salt,
  iv: data.iv,
  ct: data.ct
});
if (json.includes("</")) {
  console.error("vault JSON cannot include </");
  process.exit(1);
}

const indexPath = new URL("../index.html", import.meta.url);
let html = fs.readFileSync(indexPath, "utf8");
const re = /(<script id="vault" type="application\/json">)[\s\S]*?(<\/script>)/;
if (!re.test(html)) {
  console.error("vault script not found in index.html");
  process.exit(1);
}
html = html.replace(re, "$1" + json + "$2");
fs.writeFileSync(indexPath, html);

const hash = crypto.createHash("sha256").update(data.ct).digest("hex");
const testPath = new URL("../test/vault.test.mjs", import.meta.url);
let test = fs.readFileSync(testPath, "utf8");
const hashRe = /const EXPECTED_CT_SHA256 = "[a-f0-9]+";/;
if (!hashRe.test(test)) {
  console.error("could not update EXPECTED_CT_SHA256");
  process.exit(1);
}
const next = test.replace(hashRe, `const EXPECTED_CT_SHA256 = "${hash}";`);
fs.writeFileSync(testPath, next);
console.log("vault updated (ct " + data.ct.length + " chars, iter " + data.iter + ")");
