// src/services/dailyReminderService.js
import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';
import { createEmbed } from '../utils/embeds.js';

export async function checkDailyReminders(client) {
    const now = Date.now();
    let rows;

    try {
        const result = await client.db.query(
            `SELECT guild_id, user_id
             FROM economy
             WHERE (data->>'nextReminderAt') IS NOT NULL
               AND (data->>'nextReminderAt')::bigint <= $1
               AND (data->>'reminderSent')::boolean IS NOT TRUE`,
            [now]
        );
        rows = result.rows;
    } catch (err) {
        logger.error('Failed to query daily reminders:', err);
        return;
    }

    for (const row of rows) {
        const guildId = row.guild_id;
        const userId = row.user_id;

        const userData = await getEconomyData(client, guildId, userId);
        if (!userData) continue;

        try {
            const user = await client.users.fetch(userId).catch(() => null);
            if (!user) {
                userData.reminderSent = true;
                userData.nextReminderAt = null;
                await setEconomyData(client, guildId, userId, userData);
                continue;
            }

            const dmEmbed = createEmbed({
                title: "⏰ 每日獎勵已刷新！",
                description: `你的每日獎勵已經可以領取囉！快來伺服器使用 \`/daily\` 指令領取你的現金，保持連續簽到紀錄吧！`
            });

            await user.send({ embeds: [dmEmbed] });

            userData.reminderSent = true;
            userData.nextReminderAt = null;
            await setEconomyData(client, guildId, userId, userData);

            logger.info(`Daily reminder sent to user ${userId} in guild ${guildId}`);
        } catch (err) {
            logger.warn(`Failed to send daily reminder to ${userId}: ${err.message}`);
            userData.reminderSent = true;
            userData.nextReminderAt = null;
            await setEconomyData(client, guildId, userId, userData).catch(() => {});
        }
    }
}
