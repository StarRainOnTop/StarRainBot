logger.info(`[XP] client.db constructor: ${client.db?.constructor?.name}`);
logger.info(`[XP] client.db.db constructor: ${client.db?.db?.constructor?.name}`);
logger.info(`[XP] client.db.db keys: ${Object.keys(client.db?.db || {}).join(', ')}`);
logger.info(`[XP] client.db.db.pool: ${!!client.db?.db?.pool}`);
logger.info(`[XP] client.db.pool: ${!!client.db?.pool}`);
// src/services/xpBoosterService.js
import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';

const XP_BOOSTER_ROLE_ID = '1540410469406220358';

export async function checkExpiredXPBoosters(client) {
    const now = Date.now();
    logger.info('[XP] checkExpiredXPBoosters started');

    let rows;
    try {
        const result = await client.db.pool.query(
            `SELECT guild_id, user_id
             FROM economy
             WHERE (data->>'xpBoosterExpiresAt') IS NOT NULL
               AND (data->>'xpBoosterExpiresAt')::bigint <= $1`,
            [now]
        );
        rows = result.rows;
    } catch (err) {
        logger.error('[XP] Failed to query expired XP boosters:', err);
        return;
    }

    logger.info(`[XP] Found ${rows.length} expired XP boosters`);

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
            } else {
                logger.info(`[XP] No role to remove for ${userId} (guild=${!!guild}, member=${!!member})`);
            }

            userData.xpBoosterExpiresAt = null;
            await setEconomyData(client, guildId, userId, userData);
        } catch (err) {
            logger.warn(`Failed to remove expired XP booster for ${userId}: ${err.message}`);
        }
    }

    logger.info('[XP] checkExpiredXPBoosters finished');
}
