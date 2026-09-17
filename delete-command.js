import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import config from './src/config/application.js';

const clientId = config.bot.clientId;
const guildId = process.env.GUILD_ID; // 如果沒有 GUILD_ID，就刪全域
const commandId = '1541790866094432340';

const rest = new REST({ version: '10' }).setToken(config.bot.token);

(async () => {
    try {
        if (guildId) {
            await rest.delete(
                Routes.applicationGuildCommand(clientId, guildId, commandId)
            );
            console.log(`✅ Deleted guild command ${commandId} from guild ${guildId}`);
        } else {
            await rest.delete(
                Routes.applicationCommand(clientId, commandId)
            );
            console.log(`✅ Deleted global command ${commandId}`);
        }
    } catch (err) {
        console.error('❌ Failed to delete command:', err);
    }
})();
