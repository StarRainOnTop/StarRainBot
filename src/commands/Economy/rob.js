import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed, buildUserErrorEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { BotConfig } from '../../config/bot.js';

const ROB_COOLDOWN = BotConfig.economy?.cooldowns?.rob ?? 2 * 60 * 60 * 1000;
const BASE_ROB_SUCCESS_CHANCE = BotConfig.economy?.robSuccessRate ?? 0.4;
const ROB_WALLET_PERCENTAGE = 0.10; // 搶奪身上現金的 10%
const ROB_BANK_PERCENTAGE = 0.03;   // 額外搶奪銀行存款的 3%
const FINE_PERCENTAGE = 0.05;        // 失敗罰款總資產的 5%

export default {
    data: new SlashCommandBuilder()
        .setName('rob')
        .setDescription('嘗試搶劫其他使用者的現金與部分銀行存款（風險極高）')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('要搶劫的使用者')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
        const robberId = interaction.user.id;
        const victimUser = interaction.options.getUser("user");
        const guildId = interaction.guildId;
        const now = Date.now();

        if (robberId === victimUser.id) {
            throw createError(
                "Cannot rob self",
                ErrorTypes.VALIDATION,
                "你不能搶劫自己。",
                { robberId, victimId: victimUser.id }
            );
        }
            
        if (victimUser.bot) {
            throw createError(
                "Cannot rob bot",
                ErrorTypes.VALIDATION,
                "你不能搶劫機器人。",
                { victimId: victimUser.id, isBot: true }
            );
        }

        const robberData = await getEconomyData(client, guildId, robberId);
        const victimData = await getEconomyData(client, guildId, victimUser.id);
            
        if (!robberData || !victimData) {
            throw createError(
                "Failed to load economy data",
                ErrorTypes.DATABASE,
                "無法載入經濟數據，請稍後再試。",
                { robberId: !!robberData, victimId: !!victimData, guildId }
            );
        }
            
        const lastRob = robberData.lastRob || 0;

        if (now < lastRob + ROB_COOLDOWN) {
            const remaining = lastRob + ROB_COOLDOWN - now;
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

            throw createError(
                "Robbery cooldown active",
                ErrorTypes.RATE_LIMIT,
                `你需要低調一陣子。請等待 **${hours}小時 ${minutes}分鐘** 後再嘗試搶劫。`,
                { remaining, hours, minutes, cooldownType: 'rob' }
            );
        }

        // 確保受害者有足夠的資產才值得動手（現金或銀行加起來至少 $500）
        const victimTotalWealth = (victimData.wallet || 0) + (victimData.bank || 0);
        if (victimTotalWealth < 500) {
            throw createError(
                "Victim too poor",
                ErrorTypes.VALIDATION,
                `${victimUser.username} 太窮了。他們需要至少 $500 的總資產才值得動手。`,
                { victimTotalWealth, required: 500 }
            );
        }

        // 檢查受害者是否擁有個人保險箱 (personal_safe)
        const hasSafe = (victimData.inventory?.['personal_safe'] || 0) > 0;

        if (hasSafe) {
            // 保險箱發動：扣除 1 點耐久度
            victimData.inventory['personal_safe'] -= 1;
            if (victimData.inventory['personal_safe'] <= 0) {
                delete victimData.inventory['personal_safe'];
            }
            await setEconomyData(client, guildId, victimUser.id, victimData);

            robberData.lastRob = now;
            await setEconomyData(client, guildId, robberId, robberData);

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    warningEmbed(
                        '搶劫被阻擋',
                        `${victimUser.username} 早有準備！對方擁有**個人保險箱**，不僅保住了現金，連銀行存款也被完美保護。你的搶劫失敗了（保險箱耐久度消耗 1）。`
                    )
                ],
            });
        }

        const isSuccessful = Math.random() < BASE_ROB_SUCCESS_CHANCE;
        let resultEmbed;

        if (isSuccessful) {
            // 計算可搶奪的金額，並用 Math.min 確保不會超過受害者實際擁有的數量
            const rawWalletStolen = Math.floor((victimData.wallet || 0) * ROB_WALLET_PERCENTAGE);
            const rawBankStolen = Math.floor((victimData.bank || 0) * ROB_BANK_PERCENTAGE);
            
            const walletStolen = Math.min(rawWalletStolen, victimData.wallet || 0);
            const bankStolen = Math.min(rawBankStolen, victimData.bank || 0);
            const totalStolen = walletStolen + bankStolen;

            robberData.wallet = (robberData.wallet || 0) + totalStolen;
            victimData.wallet = Math.max(0, (victimData.wallet || 0) - walletStolen);
            victimData.bank = Math.max(0, (victimData.bank || 0) - bankStolen);

            resultEmbed = successEmbed(
                '搶劫成功',
                `你成功從 ${victimUser.username} 那裡突破防線！\n掠奪了現金 **$${walletStolen.toLocaleString()}** 與銀行存款 **$${bankStolen.toLocaleString()}**，共計 **$${totalStolen.toLocaleString()}**！`
            );
        } else {
            // 失敗罰款：計算搶匪總資產（現金+銀行）的 10%
            const robberTotalWealth = (robberData.wallet || 0) + (robberData.bank || 0);
            const fineAmount = Math.floor(robberTotalWealth * FINE_PERCENTAGE);

            let walletFine = 0;
            let bankFine = 0;

            if (robberTotalWealth <= 0) {
                walletFine = 0;
                bankFine = 0;
            } else if ((robberData.wallet || 0) >= fineAmount) {
                // 現金夠直接扣光罰款
                robberData.wallet -= fineAmount;
                walletFine = fineAmount;
            } else {
                // 現金不夠，把現金扣到 0，剩下的從銀行扣
                walletFine = robberData.wallet || 0;
                bankFine = fineAmount - walletFine;

                robberData.wallet = 0;
                robberData.bank = Math.max(0, (robberData.bank || 0) - bankFine);
            }

            resultEmbed = buildUserErrorEmbed(
                'unknown',
                `你搶劫失敗並被警方逮捕了！你被罰款了總共 **$${fineAmount.toLocaleString()}**（包含現金 **$${walletFine.toLocaleString()}** 與銀行存款 **$${bankFine.toLocaleString()}**）。`,
                { titleOverride: '搶劫失敗' }
            );
        }

        robberData.lastRob = now;

        await setEconomyData(client, guildId, robberId, robberData);
        await setEconomyData(client, guildId, victimUser.id, victimData);

        resultEmbed
            .addFields(
                {
                    name: `你的新餘額 (${interaction.user.username})`,
                    value: `現金: $${(robberData.wallet || 0).toLocaleString()}\n銀行: $${(robberData.bank || 0).toLocaleString()}`,
                    inline: true,
                },
                {
                    name: `受害者剩餘資產 (${victimUser.username})`,
                    value: `現金: $${(victimData.wallet || 0).toLocaleString()}\n銀行: $${(victimData.bank || 0).toLocaleString()}`,
                    inline: true,
                },
            )
            .setFooter({ text: `可在 ${Math.ceil(ROB_COOLDOWN / (60 * 60 * 1000))} 小時後進行下次搶劫。` });

        await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed] });
    }, { command: 'rob' })
};
