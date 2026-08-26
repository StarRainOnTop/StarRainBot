import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('guess')
        .setDescription('猜數字！選 1-3 下注，猜中即可獲得雙倍獎金！')
        .addIntegerOption(option =>
            option
                .setName('number')
                .setDescription('要猜的數字 (1-3)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(3)
        )
        .addIntegerOption(option =>
            option
                .setName('bet')
                .setDescription('下注金額')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const guessedNumber = interaction.options.getInteger('number');
        const betAmount = interaction.options.getInteger('bet');

        // 取得玩家資料
        const userData = await getEconomyData(client, guildId, userId);
        if (!userData) {
            throw createError(
                "Failed to load economy data",
                ErrorTypes.DATABASE,
                "無法載入您的經濟數據，請稍後再試。",
                { userId, guildId }
            );
        }

        // 初始化錢包與銀行
        userData.wallet = userData.wallet || 0;
        userData.bank = userData.bank || 0;
        const totalWealth = userData.wallet + userData.bank;

        // 檢查總資產是否足夠
        if (totalWealth < betAmount) {
            throw createError(
                "Insufficient funds",
                ErrorTypes.VALIDATION,
                `你的總資產不足！錢包 + 銀行只有 **$${totalWealth.toLocaleString()}**，不足以支付 **$${betAmount.toLocaleString()}** 的下注金額。`,
                { required: betAmount, current: totalWealth }
            );
        }

        // 扣款：先從錢包扣，不夠再從銀行扣
        let usedBank = 0;
        if (userData.wallet >= betAmount) {
            userData.wallet -= betAmount;
        } else {
            const fromWallet = userData.wallet;
            userData.wallet = 0;
            const remaining = betAmount - fromWallet;
            userData.bank -= remaining;
            usedBank = remaining;
        }

        // 產生隨機數字（1-3）
        const winningNumber = Math.floor(Math.random() * 3) + 1;
        const isWin = (guessedNumber === winningNumber);

        let resultDescription;
        if (isWin) {
            const winnings = betAmount * 2;
            userData.wallet += winnings;  // 獎金回到錢包
            resultDescription = `🎉 恭喜！你猜中了！\n\n` +
                `你猜的數字：**${guessedNumber}**\n` +
                `系統數字：**${winningNumber}**\n` +
                `獎金：**$${winnings.toLocaleString()}**（含本金）\n` +
                `淨賺：**$${(winnings - betAmount).toLocaleString()}**`;
        } else {
            resultDescription = `😢 可惜猜錯了！\n\n` +
                `你猜的數字：**${guessedNumber}**\n` +
                `系統數字：**${winningNumber}**\n` +
                `你損失了 **$${betAmount.toLocaleString()}**`;
        }

        // 如果有動用到銀行，加入提示
        if (usedBank > 0) {
            resultDescription += `\n🏦 已從銀行扣除 **$${usedBank.toLocaleString()}** 作為下注。`;
        }

        // 儲存資料
        await setEconomyData(client, guildId, userId, userData);

        const embed = (isWin ? successEmbed : errorEmbed)(
            isWin ? "🎯 猜數字獲勝！" : "❌ 猜數字失敗",
            resultDescription
        )
            .addFields(
                {
                    name: "錢包餘額",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "銀行餘額",
                    value: `$${userData.bank.toLocaleString()}`,
                    inline: true,
                }
            );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'guess' })
};
