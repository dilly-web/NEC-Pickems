const isAdmin = require('../../utils/isAdmin');

module.exports = {
    name: 'add-admin',
    description: 'Add a user to the admin role for the NEC Pickems Bot.',
    options: [
        {
            name: 'user',
            type: 6, // Discord user type
            description: 'The user to be added as an admin.',
            required: true,
        },
    ],
    async execute(interaction, db) {
        const invokingUserId = interaction.user.id;
        const targetUser = interaction.options.getUser('user');

        // Check if the invoking user is an admin
        const adminCheck = await isAdmin(invokingUserId, db);
        if (!adminCheck) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true,
            });
        }

        // Add the target user to the admin_users table
        db.run('INSERT OR IGNORE INTO admin_users (id) VALUES (?)', [targetUser.id], (err) => {
            if (err) {
                console.error(err);
                return interaction.reply({
                    content: 'An error occurred while adding the user.',
                    ephemeral: true,
                });
            }

            // Use the Discord mention format to include a clickable mention
            interaction.reply({
                content: `Admin role updated successfully for user <@${targetUser.id}>.`,
                ephemeral: true,
            });
        });
    },
};
