// src/services/xpBoosterService.js
import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';
import { getEconomyKey } from '../utils/database.js';

const XP_BOOSTER_ROLE_ID = '1540410469406220358';

export async function checkExpiredXPBoosters(client) {
    const now = Date.now();

    let allKeys;
    try {
        allKeys = await client.db.list('guild:');
    } catch (err) {
        logger.error('Failed to list keys for XP booster check:', err);
        return;
    }

    if (!Array.isArray(allKeys)) return;

    const economyKeys = allKeys.filter(key => key.includes(':economy:'));

    for (const key of economyKeys) {
        const parts = key.split(':');
        if (parts.length < 4 || parts[0] !== 'guild' || parts[2] !== 'economy') continue;

        const guildId = parts[1];
        const userId = parts[3];

        const userData = await getEconomyData(client, guildId, userId);
        if (!userData) continue;

        if (!userData.xpBoosterExpiresAt || now < userData.xpBoosterExpiresAt) continue;

        try {
            const guild = client.guilds.cache.get(guildId);
            const member = guild
                ? await guild.members.fetch(userId).catch(() => null)
                : null;

            if (guild && member && member.roles.cache.has(XP_BOOSTER_ROLE_ID)) {
                await member.roles.remove(XP_BOOSTER_ROLE_ID);
                logger.info(`Removed expired XP booster role from user ${userId} in guild ${guildId}`);
            }

            userData.xpBoosterExpiresAt = null;
            await setEconomyData(client, guildId, userId, userData);
        } catch (err) {
            logger.warn(`Failed to remove expired XP booster for ${userId}: ${err.message}`);
        }
    }
}
