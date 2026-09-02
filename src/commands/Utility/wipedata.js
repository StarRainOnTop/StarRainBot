import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { warningEmbed } from '../../utils/embeds.js';
import { getConfirmationButtons } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('wipedata')
        .setDescription('從機器人中刪除你所有的個人資料 (無法復原)'),

    async execute(interaction, guildConfig, client) {
        const warningMessage = 
            `⚠️ **此動作無法復原！** ⚠️\n\n` +
            `這將永久刪除你在本伺服器中的**所有**資料，包含：\n` +
            `• 💰 經濟餘額 (錢包與銀行)\n` +
            `• 📊 等級與經驗值 (XP)\n` +
            `• 🎒 背包物品\n` +
            `• 🛍️ 商店購買紀錄\n` +
            `• 🎂 生日資訊\n` +
            `• 🔢 計數器資料\n` +
            `• 📋 所有其他個人資料\n\n` +
            `**這無法被取消。你確定要繼續嗎？**`;

        const embed = warningEmbed('清除所有資料', warningMessage);

        const confirmButtons = getConfirmationButtons('wipedata');

        await InteractionHelper.safeReply(interaction, {
            embeds: [embed],
            components: [confirmButtons],
            flags: MessageFlags.Ephemeral
        });

        logger.info(`Wipedata command executed - confirmation prompt shown`, {
            userId: interaction.user.id,
            guildId: interaction.guildId
        });
    }
};
