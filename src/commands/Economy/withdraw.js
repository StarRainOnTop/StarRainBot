import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('從銀行提取現金到錢包')
        .addStringOption(option =>
            option
                .setName('amount')
                .setDescription('要提取的金額（輸入數字或 `all` 提取全部）')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const amountInput = interaction.options.getString('amount');

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            throw createError(
                '載入經濟資料失敗',
                ErrorTypes.DATABASE,
                '無法載入您的經濟資料，請稍後再試。',
                { userId, guildId }
            );
        }

        let withdrawAmount;

        // 檢查是否為 "all"（不區分大小寫）
        if (amountInput.toLowerCase() === 'all') {
            withdrawAmount = userData.bank;
        } else {
            // 嘗試解析為整數
            const parsed = parseInt(amountInput, 10);
            if (isNaN(parsed) || parsed <= 0) {
                throw createError(
                    '無效的提取金額',
                    ErrorTypes.VALIDATION,
                    '請輸入一個正整數或 `all` 提取全部。',
                    { amount: amountInput, userId }
                );
            }
            withdrawAmount = parsed;
        }

        if (withdrawAmount <= 0) {
            throw createError(
                '無效的提取金額',
                ErrorTypes.VALIDATION,
                '您必須提取一個正數金額。',
                { amount: withdrawAmount, userId }
            );
        }

        if (withdrawAmount > userData.bank) {
            withdrawAmount = userData.bank;
        }

        if (withdrawAmount === 0) {
            throw createError(
                '銀行帳戶為空',
                ErrorTypes.VALIDATION,
                '您的銀行帳戶中沒有存款。',
                { userId, bankBalance: userData.bank }
            );
        }

        userData.wallet += withdrawAmount;
        userData.bank -= withdrawAmount;

        await setEconomyData(client, guildId, userId, userData);

        const embed = successEmbed(
            '提取成功',
            `您成功從銀行提取了 **$${withdrawAmount.toLocaleString()}**。`
        )
            .addFields(
                {
                    name: '目前現金餘額',
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: '目前銀行餘額',
                    value: `$${userData.bank.toLocaleString()}`,
                    inline: true,
                },
            );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'withdraw' })
};
