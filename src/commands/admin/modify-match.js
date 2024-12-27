const isAdmin = require('../../utils/isAdmin');
const { format, parse, addDays } = require('date-fns');

module.exports = {
    name: 'modify-match',
    description: 'Modify an existing match in the NEC Pickems schedule.',
    options: [
        {
            name: 'match',
            type: 3, // STRING
            description: 'Select the match to modify.',
            required: true,
            autocomplete: true, // Enable AutoComplete for match selection
        },
        {
            name: 'team1',
            type: 3, // STRING
            description: 'Update the name of the first team.',
            required: false,
            autocomplete: true, // Enable AutoComplete for teams
        },
        {
            name: 'team2',
            type: 3, // STRING
            description: 'Update the name of the second team.',
            required: false,
            autocomplete: true, // Enable AutoComplete for teams
        },
        {
            name: 'date',
            type: 3, // STRING
            description: 'Update the date of the match.',
            required: false,
            autocomplete: true, // Enable AutoComplete for dates
        },
        {
            name: 'time',
            type: 3, // STRING
            description: 'Update the time of the match.',
            required: false,
            autocomplete: true, // Enable AutoComplete for times
        },
        {
            name: 'stage',
            type: 3, // STRING
            description: 'Update the stage of the league.',
            required: false,
            autocomplete: true, // Enable AutoComplete for stages
        },
        {
            name: 'week',
            type: 3, // STRING
            description: 'Update the week number for this match.',
            required: false,
            autocomplete: true, // Enable AutoComplete for weeks
        },
    ],
// Execute function in modify-match
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

    // Get command inputs
    const matchId = interaction.options.getString('match');
    const team1 = interaction.options.getString('team1');
    const team2 = interaction.options.getString('team2');
    let dateInput = interaction.options.getString('date'); // Changed from const to let
    const timeInput = interaction.options.getString('time');
    const stage = interaction.options.getString('stage');
    const weekInput = interaction.options.getString('week');

    // Validate and process inputs
    let matchDate;
    if (dateInput || timeInput) {
        try {
            // Fetch the existing match's date if only time is provided
            if (!dateInput && timeInput) {
                const existingMatch = await new Promise((resolve, reject) => {
                    db.get('SELECT start_time FROM matches WHERE id = ?', [matchId], (err, row) => {
                        if (err) return reject(err);
                        resolve(row);
                    });
                });

                if (!existingMatch) {
                    return interaction.reply({
                        content: 'Match not found.',
                        ephemeral: true,
                    });
                }

                dateInput = format(new Date(existingMatch.start_time), 'yyyy-MM-dd'); // Extract the date part
            }

            // Combine dateInput and timeInput
            const datePart = dateInput || '1970-01-01';
            const timePart = timeInput || '12:00 AM';

            const [time, period] = timePart.split(' '); // Split time and AM/PM
            const [hours12, minutes] = time.split(':').map(Number);

            if (isNaN(hours12) || isNaN(minutes)) {
                throw new Error('Invalid time format.');
            }

            const hours24 = period.toUpperCase() === 'PM' && hours12 !== 12
                ? hours12 + 12
                : period.toUpperCase() === 'AM' && hours12 === 12
                ? 0
                : hours12;

            matchDate = parse(datePart, 'yyyy-MM-dd', new Date());
            if (isNaN(matchDate)) throw new Error('Invalid date format.');

            matchDate.setHours(hours24, minutes, 0, 0); // Combine date and time
        } catch (error) {
            console.error(error);
            return interaction.reply({
                content: 'Invalid date or time format. Please use valid inputs.',
                ephemeral: true,
            });
        }
    }

    // Convert week input for database
    const week = weekInput ? (weekInput === 'Playoffs' ? 0 : parseInt(weekInput.replace('#', ''), 10)) : null;

    // Build the update query dynamically
    const updates = [];
    const values = [];
    if (team1) updates.push('team_a = ?'), values.push(team1);
    if (team2) updates.push('team_b = ?'), values.push(team2);
    if (matchDate) updates.push('start_time = ?'), values.push(matchDate.toISOString());
    if (stage) updates.push('stage = ?'), values.push(stage);
    if (week !== null) updates.push('week = ?'), values.push(week);

    if (updates.length === 0) {
        return interaction.reply({
            content: 'No updates were provided. Please specify at least one field to update.',
            ephemeral: true,
        });
    }

    values.push(matchId); // Add matchId for WHERE clause

    // Execute the update query
    db.run(
        `UPDATE matches SET ${updates.join(', ')} WHERE id = ?`,
        values,
        function (err) {
            if (err) {
                console.error(err);
                return interaction.reply({
                    content: 'An error occurred while updating the match.',
                    ephemeral: true,
                });
            }

            // Fetch the updated match details
            db.get('SELECT * FROM matches WHERE id = ?', [matchId], (err, updatedRow) => {
                if (err) {
                    console.error(err);
                    return interaction.reply({
                        content: 'An error occurred while fetching the updated match details.',
                        ephemeral: true,
                    });
                }

                if (!updatedRow) {
                    return interaction.reply({
                        content: 'Match not found after update.',
                        ephemeral: true,
                    });
                }

                // Build a user-friendly response with the updated match details
                const formattedDate = format(new Date(updatedRow.start_time), 'MMMM d, h:mm a');
                interaction.reply({
                    content: `Match updated successfully for **Week #${updatedRow.week || 'Playoffs'}**: **${updatedRow.team_a}** vs **${updatedRow.team_b}** on **${formattedDate}** (${updatedRow.stage}).`,
                    ephemeral: true,
                });
            });
        }
    );
},
    async autocomplete(interaction, db) {
        const focusedOption = interaction.options.getFocused(true);
        const userInput = focusedOption.value.toLowerCase();

        switch (focusedOption.name) {
            case 'match': {
                db.all('SELECT id, team_a, team_b, start_time FROM matches', [], (err, rows) => {
                    if (err) {
                        console.error(err);
                        return interaction.respond([]);
                    }

                    const choices = rows.map((row) => ({
                        name: `${row.team_a} vs ${row.team_b} on ${new Date(row.start_time).toLocaleString()}`,
                        value: row.id.toString(),
                    }));

                    const filtered = choices.filter((choice) =>
                        choice.name.toLowerCase().includes(userInput)
                    );

                    interaction.respond(filtered.slice(0, 25));
                });
                break;
            }
            case 'team1':
            case 'team2': {
                db.all('SELECT name FROM teams', [], (err, rows) => {
                    if (err) {
                        console.error(err);
                        return interaction.respond([]);
                    }

                    let choices = rows.map((row) => ({ name: row.name, value: row.name }));

                    if (focusedOption.name === 'team2') {
                        const selectedTeam1 = interaction.options.getString('team1');
                        if (selectedTeam1) {
                            choices = choices.filter(
                                (choice) => choice.value.toLowerCase() !== selectedTeam1.toLowerCase()
                            );
                        }
                    }

                    const filtered = choices.filter((choice) =>
                        choice.name.toLowerCase().includes(userInput)
                    );

                    interaction.respond(filtered.slice(0, 25));
                });
                break;
            }
            case 'week': {
                const weeks = [
                    { name: 'Playoffs', value: 'Playoffs' },
                    { name: '#1', value: '#1' },
                    { name: '#2', value: '#2' },
                    { name: '#3', value: '#3' },
                    { name: '#4', value: '#4' },
                    { name: '#5', value: '#5' },
                    { name: '#6', value: '#6' },
                    { name: '#7', value: '#7' },
                ];

                const filtered = weeks.filter((week) =>
                    week.name.toLowerCase().includes(userInput)
                );

                interaction.respond(filtered.slice(0, 25));
                break;
            }
            case 'date': {
                const dates = Array.from({ length: 10 }, (_, i) => {
                    const date = addDays(new Date(), i);
                    return {
                        name: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(date, 'yyyy-MM-dd'),
                        value: format(date, 'yyyy-MM-dd'),
                    };
                });

                const filtered = dates.filter((date) =>
                    date.name.toLowerCase().includes(userInput)
                );

                interaction.respond(filtered.slice(0, 25));
                break;
            }
            case 'time': {
                const startHour = 16;
                const endHour = 24;
                const intervalMinutes = 15;

                const times = [];
                for (let hour = startHour; hour <= endHour; hour++) {
                    for (let minutes = 0; minutes < 60; minutes += intervalMinutes) {
                        const hour12 = hour > 12 ? hour - 12 : hour;
                        const period = hour >= 12 ? 'PM' : 'AM';
                        const time = `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
                        times.push({ name: time, value: time });
                    }
                }

                const filtered = times.filter((time) =>
                    time.name.toLowerCase().includes(userInput)
                );

                interaction.respond(filtered.slice(0, 25));
                break;
            }
            case 'stage': {
                const stages = [
                    { name: 'Regular Season', value: 'Regular Season' },
                    { name: 'Playoffs', value: 'Playoffs' },
                    { name: 'Semifinals', value: 'Semifinals' },
                    { name: 'Finals', value: 'Finals' },
                ];

                const filtered = stages.filter((stage) =>
                    stage.name.toLowerCase().includes(userInput)
                );

                interaction.respond(filtered.slice(0, 25));
                break;
            }
            default:
                interaction.respond([]); // Default to an empty response for unhandled cases
                break;
        }
    },
};