// src/services/dailyReminderService.js
import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';
import { createEmbed } from '../utils/embeds.js';

export async function checkDailyReminders(client) {
    const now = Date.now();
    logger.info('[DAILY] checkDailyReminders started');

    let rows;
    try {
        const result = await client.db.db.pool.query(
            `SELECT guild_id, user_id
             FROM economy
             WHERE (data->>'nextReminderAt') IS NOT NULL
               AND (data->>'nextReminderAt')::bigint <= $1
               AND COALESCE((data->>'reminderSent')::boolean, false) = false`,
            [now]
        );
        rows = result.rows;
    } catch (err) {
        logger.error('[DAILY] Failed to query daily reminders:', err);
        return;
    }

    logger.info(`[DAILY] Found ${rows.length} pending reminders`);

    // ✅ 按 userId 分組，同一玩家只發一次 DM
    const byUser = new Map();
    for (const row of rows) {
        if (!byUser.has(row.user_id)) {
            byUser.set(row.user_id, []);
        }
        byUser.get(row.user_id).push(row.guild_id);
    }

    logger.info(`[DAILY] Unique users to notify: ${byUser.size}`);

    for (const [userId, guildIds] of byUser.entries()) {
        try {
            const user = await client.users.fetch(userId).catch(() => null);

            if (user) {
                const dmEmbed = createEmbed({
                    title: "⏰ 每日獎勵已刷新！",
                    description: `你的每日獎勵已經可以領取囉！快來伺服器使用 \`/daily\` 指令領取你的現金，保持連續簽到紀錄吧！`
                });

                await user.send({ embeds: [dmEmbed] });
                logger.info(`Daily reminder sent to user ${userId} (updated ${guildIds.length} guild record(s))`);
            } else {
                logger.warn(`[DAILY] User ${userId} not found, skipping DM but clearing reminder flags`);
            }
        } catch (err) {
            logger.warn(`Failed to send daily reminder to ${userId}: ${err.message}`);
        }

        // 無論 DM 成功與否，都把該玩家所有伺服器的提醒標記清掉
        for (const guildId of guildIds) {
            try {
                const userData = await getEconomyData(client, guildId, userId);
                if (!userData) continue;
                userData.reminderSent = true;
                userData.nextReminderAt = null;
                await setEconomyData(client, guildId, userId, userData);
            } catch (err) {
                logger.warn(`Failed to clear reminder flag for ${userId} in guild ${guildId}: ${err.message}`);
            }
        }
    }

    logger.info('[DAILY] checkDailyReminders finished');
}
