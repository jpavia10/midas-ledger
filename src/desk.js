/* Device-only marks for an open book.
   localStorage key is "midasDesk:" + the vault salt.
   This never touches midasKey and never rewrites the ciphertext. */

const PREFIX = "midasDesk:";
const NOTE_MAX = 2000;

let salt = "";
let storageImpl = null;
let listener = () => {};

function empty() {
  return { v: 1, cards: {} };
}

export function deskKey(nextSalt) {
  return PREFIX + (nextSalt || "");
}

export function configureDesk(nextSalt, storage) {
  salt = nextSalt || "";
  if (storage) storageImpl = storage;
}

export function onDeskChange(fn) {
  listener = typeof fn === "function" ? fn : () => {};
}

function emit() {
  listener();
}

export function browserStorage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch (e) { /* private mode */ }
  return null;
}

function storage() {
  return storageImpl || browserStorage();
}

export function normalizeEntry(raw) {
  const entry = raw && typeof raw === "object" ? raw : {};
  return {
    note: typeof entry.note === "string" ? entry.note.slice(0, NOTE_MAX) : "",
    pin: !!entry.pin,
    reviewed: typeof entry.reviewed === "string" ? entry.reviewed : ""
  };
}

export function readDesk(store, nextSalt) {
  const box = store || storage();
  if (!box) return empty();
  try {
    const raw = box.getItem(deskKey(nextSalt == null ? salt : nextSalt));
    if (!raw) return empty();
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || !data.cards || typeof data.cards !== "object") return empty();
    const cards = {};
    Object.keys(data.cards).forEach((id) => {
      const entry = normalizeEntry(data.cards[id]);
      if (entry.note || entry.pin || entry.reviewed) cards[id] = entry;
    });
    return { v: 1, cards };
  } catch (e) {
    return empty();
  }
}

export function writeDesk(store, nextSalt, desk) {
  const box = store || storage();
  if (!box) return;
  try {
    box.setItem(deskKey(nextSalt == null ? salt : nextSalt), JSON.stringify(desk));
  } catch (e) { /* private mode */ }
}

export function entryFor(id) {
  return normalizeEntry(readDesk().cards[id]);
}

export function updateCard(store, nextSalt, id, patch) {
  const desk = readDesk(store, nextSalt);
  const next = normalizeEntry({ ...normalizeEntry(desk.cards[id]), ...patch });
  if (!next.note && !next.pin && !next.reviewed) delete desk.cards[id];
  else desk.cards[id] = next;
  writeDesk(store, nextSalt, desk);
  return desk;
}

export function patchEntry(id, patch) {
  const desk = updateCard(storage(), salt, id, patch);
  emit();
  return normalizeEntry(desk.cards[id]);
}

export function formatReviewed(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
