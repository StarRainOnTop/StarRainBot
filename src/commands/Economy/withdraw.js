import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('從你的銀行提款到錢包')
        .addStringOption(option =>
            option
                .setName('amount')
                .setDescription('提款金額（數字或 "all"）')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const amountInput = interaction.options.getString("amount").trim().toLowerCase();

        const userData = await getEconomyData(client, guildId, userId);

        if (!userData) {
            throw createError(
                "Failed to load economy data",
                ErrorTypes.DATABASE,
                "無法載入您的經濟數據，請稍後再試。",
                { userId, guildId }
            );
        }

        let withdrawAmount;

        if (amountInput === 'all') {
            withdrawAmount = userData.bank;
        } else {
            withdrawAmount = parseInt(amountInput, 10);
            if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
                throw createError(
                    "Invalid withdrawal amount",
                    ErrorTypes.VALIDATION,
                    "你必須輸入大於零的數字或使用 `all` 提領全部。",
                    { amount: amountInput, userId }
                );
            }
        }

        if (withdrawAmount > userData.bank) {
            withdrawAmount = userData.bank;
        }

        if (withdrawAmount === 0) {
            throw createError(
                "Empty bank account",
                ErrorTypes.VALIDATION,
                "你的銀行帳戶是空的。",
                { userId, bankBalance: userData.bank }
            );
        }

        userData.wallet += withdrawAmount;
        userData.bank -= withdrawAmount;
        await setEconomyData(client, guildId, userId, userData);

        const embed = successEmbed(
            '提款成功',
            `你已成功從銀行提領了 **$${withdrawAmount.toLocaleString()}**。`
        )
            .addFields(
                {
                    name: "新現金餘額",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "新銀行餘額",
                    value: `$${userData.bank.toLocaleString()}`,
                    inline: true,
                },
            );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'withdraw' })
};
