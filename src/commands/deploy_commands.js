const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './config/.env' });

const commands = []; // Initialize the commands array

const commandsPath = path.join(__dirname); // Use the current directory
const commandFolders = fs.readdirSync(commandsPath).filter((item) =>
    fs.statSync(path.join(commandsPath, item)).isDirectory()
);

for (const folder of commandFolders) {
    const commandFiles = fs
        .readdirSync(path.join(commandsPath, folder))
        .filter((file) => file.endsWith('.js'));

    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, folder, file));

        if (!command.name || !command.description) {
            console.warn(`Skipping invalid command file: ${file}`);
            continue;
        }

        // Add visibility restriction for admin commands
        const isAdminCommand = folder === 'admin';
        commands.push({
            name: command.name,
            description: command.description,
            options: command.options || [],
            default_member_permissions: isAdminCommand ? null : undefined, // Null for admin-only commands
        });
    }
}

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
    try {
        console.log('Refreshing application (/) commands.');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();