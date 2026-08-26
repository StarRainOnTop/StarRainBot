export const shopItems = [
    {
    id: 'extra_work',
    name: '額外工作時數',
    price: 5000,
    description: '永久解鎖：每次工作獲得雙倍職業與收入（冷卻不變）。',
    type: 'upgrade',
    maxLevel: 1,
    effect: {
        type: 'double_work'
    }
},
    {
        id: 'bank_upgrade_1',
        name: '銀行升級 I',
        price: 15000,
        description: '增加銀行容量，允許存入更多資金。',
        type: 'upgrade',
        maxLevel: 5,
        effect: {
            type: 'bank_capacity',
            multiplier: 1.5
        }
    },
    {
        id: 'diamond_pickaxe',
        name: '鑽石鎬',
        price: 50000,
        description: '增加從 `/mine` 獲得的產量。',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'mining_yield',
            multiplier: 2.0
        }
    },
    {
        id: 'premium_role',
        name: '高級伺服器身分組',
        price: 50000,
        description: '授予精美顏色與 10% 每日獎勵的特殊身分組。',
        type: 'role',
        roleId: null,
        effect: {
            type: 'daily_bonus',
            multiplier: 1.1
        }
    },
    {
        id: 'custom_role',
        name: '🎨 自訂專屬身分組',
        price: 100000,
        description: '購買後請開啟 Ticket 告訴管理員你想要的名稱與顏色！',
        type: 'role',
        roleId: null,
        effect: {
            type: 'custom_role_claim',
            perk: 'exclusive_name_color'
        }
    },
    {
        id: 'lucky_clover',
        name: '幸運草',
        price: 10000,
        description: '單次增加在 `/gamble` 中贏得更高彩金的機率。',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'gamble_boost',
            multiplier: 1.5,
            uses: 1
        }
    },
    {
        id: 'fishing_rod',
        name: '🎣 釣魚竿',
        price: 5000,
        description: '用於釣魚指令的裝備。',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'fishing_yield',
            multiplier: 1.0
        }
    },
    {
        id: 'pickaxe',
        name: '⛏️ 鎬',
        price: 7500,
        description: '用於挖礦指令的裝備。',
        type: 'tool',
        durability: 100,
        effect: {
            type: 'mining_yield',
            multiplier: 1.2
        }
    },
    {
        id: 'laptop',
        name: '💻 筆記型電腦',
        price: 15000,
        description: '增加工作收益。',
        type: 'tool',
        durability: 200,
        effect: {
            type: 'work_yield',
            multiplier: 1.5
        }
    },
    {
        id: 'lucky_charm',
        name: '🍀 幸運護符',
        price: 10000,
        description: '增加賭博的幸運值。消耗前可使用 3 次。',
        type: 'consumable',
        maxQuantity: 10,
        effect: {
            type: 'gamble_boost',
            multiplier: 1.3,
            uses: 3
        }
    },
    {
        id: 'bank_note',
        name: '📜 銀行支票',
        price: 25000,
        description: '增加 10,000 點銀行容量。可以重複購買。',
        type: 'tool',
        durability: null,
        effect: {
            type: 'bank_capacity',
            increase: 10000
        }
    },
    {
        id: 'disguise_mask',
        name: '🕶️ 面具',
        price: 3000,
        description: '降低犯罪失敗時的罰款金額。使用次數上限 5 次，每次犯罪消耗 1 個。',
        type: 'consumable',
        maxQuantity: 5,
        effect: {
            type: 'crime_fine_reduction',
            reduction: 0.5  // 罰款減半
        }
    },
    {
        id: 'lockpick',
        name: '🔧 萬能鑰匙',
        price: 5000,
        description: '提高犯罪成功率。使用次數上限 5 次，每次犯罪消耗 1 個。',
        type: 'consumable',
        maxQuantity: 5,
        effect: {
            type: 'crime_success_boost',
            boost: 0.15  // 失敗率降低 15%
        }
    },
    {
        id: 'beg_hat',
        name: '🎩 破舊帽子',
        price: 150,
        description: '提高乞討成功率。每次乞討消耗 1 個。',
        type: 'consumable',
        maxQuantity: 5,
        effect: {
            type: 'beg_success_boost',
            boost: 0.10  // 成功率 +10%
        }
    },
    {
        id: 'beg_sign',
        name: '🪧 創意標語板',
        price: 150,
        description: '增加乞討成功時獲得的金額。每次乞討消耗 1 個。',
        type: 'consumable',
        maxQuantity: 5,
        effect: {
            type: 'beg_amount_boost',
            multiplier: 1.5  // 金額 x1.5
        }
    },
    {
        id: 'personal_safe',
        name: '🔒 個人保險箱',
        price: 15000,
        description: '保護你的金錢免遭竊取。可防禦 5 次搶劫，用完需重新購買。',
        type: 'tool',
        durability: 5,
        effect: {
            type: 'robbery_protection',
            protection: true
        }
    }
];

export function getItemById(itemId) {
    return shopItems.find(item => item.id === itemId);
}

export function getItemsByType(type) {
    return shopItems.filter(item => item.type === type);
}

export function getItemPrice(itemId) {
    const item = getItemById(itemId);
    return item ? item.price : 0;
}

export function validatePurchase(itemId, userData) {
    const item = getItemById(itemId);
    if (!item) {
        return { valid: false, reason: '找不到該道具' };
    }

    const inventory = userData.inventory || {};
    const upgrades = userData.upgrades || {};

    if (item.type === 'consumable' && item.maxQuantity) {
        const currentQuantity = inventory[itemId] || 0;
        if (currentQuantity >= item.maxQuantity) {
            return { 
                valid: false, 
                reason: `你最多只能擁有 ${item.maxQuantity} 個${item.name}` 
            };
        }
    }

    if (item.type === 'upgrade' && item.maxLevel) {
        if (upgrades[itemId]) {
            return { 
                valid: false, 
                reason: `你已經購買過 ${item.name} 了` 
            };
        }
    }

    if (item.type === 'tool') {
        const currentQuantity = inventory[itemId] || 0;
        // 允許 bank_note 與 personal_safe 重複購買來疊加數量/耐久度
        if (itemId !== 'bank_note' && itemId !== 'personal_safe' && currentQuantity > 0) {
            return { 
                valid: false, 
                reason: `你已經有一個 ${item.name} 了` 
            };
        }
    }

    if (item.type === 'role' && item.roleId) {
        if (userData.roles?.includes(item.roleId)) {
            return { 
                valid: false, 
                reason: `你已經擁有 ${item.name} 身分組了` 
            };
        }
    }

    return { valid: true };
}
