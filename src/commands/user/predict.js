const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const logger = require('../../utils/logger'); // Adjust path as needed

// Map to store active collectors for each user
const collectorMap = new Map();

module.exports = {
    name: 'predict',
    description: 'Make predictions for matches in a specific week or playoffs.',
    options: [
        {
            name: 'week',
            type: 4, // INTEGER
            description: 'Select the week to predict.',
            required: true,
            autocomplete: true,
        },
    ],
    async execute(interaction, db) {
        const userId = interaction.user.id;
        const selectedWeek = interaction.options.getInteger('week');
        logger.info(`User ${userId} executed /predict for week ${selectedWeek}.`);

        // Cancel any active collectors for this user
        if (collectorMap.has(userId)) {
            const existingCollector = collectorMap.get(userId);
            existingCollector.stop('new command');
            logger.info(`Stopped existing collector for user ${userId}.`);
        }

        const fetchMatches = async () => {
            return new Promise((resolve, reject) => {
                db.all(
                    `SELECT 
                        matches.id AS match_id, 
                        matches.team_a, 
                        matches.team_b, 
                        matches.start_time, 
                        predictions.predicted_winner 
                     FROM matches 
                     LEFT JOIN predictions 
                     ON matches.id = predictions.match_id 
                     AND predictions.user_id = ? 
                     WHERE matches.week = ? 
                     ORDER BY matches.start_time`,
                    [userId, selectedWeek],
                    (err, rows) => {
                        if (err) {
                            logger.error(`Database fetch error: ${err.message}`);
                            return reject(err);
                        }
                        resolve(rows);
                    }
                );
            });
        };

        const createEmbedAndRows = (matches, expired = false) => {
            const embed = new EmbedBuilder()
                .setTitle(`${selectedWeek === 0 ? 'Playoffs' : `Week ${selectedWeek}`} Predictions`)
                .setDescription(expired ? 'Prediction time has ended. This message is no longer active.' : 'Click the buttons below to set your predictions.')
                .setColor(expired ? '#FF0000' : '#5865F2');

            const actionRows = matches.map((match) => {
                const teamASymbol = match.predicted_winner === match.team_a ? ':green_square:' : '';
                const teamBSymbol = match.predicted_winner === match.team_b ? ':green_square:' : '';

                embed.addFields({
                    name: `${match.team_a} ${teamASymbol} VS ${match.team_b} ${teamBSymbol}`,
                    value: `Schedule: <t:${Math.floor(new Date(match.start_time).getTime() / 1000)}:F>`,
                });

                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`predict_${match.match_id}_team_a`)
                        .setLabel(match.team_a)
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(expired || match.predicted_winner === match.team_a),
                    new ButtonBuilder()
                        .setCustomId(`predict_${match.match_id}_team_b`)
                        .setLabel(match.team_b)
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(expired || match.predicted_winner === match.team_b)
                );
            });

            return { embed, actionRows };
        };

        try {
            const matches = await fetchMatches();
            if (!matches.length) {
                logger.info(`No matches found for week ${selectedWeek}.`);
                return interaction.reply({
                    content: `No matches found for ${selectedWeek === 0 ? 'Playoffs' : `Week ${selectedWeek}`}.`,
                    ephemeral: true,
                });
            }

            const { embed, actionRows } = createEmbedAndRows(matches);

            const message = await interaction.reply({
                embeds: [embed],
                components: actionRows,
                ephemeral: true,
            });

            const collector = message.createMessageComponentCollector({
                filter: (btnInteraction) => btnInteraction.user.id === userId,
                time: 45000,
            });

            // Store this user's collector
            collectorMap.set(userId, collector);

            collector.on('collect', async (btnInteraction) => {
                const match = btnInteraction.customId.match(/^predict_(\d+)_(team_a|team_b)$/);
                if (!match) {
                    logger.error(`Invalid customId format: ${btnInteraction.customId}`);
                    return btnInteraction.reply({
                        content: 'Invalid selection. Please try again.',
                        ephemeral: true,
                    });
                }

                const [, matchId, teamIdentifier] = match;
                const selectedMatch = matches.find((match) => match.match_id.toString() === matchId);
                if (!selectedMatch) {
                    logger.error(`Match with ID ${matchId} not found.`);
                    return btnInteraction.reply({
                        content: 'Match not found.',
                        ephemeral: true,
                    });
                }

                const predictedTeam = teamIdentifier === 'team_a' ? selectedMatch.team_a : selectedMatch.team_b;
                logger.info(`User ${userId} predicted ${predictedTeam} for match ${matchId}.`);

                db.run(
                    `INSERT INTO predictions (user_id, match_id, predicted_winner, timestamp)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(user_id, match_id)
                     DO UPDATE SET predicted_winner = excluded.predicted_winner, timestamp = excluded.timestamp`,
                    [userId, matchId, predictedTeam, new Date().toISOString()],
                    async (err) => {
                        if (err) {
                            logger.error(`Database update error: ${err.message}`);
                            return btnInteraction.reply({
                                content: 'Failed to save your prediction. Please try again later.',
                                ephemeral: true,
                            });
                        }

                        const matchIndex = matches.findIndex((match) => match.match_id.toString() === matchId);
                        if (matchIndex !== -1) {
                            matches[matchIndex].predicted_winner = predictedTeam;
                        }

                        const { embed: updatedEmbed, actionRows: updatedActionRows } = createEmbedAndRows(matches);

                        await message.edit({
                            embeds: [updatedEmbed],
                            components: updatedActionRows,
                        });

                        await btnInteraction.deferUpdate();
                    }
                );
            });

            collector.on('end', async (_, reason) => {
                logger.info(`Interaction collector ended. Reason: ${reason}`);
                const { embed: expiredEmbed, actionRows: expiredActionRows } = createEmbedAndRows(matches, true);

                await message.edit({
                    embeds: [expiredEmbed],
                    components: expiredActionRows,
                });

                collectorMap.delete(userId);
            });
        } catch (error) {
            logger.error(`Unexpected error: ${error.message}`);
            interaction.reply({
                content: 'An unexpected error occurred. Please try again later.',
                ephemeral: true,
            });
        }
    },

    async autocomplete(interaction, db) {
        try {
            db.all('SELECT DISTINCT week FROM matches ORDER BY week', [], (err, rows) => {
                if (err) {
                    logger.error(`Autocomplete database error: ${err.message}`);
                    return interaction.respond([]);
                }
                const choices = rows.map((row) => ({
                    name: row.week === 0 ? 'Playoffs' : `Week ${row.week}`,
                    value: row.week,
                }));
                interaction.respond(choices.slice(0, 25));
            });
        } catch (error) {
            logger.error(`Autocomplete unexpected error: ${error.message}`);
            interaction.respond([]);
        }
    },
};