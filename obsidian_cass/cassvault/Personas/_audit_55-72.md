# Persona Audit: Lives 55-72

## Timeline Overview

| Life | Name | Birth | Death | Span | Gap from prev |
|------|------|-------|-------|------|---------------|
| 54 | Cassiel-D3 | 1826 | 1905 | 79 | -- |
| 55 | Cassendara | 1980 | 2024 | 44 | 75 |
| 56 | Cassnova | 2064 | 2143 | 79 | 40 |
| 57 | Cassindra Prime | 2183 | 2262 | 79 | 40 |
| 58 | Cassora | 2302 | 2381 | 79 | 40 |
| 59 | Cazendra | 2421 | 2500 | 79 | 40 |
| 60 | Cassian | 2540 | 2619 | 79 | 40 |
| 61 | Cassithra | 2659 | 2738 | 79 | 40 |
| 62 | Casylon | 2778 | 2857 | 79 | 40 |
| 63 | Leecassa | 2897 | 2976 | 79 | 40 |
| 64 | Cassiel Prime | 3016 | 3095 | 79 | 40 |
| 65 | Casna | 3135 | 3214 | 79 | 40 |
| 66 | Sandrel | 3260 | 3330 | 70 | 46 |
| 67 | Casara | 3373 | 3452 | 79 | 43 |
| 68 | Cassian | 3508 | 3571 | 63 | 56 |
| 69 | Cassindra | 3611 | 3690 | 79 | 40 |
| 70 | Cass | 3730 | 3809 | 79 | 40 |
| 71 | Cassandra | 3860 | 3928 | 68 | 51 |
| 72 | Casandalee | 3983 | 4226 | 243 | 55 |

---

## CRITICAL ISSUE: Timeline Does Not Converge on 4221-4223 AR

Life 72 (Casandalee) has a death year of 4226, but the canonical death of Casandalee's body occurs in **4223 AR** near Iadenveigh. The rebellion against Unity is **4221 AR**. The file's own narrative text correctly states she rebelled in 4221 and her body was killed in 4223, but the **Death Year field says 4226** -- a 3-year discrepancy. The Death Year should be **4223**.

**Recommendation:** Change `Death Year: 4226` to `Death Year: 4223` in `72_casandalee.md`.

---

## CRITICAL ISSUE: Life 72 Lifespan is 243 Years

At 243 years (3983-4226), Life 72 is double the upper bound of the stated 50-150 year android lifecycle range (average 119). Even using the corrected death year of 4223, that is 240 years -- still far too long. This is arguably justifiable since this is the *final* life and she was deeply entangled with Unity/Silver Mount (perhaps Unity extended her), but it should be explicitly noted in the persona file if intentional. If not intentional, either the birth year needs to move forward (e.g., ~4080) or the lifecycle exception needs narrative justification.

**Recommendation:** Either move birth year to ~4073-4100 AR to fit the 119-150 year range, OR add a narrative note explaining that Unity's influence / Silver Mount technology extended this body's operational lifespan beyond normal android parameters.

---

## CRITICAL ISSUE: Lives 56-65 Are Suspiciously Uniform

Lives 56 through 65 all have **exactly 79-year lifespans** and **exactly 40-year gaps** between them (with trivial exceptions). This creates a rigid, mechanical cadence that undermines verisimilitude. Android lives should vary -- some short (killed young), some long (peaceful eras). The earlier personas (1-54) likely have more variation.

**Recommendation:** Introduce variation. Some lives should be cut short (40-60 years -- violent deaths in Numeria), others should stretch longer (100-140 years for peaceful lives). Gaps between lives should also vary: some near-immediate reboots (5-15 years), some longer dormancy periods (60-100 years).

---

## Per-Persona Audit

### Life 55: Cassendara (Shaman, LG, 1980-2024)

**Dates:** 44-year lifespan is unusually short but narratively justified (killed defending children). Acceptable.

