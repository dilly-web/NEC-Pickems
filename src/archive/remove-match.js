const isAdmin = require('../utils/isAdmin');
const { format } = require('date-fns');

module.exports = {
    name: 'remove-match',
    description: 'Remove a match from the NEC Pickems schedule.',
    options: [
        {
            name: 'match',
            type: 3, // STRING
            description: 'Select the match to remove.',
            required: true,
            autocomplete: true, // Enable AutoComplete
        },
    ],
    async execute(interaction, db) {
        const invokingUserId = interaction.user.id;

        // Check if the invoking user is an admin
        const adminCheck = await isAdmin(invokingUserId, db);
        if (!adminCheck) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true,
            });
        }

        // Get the match ID to remove
        const matchId = interaction.options.getString('match');

        // Fetch the match details before deleting
        db.get('SELECT team_a, team_b, start_time FROM matches WHERE id = ?', [matchId], (err, row) => {
            if (err) {
                console.error(err);
                return interaction.reply({
                    content: 'An error occurred while fetching the match details.',
                    ephemeral: true,
                });
            }

            if (!row) {
                return interaction.reply({
                    content: 'Match not found.',
                    ephemeral: true,
                });
            }

            const { team_a, team_b, start_time } = row;

            // Format the date and time without the year
            const formattedDate = format(new Date(start_time), 'MMMM d, h:mm a'); // e.g., "December 6, 4:00 PM"

            // Delete the match from the database
            db.run('DELETE FROM matches WHERE id = ?', [matchId], function (err) {
                if (err) {
                    console.error(err);
                    return interaction.reply({
                        content: 'An error occurred while removing the match.',
                        ephemeral: true,
                    });
                }

                interaction.reply({
                    content: `Match **${team_a} vs ${team_b}** on **${formattedDate}** was successfully removed.`,
                    ephemeral: true,
                });
            });
        });
    },
    async autocomplete(interaction, db) {
        const focusedValue = interaction.options.getFocused(); // Get current user input

        db.all('SELECT id, team_a, team_b, start_time, week FROM matches', [], (err, rows) => {
            if (err) {
                console.error(err);
                return interaction.respond([]);
            }

            // Format matches for selection
            const choices = rows.map((row) => ({
                name: `${row.team_a} vs ${row.team_b} on ${new Date(row.start_time).toLocaleString()}`,
                value: row.id.toString(),
            }));

            // Filter matches based on user input
            const filtered = choices.filter((choice) =>
                choice.name.toLowerCase().includes(focusedValue.toLowerCase())
            );

            interaction.respond(filtered.slice(0, 25)); // Respond with up to 25 options
        });
    },
};