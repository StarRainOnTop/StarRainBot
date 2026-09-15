// src/services/dailyReminderService.js
import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';
import { createEmbed } from '../utils/embeds.js';

export async function checkDailyReminders(client) {
    const now = Date.now();

    let allKeys;
    try {
        allKeys = await client.db.list('guild:');
    } catch (err) {
        logger.error('Failed to list keys for daily reminder check:', err);
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

        if (!userData.nextReminderAt || now < userData.nextReminderAt || userData.reminderSent) {
            continue;
        }

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
