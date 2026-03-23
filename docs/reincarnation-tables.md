# Casandalee's Reincarnation Tables

Cass uses two reincarnation tables in Discord: **standard** (PF1 reincarnate spell) and **aquatic** (Shackles-themed). Use `/reincarnate standard` or `/reincarnate aquatic`, or ask Cass to roll for a character. Racial traits are available via `/ancestry <race>`.

---

## Standard table (1d43)

*As per the Pathfinder 1e reincarnate spell. Data: `reincarnation_table.json`.*

| Roll | Result |
|------|--------|
| 1 | Bugbear |
| 2 | Dwarf |
| 3 | Elf |
| 4 | Gnoll |
| 5 | Gnome |
| 6 | Goblin |
| 7 | Ship-Bound Half-Elf |
| 8 | Half-orc |
| 9 | Halfling |
| 10 | Human |
| 11 | Kobold |
| 12 | Lizardfolk |
| 13 | Sea Reaver Orc |
| 14 | Troglodyte |
| 15 | Other (GM's choice) |
| 16 | Aasimar |
| 17 | Android |
| 18 | Catfolk |
| 19 | Besmaran Changeling |
| 20 | Dhampir |
| 21 | Ifrit |
| 22 | Drow |
| 23 | Duergar |
| 24 | Fetchling |
| 25 | Ghoran |
| 26 | Gillmen |
| 27 | Aquatic Elf |
| 28 | Half Giant |
| 29 | Ogre |
| 30 | Hobgoblin |
| 31 | Tiefling |
| 32 | Kasatha |
| 33 | Kitsune |
| 34 | Lashunta |
| 35 | Nagaji |
| 36 | Oread |
| 37 | Samsaran |
| 38 | Strix |
| 39 | Tengu |
| 40 | Vanara |
| 41 | Vishkanya |
| 42 | Merfolk |
| 43 | Ratfolk |

*(Table file also includes Wayangs; the bot rolls 1d43, so only 1–43 are used.)*

---

## Aquatic table (1d100) — Shackles

*Custom table for aquatic creatures in the Shackles region (e.g. Sahuagin Druids). Data: `reincarnation_aquatic_table.json`.*

| Roll | Result | Details |
|------|--------|---------|
| 1–8 | Merfolk | Common throughout the Fever Sea; insular reef-kin and current-riders. |
| 9–15 | Aquatic Elf | Reef- or kelp-dwelling elves; wary of surface politics. |
| 16–22 | Gillman | Azlanti-descended survivors, culturally divided between land and sea. |
| 23–29 | Locathah | Nomadic shoal-folk; proud traders and fisher-warriors. |
| 30–35 | Cecaelia | Octopus-blooded mystics; unsettling but respected for occult insight. |
| 36–41 | Sahuagin (Malenti) | Rare elven-appearing mutants bred for infiltration and espionage. |
| 42–46 | Adaro | Solitary sharklike hunters; often exiles or renegades. |
| 47–51 | Siyokoy | Ruin-scavenging eel-folk; pragmatic and opportunistic. |
| 52–56 | Skum (Free-Willed) | Former aboleth thralls, biologically warped but mentally autonomous. |
| 57–61 | Triton | Extraplanar sea-knights; culturally hostile to sahuagin and pirates alike. |
| 62–66 | Sea Reaver Orc | Orcs descended from escaped sahuagin slaves; one traditional orc racial trait replaced with a swim speed and aquatic adaptation. |
| 67–71 | Ship-Bound Half-Elf | Shackles-born sailors; replace elven bonuses with Skill Focus (Seamanship—pirate or sailor) and Swim, and replace longbow proficiency with rapier, cutlass, or scimitar. |
| 72–76 | Besmaran Changeling | Changelings bound to Besmara; they do not undergo unwilling hag or sea-hag transformation so long as they remain in the Pirate Queen's service. |
| 77–81 | Grindylow | Goblin-kin twisted by brine and cruelty; dangerous, cunning, and feared. |
| 82–85 | Iku-Turso (Lesser Spawn) | Myth-haunted eelfolk; a diminished lineage rather than a full legendary specimen. |
| 86–89 | Ceratioidi | Abyssal anglerfolk; reincarnation feels ominous and portentous. |
| 90–94 | Human (Shackles Islander) | Pirate stock, reef-runner, or freed slave of the Fever Sea. |
| 95–96 | Other Aquatic Humanoid (GM's Choice) | Must plausibly exist in the Shackles or surrounding seas. |
| 97–100 | Player's Choice (GM Approval) | May require rare reagents, divine favor, or significant roleplay consequences. |

---

## Commands

- **`/reincarnate standard [character name]`** — Roll on the standard 1d43 table (optional: for a named character).
- **`/reincarnate aquatic [character name]`** — Roll on the Shackles aquatic 1d100 table.
- **`/ancestry <race>`** — Look up racial traits for any reincarnation result (autocomplete and fuzzy matching).

Legacy **`/reincarnate-aquatic`** still works and uses the same aquatic table.
