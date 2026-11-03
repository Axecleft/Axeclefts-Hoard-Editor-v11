# Axecleft's Hoard Editor
Build, save and edit treasure hoards for the D35E (D&D 3.5) system in Foundry VTT.

A hoard is a chest your players can loot. Each one is an NPC actor in the **Hoards** folder, opened on D35E's loot sheet, with a random chest picture (from Foundry's own icons) as its portrait and token. Place it on a scene like any actor.

The Hoard Editor adds a **Hoards** tab to the Axecleft Treasure Generator, so it needs **Axecleft's Gemstones, Armory or Curios** (any one of them) to be active. It also adds a **Hoard Editor** button to each hoard's sheet header. Open it from the Treasure Generator's **Hoards** tab.

## The Hoards tab
- **Hoard:** pick a hoard (each shows its value and encounter level), make a new one, load one from a file; open its sheet, rename it, give it another chest, duplicate it, save it to a file or delete it. With more than six hoards, **Find** narrows the list by name, and it can be sorted by name, value or encounter level.
- **Players can loot it:** gives all players Observer permission, so they can open the loot sheet from the hoard's token and take things.
- **Contents:** its coins (edit them in place: carried coins, weightless coins when it has any, and D35E's custom currencies when the world has some), and each item with its quantity, value, total, weight and identified box. Drag items in from the Items sidebar, a compendium or a sheet.
- **Totals:** coins, goods (gems, art, jewelry, books), items and the grand total.
  - **Sells for:** what the hoard fetches from a merchant: coins as they are, gems, art and trade goods at full value, other items at half (SRD). Change the % for a hoard.
  - **Weight:** coins (50 carried coins to the pound, custom currencies by their weight, weightless coins nothing) and items, in D35E's units (lb or kg).
- **Target value:** choose an encounter level to compare the hoard with the SRD treasure per encounter (EL 1: 300 gp … EL 20: 80,000 gp).
  - **Roll EL Treasure into Hoard:** one roll on the SRD Treasure table, using the Treasure by Level settings.
  - **Fill to Target:** keeps rolling until the hoard reaches the SRD value (at most 25 rolls).
  - **Send Other Tabs Here:** sets "Put items in" to the hoard, so the Gems, Art Objects, Forge, Curios and other tabs generate straight into it.
- **Gather loot:** after a fight, sweep the fallen into the hoard: the Treasure Generator's token loot and the coins it rolled, from the selected tokens or, with none selected, from every creature on the scene that is defeated, dead or at 0 hp. Tick **Everything they carry** to take their own gear and coins as well (natural attacks, feats and spells stay). You see what moves before it does.
- **On the scene:**
  - **Trap:** pick a trap actor for the chest, or drag one in from the Actors sidebar or a compendium (Axecleft's Traps, Poisons, and Diseases has one for every SRD trap).
  - **Place on Scene:** click the scene where the chest goes; it can be **hidden until revealed**. Its trap goes on the same square, always hidden (a trap from a compendium is copied into the world first).
- **Give to one:** tick items in the Contents list (for a stack, set how many beside its tick box), enter any coins (custom currencies too), choose a character and give them: the rogue who opens the chest first, or an item someone can use. The confirmation shows the weight.
- **Share among the party:** the characters marked **Party Member** (D35E actor settings) with a token on the scene, or all party members if none are on the scene (or, if no one is marked, the characters players own). Untick anyone to leave them out, then Share Out: coins are divided evenly by type, custom currencies included (what doesn't divide stays in the hoard); items go out most valuable first, each to whoever has the least so far. You see each share, with its value and weight, before anything moves. Players don't need to be online.

## Tours
Four guided tours of the Hoards tab (GM only): **Hoards** (making, loading, saving and editing a hoard), **Filling a hoard** (encounter level, rolling and filling to the SRD value, sending other tabs' treasure in, gathering loot), **On the scene** (trapping the chest and placing it) and **Sharing out** (giving to one character, sharing among the party). Find them in Configure Settings → Tour Management, or the Tour button in the Treasure Generator's title bar on the Hoards tab.

## For module authors
`game.modules.get("axeclefts-hoards").api`: `create({ name, el, img, lootable })`, `list()`, `value(actor)`, `weight(actor)`, `sellValue(actor, pct?)`, `rollInto(actor, { el, times })`, `fillToTarget(actor, { el })`, `give(actor, target, [id | { id, qty }], { "gp": n, "customCurrency.<id>": n })`, `split(actor, actors, { coins, items })`, `gather(actor, { everything })`, `place(actor, { hidden })`, `setTrap(actor, trapActor | null)`, `trapOf(actor)`, `exportHoard(actor)`, `importHoard()`, `open(actor?)`.

## Support
- Discord: [Axecleft's Tool Suite](https://discord.gg/FRhPPwDWta)
- Patreon: [Axecleft](https://www.patreon.com/Axecleft) — the modules are free; patrons get new releases two weeks early.

Changelog:

v1.11.0.3 (Foundry 11; the same as v1.14.0.3):

- **Gather loot:** sweep the token loot (or everything they carry) of fallen or selected creatures into the hoard after a fight.
- **On the scene:** link a trap actor to the chest (pick it, or drag one from the Actors sidebar or a compendium) and **Place on Scene** with a click, hidden until revealed if you like; the trap goes on the same square, hidden. Recommends Axecleft's Traps, Poisons, and Diseases (v11).
- **Give to one** gives part of a stack (set how many beside its tick box) and custom currencies.
- **Custom currencies** (D35E's Currency Configuration) in the coin editor, Give to One and Share Out.
- **Weight** of the hoard (coins and items, in D35E's units), of each item, and of each share in the Give and Share Out confirmations.
- **Sells for:** what the hoard fetches from a merchant (SRD: items at half, gems, art and trade goods at full value), with a sell % for each hoard.
- The hoard list shows each hoard's value and encounter level; with more than six hoards, **Find** and sort by name, value or encounter level.
- The tab keeps up when hoards or trap actors are made or deleted in the Actors sidebar.
- Tours: a new **On the scene** tour; Filling a hoard covers Gather loot.
- Long lists in the Gather Loot, Share Out and Give confirmations scroll, so the buttons stay on screen.
- French: the new text drafted, for Gilgalad to check.
- The manifest, download and recommended modules now point to the Foundry 11 (-v11) repositories, so Update All installs Foundry 11 builds.
- Ships Axecleft's Tools 9.72: searchable lists can have headings that divide them.
- No Hoard Editor button in the Axecleft's Tools menu any more (as in v1.14.0.2): the Hoard Editor is the Treasure Generator's Hoards tab.


v1.14.0.1 (Foundry 13–14) / v1.11.0.1 (Foundry 11):

- First release: hoard actors on D35E's loot sheet with random chest art, the Hoards tab (contents, values, SRD target by encounter level, roll and fill to target, send other tabs' treasure in, give to one character, share among the party (Party Member characters), save to and load from a file), a Hoard Editor button in the Axecleft's Tools menu and on hoard sheets. French translation.
- Foundry 11 (v1.11.0.1): shared tools 9.71 (the Tool Suite settings and welcome window, and the tours: Hoard Editor: Hoards, Filling a hoard and Sharing out, GM only).
