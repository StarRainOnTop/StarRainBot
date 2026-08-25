// src/services/xpBoosterService.js
import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';

const XP_BOOSTER_ROLE_ID = '1540410469406220358'; // 與 crate.js 中的 ID 一致

export async function checkExpiredXPBoosters(client) {
    const now = Date.now();

    const allEconomyKeys = await getAllEconomyKeys(client);

    for (const key of allEconomyKeys) {
        const { guildId, userId } = parseEconomyKey(key);
        if (!guildId || !userId) continue;

        const userData = await getEconomyData(client, guildId, userId);
        if (!userData) continue;

        // 確認已到期
        if (!userData.xpBoosterExpiresAt || now < userData.xpBoosterExpiresAt) {
            continue;
        }

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
            userData.xpBoosterExpiresAt = null;
            await setEconomyData(client, guildId, userId, userData);
        } catch (err) {
            logger.warn(`Failed to remove expired XP booster for ${userId}: ${err.message}`);
        }
    }
}

async function getAllEconomyKeys(client) {
    try {
        if (!client.db || typeof client.db.list !== 'function') {
            return [];
        }

        const allKeys = await client.db.list('guild:');
        if (!Array.isArray(allKeys)) {
            return [];
        }

        return allKeys.filter(key => key.includes(':economy:'));
    } catch (error) {
        logger.error('Failed to list economy keys:', error);
        return [];
    }
}

function parseEconomyKey(key) {
    const parts = key.split(':');
    if (parts.length >= 4 && parts[0] === 'guild' && parts[2] === 'economy') {
        return {
            guildId: parts[1],
            userId: parts[3]
        };
    }
    return { guildId: null, userId: null };
}
