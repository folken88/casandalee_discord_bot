/**
 * /charactersheet command for Casandalee
 * Upload a screenshot of a PF1 character sheet and Cass will parse it
 * into a character dossier using Claude's vision capabilities.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dossierManager = require('../utils/dossierManager');
const nameResolver = require('../utils/nameResolver');
const llmRouter = require('../utils/llmRouter');
const logger = require('../utils/logger');

/** Supported image MIME types (Discord's contentType can be unreliable) */
const SUPPORTED_CONTENT_TYPES = new Set([
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'
]);

/**
 * Detect real image MIME type from buffer magic bytes.
 * Discord often reports contentType incorrectly (e.g., says webp but sends png).
 * @param {Buffer} buffer - Image data
 * @returns {string|null} - Detected MIME type or null
 */
function detectImageType(buffer) {
    if (!buffer || buffer.length < 4) return null;

    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return 'image/png';
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return 'image/jpeg';
    }
    // GIF: 47 49 46 38
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
        return 'image/gif';
    }
    // WebP: RIFF....WEBP
    if (buffer.length >= 12 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return 'image/webp';
    }

    return null;
}

module.exports = {
    /** Custom timeout: vision API calls need more than 5s */
    timeout: 30000,

    data: new SlashCommandBuilder()
        .setName('charactersheet')
        .setDescription('Upload a character sheet screenshot to create/update a dossier')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Character name')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addAttachmentOption(option =>
            option.setName('sheet')
                .setDescription('Screenshot of the character sheet')
                .setRequired(true)
        ),

    /**
     * Handle autocomplete for character name
     * @param {Object} interaction - Discord autocomplete interaction
     */
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const matches = nameResolver.search(focusedValue, 25);
        const dossierNames = dossierManager.getAllNames();
        const allNames = [...new Set([...matches, ...dossierNames])];

        const filtered = allNames
            .filter(name => name.toLowerCase().includes(focusedValue.toLowerCase()))
            .slice(0, 25);

        if (focusedValue.length > 1 && !filtered.some(n => n.toLowerCase() === focusedValue.toLowerCase())) {
            filtered.unshift(focusedValue);
        }

        await interaction.respond(
            filtered.slice(0, 25).map(name => ({ name, value: name }))
        );
    },

    /**
     * Execute the /charactersheet command
     * @param {Object} interaction - Discord command interaction
     */
    async execute(interaction) {
        const nameInput = interaction.options.getString('name');
        const attachment = interaction.options.getAttachment('sheet');

        // Quick sanity check: Discord should at least claim it's an image
        if (!attachment.contentType || !SUPPORTED_CONTENT_TYPES.has(attachment.contentType)) {
            await interaction.reply({
                content: `That doesn't look like an image. Please upload a PNG, JPEG, or WebP screenshot of the character sheet.`,
                ephemeral: true
            });
            return;
        }

        // Defer reply since vision processing takes a few seconds
        await interaction.deferReply();

        try {
            // Download the image
            const response = await fetch(attachment.url);
            if (!response.ok) {
                throw new Error(`Failed to download image: ${response.status}`);
            }
            const imageBuffer = Buffer.from(await response.arrayBuffer());

            // Detect REAL image type from magic bytes (Discord's contentType is unreliable)
            const mediaType = detectImageType(imageBuffer) || attachment.contentType;
            logger.info(`Processing character sheet for "${nameInput}" (${attachment.name}, ${(imageBuffer.length / 1024).toFixed(0)}KB, detected: ${mediaType}, discord said: ${attachment.contentType})`);

            // Send to Claude Vision for parsing
            const extractionPrompt = `Analyze this Pathfinder 1st Edition character sheet screenshot carefully. Extract ALL visible character data.

IMPORTANT: Look carefully for ALL THREE saving throws. In PF1 sheets, Fortitude, Reflex, and Will saves are typically displayed in a row, often with shield icons. Each has a total bonus (e.g., +19, +11, +19). Do NOT skip any of the three saves.

Return data in this exact JSON format (use null ONLY for fields truly not visible):

{
  "name": "character name",
  "race": "race",
  "class": "class and archetype if visible",
  "level": number,
  "alignment": "alignment",
  "deity": "deity if visible",
  "player": "player name if visible",
  "hp_current": number,
  "hp_max": number,
  "ac": number,
  "touch_ac": number,
  "flat_footed_ac": number,
  "abilities": {
    "str": number, "dex": number, "con": number,
    "int": number, "wis": number, "cha": number
  },
  "saves": {
    "fort": number, "ref": number, "will": number
  },
  "bab": number,
  "cmb": number,
  "cmd": number,
  "initiative": number,
  "speed": "land speed in feet",
  "skills": ["skill name +bonus", ...],
  "feats": ["feat name", ...],
  "traits": ["trait name", ...],
  "special_abilities": ["ability name", ...],
  "weapons": ["weapon name", ...],
  "armor": "armor if visible",
  "notes": "any other notable text on the sheet"
}

Return ONLY the JSON, no other text.`;

            const visionResult = await llmRouter.claudeVision(
                extractionPrompt,
                imageBuffer,
                mediaType,
                {
                    system: 'You are an expert at reading Pathfinder 1st Edition character sheets. Extract all visible data accurately. Return only valid JSON.',
                    maxTokens: 1500,
                    model: 'claude-3-5-haiku-latest'
                }
            );

            // Parse the JSON response
            let parsed;
            try {
                // Claude sometimes wraps in markdown code blocks
                const jsonStr = visionResult.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
                parsed = JSON.parse(jsonStr);
            } catch (parseErr) {
                logger.error('Failed to parse vision result as JSON:', visionResult.substring(0, 200));
                await interaction.editReply({
                    content: `I could read the image but had trouble parsing the data. Here's what I saw:\n\n${visionResult.substring(0, 1500)}`
                });
                return;
            }

            // Resolve or create the character name
            let canonical = nameResolver.resolve(nameInput);
            if (!canonical) {
                canonical = nameInput.split(' ')
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                    .join(' ');
            }

            // Get or create dossier
            let dossier = dossierManager.getDossier(canonical);
            if (!dossier) {
                dossier = dossierManager.createDossier(canonical, {
                    race: parsed.race,
                    class: parsed.class,
                    level: parsed.level
                });
            } else {
                // Update fields from parsed data
                if (parsed.race) dossier.race = parsed.race;
                if (parsed.class) dossier.class = parsed.class;
                if (parsed.level) dossier.level = parsed.level;
            }

            // Build a rich description from the parsed data
            const descParts = [];
            if (parsed.alignment) descParts.push(`**Alignment:** ${parsed.alignment}`);
            if (parsed.deity) descParts.push(`**Deity:** ${parsed.deity}`);
            if (parsed.hp_max) descParts.push(`**HP:** ${parsed.hp_current ?? '?'}/${parsed.hp_max}`);
            if (parsed.ac) descParts.push(`**AC:** ${parsed.ac}`);
            if (parsed.speed) descParts.push(`**Speed:** ${parsed.speed}`);
            if (parsed.bab) descParts.push(`**BAB:** +${parsed.bab}`);
            if (parsed.initiative) descParts.push(`**Initiative:** +${parsed.initiative}`);

            if (descParts.length > 0) {
                dossier.description = descParts.join(' | ');
            }

            // Store the full parsed data as a player update
            const summaryParts = [];
            if (parsed.abilities) {
                const abs = parsed.abilities;
                summaryParts.push(`STR ${abs.str} DEX ${abs.dex} CON ${abs.con} INT ${abs.int} WIS ${abs.wis} CHA ${abs.cha}`);
            }
            if (parsed.saves) {
                const sv = (val) => val != null ? `+${val}` : '?';
                summaryParts.push(`Saves: Fort ${sv(parsed.saves.fort)} Ref ${sv(parsed.saves.ref)} Will ${sv(parsed.saves.will)}`);
            }
            if (parsed.feats && parsed.feats.length > 0) {
                summaryParts.push(`Feats: ${parsed.feats.join(', ')}`);
            }
            if (parsed.weapons && parsed.weapons.length > 0) {
                summaryParts.push(`Weapons: ${parsed.weapons.join(', ')}`);
            }

            if (summaryParts.length > 0) {
                dossierManager.addPlayerUpdate(
                    canonical,
                    `[Sheet Import] ${summaryParts.join(' | ')}`,
                    interaction.user.username
                );
            }

            // Also store raw parsed data as a note
            if (parsed.skills && parsed.skills.length > 0) {
                dossierManager.addPlayerUpdate(
                    canonical,
                    `[Skills] ${parsed.skills.join(', ')}`,
                    'sheet-import'
                );
            }
            if (parsed.special_abilities && parsed.special_abilities.length > 0) {
                dossierManager.addPlayerUpdate(
                    canonical,
                    `[Special Abilities] ${parsed.special_abilities.join(', ')}`,
                    'sheet-import'
                );
            }
            if (parsed.notes) {
                dossierManager.addPlayerUpdate(canonical, `[Sheet Notes] ${parsed.notes}`, 'sheet-import');
            }

            dossierManager.flush();

            // Build response embed
            const embed = new EmbedBuilder()
                .setTitle(`Character Sheet Imported: ${canonical}`)
                .setColor(0x00FF88)
                .setThumbnail(attachment.url)
                .setTimestamp();

            if (parsed.race && parsed.class) {
                embed.setDescription(`**${parsed.race} ${parsed.class}${parsed.level ? ` (Level ${parsed.level})` : ''}**`);
            }

            // Ability scores
            if (parsed.abilities) {
                const abs = parsed.abilities;
                const mod = (v) => {
                    if (v == null) return '?';
                    const m = Math.floor((v - 10) / 2);
                    return `${v} (${m >= 0 ? '+' : ''}${m})`;
                };
                embed.addFields({
                    name: 'Ability Scores',
                    value: `STR ${mod(abs.str)} | DEX ${mod(abs.dex)} | CON ${mod(abs.con)}\nINT ${mod(abs.int)} | WIS ${mod(abs.wis)} | CHA ${mod(abs.cha)}`,
                    inline: false
                });
            }

            // Combat stats
            const combatParts = [];
            if (parsed.hp_max) combatParts.push(`HP: ${parsed.hp_current ?? '?'}/${parsed.hp_max}`);
            if (parsed.ac) combatParts.push(`AC: ${parsed.ac}`);
            if (parsed.bab) combatParts.push(`BAB: +${parsed.bab}`);
            if (parsed.cmb) combatParts.push(`CMB: +${parsed.cmb}`);
            if (parsed.cmd) combatParts.push(`CMD: ${parsed.cmd}`);
            if (combatParts.length > 0) {
                embed.addFields({ name: 'Combat', value: combatParts.join(' | '), inline: false });
            }

            // Saves (handle null values gracefully)
            if (parsed.saves) {
                const sv = (val) => val != null ? `+${val}` : '?';
                embed.addFields({
                    name: 'Saving Throws',
                    value: `Fort ${sv(parsed.saves.fort)} | Ref ${sv(parsed.saves.ref)} | Will ${sv(parsed.saves.will)}`,
                    inline: false
                });
            }

            // Feats
            if (parsed.feats && parsed.feats.length > 0) {
                embed.addFields({
                    name: 'Feats',
                    value: parsed.feats.join(', ').substring(0, 1024),
                    inline: false
                });
            }

            // Weapons
            if (parsed.weapons && parsed.weapons.length > 0) {
                embed.addFields({
                    name: 'Weapons',
                    value: parsed.weapons.join(', ').substring(0, 1024),
                    inline: false
                });
            }

            embed.setFooter({ text: `Parsed by Claude Vision | Imported by ${interaction.user.username}` });

            await interaction.editReply({ embeds: [embed] });
            logger.info(`Character sheet imported for ${canonical} by ${interaction.user.username}`);

        } catch (error) {
            logger.error('Error processing character sheet:', error);
            const errorMsg = error.message.includes('Anthropic')
                ? 'Claude vision API error. Please try again.'
                : `Error processing sheet: ${error.message}`;
            await interaction.editReply({ content: `Sorry, ${errorMsg}` });
        }
    }
};
