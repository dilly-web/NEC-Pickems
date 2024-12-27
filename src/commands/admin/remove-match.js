const isAdmin = require('../../utils/isAdmin');
const { format } = require('date-fns');
const {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} = require('discord.js');

// Map to store active collectors for each user
const activeCollectors = new Map();

module.exports = {
    name: 'remove-match',
    description: 'Remove a match from the NEC Pickems schedule.',
    async execute(interaction, db) {
        const invokingUserId = interaction.user.id;

        // End any previous interaction for this user
        if (activeCollectors.has(invokingUserId)) {
            const previousCollector = activeCollectors.get(invokingUserId);
            previousCollector.stop('new command');
            console.log(`[INFO] Stopped existing collector for user ${invokingUserId}.`);
        }

        // Check if the invoking user is an admin
        const adminCheck = await isAdmin(invokingUserId, db);
        if (!adminCheck) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true,
            });
        }

        // Fetch matches from the database
        db.all('SELECT id, team_a, team_b, start_time, week FROM matches', [], async (err, rows) => {
            if (err) {
                console.error(`[ERROR] Database fetch error:`, err);
                return interaction.reply({
                    content: 'An error occurred while fetching matches.',
                    ephemeral: true,
                });
            }

            if (!rows.length) {
                return interaction.reply({
                    content: 'No matches found in the schedule.',
                    ephemeral: true,
                });
            }

           // Format matches for the select menu
            const options = rows.map((row) => ({
                label: `${row.team_a} vs ${row.team_b} (${row.week === 0 ? 'Playoffs' : `Week ${row.week}`})`,
                description: `Scheduled: ${new Date(row.start_time).toLocaleString()}`,
                value: row.id.toString(),
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select-match')
                .setPlaceholder('Select a match to remove')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.reply({
                content: 'Select a match to remove:',
                components: [row],
                ephemeral: true,
            });

            // Create collector for select menu interaction
            const collector = interaction.channel.createMessageComponentCollector({
                filter: (menuInteraction) => menuInteraction.user.id === invokingUserId,
                time: 60000, // 1 minute
            });

            // Store the collector for this user
            activeCollectors.set(invokingUserId, collector);

            collector.on('collect', async (menuInteraction) => {
                if (menuInteraction.customId === 'select-match') {
                    await menuInteraction.deferUpdate(); // Avoid "Unknown interaction"

                    const selectedMatchId = menuInteraction.values[0];
                    const selectedMatch = rows.find((row) => row.id.toString() === selectedMatchId);

                    if (!selectedMatch) {
                        console.error(`[ERROR] Match with ID ${selectedMatchId} not found.`);
                        return menuInteraction.followUp({
                            content: 'The selected match could not be found. Please try again.',
                            ephemeral: true,
                        });
                    }

                    const { team_a, team_b, start_time } = selectedMatch;
                    const formattedDate = format(new Date(start_time), 'MMMM d, h:mm a'); // e.g., "December 6, 4:00 PM"

                    // Check related predictions
                    db.get('SELECT COUNT(*) AS count FROM predictions WHERE match_id = ?', [selectedMatchId], async (err, result) => {
                        if (err) {
                            console.error(`[ERROR] Database fetch error for predictions:`, err);
                            return menuInteraction.followUp({
                                content: 'An error occurred while checking related predictions.',
                                ephemeral: true,
                            });
                        }

                        const predictionCount = result.count;

                        // Show confirmation
                        const confirmationEmbed = new EmbedBuilder()
                            .setTitle('Confirm Match and Prediction Removal')
                            .setDescription(
                                `**${team_a} vs ${team_b}**\nScheduled for **${formattedDate}**\n\n` +
                                `This match has **${predictionCount} related predictions**. Removing this match will also delete all associated predictions.`
                            )
                            .setColor('#FF0000');

                        const confirmButton = new ButtonBuilder()
                            .setCustomId(`confirm-remove-${selectedMatchId}`)
                            .setLabel('Confirm')
                            .setStyle(ButtonStyle.Danger);

                        const cancelButton = new ButtonBuilder()
                            .setCustomId('cancel-remove')
                            .setLabel('Cancel')
                            .setStyle(ButtonStyle.Secondary);

                        const confirmationRow = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

                        await menuInteraction.followUp({
                            content: 'Are you sure you want to proceed?',
                            embeds: [confirmationEmbed],
                            components: [confirmationRow],
                            ephemeral: true,
                        });

                        // Create collector for confirmation buttons
                        const confirmationCollector = menuInteraction.channel.createMessageComponentCollector({
                            filter: (buttonInteraction) =>
                                buttonInteraction.user.id === invokingUserId &&
                                (buttonInteraction.customId.startsWith('confirm-remove') ||
                                    buttonInteraction.customId === 'cancel-remove'),
                            time: 60000, // 1 minute
                        });

                        activeCollectors.set(invokingUserId, confirmationCollector);

                        confirmationCollector.on('collect', async (buttonInteraction) => {
                            const [action, actionType, matchId] = buttonInteraction.customId.split('-');

                            if (action === 'confirm' && actionType === 'remove' && matchId) {
                                db.run('DELETE FROM predictions WHERE match_id = ?', [matchId], function (err) {
                                    if (err) {
                                        console.error(`[ERROR] Failed to delete predictions for match ID ${matchId}:`, err);
                                        return buttonInteraction.reply({
                                            content: 'An error occurred while removing predictions.',
                                            ephemeral: true,
                                        });
                                    }

                                    db.run('DELETE FROM matches WHERE id = ?', [matchId], function (err) {
                                        if (err) {
                                            console.error(`[ERROR] Failed to delete match with ID ${matchId}:`, err);
                                            return buttonInteraction.reply({
                                                content: 'An error occurred while removing the match.',
                                                ephemeral: true,
                                            });
                                        }

                                        console.log(`[INFO] Match with ID ${matchId} and related predictions successfully removed.`);
                                        buttonInteraction.update({
                                            content: `The match and all related predictions were successfully removed.`,
                                            embeds: [],
                                            components: [],
                                        });
                                    });
                                });
                            } else if (action === 'cancel') {
                                console.log(`[INFO] Match removal canceled by user.`);
                                buttonInteraction.update({
                                    content: 'Match removal has been canceled.',
                                    embeds: [],
                                    components: [],
                                });
                            }

                            confirmationCollector.stop();
                        });

                        confirmationCollector.on('end', (_, reason) => {
                            if (reason === 'time') {
                                menuInteraction.editReply({
                                    content: 'Time has expired. Please reissue the command to remove a match.',
                                    components: [],
                                });
                            }
                        });
                    });
                }
            });

            collector.on('end', (_, reason) => {
                activeCollectors.delete(invokingUserId); // Remove collector reference
                if (reason === 'time') {
                    interaction.editReply({
                        content: 'Time has expired. Please reissue the command to remove a match.',
                        components: [],
                    });
                }
            });
        });
    },
};