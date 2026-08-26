import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const FISH_COOLDOWN = 35 * 60 * 1000; 
const BASE_MIN_REWARD = 300;
const BASE_MAX_REWARD = 900;
const FISHING_ROD_MULTIPLIER = 1.5;          // 普通釣竿
const DIAMOND_FISHING_ROD_MULTIPLIER = 2.0; // 鑽石釣魚竿（+100%）

// 🟢 請在這裡填入你伺服器「解鎖全部圖鑑」的特殊身分組 ID
const SPECIAL_ROLE_ID = '1540051763053338684'; 

const FISH_TYPES = [
    { id: 'bass', name: '鱸魚 (Bass)', emoji: '🐟', rarity: 'common' },
    { id: 'salmon', name: '鮭魚 (Salmon)', emoji: '🐟', rarity: 'common' },
    { id: 'trout', name: '鱒魚 (Trout)', emoji: '🐟', rarity: 'common' },
    { id: 'sardine', name: '沙丁魚 (Sardine)', emoji: '🐟', rarity: 'common' },
    { id: 'seaweed_bundle', name: '海帶束 (Seaweed)', emoji: '🌿', rarity: 'common' },
    { id: 'tuna', name: '鮪魚 (Tuna)', emoji: '🐠', rarity: 'uncommon' },
    { id: 'swordfish', name: '旗魚 (Swordfish)', emoji: '🐠', rarity: 'uncommon' },
    { id: 'pufferfish', name: '河豚 (Pufferfish)', emoji: '🐡', rarity: 'uncommon' },
    { id: 'clownfish', name: '小丑魚 (Clownfish)', emoji: '🐠', rarity: 'uncommon' },
    { id: 'octopus', name: '章魚 (Octopus)', emoji: '🐙', rarity: 'rare' },
    { id: 'lobster', name: '龍蝦 (Lobster)', emoji: '🦞', rarity: 'rare' },
    { id: 'anglerfish', name: '燈籠魚 (Anglerfish)', emoji: '🏮', rarity: 'rare' },
    { id: 'stingray', name: '扁魟魚 (Stingray)', emoji: '🛸', rarity: 'rare' },
    { id: 'shark', name: '鯊魚 (Shark)', emoji: '🦈', rarity: 'epic' },
    { id: 'giant_octopus', name: '巨型章魚 (Giant Octopus)', emoji: '🦑', rarity: 'epic' },
    { id: 'electric_eel', name: '電鰻 (Electric Eel)', emoji: '⚡', rarity: 'epic' },
    { id: 'whale', name: '鯨魚 (Whale)', emoji: '🐋', rarity: 'legendary' },
    { id: 'leviathan', name: '深海巨獸利維坦 (Leviathan)', emoji: '🌊', rarity: 'legendary' },
];

const CATCH_MESSAGES = [
    "你把釣魚線拋向清澈見底的水域...",
    "你耐心地等待著浮標在水面上漂浮...",
    "等待了幾分鐘後，你感覺到了一陣拉扯...",
    "水面泛起漣漪，有東西咬鉤了...",
    "你以精湛的技巧將你的戰利品收回...",
];

