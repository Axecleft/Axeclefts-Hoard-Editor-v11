/**
 * Axecleft's Hoard Editor — build, save and edit treasure hoards for D35E.
 *
 * A hoard is an NPC actor in the "Hoards" Actors folder, opened on D35E's loot sheet, with a random chest
 * as its portrait and token. The Hoards tab of the Axecleft Treasure Generator (shipped by Axecleft's
 * Gemstones, Armory and Curios) lists its contents and coins with their values, compares the total with the
 * SRD treasure per encounter for an encounter level, rolls SRD treasure into it, shares it out among the
 * party, and saves it to a file or loads one.
 *
 * API: game.modules.get("axeclefts-hoards").api = { create, list, value, weight, sellValue, rollInto, fillToTarget, split, give,
 *   gather, place, setTrap, trapOf, exportHoard, importHoard, open }
 */
const MOD = "axeclefts-hoards";
const FOLDER = /*t*/"Hoards";
const SHEET = "D35E.ActorSheetPFNPCLoot";
const TAB_ID = `t-${MOD}-hoards`;
const T = () => globalThis.AxecleftTreasure;
const A = () => globalThis.AxecleftTools;
const fmt = (s, d) => (d ? String(s).replace(/\{(\w+)\}/g, (m, k) => (d[k] ?? m)) : String(s));
const t = (s, d) => A()?.t?.(s, d) ?? fmt(s, d);
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const H = (s, d) => esc(t(s, d));
const num = (n) => { const l = A()?.i18n?.lang; return Number(n).toLocaleString(l && l !== "en" ? l : "en-US", { maximumFractionDigits: 2 }); };
const gp = (n) => t("{n} gp", { n: num(Math.round(Number(n) * 100) / 100) });
const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel ?? "") ? " selected" : ""}>${esc(label)}</option>`;
const Dlg = () => A()?.DialogV2 ?? foundry.applications?.api?.DialogV2;
/** A long list in a confirmation window scrolls inside this box, so the window's buttons stay on screen. */
const scrollBox = (html) => `<div class="ahe-scroll" style="max-height: 55vh; overflow-y: auto; margin-bottom: 4px;">${html}</div>`;

A()?.registerLanguageModule?.(MOD); // lang/<code>.json, and the Tool Suite button in this module's settings

/** Foundry's own fantasy chests (icons/containers/chest), the same on Foundry v11 to v14. */
const CHESTS = ["chest-elm-steel-brown", "chest-elm-steel-tan", "chest-oak-steel-brown", "chest-reinforced-box-brown", "chest-reinforced-elm-steel-tan",
  "chest-reinforced-steel-brown", "chest-reinforced-steel-cherry", "chest-reinforced-steel-green", "chest-reinforced-steel-oak-tan", "chest-reinforced-steel-pink",
  "chest-reinforced-steel-red", "chest-reinforced-steel-tan", "chest-reinforced-steel-walnut-brown", "chest-reinforced-stone", "chest-simple-box-blue",
  "chest-simple-box-brown", "chest-simple-box-gold-brown", "chest-simple-box-red", "chest-simple-box-steel-brown", "chest-simple-elm-tan",
  "chest-simple-oak-steel-brown", "chest-simple-purple", "chest-simple-steel-brown", "chest-simple-steel-orange", "chest-simple-walnut",
  "chest-small-gold-cherry", "chest-steel-purple", "chest-wooden-tied-white", "chest-worn-oak-tan"].map((n) => `icons/containers/chest/${n}.webp`);
const randomChest = (not = null) => { const pool = CHESTS.filter((c) => c !== not); return pool[Math.floor(Math.random() * pool.length)]; };

/** SRD "Treasure per Encounter" by Encounter Level 1–20 (gp). */
const SRD_TREASURE = [300, 600, 900, 1200, 1600, 2000, 2600, 3400, 4500, 5800, 7500, 9800, 13000, 17000, 22000, 28000, 36000, 47000, 61000, 80000];
const targetFor = (el) => SRD_TREASURE[Math.min(20, Math.max(1, Number(el) || 1)) - 1];

const STD = ["pp", "gp", "sp", "cp"];
const STD_VALUE = { pp: 10, gp: 1, sp: 0.1, cp: 0.01 };
/** D35E item types that are things you can carry (natural attacks, feats, spells and buffs are other types). */
const PHYSICAL = ["weapon", "equipment", "consumable", "loot", "valuable"];
const SELL_PCT = 50; // SRD: adventurers sell gear at half its value; gems, art and trade goods at full value

/* -------------------------------------------- */
/*  Coins                                       */
/* -------------------------------------------- */

/** D35E's custom currencies: [{ id, name, weight (lb per coin), value (gp) }], from its Currency Configuration. */
function customCurrencies() {
  let rows = [];
  try { rows = game.settings.get("D35E", "currencyConfig")?.currency ?? []; } catch (e) { /* setting missing */ }
  const names = T()?.currencies?.().custom ?? [];
  return rows.filter((c) => Array.isArray(c) && String(c[0] ?? "").trim()).map((c) => ({
    id: String(c[0]), name: names.find((n) => n.id === String(c[0]))?.name ?? String(c[1] || c[0]), weight: Number(c[2]) || 0, value: Number(c[3]) || 0,
  }));
}

/**
 * Every coin purse of an actor as a path: "currency.gp" (carried), "altCurrency.gp" (weightless) and
 * "customCurrency.<id>" (D35E custom currencies). [{ path, label, value (gp each), weight (lb each), alt }]
 */
function coinKinds() {
  const name = (k) => T()?.currencies?.().name(k) ?? k;
  return [
    ...STD.map((k) => ({ path: `currency.${k}`, key: k, label: name(k), value: STD_VALUE[k], weight: 1 / 50, alt: false, custom: false })),
    ...STD.map((k) => ({ path: `altCurrency.${k}`, key: k, label: `${name(k)} *`, value: STD_VALUE[k], weight: 0, alt: true, custom: false })),
    ...customCurrencies().map((c) => ({ path: `customCurrency.${c.id}`, key: c.id, label: c.name, value: c.value, weight: c.weight, alt: false, custom: true })),
  ];
}
const coinsOf = (actor, path) => Math.max(0, Math.floor(Number(foundry.utils.getProperty(actor?.system ?? {}, path)) || 0));
/** "12 gp, 3 sp*, 40 Trade bars" for { path: n }. */
function coinText(coins) {
  const kinds = coinKinds();
  return Object.entries(coins).filter(([, n]) => n).map(([p, n]) => `${num(n)} ${kinds.find((k) => k.path === p)?.label ?? p.split(".").pop()}`).join(", ");
}

/* -------------------------------------------- */
/*  Weight                                      */
/* -------------------------------------------- */

const metric = () => { try { return game.settings.get("D35E", "units") === "metric"; } catch (e) { return false; } };
/** A weight in lb shown in the world's units (D35E's units setting: metric halves it). */
const wt = (lb) => t(metric() ? "{n} kg" : "{n} lb", { n: num(Math.round(Number(lb) * (metric() ? 0.5 : 1) * 10) / 10) });
const itemWeight = (item) => (Number(item.system?.weight?.value ?? item.system?.weight) || 0) * Math.max(0, Number(item.system?.quantity ?? 1) || 0);
/** { coins, items, total } in lb, as D35E counts it: 50 carried coins a pound, custom coins by their weight, weightless coins nothing. */
function weight(actor) {
  let coins = 0;
  for (const k of coinKinds()) if (k.weight) coins += coinsOf(actor, k.path) * k.weight;
  let items = 0;
  for (const it of actor.items) items += itemWeight(it);
  return { coins, items, total: coins + items };
}

/* -------------------------------------------- */
/*  Hoards                                      */
/* -------------------------------------------- */

const isHoard = (a) => !!a?.getFlag?.(MOD, "hoard");
const list = () => [...(game.actors ?? [])].filter(isHoard).sort((a, b) => a.name.localeCompare(b.name));
const info = (a) => a?.getFlag?.(MOD, "hoard") ?? {};

async function hoardFolder() {
  const names = [FOLDER, t(FOLDER)];
  return game.folders.find((f) => f.type === "Actor" && names.includes(f.name)) ?? Folder.create({ name: t(FOLDER), type: "Actor", color: "#8a6a1f" });
}

/** A new, empty hoard: an NPC on the loot sheet with a random chest. */
async function create({ name = null, el = null, img = null, lootable = false } = {}) {
  const folder = await hoardFolder();
  const pic = img || randomChest();
  const n = String(name ?? "").trim() || t("Hoard {n}", { n: list().length + 1 });
  const actor = await CONFIG.Actor.documentClass.create({
    name: n, type: "npc", img: pic, folder: folder.id,
    ownership: { default: lootable ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    prototypeToken: { name: n, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL, texture: { src: pic } },
    flags: { core: { sheetClass: SHEET }, D35E: { lootsheettype: "Loot" }, [MOD]: { hoard: { el: el ?? null, created: Date.now() } } },
  });
  return actor;
}

/* -------------------------------------------- */
/*  Value                                       */
/* -------------------------------------------- */

const GOODS_PROVIDER = /^axecleft-gemstones\./;
/** Goods (gems, art, jewelry, books) or items. */
function partOf(item) {
  const gen = item.flags?.["axecleft-gemstones"]?.generated;
  if (gen && ["gem", "art", "jewelry"].includes(gen.kind)) return "goods";
  if (item.type === "valuable") return "goods";
  const tags = (item.system?.tags ?? []).map((x) => String(Array.isArray(x) ? x[0] : x).toLowerCase());
  if (item.type === "loot" && (["tradeGoods", "gem"].includes(item.system?.subType) || tags.some((x) => ["gem", "artwork", "jewelry", "book"].includes(x)))) return "goods";
  return "items";
}
const itemValue = (item) => (Number(item.system?.price) || 0) * Math.max(0, Number(item.system?.quantity ?? 1) || 0);

/** The coins in a hoard's purses (standard, weightless and D35E custom currencies) in gp. */
function coinValue(actor) {
  return coinKinds().reduce((sum, k) => sum + coinsOf(actor, k.path) * k.value, 0);
}

/** { coins, goods, items, total } in gp. */
function value(actor) {
  const v = { coins: coinValue(actor), goods: 0, items: 0 };
  for (const it of actor.items) v[partOf(it)] += itemValue(it);
  v.total = v.coins + v.goods + v.items;
  return v;
}

/** The items' sell rate (% of value) for a hoard: SRD half by default, saved with the hoard. */
const sellPct = (actor) => { const p = Number(info(actor).sellPct); return Number.isFinite(p) && p >= 0 ? p : SELL_PCT; };
/** What the hoard fetches when sold (SRD): coins as they are, gems, art and trade goods at full value, other items at the sell rate. */
function sellValue(actor, pct = sellPct(actor)) {
  const v = value(actor);
  return v.coins + v.goods + v.items * (pct / 100);
}

/* -------------------------------------------- */
/*  Adding treasure                             */
/* -------------------------------------------- */

/** Put rolled entries ({ data } items and { coins }) into the hoard: values rolled, coins paid as the Treasure by Level tab is set. */
async function addEntries(actor, entries) {
  const hub = T();
  const coins = { pp: 0, gp: 0, sp: 0, cp: 0 }, data = [];
  let missing = 0;
  for (const e of entries) {
    if (e.coins) { for (const [k, v] of Object.entries(e.coins)) coins[k] = (coins[k] ?? 0) + (Number(v) || 0); continue; }
    let d = e.data;
    if (!d && e.ref && e.provider) { try { d = await hub.registry?.providers?.get(e.provider)?.recreate?.(e.ref); } catch (err) { d = null; } }
    if (!d || e.placeholder) { missing++; continue; }
    data.push(await hub.rollCreationChanges(foundry.utils.deepClone(d)));
  }
  const made = data.length ? await actor.createEmbeddedDocuments("Item", data) : [];
  let paidText = "";
  if (Object.values(coins).some((v) => v)) {
    const cfg = hub.coinSettings(), paid = hub.convertCoins(coins, cfg), upd = {};
    for (const k of STD) if (paid.std[k]) upd[`system.${cfg.purse}.${k}`] = (Number(actor.system?.[cfg.purse]?.[k]) || 0) + paid.std[k];
    for (const [id, n] of Object.entries(paid.custom)) if (n) upd[`system.customCurrency.${id}`] = (Number(actor.system?.customCurrency?.[id]) || 0) + n;
    if (Object.keys(upd).length) await actor.update(upd);
    paidText = paid.text;
  }
  return { made, coins: paidText, missing };
}

/** Roll the SRD Treasure table for an encounter level `times` times into the hoard. */
async function rollInto(actor, { el = 1, times = 1, coins = true, goods = true, items = true, chat = true } = {}) {
  const hub = T();
  if (!hub?.rollTreasure) throw new Error(t("The Treasure Generator isn't available: activate Axecleft's Gemstones, Armory or Curios."));
  const notes = [], entries = [];
  for (let i = 0; i < Math.max(1, Number(times) || 1); i++) {
    const r = await hub.rollTreasure(el, { coins, goods, items }, { actor });
    entries.push(...r.entries);
    notes.push(...r.notes);
  }
  const res = await addEntries(actor, entries);
  if (chat) await report(actor, t("Treasure, EL {level}", { level: el }), res, notes);
  return { ...res, notes };
}

/** Keep rolling SRD treasure for the encounter level until the hoard reaches the SRD treasure value (at most 25 rolls). */
async function fillToTarget(actor, { el = info(actor).el || 1, max = 25 } = {}) {
  const target = targetFor(el), all = { made: [], coins: [], missing: 0 }, notes = [];
  let rolls = 0;
  while (value(actor).total < target && rolls < max) {
    const r = await rollInto(actor, { el, chat: false });
    all.made.push(...r.made); if (r.coins) all.coins.push(r.coins); all.missing += r.missing;
    notes.push(...r.notes);
    rolls++;
  }
  await report(actor, t("Filled to EL {level}: {n} rolls", { level: el, n: rolls }), { made: all.made, coins: all.coins.join("; "), missing: all.missing }, []);
  return { rolls, total: value(actor).total, target };
}

/** A chat card for the GM: what went into the hoard. */
async function report(actor, title, { made = [], coins = "", missing = 0 }, notes = []) {
  const items = made.map((i) => `<li>@UUID[${i.uuid}]{${esc(i.name)}} <small>${esc(gp(itemValue(i)))}</small></li>`).join("");
  const v = value(actor);
  const content = `<h3>${esc(actor.name)}: ${esc(title)}</h3>${notes.length ? `<p><small>${notes.map(esc).join("; ")}</small></p>` : ""}`
    + (coins ? `<p>${H("Coins: {coins}", { coins })}</p>` : "") + (items ? `<ol>${items}</ol>` : "")
    + (missing ? `<p><small>${H("{n} item(s) need a module that isn't active and were skipped.", { n: missing })}</small></p>` : "")
    + `<p><strong>${H("Hoard total: {total}", { total: gp(v.total) })}</strong></p>`;
  return ChatMessage.create({ content, whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id), speaker: { alias: t("Hoard Editor") } });
}

/** Copy dropped items (sidebar, compendium or another sheet) into the hoard. */
async function addDropped(actor, data) {
  if (data?.type !== "Item" || !data.uuid) return ui.notifications.warn(t("Drop an item from the Items sidebar, a compendium or a sheet."));
  const doc = await fromUuid(data.uuid);
  if (!doc) return;
  const obj = doc.toObject();
  delete obj._id;
  await actor.createEmbeddedDocuments("Item", [await T().rollCreationChanges(obj)]);
}

/* -------------------------------------------- */
/*  Sharing out                                 */
/* -------------------------------------------- */

/**
 * The party: actors marked "Party Member" (D35E system.isPartyMember) with a token on the current scene; if none,
 * every party member in the world; if none, the characters players own. Whether a player owns them or is online doesn't matter.
 * [{ key, name, actor, where }]
 */
let members = new Map();
function party() {
  const out = new Map();
  const add = (actor, where) => { if (actor && !isHoard(actor) && !out.has(actor.uuid)) out.set(actor.uuid, { key: actor.uuid, name: actor.name, actor, where }); };
  for (const tk of globalThis.canvas?.scene?.tokens ?? []) if (tk.actor?.system?.isPartyMember) add(tk.actor, "scene");
  if (!out.size) for (const a of game.actors ?? []) if (a.system?.isPartyMember) add(a, "world");
  if (!out.size) for (const a of game.actors ?? []) if (a.type === "character" && a.hasPlayerOwner) add(a, "players");
  members = out;
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Move items between actors: picks [{ item, qty }] (qty: how many of the stack; the whole stack when left out).
 * The copies lose their creation changes (already rolled) and any token-loot mark; what's left of a stack stays behind.
 */
async function moveItems(from, to, picks) {
  const data = [], upd = [], del = [];
  const taken = new Map();
  for (const { item, qty } of picks) {
    if (!item) continue;
    const have = Math.max(0, Number(item.system?.quantity ?? 1) || 0);
    const n = Math.min(have || 1, Math.max(1, Math.floor(Number(qty ?? have) || have || 1)));
    const o = item.toObject(); delete o._id;
    if (item.system?.quantity !== undefined) foundry.utils.setProperty(o, "system.quantity", n);
    foundry.utils.setProperty(o, "system.creationChanges", []);
    if (o.flags?.world?.axecleftLoot) delete o.flags.world.axecleftLoot; // the Treasure Generator's token-loot mark
    data.push(o);
    taken.set(item.id, (taken.get(item.id) ?? 0) + n);
  }
  for (const [id, n] of taken) {
    const it = from.items.get(id); if (!it) continue;
    const left = (Number(it.system?.quantity ?? 1) || 1) - n;
    if (it.system?.quantity !== undefined && left > 0) upd.push({ _id: id, "system.quantity": left }); else del.push(id);
  }
  if (data.length) await to.createEmbeddedDocuments("Item", data);
  if (upd.length) await from.updateEmbeddedDocuments("Item", upd);
  if (del.length) await from.deleteEmbeddedDocuments("Item", del);
}

/** Move coins ({ path: n }) between actors, never below 0. */
async function moveCoins(from, to, coins) {
  const fu = {}, tu = {};
  for (const [path, want] of Object.entries(coins)) {
    const n = Math.min(coinsOf(from, path), Math.max(0, Math.floor(Number(want) || 0)));
    if (!n) continue;
    fu[`system.${path}`] = coinsOf(from, path) - n;
    tu[`system.${path}`] = coinsOf(to, path) + n;
  }
  if (Object.keys(tu).length) { await to.update(tu); await from.update(fu); }
}

/**
 * Coins asked for → { path: n } the hoard actually has. Keys are purse paths ("currency.gp", "customCurrency.bar"),
 * or a bare standard coin ("gp"), taken from the carried coins first, then the weightless ones.
 */
function takeCoins(actor, coins = {}) {
  const take = {};
  for (const [key, raw] of Object.entries(coins)) {
    let want = Math.max(0, Math.floor(Number(raw) || 0));
    if (!want) continue;
    const paths = key.includes(".") ? [key] : [`currency.${key}`, `altCurrency.${key}`];
    for (const path of paths) {
      if (!want) break;
      const n = Math.min(coinsOf(actor, path) - (take[path] ?? 0), want);
      if (n > 0) { take[path] = (take[path] ?? 0) + n; want -= n; }
    }
  }
  return take;
}

/**
 * Give items and coins from the hoard to one character. items: item ids (whole stacks) or [{ id, qty }];
 * coins: { "gp": 40, "customCurrency.bar": 2, … }.
 */
async function give(actor, target, items = [], coins = {}) {
  const picks = items.map((x) => (typeof x === "string" ? { item: actor.items.get(x) } : { item: actor.items.get(x.id), qty: x.qty })).filter((p) => p.item);
  for (const p of picks) { const q = Math.max(1, Number(p.item.system?.quantity ?? 1) || 1); p.qty = Math.min(q, Math.max(1, Math.floor(Number(p.qty ?? q) || q))); }
  const take = takeCoins(actor, coins);
  if (!picks.length && !Object.keys(take).length) { ui.notifications.warn(t("Tick items in the Contents list, or enter coins, to give.")); return false; }
  const each = (it) => Number(it.system?.price) || 0, lbEach = (it) => Number(it.system?.weight?.value ?? it.system?.weight) || 0;
  let lb = Object.entries(take).reduce((s, [p, n]) => s + n * (coinKinds().find((k) => k.path === p)?.weight ?? 0), 0);
  const lines = picks.map(({ item, qty }) => { lb += lbEach(item) * qty; return `<li>${esc(qty > 1 ? `${item.name} ×${qty}` : item.name)} <small>${esc(gp(each(item) * qty))}</small></li>`; }).join("");
  const coinLine = coinText(take);
  const content = `<p>${H("Give to {name}:", { name: target.name })}</p>${scrollBox(`<ul>${lines}${coinLine ? `<li>${esc(coinLine)}</li>` : ""}</ul>`)}`
    + `<p class="hint">${H("Weight: {weight}", { weight: wt(lb) })}</p>`;
  const ok = await Dlg().confirm({ window: { title: t("Give from {name}", { name: actor.name }) }, content });
  if (!ok) return false;
  await moveItems(actor, target, picks);
  await moveCoins(actor, target, take);
  ui.notifications.info(t("Given to {name}.", { name: target.name }));
  return true;
}

/**
 * Plan a fair split: each denomination of coins evenly (what doesn't divide stays in the hoard), items one by one,
 * most valuable first, to whoever has the least so far (a stack of up to 50 is shared item by item).
 */
function planSplit(actor, actors, { coins = true, items = true } = {}) {
  const shares = actors.map((a) => ({ actor: a, coins: {}, items: [], value: 0, weight: 0 }));
  if (!shares.length) return { shares, leftCoins: {} };
  const leftCoins = {};
  if (coins) for (const k of coinKinds()) {
    const n = coinsOf(actor, k.path);
    if (!n) continue;
    const each = Math.floor(n / shares.length), rest = n - each * shares.length;
    if (each) for (const s of shares) { s.coins[k.path] = each; s.value += each * k.value; s.weight += each * k.weight; }
    if (rest) leftCoins[k.path] = rest;
  }
  if (items) {
    const units = [];
    for (const it of actor.items) {
      const q = Math.max(1, Number(it.system?.quantity ?? 1) || 1), each = Number(it.system?.price) || 0, lb = Number(it.system?.weight?.value ?? it.system?.weight) || 0;
      if (q <= 50) for (let i = 0; i < q; i++) units.push({ item: it, qty: 1, value: each, weight: lb });
      else units.push({ item: it, qty: q, value: each * q, weight: lb * q });
    }
    units.sort((a, b) => b.value - a.value);
    for (const u of units) {
      const s = shares.reduce((lo, x) => (x.value < lo.value ? x : lo), shares[0]);
      const have = s.items.find((x) => x.item === u.item);
      if (have) have.qty += u.qty; else s.items.push({ item: u.item, qty: u.qty });
      s.value += u.value; s.weight += u.weight;
    }
  }
  return { shares, leftCoins };
}

/** Carry out a planned split: items and coins move from the hoard to each character. */
async function applySplit(actor, plan) {
  for (const s of plan.shares) {
    if (s.items.length) await moveItems(actor, s.actor, s.items);
    if (Object.keys(s.coins).length) await moveCoins(actor, s.actor, s.coins);
  }
}

async function split(actor, actors, opts = {}) {
  const plan = planSplit(actor, actors, opts);
  if (!plan.shares.length) return ui.notifications.warn(t("Choose at least one character."));
  const rows = plan.shares.map((s) => `<tr><td><strong>${esc(s.actor.name)}</strong></td><td>${esc(coinText(s.coins) || "—")}</td>
    <td>${s.items.map(({ item, qty }) => esc(qty > 1 ? `${item.name} ×${qty}` : item.name)).join("<br>") || "—"}</td><td style="text-align:right">${esc(gp(s.value))}</td><td style="text-align:right">${esc(wt(s.weight))}</td></tr>`).join("");
  const left = coinText(plan.leftCoins);
  const content = `${scrollBox(`<table class="atg-sources"><thead><tr><th>${H("Character")}</th><th>${H("Coins")}</th><th>${H("Items")}</th><th>${H("Value")}</th><th>${H("Weight")}</th></tr></thead><tbody>${rows}</tbody></table>`)}
    ${left ? `<p class="hint">${H("Left in the hoard (doesn't divide evenly): {coins}", { coins: left })}</p>` : ""}
    <p class="hint">${H("* weightless coins. Items go out most valuable first, each to whoever has the least so far.")}</p>`;
  const ok = await Dlg().confirm({ window: { title: t("Share Out {name}", { name: actor.name }) }, content, position: { width: 560 } });
  if (!ok) return false;
  await applySplit(actor, plan);
  ui.notifications.info(t("{name} shared out among {n} characters.", { name: actor.name, n: plan.shares.length }));
  return true;
}

/* -------------------------------------------- */
/*  Gathering loot from the fallen              */
/* -------------------------------------------- */

const LOOT_FLAG = "axecleftLoot"; // the Treasure Generator's token-loot mark (flags.world.axecleftLoot)
const lootHolder = (tok) => (tok.actorLink ? tok.actor : tok);

/** A token is down: defeated in the combat tracker, marked dead, or at 0 hp or less. */
function isDown(tok) {
  const a = tok.actor;
  if (!a) return false;
  if (game.combat?.combatants?.some((c) => c.tokenId === tok.id && c.defeated)) return true;
  if (a.statuses?.has?.("dead") || tok.hasStatusEffect?.("dead")) return true;
  const hp = a.system?.attributes?.hp;
  return hp && Number(hp.max) > 0 && Number(hp.value) <= 0;
}

/**
 * The tokens to gather from: the selected tokens, or else every fallen NPC on the scene (not hoards or player
 * characters). [{ token, actor, items: [item], coins: { path: n } }] — loot only (the Treasure Generator's token loot
 * and the coins it recorded) or everything the creature carries.
 */
function gatherPlan(actor, { everything = false, selected = true } = {}) {
  const chosen = selected ? (canvas?.tokens?.controlled ?? []).map((p) => p.document) : [];
  const toks = (chosen.length ? chosen : [...(canvas?.scene?.tokens ?? [])].filter(isDown))
    .filter((tk) => tk.actor && tk.actor.id !== actor.id && !isHoard(tk.actor) && !tk.actor.hasPlayerOwner && tk.actor.type !== "character");
  return toks.map((tk) => {
    const a = tk.actor, rec = lootHolder(tk)?.getFlag?.("world", LOOT_FLAG) ?? null;
    const items = a.items.filter((i) => PHYSICAL.includes(i.type) && (everything || i.flags?.world?.[LOOT_FLAG]));
    const coins = {};
    if (everything) for (const k of coinKinds()) { const n = coinsOf(a, k.path); if (n) coins[k.path] = n; }
    else if (rec?.paid) {
      const purse = rec.paid.purse ?? "currency";
      for (const k of STD) if (rec.paid.std?.[k]) coins[`${purse}.${k}`] = Math.min(coinsOf(a, `${purse}.${k}`), rec.paid.std[k]);
      for (const [id, n] of Object.entries(rec.paid.custom ?? {})) if (n) coins[`customCurrency.${id}`] = Math.min(coinsOf(a, `customCurrency.${id}`), n);
    }
    return { token: tk, actor: a, items, coins, rec };
  }).filter((g) => g.items.length || Object.values(g.coins).some((n) => n));
}

/** Gather the loot of fallen (or selected) creatures into the hoard, after showing what will move. */
async function gather(actor, opts = {}) {
  if (!canvas?.scene) return ui.notifications.warn(t("Open a scene first."));
  const plan = gatherPlan(actor, opts);
  if (!plan.length) {
    ui.notifications.warn(t(opts.everything ? "No fallen or selected creatures carry anything." : "No fallen or selected creatures have token loot. Tick Everything they carry to take their own gear too."));
    return false;
  }
  const rows = plan.map((g) => `<tr><td><strong>${esc(g.token.name)}</strong></td><td>${esc(coinText(g.coins) || "—")}</td>
    <td>${g.items.map((i) => esc(Number(i.system?.quantity ?? 1) > 1 ? `${i.name} ×${i.system.quantity}` : i.name)).join("<br>") || "—"}</td></tr>`).join("");
  const content = `<p>${H("Into {name}:", { name: actor.name })}</p>${scrollBox(`<table class="atg-sources"><thead><tr><th>${H("Creature")}</th><th>${H("Coins")}</th><th>${H("Items")}</th></tr></thead><tbody>${rows}</tbody></table>`)}`;
  const ok = await Dlg().confirm({ window: { title: t("Gather Loot") }, content, position: { width: 520 } });
  if (!ok) return false;
  let n = 0;
  for (const g of plan) {
    await moveItems(g.actor, actor, g.items.map((item) => ({ item })));
    await moveCoins(g.actor, actor, g.coins);
    if (g.rec) await lootHolder(g.token).unsetFlag("world", LOOT_FLAG); // nothing left to take back
    n++;
  }
  ui.notifications.info(t("Gathered the loot of {n} creature(s) into {name}.", { n, name: actor.name }));
  return true;
}

/* -------------------------------------------- */
/*  On the scene                                */
/* -------------------------------------------- */

/** Wait for a click on the scene: the point clicked (snapped to the grid), or null (right-click or Esc). */
function pickPoint() {
  return new Promise((resolve) => {
    const stage = canvas.stage;
    const done = (p) => { stage.off("pointerdown", onDown); document.removeEventListener("keydown", onKey, true); resolve(p); };
    const onDown = (ev) => {
      if ((ev.button ?? ev.data?.button) === 2) return done(null);
      const pos = (ev.getLocalPosition ?? ev.data?.getLocalPosition)?.call(ev.getLocalPosition ? ev : ev.data, stage);
      if (!pos) return done(null);
      const g = canvas.grid;
      if (g?.getTopLeftPoint) return done(g.getTopLeftPoint(pos)); // v12+
      const [x, y] = g?.getTopLeft?.(pos.x, pos.y) ?? [pos.x, pos.y]; // v11
      done({ x, y });
    };
    const onKey = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); done(null); } };
    stage.on("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
  });
}

/** The hoard's trap actor (a world actor, or one in a compendium), or null. */
async function trapOf(actor) {
  const uuid = info(actor).trap;
  if (!uuid) return null;
  try { const doc = await fromUuid(uuid); return doc?.documentName === "Actor" ? doc : null; } catch (e) { return null; }
}
const trapOfSync = (actor) => { const uuid = info(actor).trap; return uuid ? (globalThis.fromUuidSync?.(uuid) ?? null) : null; };

/** Link a trap actor to the hoard (null unlinks it). */
async function setTrap(actor, trap) {
  if (trap && trap.type !== "trap") { ui.notifications.warn(t("That actor isn't a trap.")); return false; }
  await actor.setFlag(MOD, "hoard", { ...info(actor), trap: trap?.uuid ?? null });
  return true;
}

/**
 * Put the hoard's chest on the current scene where the GM clicks (hidden: only the GM sees it until revealed).
 * A linked trap goes on the same square, always hidden (a trap from a compendium is imported to the world first).
 */
async function place(actor, { hidden = true, app = null } = {}) {
  if (!canvas?.scene) return ui.notifications.warn(t("Open a scene first."));
  app?.minimize?.();
  ui.notifications.info(t("Click the scene where {name} goes (right-click or Esc to cancel).", { name: actor.name }));
  const at = await pickPoint();
  app?.maximize?.();
  if (!at) return false;
  const chest = (await actor.getTokenDocument({ x: at.x, y: at.y, hidden, actorLink: true })).toObject();
  await canvas.scene.createEmbeddedDocuments("Token", [chest]);
  let trap = await trapOf(actor);
  if (trap?.pack) {
    trap = await CONFIG.Actor.documentClass.create({ ...trap.toObject(), folder: null }); // a world copy to place
    await actor.setFlag(MOD, "hoard", { ...info(actor), trap: trap.uuid });
  }
  if (trap) {
    const td = (await trap.getTokenDocument({ x: at.x, y: at.y, hidden: true })).toObject();
    await canvas.scene.createEmbeddedDocuments("Token", [td]);
  }
  ui.notifications.info(t(trap ? "{name} placed, trapped with {trap}." : "{name} placed.", { name: actor.name, trap: trap?.name }));
  return true;
}

/* -------------------------------------------- */
/*  Files                                       */
/* -------------------------------------------- */

function exportHoard(actor) {
  const data = actor.toObject();
  delete data._id; delete data.folder; delete data.ownership;
  data.flags ??= {}; data.flags[MOD] = { ...(data.flags[MOD] ?? {}), exported: { at: new Date().toISOString(), version: game.modules.get(MOD)?.version } };
  const save = foundry.utils.saveDataToFile ?? globalThis.saveDataToFile;
  save(JSON.stringify(data, null, 2), "text/json", `hoard-${actor.name.slugify?.() ?? actor.name}.json`);
}

async function importHoard() {
  const read = foundry.utils.readTextFromFile ?? globalThis.readTextFromFile;
  const file = await new Promise((resolve) => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept: ".json,application/json" });
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.click();
  });
  if (!file) return null;
  let data;
  try { data = JSON.parse(await read(file)); } catch (err) { ui.notifications.error(t("That file isn't a hoard (not readable JSON).")); return null; }
  if (data?.type !== "npc" || !Array.isArray(data.items)) { ui.notifications.error(t("That file isn't a hoard (no NPC with items).")); return null; }
  const folder = await hoardFolder();
  delete data._id;
  data.folder = folder.id;
  foundry.utils.setProperty(data, "flags.core.sheetClass", SHEET);
  foundry.utils.setProperty(data, "flags.D35E.lootsheettype", "Loot");
  foundry.utils.setProperty(data, `flags.${MOD}.hoard`, { el: null, ...(data.flags?.[MOD]?.hoard ?? {}), imported: Date.now() });
  const actor = await CONFIG.Actor.documentClass.create(data);
  ui.notifications.info(t("Hoard \"{name}\" loaded.", { name: actor.name }));
  return actor;
}

/* -------------------------------------------- */
/*  The Hoards tab                              */
/* -------------------------------------------- */

let current = null; // the hoard shown on the tab (actor id)
let filter = "", sortBy = "name"; // the hoard list's search and order
let placeHidden = true; // Place on Scene: hidden until revealed
const currentHoard = () => { const a = current && game.actors.get(current); return isHoard(a) ? a : list()[0] ?? null; };

const STYLE = `<style>
  .ahe-head { display: flex; align-items: center; gap: 10px; margin: 4px 0 6px; }
  .ahe-head img { width: 56px; height: 56px; border: none; object-fit: contain; }
  .ahe-head .ahe-name { font-size: 1.2em; font-weight: bold; flex: 1; }
  .ahe-items { width: 100%; }
  .ahe-items td, .ahe-items th { padding: 2px 4px; vertical-align: middle; }
  .ahe-items img { width: 24px; height: 24px; border: none; vertical-align: middle; }
  .ahe-items input[type=number] { width: 70px; }
  .ahe-items .ahe-num { text-align: right; white-space: nowrap; }
  .ahe-items a.ahe-open { cursor: pointer; }
  .ahe-drop { border: 2px dashed var(--color-border-light-tertiary, #888); border-radius: 6px; padding: 6px; text-align: center; opacity: 0.8; margin: 6px 0; }
  .ahe-drop.over { opacity: 1; border-color: var(--color-border-highlight, #ff6400); }
  .ahe-coins { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .ahe-coins label { display: flex; flex-direction: column; font-size: 0.9em; }
  .ahe-bar { height: 10px; border-radius: 5px; background: rgba(127,127,127,0.3); overflow: hidden; margin: 4px 0; }
  .ahe-bar > div { height: 100%; background: #c9a227; }
  .ahe-party { display: flex; flex-wrap: wrap; gap: 4px 12px; }
  .ahe-items td.ahe-pickcell { white-space: nowrap; }
  .ahe-items input.ahe-give-qty { width: 48px; margin-left: 2px; }
  .ahe-coins.ahe-custom { margin-top: 4px; }
  .ahe-find input[type=text] { flex: 2; }
  .ahe-find select { flex: 1; }
  .ahe-totals input[name='ahe.sellPct'] { width: 48px; height: 1.6em; }
  .ahe-scene .form-group a.ahe-open { flex: 0 0 auto; margin-left: 6px; }
</style>`;

const TAB = {
  module: MOD, name: "hoards", title: /*t*/"Hoards", icon: "fas fa-box-open", order: 450,
  content() {
    const all = list(), a = currentHoard();
    const q = filter.trim().toLowerCase();
    const sorted = sortBy === "value" ? [...all].sort((x, y) => value(y).total - value(x).total)
      : sortBy === "el" ? [...all].sort((x, y) => (Number(info(x).el) || 0) - (Number(info(y).el) || 0) || x.name.localeCompare(y.name)) : all;
    const hoards = sorted.filter((h) => !q || h.name.toLowerCase().includes(q) || h.id === a?.id);
    const label = (h) => `${h.name} — ${gp(value(h).total)}${info(h).el ? ` · ${t("EL {level}", { level: info(h).el })}` : ""}`;
    const finder = all.length > 6 ? `<div class="form-group ahe-find"><label>${H("Find")}</label><input type="text" name="ahe.filter" value="${esc(filter)}" placeholder="${H("Part of a name")}">
      <select name="ahe.sort">${opt("name", t("By name"), sortBy)}${opt("value", t("By value"), sortBy)}${opt("el", t("By encounter level"), sortBy)}</select></div>` : "";
    const pick = `<fieldset class="ahe-pick"><legend>${H("Hoard")}</legend>${finder}
      <div class="form-group"><label>${H("Hoard")}</label><select name="ahe.hoard">${hoards.length ? hoards.map((h) => opt(h.id, label(h), a?.id)).join("") : opt("", t(all.length ? "No match" : "No hoards yet"))}</select></div>
      <div class="atg-footer ahe-files"><button type="button" data-ahe="new"><i class="fas fa-plus"></i> ${H("New Hoard")}</button><button type="button" data-ahe="import"><i class="fas fa-file-import"></i> ${H("Load from File")}</button></div>
      ${a ? `<div class="atg-footer ahe-manage"><button type="button" data-ahe="sheet"><i class="fas fa-box-open"></i> ${H("Open Sheet")}</button><button type="button" data-ahe="rename"><i class="fas fa-pen"></i> ${H("Rename")}</button><button type="button" data-ahe="art"><i class="fas fa-dice"></i> ${H("New Chest")}</button><button type="button" data-ahe="copy"><i class="fas fa-copy"></i> ${H("Duplicate")}</button><button type="button" data-ahe="export"><i class="fas fa-file-export"></i> ${H("Save to File")}</button><button type="button" data-ahe="delete"><i class="fas fa-trash"></i> ${H("Delete")}</button></div>` : ""}
    </fieldset>`;
    if (!a) return `${STYLE}<p class="hint">${H("A hoard is a chest actor in the Hoards folder that players can loot from its token. Make one with New Hoard, then fill it here.")}</p>${pick}`;

    const v = value(a), w = weight(a), el = Number(info(a).el) || 1, target = targetFor(el), pct = Math.round((v.total / target) * 100);
    const kinds = coinKinds(), sell = sellPct(a);
    const coinIn = (k) => `<label>${esc(k.label)}<input type="number" min="0" step="1" data-ahe-coin="${esc(k.path)}" value="${coinsOf(a, k.path)}"></label>`;
    const std = kinds.filter((k) => !k.alt && !k.custom), altK = kinds.filter((k) => k.alt), custom = kinds.filter((k) => k.custom);
    const alt = altK.some((k) => coinsOf(a, k.path));
    const rows = [...a.items].sort((x, y) => itemValue(y) - itemValue(x)).map((it) => {
      const qty = Number(it.system?.quantity ?? 1) || 0;
      const giveQty = qty > 1 ? `<input type="number" class="ahe-give-qty" min="1" max="${qty}" step="1" value="${qty}" data-ahe-give-qty="${it.id}" title="${H("How many of the stack to give")}">` : "";
      return `<tr data-ahe-item="${it.id}">
      <td class="ahe-pickcell"><input type="checkbox" data-ahe-pick="${it.id}" title="${H("Tick to give it with Give to One")}">${giveQty}</td><td><img src="${esc(it.img)}"></td><td><a class="ahe-open" data-ahe-open="${it.id}">${esc(it.name)}</a><br><small>${H(partOf(it) === "goods" ? "goods" : "item")}${itemWeight(it) ? ` · ${esc(wt(itemWeight(it)))}` : ""}</small></td>
      <td><input type="number" min="0" step="1" data-ahe-field="system.quantity" value="${Number(it.system?.quantity ?? 1)}"></td>
      <td><input type="number" min="0" step="0.01" data-ahe-field="system.price" value="${Number(it.system?.price) || 0}"></td>
      <td class="ahe-num">${esc(gp(itemValue(it)))}</td>
      <td style="text-align:center"><input type="checkbox" data-ahe-field="system.identified" ${it.system?.identified ? "checked" : ""} title="${H("Identified")}"></td>
      <td><a data-ahe-remove="${it.id}" title="${H("Remove")}"><i class="fas fa-trash"></i></a></td></tr>`;
    }).join("");
    const contents = `<fieldset class="ahe-contents"><legend>${H("Contents")}</legend>
      <div class="ahe-coins">${std.map(coinIn).join("")}</div>
      ${alt ? `<div class="ahe-coins">${altK.map(coinIn).join("")}</div><p class="hint">${H("* weightless coins")}</p>` : ""}
      ${custom.length ? `<div class="ahe-coins ahe-custom">${custom.map(coinIn).join("")}</div>` : ""}
      ${rows ? `<table class="ahe-items ahe-list"><thead><tr><th title="${H("Tick to give it with Give to One")}"><i class="fas fa-hand-holding"></i></th><th></th><th>${H("Item")}</th><th>${H("Qty")}</th><th>${H("Value each (gp)")}</th><th>${H("Total")}</th><th>${H("Id.")}</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="hint">${H("No items yet.")}</p>`}
      <div class="ahe-drop" data-ahe-drop>${H("Drag items here from the Items sidebar, a compendium or a sheet")}</div>
      <table class="ahe-items ahe-totals"><tbody>
        <tr><td>${H("Coins")}</td><td class="ahe-num">${esc(gp(v.coins))}</td></tr>
        <tr><td>${H("Goods (gems, art, jewelry)")}</td><td class="ahe-num">${esc(gp(v.goods))}</td></tr>
        <tr><td>${H("Items")}</td><td class="ahe-num">${esc(gp(v.items))}</td></tr>
        <tr><td><strong>${H("Total")}</strong></td><td class="ahe-num"><strong>${esc(gp(v.total))}</strong></td></tr>
        <tr class="ahe-sell"><td>${H("Sells for")} <small>(${H("items at")} <input type="number" min="0" max="200" step="5" name="ahe.sellPct" value="${sell}">%, ${H("gems, art and trade goods at full value")})</small></td><td class="ahe-num">${esc(gp(sellValue(a, sell)))}</td></tr>
        <tr class="ahe-weight"><td>${H("Weight")} <small>(${H("coins {coins}, items {items}", { coins: wt(w.coins), items: wt(w.items) })})</small></td><td class="ahe-num">${esc(wt(w.total))}</td></tr>
      </tbody></table>
    </fieldset>`;

    const trap = trapOfSync(a), trapActors = [...(game.actors ?? [])].filter((x) => x.type === "trap").sort((x, y) => x.name.localeCompare(y.name));
    const trapOpts = opt("", t("No trap"), trap?.uuid ?? "") + trapActors.map((x) => opt(x.uuid, x.name, trap?.uuid)).join("")
      + (trap && !trapActors.includes(trap) ? opt(trap.uuid, `${trap.name} (${t("compendium")})`, trap.uuid) : "");
    const scene = `<fieldset class="ahe-scene"><legend>${H("On the scene")}</legend>
      <div class="form-group"><label>${H("Trap")}</label><select name="ahe.trap">${trapOpts}</select>${trap ? `<a class="ahe-open" data-ahe-trap-open title="${H("Open the trap's sheet")}"><i class="fas fa-up-right-from-square"></i></a>` : ""}</div>
      <div class="ahe-drop ahe-trap-drop" data-ahe-trap-drop>${H("Or drag a trap actor here from the Actors sidebar or a compendium")}</div>
      <div class="atg-checks"><label class="atg-cb"><input type="checkbox" name="ahe.hidden" ${placeHidden ? "checked" : ""}> ${H("Hidden until revealed")}</label></div>
      <div class="atg-footer"><button type="button" data-ahe="place"><i class="fas fa-location-dot"></i> ${H("Place on Scene")}</button></div>
      <p class="hint">${H("Click the scene where the chest goes. A trap goes on the same square, always hidden. Hidden chests show only to the GM until you reveal the token.")}</p>
    </fieldset>`;

    const target_ = `<fieldset class="ahe-target"><legend>${H("Target value")}</legend>
      <div class="form-group"><label>${H("Encounter level")}</label><select name="ahe.el">${SRD_TREASURE.map((g, i) => opt(i + 1, t("EL {level}: {value}", { level: i + 1, value: gp(g) }), el)).join("")}</select></div>
      <div class="ahe-bar"><div style="width:${Math.min(100, pct)}%"></div></div>
      <p class="hint">${H("SRD treasure per encounter at EL {level}: {target}. This hoard: {total} ({pct}%).", { level: el, target: gp(target), total: gp(v.total), pct })}</p>
      <div class="atg-footer"><button type="button" data-ahe="roll"><i class="fas fa-dice-d20"></i> ${H("Roll EL Treasure into Hoard")}</button><button type="button" data-ahe="fill" class="bright"><i class="fas fa-fill-drip"></i> ${H("Fill to Target")}</button></div>
      <div class="atg-footer"><button type="button" data-ahe="dest"><i class="fas fa-arrow-right-to-bracket"></i> ${H("Send Other Tabs Here")}</button></div>
      <p class="hint">${H("Roll uses the Treasure by Level settings (coin conversion, item sources, Generation settings). Fill to Target keeps rolling until the hoard reaches the SRD value (at most 25 rolls). Send Other Tabs Here sets \"Put items in\" to this hoard, so the Gems, Forge, Curios and other tabs generate straight into it.")}</p>
    </fieldset>`;

    const members = party();
    const where = { scene: /*t*/"Party members with a token on this scene.", world: /*t*/"Party members in this world (none have a token on this scene).", players: /*t*/"No actor is marked Party Member (actor settings), so these are the characters players own." }[members[0]?.where];
    const give_ = members.length ? `<fieldset class="ahe-give"><legend>${H("Give to one")}</legend>
      <div class="form-group"><label>${H("Character")}</label><select name="ahe.giveTo">${members.map((m) => opt(m.key, m.name)).join("")}</select></div>
      <div class="ahe-coins">${std.map((k) => `<label>${esc(k.label)}<input type="number" min="0" step="1" data-ahe-give-coin="${esc(k.key)}" value="0"></label>`).join("")}</div>
      ${custom.length ? `<div class="ahe-coins">${custom.map((k) => `<label>${esc(k.label)}<input type="number" min="0" step="1" data-ahe-give-coin="${esc(k.path)}" value="0"></label>`).join("")}</div>` : ""}
      <div class="atg-footer"><button type="button" data-ahe="give"><i class="fas fa-hand-holding"></i> ${H("Give Ticked Items and Coins")}</button></div>
      <p class="hint">${H("Tick items in the Contents list and enter any coins, then give them to one character: the rogue who opens the chest first, or an item someone can use. For a stack, set how many beside its tick box. Share Out the rest afterwards.")}</p>
    </fieldset>` : "";
    const gather_ = `<fieldset class="ahe-gather"><legend>${H("Gather loot")}</legend>
      <div class="atg-checks"><label class="atg-cb"><input type="checkbox" name="ahe.gatherAll"> ${H("Everything they carry")}</label></div>
      <div class="atg-footer"><button type="button" data-ahe="gather"><i class="fas fa-sack-dollar"></i> ${H("Gather Loot into Hoard")}</button></div>
      <p class="hint">${H("After a fight: takes the token loot (and the coins it rolled) from the selected tokens, or, with none selected, from every fallen creature on the scene (defeated, dead or at 0 hp). Ticked, it takes all their gear and coins too. You see what moves first.")}</p>
    </fieldset>`;
    const share = `${give_}<fieldset class="ahe-share"><legend>${H("Share among the party")}</legend>
      ${members.length ? `<p class="hint">${H(where)}</p><div class="ahe-party">${members.map((m) => `<label class="atg-cb"><input type="checkbox" data-ahe-member="${esc(m.key)}" checked> ${esc(m.name)}</label>`).join("")}</div>
      <div class="atg-checks"><label class="atg-cb"><input type="checkbox" name="ahe.splitCoins" checked> ${H("Coins")}</label><label class="atg-cb"><input type="checkbox" name="ahe.splitItems" checked> ${H("Items")}</label></div>
      <div class="atg-footer"><button type="button" data-ahe="split"><i class="fas fa-people-arrows"></i> ${H("Share Out…")}</button></div>
      <p class="hint">${H("Coins are divided evenly by type; items go out most valuable first, each to whoever has the least so far. You see the shares before anything moves.")}</p>`
      : `<p class="hint">${H("No party members: tick Party Member in a character's actor settings, or give a player a character.")}</p>`}
    </fieldset>`;

    const lootable = (a.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    const head = `<div class="ahe-head"><img src="${esc(a.img)}"><span class="ahe-name">${esc(a.name)}</span>
      <label class="atg-cb" title="${H("Gives all players Observer permission, so they can open its loot sheet from its token and take things.")}"><input type="checkbox" data-ahe="lootable" ${lootable ? "checked" : ""}> ${H("Players can loot it")}</label></div>`;
    return `${STYLE}${pick}${head}${contents}${target_}${gather_}${scene}${share}`;
  },

  wire(section, app) {
    const a = currentHoard();
    const rerender = () => app.render();
    const busy = async (btn, fn) => { if (btn) btn.disabled = true; try { await fn(); } catch (err) { console.error(`${MOD} |`, err); ui.notifications.error(err.message); } finally { rerender(); } };
    section.querySelector("[name='ahe.hoard']")?.addEventListener("change", (ev) => { current = ev.currentTarget.value || null; rerender(); });
    const find = section.querySelector("[name='ahe.filter']");
    if (find) {
      const apply = foundry.utils.debounce(() => { filter = find.value; rerender(); }, 350);
      find.addEventListener("input", apply);
      if (filter) { find.focus(); find.setSelectionRange(find.value.length, find.value.length); } // keep typing after the re-render
    }
    section.querySelector("[name='ahe.sort']")?.addEventListener("change", (ev) => { sortBy = ev.currentTarget.value; rerender(); });

    section.querySelectorAll("button[data-ahe]").forEach((b) => b.addEventListener("click", (ev) => {
      ev.preventDefault();
      const act = b.dataset.ahe;
      if (act === "new") return busy(b, async () => {
        const name = await ask(t("New Hoard"), t("Name"), t("Hoard {n}", { n: list().length + 1 }));
        if (name === null) return;
        const h = await create({ name, el: a ? info(a).el : null });
        current = h.id;
      });
      if (act === "import") return busy(b, async () => { const h = await importHoard(); if (h) current = h.id; });
      if (!a) return;
      if (act === "sheet") return a.sheet.render(true);
      if (act === "rename") return busy(b, async () => { const name = await ask(t("Rename"), t("Name"), a.name); if (name) await a.update({ name, "prototypeToken.name": name }); });
      if (act === "art") return busy(b, async () => { const img = randomChest(a.img); await a.update({ img, "prototypeToken.texture.src": img }); });
      if (act === "copy") return busy(b, async () => {
        const o = a.toObject(); delete o._id; o.name = t("{name} (copy)", { name: a.name }); o.prototypeToken.name = o.name;
        const h = await CONFIG.Actor.documentClass.create(o); current = h.id;
      });
      if (act === "export") return exportHoard(a);
      if (act === "delete") return busy(b, async () => {
        const ok = await Dlg().confirm({ window: { title: t("Delete Hoard") }, content: `<p>${H("Delete {name} and everything in it? This can't be undone.", { name: a.name })}</p>` });
        if (ok) { await a.delete(); current = null; }
      });
      if (act === "roll") return busy(b, () => rollInto(a, { el: Number(info(a).el) || 1 }));
      if (act === "fill") return busy(b, async () => {
        const r = await fillToTarget(a);
        ui.notifications.info(t("{name}: {total} after {n} rolls (target {target}).", { name: a.name, total: gp(r.total), n: r.rolls, target: gp(r.target) }));
      });
      if (act === "dest") {
        const form = section.closest("form"), mode = form?.elements["dest.mode"], uuid = form?.elements["dest.uuid"];
        if (!mode || !uuid) return;
        mode.value = "actor"; mode.dispatchEvent(new Event("change", { bubbles: true }));
        if (![...uuid.options].some((o) => o.value === a.uuid)) uuid.insertAdjacentHTML("beforeend", opt(a.uuid, a.name));
        uuid.value = a.uuid; uuid.dispatchEvent(new Event("change", { bubbles: true }));
        return ui.notifications.info(t("Other tabs now put their items in {name}.", { name: a.name }));
      }
      if (act === "give") return busy(b, () => {
        const target = members.get(section.querySelector("[name='ahe.giveTo']")?.value)?.actor;
        if (!target) return ui.notifications.warn(t("Choose a character."));
        const picks = [...section.querySelectorAll("[data-ahe-pick]:checked")].map((x) => {
          const id = x.dataset.ahePick, q = section.querySelector(`[data-ahe-give-qty="${id}"]`);
          return { id, qty: q ? Number(q.value) : undefined };
        });
        const coins = Object.fromEntries([...section.querySelectorAll("[data-ahe-give-coin]")].map((x) => [x.dataset.aheGiveCoin, x.value]));
        return give(a, target, picks, coins);
      });
      if (act === "gather") return busy(b, () => gather(a, { everything: !!section.querySelector("[name='ahe.gatherAll']")?.checked }));
      if (act === "place") return busy(b, () => place(a, { hidden: placeHidden, app }));
      if (act === "split") return busy(b, () => {
        const chosen = [...section.querySelectorAll("[data-ahe-member]:checked")].map((x) => members.get(x.dataset.aheMember)?.actor).filter(Boolean);
        return split(a, chosen, { coins: section.querySelector("[name='ahe.splitCoins']")?.checked, items: section.querySelector("[name='ahe.splitItems']")?.checked });
      });
    }));
    if (!a) return;

    section.querySelector("input[data-ahe='lootable']")?.addEventListener("change", (ev) => busy(null, () => a.update({ "ownership.default": ev.currentTarget.checked ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE })));
    section.querySelector("[name='ahe.el']")?.addEventListener("change", (ev) => busy(null, () => a.setFlag(MOD, "hoard", { ...info(a), el: Number(ev.currentTarget.value) })));
    section.querySelector("[name='ahe.sellPct']")?.addEventListener("change", (ev) => busy(null, () => a.setFlag(MOD, "hoard", { ...info(a), sellPct: Math.max(0, Number(ev.currentTarget.value) || 0) })));
    section.querySelector("[name='ahe.hidden']")?.addEventListener("change", (ev) => { placeHidden = ev.currentTarget.checked; });
    section.querySelector("[name='ahe.trap']")?.addEventListener("change", (ev) => busy(null, async () => {
      const uuid = ev.currentTarget.value;
      await setTrap(a, uuid ? await fromUuid(uuid) : null);
    }));
    section.querySelector("[data-ahe-trap-open]")?.addEventListener("click", async () => (await trapOf(a))?.sheet?.render(true));
    // Changing how many of a stack to give ticks it
    section.querySelectorAll("[data-ahe-give-qty]").forEach((x) => x.addEventListener("input", () => {
      const box = section.querySelector(`[data-ahe-pick="${x.dataset.aheGiveQty}"]`);
      if (box) box.checked = true;
    }));
    section.querySelectorAll("[data-ahe-coin]").forEach((x) => x.addEventListener("change", () => busy(null, () => a.update({ [`system.${x.dataset.aheCoin}`]: Math.max(0, Math.floor(Number(x.value) || 0)) }))));
    section.querySelectorAll("[data-ahe-item]").forEach((row) => {
      const it = a.items.get(row.dataset.aheItem);
      row.querySelectorAll("[data-ahe-field]").forEach((x) => x.addEventListener("change", () => busy(null, () =>
        it.update({ [x.dataset.aheField]: x.type === "checkbox" ? x.checked : Math.max(0, Number(x.value) || 0) }))));
    });
    section.querySelectorAll("[data-ahe-open]").forEach((x) => x.addEventListener("click", () => a.items.get(x.dataset.aheOpen)?.sheet.render(true)));
    section.querySelectorAll("[data-ahe-remove]").forEach((x) => x.addEventListener("click", () => busy(null, () => a.deleteEmbeddedDocuments("Item", [x.dataset.aheRemove]))));

    // Dropping items: handled here so the generator's own drop (actors for "Put items in") doesn't see it.
    // Items go in the hoard; a trap actor dropped anywhere on the tab becomes its trap.
    const drop = section.querySelector("[data-ahe-drop]"), trapDrop = section.querySelector("[data-ahe-trap-drop]");
    section.addEventListener("dragover", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const onTrap = trapDrop?.contains(ev.target);
      trapDrop?.classList.toggle("over", !!onTrap); drop?.classList.toggle("over", !onTrap);
    });
    section.addEventListener("dragleave", () => { drop?.classList.remove("over"); trapDrop?.classList.remove("over"); });
    section.addEventListener("drop", (ev) => {
      ev.preventDefault(); ev.stopPropagation(); drop?.classList.remove("over"); trapDrop?.classList.remove("over");
      let data; try { data = JSON.parse(ev.dataTransfer.getData("text/plain")); } catch (e) { return; }
      if (data?.type === "Actor" && data.uuid) return busy(null, async () => setTrap(a, await fromUuid(data.uuid)));
      busy(null, () => addDropped(a, data));
    });
  },
};

/** A one-line text prompt; null when cancelled. */
async function ask(title, label, value = "") {
  let out = null;
  const ok = await Dlg().wait({
    window: { title }, content: `<div class="form-group"><label>${esc(label)}</label><input type="text" name="ahe-text" value="${esc(value)}" autofocus></div>`,
    buttons: [{ action: "ok", label: t("OK"), icon: "fas fa-check", default: true, callback: (ev, btn) => { out = btn.form?.elements?.["ahe-text"]?.value ?? null; return true; } },
      { action: "cancel", label: t("Cancel"), icon: "fas fa-times" }],
  });
  return ok === true || ok === "ok" ? String(out ?? "").trim() || value : null;
}

/* -------------------------------------------- */
/*  Tours (Axecleft's Tools 9.7)                */
/* -------------------------------------------- */

/** Three tours of the Hoards tab: Configure Settings → Tour Management, or the Treasure Generator's ⋮ menu. GM only. */
function registerTours(hub) {
  const R = A()?.registerTour;
  if (!R || !hub?.tourOpen) return;
  const APP = "axecleft-treasure-generator", go = hub.tourOpen(TAB_ID);
  const tour = (id, title, description, next, steps) => R({ module: MOD, id, app: APP, tab: TAB_ID, open: go, title, description, next: next ? [`${MOD}.${next}`] : [], steps });
  tour("hoards", /*t*/"Hoard Editor: Hoards", /*t*/"Make, load and save hoards, and edit what is in them.", "fill", [
    hub.tourTabStep(TAB_ID, /*t*/"Hoards", /*t*/"A hoard is a chest actor in the Hoards folder of the Actors sidebar, opened on D35E's loot sheet. Place its token on a scene and the players can loot it.\nThis tab builds and edits hoards. If you have none yet, press New Hoard first: the rest of the tour points at a hoard's parts."),
    { id: "hoard", field: "ahe.hoard", title: /*t*/"Hoard", content: /*t*/"The hoard shown on the tab. Every hoard in the world is listed here." },
    { id: "files", sel: "section.active .ahe-files", title: /*t*/"New or from a file", content: /*t*/"New Hoard makes an empty chest with a random picture. Load from File makes a hoard from a file saved with Save to File, in this world or another." },
    { id: "manage", sel: "section.active .ahe-manage", title: /*t*/"Manage the hoard", content: /*t*/"Open Sheet opens its loot sheet. Rename, New Chest (another random chest picture for the actor and its token), Duplicate, Save to File (to keep it or move it to another world) and Delete." },
    { id: "head", sel: "section.active .ahe-head", title: /*t*/"Players can loot it", content: /*t*/"Ticked, every player gets Observer permission on the hoard, so they can open its loot sheet from its token and take things. Leave it unticked while you prepare it." },
    { id: "coins", sel: "section.active .ahe-contents > .ahe-coins", title: /*t*/"Coins", content: /*t*/"The coins in the hoard. Type a new amount to change it. Weightless coins get a row of their own (marked *) when the hoard has any." },
    { id: "items", sel: "section.active table.ahe-list", title: /*t*/"Items", content: /*t*/"Everything in the hoard, most valuable first. Click a name to open its sheet; change the quantity, the value of each, or whether it is identified; the bin removes it.\nThe tick box at the start of a row picks it for Give to One. A stack has a box beside it: how many of it to give." },
    { id: "drop", sel: "section.active [data-ahe-drop]", title: /*t*/"Add items by hand", content: /*t*/"Drag an item here from the Items sidebar, a compendium or a character sheet to put a copy in the hoard." },
    { id: "totals", sel: "section.active table.ahe-totals", title: /*t*/"Value", direction: "UP", content: /*t*/"The hoard's value in gp: coins, goods (gems, art and jewelry), items and the total. Values are the true values, whatever the players have appraised.\nSells for: what it fetches from a merchant (SRD: items at half, gems, art and trade goods at full value; change the % for this hoard). Weight: coins (50 to the pound) and items, in D35E's units." },
  ]);
  tour("fill", /*t*/"Hoard Editor: Filling a hoard", /*t*/"Fill a hoard with SRD treasure for an encounter level, send the other tabs' treasure into it, or gather the loot of the fallen.", "scene", [
    { id: "el", field: "ahe.el", title: /*t*/"Encounter level", content: /*t*/"The encounter level the hoard is for, with the SRD's treasure per encounter at that level. It is saved with the hoard." },
    { id: "bar", sel: "section.active .ahe-target .ahe-bar", title: /*t*/"Target value", content: /*t*/"How close the hoard is to the SRD value for its encounter level." },
    { id: "roll", sel: "section.active [data-ahe=roll]", title: /*t*/"Roll EL Treasure into Hoard", content: /*t*/"Rolls the SRD Treasure table once for the encounter level and puts the coins, goods and items in the hoard. It follows the Treasure by Level tab's settings: how coins are paid, your item sources and the Generation settings. A chat card, whispered to the GM, lists what went in." },
    { id: "fill", sel: "section.active [data-ahe=fill]", title: /*t*/"Fill to Target", content: /*t*/"Keeps rolling the table until the hoard reaches the SRD value for its encounter level (at most 25 rolls)." },
    { id: "dest", sel: "section.active [data-ahe=dest]", title: /*t*/"Send Other Tabs Here", content: /*t*/"Sets Put items in to this hoard, so the Gems, Forge, Curios and other tabs make their treasure straight into it. Handy for a hoard with a theme: a dragon's gems, a wizard's scrolls." },
    { id: "gather", sel: "section.active .ahe-gather", title: /*t*/"Gather loot", direction: "UP", content: /*t*/"After a fight, sweep the fallen into the hoard and share it out from here. It takes the Treasure Generator's token loot and the coins it rolled from the selected tokens, or, with none selected, from every creature on the scene that is defeated, dead or at 0 hp.\nTick Everything they carry to take their own gear and coins as well. You see what moves before it does." },
  ]);
  tour("scene", /*t*/"Hoard Editor: On the scene", /*t*/"Trap the chest and put it on a scene.", "share", [
    { id: "trap", field: "ahe.trap", title: /*t*/"Trap", content: /*t*/"A trap for the chest: any trap actor in the world (Axecleft's Traps, Poisons, and Diseases makes them for every SRD trap). It is saved with the hoard." },
    { id: "trapDrop", sel: "section.active [data-ahe-trap-drop]", title: /*t*/"Trap from a compendium", content: /*t*/"Drag a trap actor here from the Actors sidebar or a compendium. One from a compendium is copied into the world when the chest is placed." },
    { id: "hidden", field: "ahe.hidden", title: /*t*/"Hidden until revealed", content: /*t*/"Ticked, the chest's token is hidden: only you see it until you reveal it (the token's right-click menu)." },
    { id: "place", sel: "section.active [data-ahe=place]", title: /*t*/"Place on Scene", direction: "UP", content: /*t*/"The window shrinks; click the scene where the chest goes (right-click or Esc to cancel). Its trap goes on the same square, always hidden." },
  ]);
  tour("share", /*t*/"Hoard Editor: Sharing out", /*t*/"Give things to one character, or share the hoard fairly among the party.", null, [
    { id: "giveTo", field: "ahe.giveTo", title: /*t*/"Give to one", content: /*t*/"For the rogue who opens the chest first, or an item only one character can use: choose the character here.\nThe party is the actors marked Party Member (in their actor settings) with a token on this scene; if none, every party member; if none, the characters players own." },
    { id: "giveCoins", sel: "section.active .ahe-give .ahe-coins", title: /*t*/"Coins to give", content: /*t*/"Any coins to give with the items." },
    { id: "give", sel: "section.active [data-ahe=give]", title: /*t*/"Give Ticked Items and Coins", content: /*t*/"Gives the items ticked in the Contents list (as many of each stack as you set) and the coins to that character. You see what goes, and its weight, before anything moves." },
    { id: "party", sel: "section.active .ahe-share .ahe-party", title: /*t*/"Share among the party", content: /*t*/"The characters who get a share. Untick anyone who isn't there." },
    { id: "parts", field: "ahe.splitCoins", title: /*t*/"Coins and items", content: /*t*/"What to share out: the coins, the items, or both." },
    { id: "split", sel: "section.active [data-ahe=split]", title: /*t*/"Share Out", direction: "UP", content: /*t*/"Coins are divided evenly, type by type; what doesn't divide stays in the hoard. Items go out most valuable first, each to whoever has the least so far. You see each share before anything moves." },
    { id: "sheet", title: /*t*/"From the hoard's sheet", content: /*t*/"A hoard's loot sheet has a Hoard Editor button in its title bar that opens this tab on that hoard." },
  ]);
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

const open = (hoard = null) => { if (hoard) current = hoard.id ?? hoard; return T()?.open?.(TAB_ID); };
const API = { create, list, value, weight, sellValue, rollInto, fillToTarget, split, planSplit, give, party, gather, gatherPlan, place, setTrap, trapOf,
  exportHoard, importHoard, open, targetFor, CHESTS };

// The Hoard Editor is the Hoards tab of the Treasure Generator (1.14.0.2: no button of its own in the Axecleft's Tools menu).
A()?.unregister?.(MOD, "hoards");

Hooks.once("init", () => {
  if (T()?.registerTab) T().registerTab(TAB);
  try { registerTours(T()); } catch (err) { console.warn(`${MOD} | tours`, err); }
});
Hooks.once("ready", () => {
  const mod = game.modules.get(MOD);
  if (mod) mod.api = API;
  if (game.user.isGM && !T()?.registerTab) ui.notifications.warn(t("Axecleft's Hoard Editor needs Axecleft's Gemstones, Armory or Curios (their Treasure Generator) to be active."), { permanent: true });
});
// A hoard's sheet header: open it in the Hoard Editor (D35E's loot sheet, Foundry v11–v14 header hooks).
const headerButton = (sheet, buttons) => {
  if (!game.user.isGM || !isHoard(sheet.actor ?? sheet.document)) return;
  buttons.unshift({ label: t("Hoard Editor"), class: "ahe-open-editor", icon: "fas fa-box-open", onclick: () => open(sheet.actor ?? sheet.document) });
};
Hooks.on("getActorSheetHeaderButtons", headerButton);
// Keep the tab current when a hoard changes elsewhere (its sheet, a split, a drop on its token).
const rerenderTab = foundry.utils.debounce(() => { const app = T()?._app; if (app?.rendered && app.tab === TAB_ID) app.render(); }, 200);
// 1.14.0.3: also when a hoard or a trap actor is made or deleted in the Actors sidebar (the hoard list, the Trap list).
const refresh = (doc) => { const actor = doc?.documentName === "Actor" ? doc : doc?.parent; if (isHoard(actor) || actor?.type === "trap") rerenderTab(); };
for (const h of ["createActor", "updateActor", "deleteActor", "createItem", "updateItem", "deleteItem"]) Hooks.on(h, refresh);