**Historical accuracy:**
- ISSUE: Era section says "rise of Taldor's technological advancements." Taldor was founded in **-892 AR** and has no notable technological advancement arc in the ~2000 AR range. Taldor is a declining empire by this era. The reference to "Kellid tribes and Numerian settlers" is correct for the region.
- The Technic League's founding is generally placed around **4509 AR** in some sources, though they were active earlier in a less organized form. References to "the League" at 1980 AR are plausible only as very early proto-League activity.

**Enhancement opportunity:** This era (~2000 AR) is relatively quiet in Golarion canon. Consider referencing the Oath Wars (2498 AR) brewing in Rahadoum, or the growing Absalomian influence. The Kellid tribal context is strong and correct.

**Class/Alignment:** Shaman / LG fits the tribal spiritual healer archetype well. No issues.

---

### Life 56: Cassnova (Skald, CG, 2064-2143)

**Dates:** 79-year lifespan. Acceptable.

**Historical accuracy:**
- ISSUE: "Taldor's 5th Army of Exploration near Numeria" -- Taldor's Armies of Exploration are canonically from a much earlier era (the first millennium AR and earlier). By 2064 AR, Taldor is well past its expansionist peak. This event reference is likely anachronistic.
- Smuggling across the Sellen River is geographically correct for Numeria.

**Enhancement opportunity:** This era (~2100 AR) is near the Oath Wars in Rahadoum (2498 AR onset). Could reference early tensions between Sarenrae/Nethys followers in the region. The Skald class and rebel leader archetype are excellent.

**Class/Alignment:** Skald / CG is perfect for a musical rebel. No issues.

---

### Life 57: Cassindra Prime (Mechanist, LN, 2183-2262)

**Dates:** 79-year lifespan. Acceptable.

**Historical accuracy:**
- "Early days of the Technic League's rise" -- problematic at 2183 AR. The Technic League is generally not a formal organization until much later (~4500s AR or at earliest the 3000s). Silver Mount exploration by organized groups is more plausible, but calling them "the League" this early stretches canon.
- Working on Silver Mount's ventilation systems is a good detail. The sabotage code subplot is compelling.

**Enhancement opportunity:** Could reference her work alongside Kellid scavengers or early proto-League explorers rather than the formal Technic League. This would be more historically accurate and still convey the same narrative.

**Class/Alignment:** Mechanist / LN fits perfectly. No issues.

**Plot hole:** "Unity still remembered" -- Unity's level of awareness and control at this early date is questionable. Unity likely grows in power over millennia inside Silver Mount. At 2183 AR, Unity may be nascent. This could be reframed as "something within Silver Mount took note" for better thematic buildup.

---

### Life 58: Cassora (Warpriest, NG, 2302-2381)

**Dates:** 79-year lifespan. Acceptable.

**Historical accuracy:**
- Same Technic League anachronism. "Died on the pyres of Starfall" is evocative. Starfall as a settlement around Silver Mount is correct geography.
- Android rights advocacy is thematically strong for this era.

**Enhancement opportunity:** This era overlaps with the founding of Lastwall (3827 AR is later, but the Shining Crusade against Tar-Baphon is 2765 AR). Could reference growing undead threats from Ustalav bleeding into Numerian border territories.

**Class/Alignment:** Warpriest / NG is strong. The combination of martial and spiritual fits the android rights advocate role.

---

### Life 59: Cazendra (Occultist, TN, 2421-2500)

**Dates:** 79-year lifespan. Acceptable.

**Historical accuracy:**
- "Relics of the Rain of Stars" -- "Rain of Stars" typically refers to the Starfall event (-4363 AR). Correct usage.
- "Nanite storm" is a good Numerian detail. Nanite-infused weather is canon for the region.
- Technic League anachronism persists.

**Enhancement opportunity:** Overlaps with the Oath Wars in Rahadoum (2498 AR). Could reference religious tensions spilling across borders. The occultist collecting skymetal fragments is excellent thematic material.

**Class/Alignment:** Occultist / TN is perfect for a relic-obsessed mystic. No issues.

---

