// src/services/reconcile.js

/**
 * 這些函式原本用於背景同步與健康檢查，
 * 目前暫時以空實作取代，回傳符合預期的結構。
 * 未來若需要實際功能，再補上邏輯即可。
 */

export async function reconcileReactionRoleMessages(client) {
    return {
        scannedMessages: 0,
        removedMessages: 0,
        errors: 0
    };
}

export async function reconcileTicketPanels(client) {
    return {
        scannedGuilds: 0,
        healthyPanels: 0,
        deletedPanels: 0,
        missingChannels: 0,
        recoveredIds: 0,
        errors: 0
    };
}

export async function reconcileVerificationPanels(client) {
    return {
        scannedGuilds: 0,
        healthyPanels: 0,
        deletedPanels: 0,
        missingChannels: 0,
        recoveredIds: 0,
        errors: 0
    };
}

export async function reconcileReactionRolePanelHealth(client) {
    return {
        scannedPanels: 0,
        healthyPanels: 0,
        deletedPanels: 0,
        missingChannels: 0,
        recoveredIds: 0,
        errors: 0
    };
}

export async function reconcileLevelRoles(client) {
    return {
        scannedGuilds: 0,
        prunedRewardEntries: 0,
        rolesReAwarded: 0,
        errors: 0
    };
}
