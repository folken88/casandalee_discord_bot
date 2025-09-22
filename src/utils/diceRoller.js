/**
 * Dice Rolling Utility for D&D Notation
 * Supports standard D&D dice notation (e.g., 1d20+5, 2d6+3, 1d100)
 */

class DiceRoller {
    /**
     * Parse and roll dice using D&D notation
     * @param {string} notation - Dice notation (e.g., "1d20+5", "2d6", "1d100")
     * @returns {Object} - Result object with details
     */
    static roll(notation) {
        try {
            // Clean the notation
            const cleanNotation = notation.trim().toLowerCase();
            
            // Parse the notation
            const parsed = this.parseNotation(cleanNotation);
            if (!parsed) {
                throw new Error('Invalid dice notation');
            }
            
            // Roll the dice
            const results = [];
            let total = 0;
            
            for (let i = 0; i < parsed.count; i++) {
                const roll = Math.floor(Math.random() * parsed.sides) + 1;
                results.push(roll);
                total += roll;
            }
            
            // Apply modifier
            total += parsed.modifier;
            
            return {
                notation: notation,
                parsed: parsed,
                rolls: results,
                total: total,
                breakdown: this.formatBreakdown(parsed, results, total)
            };
            
        } catch (error) {
            throw new Error(`Dice rolling error: ${error.message}`);
        }
    }
    
    /**
     * Parse dice notation into components
     * @param {string} notation - Dice notation to parse
     * @returns {Object|null} - Parsed components or null if invalid
     */
    static parseNotation(notation) {
        // Regex to match dice notation: [count]d[sides][+/-modifier]
        const diceRegex = /^(\d+)d(\d+)([+-]\d+)?$/;
        const match = notation.match(diceRegex);
        
        if (!match) {
            return null;
        }
        
        const count = parseInt(match[1]);
        const sides = parseInt(match[2]);
        const modifier = match[3] ? parseInt(match[3]) : 0;
        
        // Validate ranges
        if (count < 1 || count > 100) {
            throw new Error('Dice count must be between 1 and 100');
        }
        
        if (sides < 1 || sides > 1000) {
            throw new Error('Dice sides must be between 1 and 1000');
        }
        
        return { count, sides, modifier };
    }
    
    /**
     * Format the roll breakdown for display
     * @param {Object} parsed - Parsed dice notation
     * @param {Array} rolls - Individual die results
     * @param {number} total - Final total
     * @returns {string} - Formatted breakdown
     */
    static formatBreakdown(parsed, rolls, total) {
        let breakdown = `[${rolls.join(', ')}]`;
        
        if (parsed.modifier !== 0) {
            const modifierStr = parsed.modifier > 0 ? `+${parsed.modifier}` : `${parsed.modifier}`;
            breakdown += ` ${modifierStr}`;
        }
        
        breakdown += ` = **${total}**`;
        return breakdown;
    }
    
    /**
     * Roll multiple dice sets
     * @param {Array} notations - Array of dice notations
     * @returns {Array} - Array of roll results
     */
    static rollMultiple(notations) {
        return notations.map(notation => this.roll(notation));
    }
    
    /**
     * Roll advantage/disadvantage (roll twice, take higher/lower)
     * @param {string} notation - Base dice notation
     * @param {boolean} advantage - True for advantage, false for disadvantage
     * @returns {Object} - Result with both rolls and final result
     */
    static rollAdvantage(notation, advantage = true) {
        const roll1 = this.roll(notation);
        const roll2 = this.roll(notation);
        
        const finalTotal = advantage 
            ? Math.max(roll1.total, roll2.total)
            : Math.min(roll1.total, roll2.total);
        
        return {
            notation: notation,
            roll1: roll1,
            roll2: roll2,
            finalTotal: finalTotal,
            advantage: advantage,
            breakdown: `${roll1.breakdown} vs ${roll2.breakdown} → **${finalTotal}**`
        };
    }
    
    /**
     * Roll with critical hit detection (for d20 rolls)
     * @param {string} notation - Dice notation (should be d20 based)
     * @param {number} criticalRange - Critical hit range (default 20)
     * @returns {Object} - Result with critical hit information
     */
    static rollWithCrit(notation, criticalRange = 20) {
        const result = this.roll(notation);
        const isCrit = result.rolls.some(roll => roll >= criticalRange);
        const isCritFail = result.rolls.some(roll => roll === 1);
        
        return {
            ...result,
            isCritical: isCrit,
            isCriticalFailure: isCritFail,
            criticalRange: criticalRange
        };
    }
}

module.exports = DiceRoller;


