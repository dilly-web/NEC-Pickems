const isAdmin = require('../../utils/isAdmin');

module.exports = {
    name: 'remove-admin',
    description: 'Remove a user from the admin role for the NEC Pickems Bot.',
    options: [
        {
            name: 'user',
            type: 3, // STRING type for dynamic AutoComplete
            description: 'The user to be removed as an admin',
            required: true,
            autocomplete: true, // Enable AutoComplete for this option
        },
    ],
    async execute(interaction, db) {
        const invokingUserId = interaction.user.id;
        const targetUserId = interaction.options.getString('user');

        // Check if the invoking user is an admin
        const adminCheck = await isAdmin(invokingUserId, db);
        if (!adminCheck) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true,
            });
        }

        // Remove the target user from the admin_users table
        db.run('DELETE FROM admin_users WHERE id = ?', [targetUserId], (err) => {
            if (err) {
                console.error(err);
                return interaction.reply({
                    content: 'An error occurred while removing the user.',
                    ephemeral: true,
                });
            }

            interaction.reply({
                content: `User <@${targetUserId}> has been removed as an admin.`,
                ephemeral: true,
            });
        });
    },
    async autocomplete(interaction, db) {
        const focusedValue = interaction.options.getFocused(); // Get current user input

        db.all('SELECT id FROM admin_users', [], async (err, rows) => {
            if (err) {
                console.error(err);
                return interaction.respond([]);
            }

            const choices = [];
            for (const row of rows) {
                try {
                    // Fetch the user from Discord API to get their username
                    const user = await interaction.client.users.fetch(row.id);
                    choices.push({
                        name: `${user.username}#${user.discriminator}`, // Display username#discriminator
                        value: row.id,
                    });
                } catch (error) {
                    console.error(`Error fetching user with ID ${row.id}:`, error);
                }
            }

            // Filter choices based on user input
            const filtered = choices.filter((choice) =>
                choice.name.toLowerCase().includes(focusedValue.toLowerCase())
            );

            interaction.respond(filtered.slice(0, 25)); // Respond with up to 25 options
        });
    },
};
