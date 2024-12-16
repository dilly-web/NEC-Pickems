const isAdmin = require('../../utils/isAdmin');

module.exports = {
    name: 'modify-results',
    description: 'Modify match results in the NEC Pickems schedule.',
    options: [
        {
            name: 'match',
            type: 3, // STRING
            description: 'Select the match to modify results for.',
            required: true,
            autocomplete: true,
        },
        {
            name: 'team_a_score',
            type: 4, // INTEGER
            description: 'Score for Team A (left team).',
            required: true,
            choices: [
                { name: '0', value: 0 },
                { name: '1', value: 1 },
                { name: '2', value: 2 },
                { name: '3', value: 3 }, // For Best of 5
            ],
        },
        {
            name: 'team_b_score',
            type: 4, // INTEGER
            description: 'Score for Team B (right team).',
            required: true,
            choices: [
                { name: '0', value: 0 },
                { name: '1', value: 1 },
                { name: '2', value: 2 },
                { name: '3', value: 3 }, // For Best of 5
            ],
        },
    ],
    async execute(interaction, db) {
        try {
            const invokingUserId = interaction.user.id;

            // Check admin permissions
            const adminCheck = await isAdmin(invokingUserId, db);
            if (!adminCheck) {
                return interaction.reply({
                    content: 'You do not have permission to use this command.',
                    ephemeral: true,
                });
            }

            const matchId = interaction.options.getString('match');
            const teamAScore = interaction.options.getInteger('team_a_score');
            const teamBScore = interaction.options.getInteger('team_b_score');

            // Fetch match details
            const matchDetails = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT stage, team_a, team_b FROM matches WHERE id = ?',
                    [matchId],
                    (err, row) => {
                        if (err) {
                            console.error(err);
                            reject('An error occurred while fetching the match.');
                        } else if (!row) {
                            reject('Match not found.');
                        } else {
                            resolve(row); // { stage: "Regular Season", team_a: "Team A", team_b: "Team B" }
                        }
                    }
                );
            });

            const { stage, team_a, team_b } = matchDetails;

            // Validate the combination of scores
            const validCombinations =
                stage === 'Finals'
                    ? [
                          [3, 0],
                          [3, 1],
                          [3, 2],
                          [0, 3],
                          [1, 3],
                          [2, 3],
                      ] // Best of 5
                    : [
                          [2, 0],
                          [2, 1],
                          [0, 2],
                          [1, 2],
                      ]; // Best of 3

            const isValid = validCombinations.some(
                ([a, b]) => a === teamAScore && b === teamBScore
            );

            if (!isValid) {
                return interaction.reply({
                    content: `Invalid score combination for ${stage}. Allowed combinations: ${validCombinations
                        .map(([a, b]) => `${a}-${b}`)
                        .join(', ')}`,
                    ephemeral: true,
                });
            }

            // Determine winner
            const matchWinner = teamAScore > teamBScore ? team_a : team_b;

            // Insert or update the results in the database
            const query = `
                INSERT INTO results (
                    match_id, team_a_score, team_b_score, match_winner
                )
                VALUES (?, ?, ?, ?)
                ON CONFLICT(match_id)
                DO UPDATE SET 
                    team_a_score = excluded.team_a_score,
                    team_b_score = excluded.team_b_score,
                    match_winner = excluded.match_winner;
            `;
            db.run(
                query,
                [matchId, teamAScore, teamBScore, matchWinner],
                (err) => {
                    if (err) {
                        console.error(err);
                        return interaction.reply({
                            content: 'An error occurred while updating the results.',
                            ephemeral: true,
                        });
                    }

                    interaction.reply({
                        content: `**Match:** ${team_a} vs ${team_b}\n**Final Score:** ${team_a} ${teamAScore} - ${teamBScore} ${team_b}\n**Winner:** ${matchWinner}`,
                        ephemeral: true,
                    });
                }
            );
        } catch (error) {
            interaction.reply({
                content: error.message || 'An error occurred during validation.',
                ephemeral: true,
            });
        }
    },

    async autocomplete(interaction, db) {
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'match') {
            db.all('SELECT id, team_a, team_b, start_time FROM matches', [], (err, rows) => {
                if (err) {
                    console.error(err);
                    return interaction.respond([]);
                }

                const choices = rows.map((row) => ({
                    name: `${row.team_a} vs ${row.team_b} on ${new Date(
                        row.start_time
                    ).toLocaleString()}`,
                    value: row.id.toString(),
                }));

                const filtered = choices.filter((choice) =>
                    choice.name
                        .toLowerCase()
                        .includes(focusedOption.value.toLowerCase())
                );

                interaction.respond(filtered.slice(0, 25));
            });
        } else {
            interaction.respond([]);
        }
    },
};