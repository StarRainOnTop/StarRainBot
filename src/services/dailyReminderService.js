// src/services/dailyReminderService.js
import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';
import { createEmbed } from '../utils/embeds.js';

export async function checkDailyReminders(client) {
    const now = Date.now();
    const allEconomyKeys = await getAllEconomyKeys(client);

    for (const key of allEconomyKeys) {
        const { guildId, userId } = parseEconomyKey(key);
        if (!guildId || !userId) continue;

        const userData = await getEconomyData(client, guildId, userId);
        if (!userData) continue;

        // 沒有設定提醒、還沒到時間、或已提醒過就跳過
        if (!userData.nextReminderAt || now < userData.nextReminderAt || userData.reminderSent) {
            continue;
        }

        try {
            const user = await client.users.fetch(userId).catch(() => null);
            if (!user) {
                // 找不到使用者，標記已提醒避免重複嘗試
                userData.reminderSent = true;
                userData.nextReminderAt = null;
                await setEconomyData(client, guildId, userId, userData);
                continue;
            }

            const dmEmbed = createEmbed({
                title: "⏰ 每日獎勵已刷新！",
                description: `你的每日獎勵已經可以領取囉！快來伺服器使用 \`/daily\` 指令領取你的現金，保持連續簽到紀錄吧！\n\n*掌握最新影片資訊、交流床戰戰術、尋找優質組隊隊友，快加入我們的伺服器吧！*`
            });

            await user.send({ embeds: [dmEmbed] });

            // ✅ 標記已提醒並清空時間
            userData.reminderSent = true;
            userData.nextReminderAt = null;
            await setEconomyData(client, guildId, userId, userData);

            logger.info(`Daily reminder sent to user ${userId} in guild ${guildId}`);
        } catch (err) {
            // ⚠️ DM 失敗（例如玩家關閉私訊）也要標記已提醒，避免重複嘗試
            logger.warn(`Failed to send daily reminder to ${userId}: ${err.message}`);
            userData.reminderSent = true;
            userData.nextReminderAt = null;
            await setEconomyData(client, guildId, userId, userData).catch(() => {});
        }
    }
}

async function getAllEconomyKeys(client) {
    try {
        if (!client.db || typeof client.db.list !== 'function') {
            logger.warn('client.db.list is not available; skipping daily reminder check.');
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