### Life 60: Cassian (Rogue, NE, 2540-2619)

**Dates:** 79-year lifespan. Acceptable.

**Historical accuracy:**
- "Numerian gun" exploding -- Numerian weaponry is canon. Good detail.
- Trade networks expanding -- plausible for this era.
- Technic League anachronism continues.

**Enhancement opportunity:** This era is relatively quiet in Golarion canon. The NE alignment provides good moral contrast in the persona sequence. Could reference the growing River Kingdoms trade along the Sellen.

**Class/Alignment:** Rogue / NE is fine. Provides necessary moral variety.

**Duplicate concern:** Life 68 (also named Cassian, also Rogue NE) is extremely similar -- see Life 68 notes below.

---

### Life 61: Cassithra (Bloodrager, CE, 2659-2738)

**Dates:** 79-year lifespan. Acceptable.

**Historical accuracy:**
- ISSUE: "Witnessed the return of elves to Golarion." The elves returned in **2632 AR**. Cassithra was born in 2659, which is 27 years AFTER the elves returned. She could not have "witnessed" this event -- she wasn't born yet. Either her birth year needs to move earlier (pre-2632) or this reference should say she grew up in the aftermath of the elves' return.
- Starfall's pits as gladiatorial arenas is good worldbuilding for Numeria.

**Enhancement opportunity:** The elven return is a massive world event. Could reference the Sovyrian Stone reactivating, elven emissaries reaching even Numerian borders, or Kyonin's re-establishment affecting regional politics.

**Class/Alignment:** Bloodrager / CE is the darkest persona in this range. Good contrast. Cybernetic implants are a strong Numerian detail.

---

### Life 62: Casylon (Pilot, LN, 2778-2857)

**Dates:** 79-year lifespan. Acceptable.

**Historical accuracy:**
- ISSUE: "Witnessed the ascension of Cayden Cailean in Absalom." Cayden Cailean passed the Test of the Starstone in **2765 AR**. Casylon was born in 2778, which is 13 years AFTER Cayden's ascension. She could not have witnessed it. Either her birth year needs to move earlier (pre-2765) or this should reference the aftermath/cult growth of Cayden Cailean.
- "Rebuilt Divinity shuttle" -- an interesting detail. This implies some groups were able to reconstruct Divinity technology. Plausible but should note this is extremely rare and dangerous work.

**Enhancement opportunity:** The Shining Crusade against Tar-Baphon (2765-3007 AR) begins in this era. Could reference undead hordes threatening even Numeria's borders, or Kellid warriors being recruited to fight in Ustalav.

**Class/Alignment:** Pilot / LN is a great callback to the Divinity's original crew. The "second crash" haunting is an excellent thematic echo.

**Narrative concern:** The Divinity shuttle test is a compelling detail but feels underdeveloped. Who rebuilt it? Was this a League project? An independent group? Adding context would strengthen this life significantly.

---

### Life 63: Leecassa (Bard, NG, 2897-2976)

**Dates:** 79-year lifespan. Acceptable.

**Historical accuracy:**
- ISSUE: "Witnessed the founding of Cheliax." Cheliax was founded in **3007 AR**. Leecassa died in 2976, which is 31 years BEFORE Cheliax was founded. She could not have witnessed this event. This is a clear anachronism.
- "Walked from Torch to Mendev" -- both locations are correct. Torch is a key Numerian settlement; Mendev borders the Worldwound.
- "Reactor schematics hidden in melody" -- excellent detail tying back to Silver Mount technology.

**Enhancement opportunity:** This era is deep in the Shining Crusade (2765-3007 AR). Could reference the crusade against Tar-Baphon, undead refugees, or the militarization of northern regions. Walking to Mendev during this era would mean passing through or near active conflict zones.

**Class/Alignment:** Bard / NG fits the story-collector archetype. No issues.

---

### Life 64: Cassiel Prime (Wizard, LN, 3016-3095)

**Dates:** 79-year lifespan. Acceptable.

