import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import config from './src/config/application.js';

const clientId = config.bot.clientId;
const guildId = process.env.GUILD_ID;
const commandId = '1541790866094432340';
const isGlobal = true; // 如果是全域指令填 true，公會指令填 false

const rest = new REST({ version: '10' }).setToken(config.bot.token);

(async () => {
    try {
        if (isGlobal) {
            await rest.delete(Routes.applicationCommand(clientId, commandId));
            console.log(`✅ Deleted global command ${commandId}`);
        } else {
            await rest.delete(Routes.applicationGuildCommand(clientId, guildId, commandId));
            console.log(`✅ Deleted guild command ${commandId}`);
        }
    } catch (err) {
        console.error('❌ Failed:', err);
    }
})();
