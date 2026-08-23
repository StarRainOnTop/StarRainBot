import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const CRATE_PRICE = 5000; // 單抽價格
const XP_BOOSTER_ROLE_ID = '1540410469406220358'; // ⚡ 15% 經驗加成身分組 ID

// 📢 已設定大獎專屬廣播頻道 ID
const ANNOUNCE_CHANNEL_ID = '1540416585553158184'; 

// 獎品池設定
const PRIZE_POOL = [
    { id: 'cash_small', name: '💵 現金紅包 ($1,000)', type: 'cash', value: 1000, weight: 60, rarity: '普通' },
    { id: 'xp_booster_card', name: '⚡ 15% 經驗加成卡 (24小時)', type: 'role', roleId: XP_BOOSTER_ROLE_ID, weight: 18, rarity: '稀有' },
    { id: 'personal_safe', name: '🛡️ 個人保險箱 (防禦次數 +1)', type: 'item', value: 1, weight: 10, rarity: '稀有' },
    { id: 'diamond_pickaxe', name: '⛏️ 鑽石鎬', type: 'item', value: 1, weight: 8, rarity: '史詩' },
    { id: 'cash_jackpot', name: '💰巨額頭獎💰 ($50,000)', type: 'cash', value: 50000, weight: 4, rarity: '傳說' },
    { id: 'golden_crown_role', name: '👑尊爵黃金皇冠👑 (專屬身分組)', type: 'role', roleId: '1540406574189649940', weight: 2, rarity: '神話' }
];

function rollCrate() {
    const totalWeight = PRIZE_POOL.reduce((sum, prize) => sum + prize.weight, 0);
    let randomNum = Math.random() * totalWeight;

    for (const prize of PRIZE_POOL) {
        if (randomNum < prize.weight) {
            return prize;
        }
        randomNum -= prize.weight;
    }
    return PRIZE_POOL[0];
}

export default {
    data: new SlashCommandBuilder()
        .setName('crate')
        .setDescription('開啟高級抽獎箱，拼手氣贏取巨額現金與傳說級皇冠身分組！')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('抽獎次數')
                .setRequired(false)
                .addChoices(
                    { name: '單抽 ($5,000)', value: 1 },
                    { name: '10 連抽 ($50,000)', value: 10 }
                )
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const count = interaction.options.getInteger('amount') || 1;
        const totalPrice = CRATE_PRICE * count;

        const userData = await getEconomyData(client, guildId, userId);
        if (!userData) {
            throw createError(
                "Failed to load economy data",
                ErrorTypes.DATABASE,
                "無法載入您的經濟數據，請稍後再試。",
                { userId, guildId }
            );
        }

        userData.wallet = userData.wallet || 0;
        userData.bank = userData.bank || 0;
        const totalWealth = userData.wallet + userData.bank;

        if (totalWealth < totalPrice) {
            throw createError(
                "Not enough money",
                ErrorTypes.VALIDATION,
                `你的總資產不足！進行 ${count} 連抽需要 **$${totalPrice.toLocaleString()}**（你目前擁有 $${totalWealth.toLocaleString()}）。`,
                { totalWealth, totalPrice }
            );
        }

        // 扣款邏輯（現金優先，不夠扣銀行）
        if (userData.wallet >= totalPrice) {
            userData.wallet -= totalPrice;
        } else {
            const remaining = totalPrice - userData.wallet;
            userData.wallet = 0;
            userData.bank = Math.max(0, userData.bank - remaining);
        }

        // 🎰 開箱視覺動畫：顯示正在開箱的懸念感
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '🎰 正在開啟高級抽獎箱...',
                description: `運氣正在轉動中，祝您手氣爆棚！✨`,
                color: 'warning'
            })]
        });

        // 暫停 2 秒鐘製造開箱期待感
        await new Promise(resolve => setTimeout(resolve, 2000));

        const results = [];
        let totalCashWon = 0;
        const member = interaction.member;

        for (let i = 0; i < count; i++) {
            const prize = rollCrate();
            
            const prizeRecord = { ...prize };
            results.push(prizeRecord);

            if (prizeRecord.type === 'cash') {
                totalCashWon += prizeRecord.value;
                userData.wallet += prizeRecord.value;
            } else if (prizeRecord.type === 'item') {
                userData.inventory = userData.inventory || {};
                userData.inventory[prizeRecord.id] = (userData.inventory[prizeRecord.id] || 0) + prizeRecord.value;
            } else if (prizeRecord.type === 'role') {
                try {
                    if (prizeRecord.roleId) {
                        if (!member.roles.cache.has(prizeRecord.roleId)) {
                            await member.roles.add(prizeRecord.roleId);

                            // ⚡ 如果是經驗加成卡，記錄 24 小時後的過期時間戳記（改用資料庫持久化檢查）
                            if (prizeRecord.roleId === XP_BOOSTER_ROLE_ID) {
                                const ONE_DAY_MS = 24 * 60 * 60 * 1000;
                                userData.xpBoosterExpiresAt = Date.now() + ONE_DAY_MS;
                            }
                        } else {
                            // 💡 重複獲得身分組的保底補償機制：轉化為 $3,500 現金
                            const compensation = 3500;
                            userData.wallet += compensation;
                            totalCashWon += compensation;
                            prizeRecord.name += ` (已擁有，折現 +$${compensation.toLocaleString()})`;
                        }
                    }
                } catch (err) {
                    logger.error(`[CRATE] Failed to assign role: ${err.message}`);
                }
            }

            // 📢 廣播系統：抽中傳說或神話大獎時發送到指定的公告頻道
            if (prizeRecord.rarity === '傳說' || prizeRecord.rarity === '神話') {
                try {
                    const channelToAnnounce = client.channels.cache.get(ANNOUNCE_CHANNEL_ID);

                    if (channelToAnnounce) {
                        await channelToAnnounce.send({
                            embeds: [createEmbed({
                                title: '🎉 恭喜歐皇誕生！',
                                description: `🔥 **${interaction.user}** 在高級抽獎箱中人品大爆發，一發入魂抽中了 **[${prizeRecord.rarity}] ${prizeRecord.name}**！`,
                                color: 'gold',
                                timestamp: true
                            })]
                        });
                    }
                } catch (err) {
                    logger.error(`[CRATE] Failed to send broadcast: ${err.message}`);
                }
            }
        }

        await setEconomyData(client, guildId, userId, userData);

        const resultSummary = results.map((p, index) => `**#${index + 1}** [${p.rarity}] ${p.name}`).join('\n');

        const embed = createEmbed({
            title: `🎁 ${interaction.user.username} 的開箱結果 (${count}連抽)`,
            description: `花費金額：**$${totalPrice.toLocaleString()}**\n\n獲得獎勵：\n${resultSummary}`,
            color: 'success',
            timestamp: true
        });

        if (totalCashWon > 0) {
            embed.addFields({ name: '💰 總現金回饋/補償', value: `本次獲得現金共 **+$${totalCashWon.toLocaleString()}**！`, inline: false });
        }

        embed.addFields({
            name: '💳 更新後餘額',
            value: `現金: $${userData.wallet.toLocaleString()} | 銀行: $${userData.bank.toLocaleString()}`,
            inline: false
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'crate' })
};
