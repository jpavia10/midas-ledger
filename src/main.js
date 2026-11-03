import { startField } from "./particles.js";
import { bindNav, mountLedger, presentBook } from "./ledger.js";

export { presentBook };

const canvas = document.getElementById("field");

if (canvas) {
  try {
    startField(canvas);
    document.documentElement.classList.add("has-gl");
  } catch (error) {
    document.documentElement.classList.add("no-gl");
    console.warn("Particle field unavailable", error);
  }
}

bindNav();

let vault = null;
const vaultEl = document.getElementById("vault");
if (vaultEl) {
  try {
    vault = JSON.parse(vaultEl.textContent);
  } catch (error) {
    vault = null;
  }
}

mountLedger(vault);

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  });
}