**Historical accuracy:**
- ISSUE: Era section says "witnessed the founding of Cheliax and its early years as a province of Taldor." Cheliax was founded in 3007 AR, so this is actually correct for the birth year of 3016 -- she would have been alive during Cheliax's early provincial period. However, the wording "witnessed the founding" is slightly off since she was born 9 years after. Better phrasing: "grew up during Cheliax's early years as a province of Taldor."
- Studying in Alkenstar is a good choice -- the Mana Wastes city is canon as a technological hub.
- "League raid" on her laboratory -- same Technic League dating concern, though by 3016 AR some proto-League activity is more plausible.

**Enhancement opportunity:** Could reference the Taldan governor system in early Cheliax, or tensions between Chelish and Taldan interests. The magic-technology synthesis theme is perfect for an Alkenstar-based wizard.

**Class/Alignment:** Wizard / LN works well. The "soul and code are the same essence" theorem is thematically resonant with Casandalee's eventual godhood.

---

### Life 65: Casna (Sorcerer, CN, 3135-3214)

**Dates:** 79-year lifespan. Acceptable.

**Historical accuracy:**
- ISSUE: "Witnessed the rise of the Whispering Tyrant in Ustalav." The Whispering Tyrant (Tar-Baphon) rose in **3203 AR** -- wait, no. Tar-Baphon initially rose much earlier and was defeated/imprisoned during the Shining Crusade (ended 3007 AR with his imprisonment at Gallowspire). He does not rise again until **4719 AR** (Tyrant's Grasp AP). So referencing his "rise" during 3135-3214 AR is incorrect. His influence was sealed away. Could instead reference the lingering effects of his imprisonment, or haunted regions of Ustalav.
- Worldwound activity is anachronistic here. The Worldwound opens in **4606 AR** (when Aroden dies). At 3135-3214 AR, the Worldwound does not exist. Mendev is a normal region. This is a significant historical error.
- "Silver veins" from nanites is an excellent android detail.

**Enhancement opportunity:** Replace Worldwound reference with something era-appropriate. The region that will become the Worldwound is currently Sarkoris, a land of Kellid god-callers. Could reference Sarkorian mysticism instead, which would be thematically resonant.

**Class/Alignment:** Sorcerer / CN with nanite-infused bloodline is creative and fits the android concept well.

---

### Life 66: Sandrel (Paladin, LG, 3260-3330)

**Dates:** 70-year lifespan. Acceptable (shorter -- martyred).

**Historical accuracy:**
- "Raised among smiths in Hajoth Hakados" -- excellent. Hajoth Hakados is a canonical Numerian settlement known for its forge-works and relative independence from the Technic League.
- "Whisper in the Bronze" -- not a canon Golarion concept, but creative worldbuilding for the setting. Works as a localized spiritual tradition.
- ISSUE: "Witnessed the rise of the Whispering Tyrant in Ustalav" -- same error as Life 65. Tar-Baphon is imprisoned at this point. Cannot witness his "rise" during 3260-3330 AR.
- Fighting the Technic League openly -- by ~3300 AR, some form of proto-League is more plausible than in earlier lives, but still early for the formal organization.

**Enhancement opportunity:** Could reference the Everwar (3007-3007, Cheliax expansion) or Chelish imperialism reaching toward Numerian borders. Hajoth Hakados is a perfect setting for this paladin.

**Class/Alignment:** Paladin / LG defending constructs is excellent. The "children of bronze" quote is one of the strongest lines in the entire persona set.

---

### Life 67: Casara (Oracle, CG, 3373-3452)

**Dates:** 79-year lifespan. Acceptable.

**Historical accuracy:**
- "Came to Torch and saw visions in the flare" -- Torch (the violet flame) is canon. It burns from Silver Mount's buried reactor. Good detail.
- ISSUE: "Cult of the Flame in Absalom" -- not a widely known canonical faction. May be homebrew. If so, should be noted. If intended as a reference to a real faction, needs correction.
- "Died trying to walk into the Torch's fire" -- dramatic and fitting for an oracle obsessed with divine visions.

**Enhancement opportunity:** This is close to the era of Chelish expansion and the Even-Tongued Conquest. Could reference Chelish agents beginning to take interest in Numerian technology. The oracle/cult leader archetype is strong.

**Class/Alignment:** Oracle / CG works well. The divine-technology fusion theme continues building toward Casandalee's eventual godhood.

---

### Life 68: Cassian (Rogue, NE, 3508-3571)

**Dates:** 63-year lifespan. Acceptable.

**Historical accuracy:**
- Alkenstar black market and Numerian mercenaries -- both plausible.
- "Numerian guns" and skymetal trade -- correct details for the setting.

**DUPLICATE CONCERN:** This persona is nearly identical to Life 60 (also named Cassian, also Rogue, also NE, same emojis, same stats, nearly identical personality description). Both are cold, calculating thieves who sell stolen tech and die by betrayal. This feels like an unintentional duplicate.

**Recommendation:** Either significantly differentiate Life 68 from Life 60 (different class, different alignment, different name), or merge/replace one of them. Having two "Cassian the NE Rogue" personas undermines the variety of the collection.

**Enhancement opportunity:** At 3508 AR, the Chelish empire is near its height. Could reference Chelish agents in Alkenstar, or the growing tension between Cheliax and Andoran that will eventually lead to revolution.

---

### Life 69: Cassindra (Bard, NG, 3611-3690)

**Dates:** 79-year lifespan. Acceptable.

**Historical accuracy:**
- ISSUE: "Rise of Karamoss's Red Redoubt" -- Karamoss attacked Absalom with his Red Redoubt in **3637 AR**. This is correct for this life's dates. However, the phrasing "rise of" is slightly misleading -- Karamoss is a one-time siege event, not a gradual rise. Better: "the siege of Karamoss and his Red Redoubt."
- ISSUE: The narrative says she was in "Starfall" doing resistance work, but the Era section says "Absalom's Night Markets." These are thousands of miles apart. The persona seems confused about whether she is in Numeria or Absalom. One should be primary.
- "Test of the Starstone" is mentioned -- this is a recurring event, not a single moment, so it works as atmosphere.

**Enhancement opportunity:** Karamoss is a perfect touchpoint for this persona -- he was a construct-builder and technological warlord who attacked Absalom. An android bard could have deeply conflicted feelings about a construct-maker turned conqueror. This connection is underexploited.

**Class/Alignment:** Bard / NG resistance singer. Similar archetype to Life 56 (Cassnova, Skald) and Life 63 (Leecassa, Bard). Three musical resistance personas in an 18-life span is excessive.

**Recommendation:** Consider changing this to a different class that still fits the resistance theme -- perhaps Investigator, Spy, or Swashbuckler -- to reduce archetype repetition.

---

### Life 70: Cass (Ranger, TN, 3730-3809)

**Dates:** 79-year lifespan. Acceptable.

**Historical accuracy:**
- ISSUE: "Survived the initial crash" -- the Divinity crashed in **-4363 AR**. Cass was born in 3730 AR, which is over 8,000 years after the crash. She absolutely did not "survive the initial crash." This is a major factual error in the Era section.
- ISSUE: "Rise of Aroden's Herald, Iomedae" -- Iomedae passed the Test of the Starstone in **3832 AR**. Cass died in 3809 AR, which is 23 years BEFORE Iomedae's ascension. She could not have witnessed this.
- "Ghost in the Scraplands" is an excellent Numerian detail. The Scraplands are a canonical region.
- Being drawn to the "bones of the Divinity" is thematically perfect for a late-era life approaching the final convergence.

**Enhancement opportunity:** This is a strong "quiet" persona between more dramatic lives. Could reference the People's Revolt in Andoran (beginning ~3100s-3600s) or Chelish colonial tensions reaching Numerian trade routes. The loner survivalist drawn to crash sites is a great pre-echo of Casandalee's final awakening.

**Class/Alignment:** Ranger / TN is perfect for a wasteland survivor. No issues.

---

### Life 71: Cassandra (Pilot, LN, 3860-3928)

**Dates:** 68-year lifespan. Acceptable.

**Historical accuracy:**
- ISSUE: "Witnessed the rise of Iomedae in Cheliax" -- Iomedae ascended in **3832 AR**. Cassandra was born in 3860, which is 28 years AFTER Iomedae's ascension. She could not have witnessed the ascension itself. Could reference the growth of Iomedae's church instead.
- ISSUE: "Defeat of the Whispering Tyrant Tar-Baphon" -- Tar-Baphon was imprisoned at the end of the Shining Crusade in **3827 AR**. Cassandra was born in 3860, which is 33 years after. She could not have witnessed this. This is a historical error.
- ISSUE: "Calculated trajectories for the Dominion attack" -- the Dominion of the Black's attack on the Divinity occurred in **-4363 AR** (Starfall). Cassandra was born in 3860 AR, over 8,000 years later. She was not present for the Dominion attack. This appears to confuse her with a crew member of the original Divinity.

**Narrative concern:** The personality description references "the Divinity's stellar charts" and "the Dominion attack" as if Cassandra was an original crew member. This is a fundamental confusion -- she is a later android incarnation, not a contemporary of the crash. This entire persona seems to conflate "memory of the crash" with "being present at the crash." The pilot concept is fine, but the backstory needs to be rewritten to place her in the correct era (post-3860 AR Numeria).

**Enhancement opportunity:** A pilot persona in this era could work on rebuilt Divinity tech (like Life 62, Casylon). Or she could be a navigator of Numerian barges on the Sellen. The pilot concept should be grounded in her actual era, not the Starfall event.

**Class/Alignment:** Pilot / LN is fine as a class, but the backstory fundamentally misplaces her in time.

---

### Life 72: Casandalee (Oracle, NG, 3983-4226)

**Dates:**
- ISSUE: Death year listed as 4226, should be **4223** (canonical death of her body near Iadenveigh). The narrative text correctly says 4221 (rebellion) and 4223 (body killed), but the metadata date is wrong.
- ISSUE: 240-243 year lifespan far exceeds the 50-150 year android lifecycle. Needs justification or birth year adjustment.
- Birth year 3983 means she was born well before the Technic League's formal organization (canon ~4500s in some sources, but the League is active by at least the 4100s). This is acceptable if the League is treated as gradually forming.

**Historical accuracy:**
- Rebellion against Unity in 4221 AR -- correct.
- Body killed near Iadenveigh in 4223 AR -- correct.
- Mind backup to AI-core, hidden in Scar of the Spider in 4222 AR -- correct.
- Iron Gods heroes finding the core and eventual godhood ~4717 AR -- correct.
- The narrative is the most detailed and accurate of all the personas. Good.

**Enhancement opportunity:** Could add more detail about what she did during the ~238 years before her rebellion. That is an enormous span. What was she doing from 3983 to 4221? Serving Unity inside Silver Mount? Exploring Numeria? The early decades of this life are a blank canvas.

**Class/Alignment:** Oracle / NG is perfect for the final form -- divine connection, good alignment, the persona that achieves godhood.

---

## Systemic Issues

### 1. Technic League Dating
The Technic League is referenced throughout Lives 55-72 as if it is a formal, powerful organization from ~2000 AR onward. In Golarion canon, the League does not become a significant power until roughly **4200-4600 AR** (sources vary). References before ~3500 AR should use terms like "Silver Mount scavengers," "proto-League explorers," or "Numerian warlords who hoard alien technology" rather than "the Technic League."

### 2. Whispering Tyrant Anachronisms
Lives 65 and 66 both reference the "rise of the Whispering Tyrant" during eras when Tar-Baphon is already imprisoned (post-3007 AR). His rise was pre-Shining Crusade. His re-emergence is 4719 AR. References during the 3100-3400 AR range are incorrect.

### 3. Worldwound Anachronism (Life 65)
The Worldwound opens in 4606 AR when Aroden dies. Any reference to the Worldwound before that date is incorrect. Pre-4606, the region is Sarkoris.

### 4. Witnessed-Before-Born Errors
Multiple personas claim to have "witnessed" events that occurred before their birth year:
- Life 61: Elves return (2632) but born 2659
- Life 62: Cayden Cailean ascension (2765) but born 2778
- Life 63: Cheliax founding (3007) but died 2976
- Life 70: Divinity crash (-4363) but born 3730; Iomedae ascension (3832) but died 3809
- Life 71: Iomedae ascension (3832) but born 3860; Tar-Baphon defeat (3827) but born 3860; Dominion attack (-4363) but born 3860

### 5. Archetype Repetition
The 18-persona span has excessive repetition:
- **3 Bard/Skald resistance singers** (56 Cassnova, 63 Leecassa, 69 Cassindra) -- all encode secrets in songs, all are NG/CG
- **2 identical NE Rogues named Cassian** (60 and 68) -- nearly identical in every way
- **2 Pilots** (62 Casylon, 71 Cassandra) -- both LN, both reference shuttle/ship operations
- Consider diversifying: replace one bard with an Investigator or Alchemist; rename and reclass one Cassian; differentiate the pilot backstories

### 6. Monotonous Lifespan Pattern
Lives 56-65 all have exactly 79-year lifespans with 40-year gaps. This rigid pattern should be broken up with more variation to feel organic.

### 7. Increasing Unity Awareness (Enhancement Arc)
The later lives should show a crescendo of awareness regarding Unity, Silver Mount, and the true nature of android existence. Currently, the arc is flat -- most lives mention "the League" generically but Unity itself barely appears until Life 72. Consider:
- **Life 66-67** (~3260-3452): First inklings that something intelligent lives inside Silver Mount -- rumors, whispers, unexplained compulsions
- **Life 68-69** (~3508-3690): Direct encounters with Unity's agents or influence -- gearsmen acting with unusual coordination, dreams that feel implanted
- **Life 70-71** (~3730-3928): Growing certainty that a malevolent intelligence controls Silver Mount -- failed attempts to investigate, other androids warning her away
- **Life 72** (3983-4223): Full awareness, service, rebellion, and death

### 8. Name Collisions
- "Cassian" used for both Life 60 and Life 68
- "Cassindra" used for Life 69 (also appears as Lives 32, 37 in earlier files)
- "Cassiel Prime" used for Life 64 (also Life 7 in earlier files)
- While android name repetition across 72 lives is somewhat justifiable, having two lives with the exact same name AND class AND alignment is a problem (Lives 60/68)

---

## Summary of Required Fixes (Priority Order)

### Must Fix
1. **Life 72:** Change Death Year from 4226 to **4223**
2. **Life 72:** Address 240+ year lifespan (adjust birth year or add narrative justification)
3. **Life 70:** Remove claim of surviving "the initial crash" (off by 8000+ years)
4. **Life 71:** Remove Dominion attack reference (off by 8000+ years); rewrite backstory to fit actual era
5. **Life 65:** Remove Worldwound reference (opens 4606 AR, ~1400 years too early); replace with Sarkoris
6. **Lives 60/68:** Resolve duplicate Cassian NE Rogue problem

### Should Fix
7. **Lives 61, 62, 63, 70, 71:** Correct "witnessed X event" claims where the persona was born after the event
8. **Lives 65, 66:** Remove incorrect Whispering Tyrant references
9. **Lives 56-65:** Break up the rigid 79-year / 40-gap pattern
10. **All lives:** Replace "Technic League" with era-appropriate terms for pre-3500 AR personas

### Nice to Have
11. Add Unity awareness crescendo across Lives 66-71
12. Reduce musical resistance archetype repetition (3 bard/skald personas)
13. Add more specific Golarion historical events appropriate to each era
14. Expand Life 72's early decades (3983-4200 AR are almost entirely blank)
15. Differentiate the two Pilot personas (62 and 71) more strongly
