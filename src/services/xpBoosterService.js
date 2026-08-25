// src/services/xpBoosterService.js
import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';

const XP_BOOSTER_ROLE_ID = '1540410469406220358'; // 與 crate.js 中的 ID 一致

export async function checkExpiredXPBoosters(client) {
    const now = Date.now();

    const expiredUsers = await getExpiredXPBoosters(client);

    for (const userData of expiredUsers) {
        const userId = userData.userId;
        const guildId = userData.guildId;

        try {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;

            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) continue;

            if (member.roles.cache.has(XP_BOOSTER_ROLE_ID)) {
                await member.roles.remove(XP_BOOSTER_ROLE_ID);
                logger.info(`Removed expired XP booster role from user ${userId} in guild ${guildId}`);
            }

            // 清除到期時間
            const freshData = await getEconomyData(client, guildId, userId);
            if (freshData) {
                freshData.xpBoosterExpiresAt = null;
                await setEconomyData(client, guildId, userId, freshData);
            }
        } catch (err) {
            logger.warn(`Failed to remove expired XP booster for ${userId}: ${err.message}`);
        }
    }
}

// ⚠️ 請根據你的資料庫結構調整此函式
async function getExpiredXPBoosters(client) {
    // 假設使用 PostgreSQL，且 economy 表有以下欄位：
    // user_id, guild_id, xp_booster_expires_at
    const query = `
        SELECT 
            user_id AS "userId",
            guild_id AS "guildId"
        FROM economy
        WHERE xp_booster_expires_at IS NOT NULL
          AND xp_booster_expires_at <= $1
    `;

    try {
        const result = await client.db.pool.query(query, [Date.now()]);
        return result.rows;
    } catch (error) {
        logger.error('Failed to fetch expired XP boosters:', error);
        return [];
    }
}