export default {
    data: new SlashCommandBuilder()
        .setName('fish')
        .setDescription('去釣魚以捕捉魚類並賺取金錢'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastFish = userData.lastFish || 0;
        const hasFishingRod = userData.inventory?.["fishing_rod"] || 0;
        const hasDiamondFishingRod = userData.inventory?.["diamond_fishing_rod"] || 0;

        if (now < lastFish + FISH_COOLDOWN) {
            const remaining = lastFish + FISH_COOLDOWN - now;
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor(
                (remaining % (1000 * 60 * 60)) / (1000 * 60),
            );

            throw createError(
                "Fishing cooldown active",
                ErrorTypes.RATE_LIMIT,
                `你現在太累了，無法釣魚。請休息 **${hours}小時 ${minutes}分鐘** 後再試。`,
                { remaining, cooldownType: 'fish' }
            );
        }

        const rand = Math.random();
        let fishCaught;
        
        const getFishByRarity = (rarity) => {
            const list = FISH_TYPES.filter(f => f.rarity === rarity);
            return list[Math.floor(Math.random() * list.length)];
        };

        if (rand < 0.5) {
            fishCaught = getFishByRarity('common');
        } else if (rand < 0.75) {
            fishCaught = getFishByRarity('uncommon');
        } else if (rand < 0.9) {
            fishCaught = getFishByRarity('rare');
        } else if (rand < 0.98) {
            fishCaught = getFishByRarity('epic');
        } else {
            fishCaught = getFishByRarity('legendary');
        }

        const baseEarned = Math.floor(
            Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1)
        ) + BASE_MIN_REWARD;

        let finalEarned = baseEarned;
        let multiplierMessage = "";

        // 優先使用鑽石釣魚竿，否則使用普通釣竿
        if (hasDiamondFishingRod > 0) {
            finalEarned = Math.floor(baseEarned * DIAMOND_FISHING_ROD_MULTIPLIER);
            multiplierMessage = `\n💎 **鑽石釣竿加成：+100%**`;
        } else if (hasFishingRod > 0) {
            finalEarned = Math.floor(baseEarned * FISHING_ROD_MULTIPLIER);
            multiplierMessage = `\n🎣 **釣竿加成：+50%**`;
        }

        const catchMessage = CATCH_MESSAGES[Math.floor(Math.random() * CATCH_MESSAGES.length)];

        userData.wallet += finalEarned;
        userData.lastFish = now;

        if (!userData.inventory) userData.inventory = {};
        userData.inventory[fishCaught.id] = (userData.inventory[fishCaught.id] || 0) + 1;

        await setEconomyData(client, guildId, userId, userData);

        // 檢查是否收集了全部種類的魚
        let roleAwardedMessage = "";
        try {
            const member = await interaction.guild.members.fetch(userId);
            const hasAllFishes = FISH_TYPES.every(f => (userData.inventory[f.id] || 0) > 0);
            
            if (hasAllFishes && SPECIAL_ROLE_ID && SPECIAL_ROLE_ID !== '你的身分組ID數字') {
                if (!member.roles.cache.has(SPECIAL_ROLE_ID)) {
                    await member.roles.add(SPECIAL_ROLE_ID);
                    roleAwardedMessage = `\n🎉 **恭喜！你集齊了所有 18 種魚類圖鑑，獲得了專屬特殊身分組！**`;
                }
            }
        } catch (err) {
            console.error("自動發放身分組失敗:", err);
        }

        const rarityColors = {
            common: '#95A5A6',
            uncommon: '#2ECC71',
            rare: '#3498DB',
            epic: '#9B59B6',
            legendary: '#F1C40F'
        };

        const rarityTranslations = {
            common: '普通 (Common)',
            uncommon: '罕見 (Uncommon)',
            rare: '稀有 (Rare)',
            epic: '史詩 (Epic)',
            legendary: '傳說 (Legendary)'
        };

        const embed = createEmbed({
            title: '🎣 釣魚成功！',
            description: `${catchMessage}\n\n你釣到了一隻 **${fishCaught.emoji} ${fishCaught.name}**！你把它賣掉了，賺取了 **$${finalEarned.toLocaleString()}**！${multiplierMessage}${roleAwardedMessage}\n📦 *(已將該魚類記錄至你的背包與收集冊)*`,
            color: rarityColors[fishCaught.rarity]
        })
            .addFields(
                {
                    name: "新錢包現金餘額",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "稀有度",
                    value: rarityTranslations[fishCaught.rarity],
                    inline: true,
                }
            )
            .setFooter({ text: `可在 35 分鐘後進行下次釣魚。` });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'fish' })
};
