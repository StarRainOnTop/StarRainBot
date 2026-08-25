// src/services/dailyReminderService.js
import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';
import { createEmbed } from '../utils/embeds.js';

export async function checkDailyReminders(client) {
    const now = Date.now();

    // 🔍 掃描所有經濟資料 key
    const allEconomyKeys = await getAllEconomyKeys(client);

    for (const key of allEconomyKeys) {
        // 從 key 解析出 guildId 和 userId
        const { guildId, userId } = parseEconomyKey(key);
        if (!guildId || !userId) continue;

        const userData = await getEconomyData(client, guildId, userId);
        if (!userData) continue;

        // 確認有設定提醒且時間已到，且尚未發送過
        if (!userData.nextReminderAt || now < userData.nextReminderAt || userData.reminderSent) {
            continue;
        }

        try {
            const user = await client.users.fetch(userId).catch(() => null);
            if (!user) continue;

            const dmEmbed = createEmbed({
                title: "⏰ 每日獎勵已刷新！",
                description: `你的每日獎勵已經可以領取囉！快來伺服器使用 \`/daily\` 指令領取你的現金，保持連續簽到紀錄吧！\n\n*掌握最新影片資訊、交流床戰戰術、尋找優質組隊隊友，快加入我們的伺服器吧！*`
            });
            await user.send({ embeds: [dmEmbed] });

            // ✅ 更新提醒已發送
            userData.reminderSent = true;
            userData.nextReminderAt = null; // 清除提醒時間
            await setEconomyData(client, guildId, userId, userData);

            logger.info(`Daily reminder sent to user ${userId} in guild ${guildId}`);
        } catch (err) {
            logger.warn(`Failed to send daily reminder to ${userId}: ${err.message}`);
        }
    }
}

// 取得所有經濟資料的 key（例如 guild:123:economy:456）
async function getAllEconomyKeys(client) {
    try {
        if (!client.db || typeof client.db.list !== 'function') {
            return [];
        }

        const allKeys = await client.db.list('guild:');
        if (!Array.isArray(allKeys)) {
            return [];
        }

        // 過濾出 economy 相關的 key
        return allKeys.filter(key => key.includes(':economy:'));
    } catch (error) {
        logger.error('Failed to list economy keys:', error);
        return [];
    }
}

// 從 key 解析出 guildId 和 userId
// key 格式範例: guild:123456789:economy:987654321
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
