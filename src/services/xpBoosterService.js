// src/services/xpBoosterService.js
import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';

const XP_BOOSTER_ROLE_ID = '1540410469406220358';

export async function checkExpiredXPBoosters(client) {
    const now = Date.now();
    let rows;

    try {
        const result = await client.db.query(
            `SELECT guild_id, user_id
             FROM economy
             WHERE (data->>'xpBoosterExpiresAt') IS NOT NULL
               AND (data->>'xpBoosterExpiresAt')::bigint <= $1`,
            [now]
        );
        rows = result.rows;
    } catch (err) {
        logger.error('Failed to query expired XP boosters:', err);
        return;
    }

    for (const row of rows) {
        const guildId = row.guild_id;
        const userId = row.user_id;

        const userData = await getEconomyData(client, guildId, userId);
        if (!userData) continue;

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
