const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config({ path: './config/.env' });

// const sqlite3 = require('sqlite3').verbose();
// const db = new sqlite3.Database('./data/pickems.db'); 
// Initialize database
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/pickems.db', (err) => {
    if (err) {
        console.error("Database connection error:", err.message);
    } else {
        db.run("PRAGMA foreign_keys = ON;", (err) => {
            if (err) {
                console.error("Failed to enable foreign key constraints:", err.message);
            } else {
                // console.log("Foreign key constraints are enabled.");
            }
        });
    }
});


const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Map();

// // Load all commands dynamically
const commandsPath = path.join(__dirname, 'commands'); // Corrected path
const commandFolders = fs.readdirSync(commandsPath).filter((item) =>
    fs.statSync(path.join(commandsPath, item)).isDirectory()
);

for (const folder of commandFolders) {
    const commandFiles = fs.readdirSync(path.join(commandsPath, folder)).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, folder, file));
        client.commands.set(command.name, command);
    }
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);

        if (!command || !command.autocomplete) return;

        try {
            await command.autocomplete(interaction, db);
        } catch (error) {
            console.error(error);
        }
    } else if (interaction.isCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            return interaction.reply({ content: 'Command not recognized.', ephemeral: true });
        }

        try {
            await command.execute(interaction, db);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error executing that command.', ephemeral: true });
        }
    }
});


client.login(process.env.BOT_TOKEN);