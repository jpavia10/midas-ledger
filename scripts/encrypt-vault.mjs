/* Encrypt a book JSON to { v, iter, salt, iv, ct } for scripts/set-vault.mjs.
   Password is read from LEDGER_PAGE_PASSWORD. It is never written.
   AES-256-GCM auth tag is appended the way WebCrypto's encrypt() does. */
import crypto from "crypto";
import fs from "fs";

const file = process.argv[2];
const out = process.argv[3];
const pw = process.env.LEDGER_PAGE_PASSWORD || "";
if (!file || !out || !pw) {
  console.error("usage: LEDGER_PAGE_PASSWORD=… node scripts/encrypt-vault.mjs book.json vault.json");
  process.exit(1);
}

const plain = fs.readFileSync(file);
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const iter = 600000;
const key = crypto.pbkdf2Sync(pw, salt, iter, 32, "sha256");
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const ct = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
const vault = {
  v: 1,
  iter,
  salt: salt.toString("base64"),
  iv: iv.toString("base64"),
  ct: ct.toString("base64")
};
if (JSON.stringify(vault).includes("</")) {
  console.error("vault JSON cannot include </");
  process.exit(1);
}
fs.writeFileSync(out, JSON.stringify(vault));
console.log("encrypted " + plain.length + " bytes → " + out + " (ciphertext only)");
