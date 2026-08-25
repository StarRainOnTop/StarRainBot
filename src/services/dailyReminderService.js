// src/services/dailyReminderService.js
import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';
import { createEmbed } from '../utils/embeds.js';

export async function checkDailyReminders(client) {
    const now = Date.now();

    // 🔍 從資料庫取得所有用戶的經濟資料
    // 注意：需要根據你的資料庫結構調整查詢
    const allUsers = await getAllEconomyData(client);

    for (const userData of allUsers) {
        // 檢查是否有設定提醒、時間是否已到、是否已發送過
        if (!userData.nextReminderAt || now < userData.nextReminderAt || userData.reminderSent) {
            continue;
        }

        const userId = userData.userId;
        const guildId = userData.guildId;

        try {
            const user = await client.users.fetch(userId);
            if (!user) continue;

            const dmEmbed = createEmbed({
                title: "⏰ 每日獎勵已刷新！",
                description: `你的每日獎勵已經可以領取囉！快來伺服器使用 \`/daily\` 指令領取你的現金，保持連續簽到紀錄吧！\n\n*掌握最新影片資訊、交流床戰戰術、尋找優質組隊隊友，快加入我們的伺服器吧！*`
            });
            await user.send({ embeds: [dmEmbed] });

            // ✅ 更新提醒已發送
            userData.reminderSent = true;
            userData.nextReminderAt = null; // 清除提醒時間，直到下次領取再設定
            await setEconomyData(client, guildId, userId, userData);

            logger.info(`Daily reminder sent to user ${userId} in guild ${guildId}`);
        } catch (err) {
            logger.warn(`Failed to send daily reminder to ${userId}: ${err.message}`);
        }
    }
}

// ⚠️ 這個函式需要根據你的資料庫實作來取得所有用戶資料
async function getAllEconomyData(client) {
    // 假設你使用 PostgreSQL，且經濟資料存在一個名為 "economy" 的表中
    // 欄位包含 user_id, guild_id, next_reminder_at, reminder_sent 等
    // 請根據實際 Schema 調整 SQL 查詢
    
    // 範例 SQL：
    const query = `
        SELECT 
            user_id AS "userId",
            guild_id AS "guildId",
            wallet,
            bank,
            last_daily AS "lastDaily",
            daily_streak AS "dailyStreak",
            reminder_sent AS "reminderSent",
            next_reminder_at AS "nextReminderAt"
        FROM economy
        WHERE next_reminder_at IS NOT NULL AND reminder_sent = false
    `;

    try {
        // 假設 client.db 有 pool 可以查詢
        const result = await client.db.pool.query(query);
        return result.rows;
    } catch (error) {
        logger.error('Failed to fetch all economy data for reminders:', error);
        return [];
    }
}
