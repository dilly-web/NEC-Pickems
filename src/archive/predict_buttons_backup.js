const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

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
        console.log(`[INFO] User ${userId} selected week ${selectedWeek}.`);

        try {
            console.log(`[DEBUG] Fetching matches for user ${userId} and week ${selectedWeek}.`);
            const matches = await new Promise((resolve, reject) => {
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
                            console.error(`[ERROR] Database fetch error:`, err);
                            return reject(err);
                        }
                        console.log(`[DEBUG] Fetched matches:`, rows);
                        resolve(rows);
                    }
                );
            });

            if (!matches.length) {
                console.log(`[INFO] No matches found for week ${selectedWeek}.`);
                return interaction.reply({
                    content: `No matches found for ${selectedWeek === 0 ? 'Playoffs' : `Week ${selectedWeek}`}.`,
                    ephemeral: true,
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`${selectedWeek === 0 ? 'Playoffs' : `Week ${selectedWeek}`} Predictions`)
                .setDescription('Click the buttons below to set your predictions.')
                .setColor('#5865F2');

            const actionRows = [];
            matches.forEach((match) => {
                embed.addFields({
                    name: `${match.team_a} ${match.predicted_winner === match.team_a ? '✅' : ''} vs ${match.team_b} ${match.predicted_winner === match.team_b ? '✅' : ''}`,
                    value: `Time: ${new Date(match.start_time).toLocaleString()}`,
                });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`predict_${match.match_id}_team_a`)
                        .setLabel(match.team_a)
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(match.predicted_winner === match.team_a),
                    new ButtonBuilder()
                        .setCustomId(`predict_${match.match_id}_team_b`)
                        .setLabel(match.team_b)
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(match.predicted_winner === match.team_b)
                );
                actionRows.push(row);
            });

            console.log(`[DEBUG] Action rows generated:`, JSON.stringify(actionRows, null, 2));

            await interaction.reply({
                embeds: [embed],
                components: actionRows,
                ephemeral: true,
            });

            const collector = interaction.channel.createMessageComponentCollector({
                filter: (btnInteraction) => btnInteraction.user.id === userId,
                time: 60000,
            });

            collector.on('collect', async (btnInteraction) => {
                console.log(`[INFO] Button interaction received: ${btnInteraction.customId}`);
                
                // Correctly parse customId
                const match = btnInteraction.customId.match(/^predict_(\d+)_(team_a|team_b)$/);
                if (!match) {
                    console.error(`[ERROR] Invalid customId format: ${btnInteraction.customId}`);
                    return btnInteraction.reply({
                        content: 'Invalid selection. Please try again.',
                        ephemeral: true,
                    });
                }
            
                const [, matchId, teamIdentifier] = match; // Properly extract matchId and teamIdentifier
                console.log(`[DEBUG] Parsed: matchId=${matchId}, teamIdentifier=${teamIdentifier}`);
            
                // Find the selected match
                const selectedMatch = matches.find((match) => match.match_id.toString() === matchId);
                if (!selectedMatch) {
                    console.error(`[ERROR] Match with ID ${matchId} not found.`);
                    return btnInteraction.reply({
                        content: 'Match not found.',
                        ephemeral: true,
                    });
                }
            
                console.log(`[DEBUG] Selected Match:`, selectedMatch);
            
                // Determine the predicted team based on teamIdentifier
                const predictedTeam = teamIdentifier === 'team_a' ? selectedMatch.team_a : selectedMatch.team_b;
                console.log(`[INFO] User ${userId} predicted: ${predictedTeam} for Match ${matchId}`);
            
                // Update the database and proceed
                db.run(
                    `INSERT INTO predictions (user_id, match_id, predicted_winner, timestamp)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(user_id, match_id)
                     DO UPDATE SET predicted_winner = excluded.predicted_winner, timestamp = excluded.timestamp`,
                    [userId, matchId, predictedTeam, new Date().toISOString()],
                    (err) => {
                        if (err) {
                            console.error(`[ERROR] Database update error:`, err);
                            return btnInteraction.reply({
                                content: 'Failed to save your prediction. Please try again later.',
                                ephemeral: true,
                            });
                        }
            
                        console.log(`[INFO] Prediction updated for Match ${matchId}: ${predictedTeam}`);
                        
                        // Update Embed
                        embed.data.fields = embed.data.fields.map((field) => {
                            if (field.name.includes(selectedMatch.team_a) && field.name.includes(selectedMatch.team_b)) {
                                const isTeamAPredicted = predictedTeam === selectedMatch.team_a;
                                const isTeamBPredicted = predictedTeam === selectedMatch.team_b;
                                return {
                                    name: `${selectedMatch.team_a} ${isTeamAPredicted ? '✅' : ''} vs ${selectedMatch.team_b} ${isTeamBPredicted ? '✅' : ''}`,
                                    value: field.value,
                                };
                            }
                            return field;
                        });
            
                        // Update button states
                        const updatedRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`predict_${matchId}_team_a`)
                                .setLabel(selectedMatch.team_a)
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(predictedTeam === selectedMatch.team_a),
                            new ButtonBuilder()
                                .setCustomId(`predict_${matchId}_team_b`)
                                .setLabel(selectedMatch.team_b)
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(predictedTeam === selectedMatch.team_b)
                        );
            
                        btnInteraction.update({
                            embeds: [embed],
                            components: actionRows.map((row) => {
                                // Ensure `row.components` exists before proceeding
                                if (!row || !row.components) return row;
                        
                                // Check if the current row contains the button for the given matchId
                                const containsMatchButton = row.components.some((btn) =>
                                    btn.customId && btn.customId.includes(`predict_${matchId}`)
                                );
                        
                                // If it matches, replace with the updated row; otherwise, keep the row unchanged
                                return containsMatchButton ? updatedRow : row;
                            }),
                            content: `Your prediction for **${predictedTeam}** has been saved.`,
                        });
                    }
                );
            });

            collector.on('end', () => {
                actionRows.forEach((row) =>
                    row.components.forEach((btn) => btn.setDisabled(true))
                );
                interaction.editReply({
                    content: 'Prediction time has ended.',
                    components: actionRows,
                });
            });
        } catch (error) {
            console.error(`[ERROR] Unexpected error:`, error);
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
                    console.error(`[ERROR] Autocomplete database error:`, err);
                    return interaction.respond([]);
                }
                const choices = rows.map((row) => ({
                    name: row.week === 0 ? 'Playoffs' : `Week ${row.week}`,
                    value: row.week,
                }));
                interaction.respond(choices.slice(0, 25));
            });
        } catch (error) {
            console.error(`[ERROR] Autocomplete unexpected error:`, error);
            interaction.respond([]);
        }
    },
};