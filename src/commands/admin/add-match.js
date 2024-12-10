const isAdmin = require('../../utils/isAdmin');
const { addDays, format, parse } = require('date-fns');

module.exports = {
    name: 'add-match',
    description: 'Add a match to the NEC Pickems schedule.',
    options: [
        {
            name: 'team1',
            type: 3, // STRING
            description: 'Name of the first team.',
            required: true,
            autocomplete: true, // Enable AutoComplete
        },
        {
            name: 'team2',
            type: 3, // STRING
            description: 'Name of the second team.',
            required: true,
            autocomplete: true, // Enable AutoComplete
        },
        {
            name: 'date',
            type: 3, // STRING
            description: 'Select a date for the match.',
            required: true,
            autocomplete: true, // Enable AutoComplete for dates
        },
        {
            name: 'time',
            type: 3, // STRING
            description: 'Select a time for the match (e.g., 4:00 PM).',
            required: true,
            autocomplete: true, // Enable AutoComplete for times
        },
        {
            name: 'stage',
            type: 3, // STRING
            description: 'The stage of the league (e.g., Regular Season, Playoffs).',
            required: true,
            autocomplete: true, // Enable AutoComplete
        },
        {
            name: 'week',
            type: 4, // INTEGER
            description: 'Specify the week number for this match (default: 0).',
            required: false, // Optional
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

        // Get command inputs
        const team1 = interaction.options.getString('team1');
        const team2 = interaction.options.getString('team2');
        const dateInput = interaction.options.getString('date');
        const timeInput = interaction.options.getString('time');
        const stage = interaction.options.getString('stage');
        const week = interaction.options.getInteger('week') ?? 0;
        console.log(`Week received from input: ${week}`);
        // Validate week input
        if (week < 0 || !Number.isInteger(week)) {
            return interaction.reply({
                content: 'Invalid week number. Please provide a non-negative integer.',
                ephemeral: true,
            });
        }        
        // Parse and validate date and time
        let matchDate;
        try {
            // Parse the date input
            matchDate = parse(dateInput, 'yyyy-MM-dd', new Date());
            if (isNaN(matchDate)) throw new Error('Invalid date format');

            // Parse the time input
            const [time, period] = timeInput.split(' '); // Split time and AM/PM
            const [hours12, minutes] = time.split(':').map(Number);
            const hours24 = period.toUpperCase() === 'PM' && hours12 !== 12
                ? hours12 + 12
                : period.toUpperCase() === 'AM' && hours12 === 12
                ? 0
                : hours12;

            matchDate.setHours(hours24, minutes, 0, 0); // Set time on the date object
        } catch (error) {
            return interaction.reply({
                content: 'Invalid date or time format. Please use a valid date (YYYY-MM-DD) and time (e.g., 4:00 PM).',
                ephemeral: true,
            });
        }

        // Insert match into the database
        db.run(
            `INSERT INTO matches (team_a, team_b, start_time, stage, week) VALUES (?, ?, ?, ?, ?)`,
            [team1, team2, matchDate.toISOString(), stage, week],
            function (err) {
                if (err) {
                    console.error(err);
                    return interaction.reply({
                        content: 'An error occurred while adding the match.',
                        ephemeral: true,
                    });
                }

                interaction.reply({
                    content: `Match added successfully for **Week ${week}**: **${team1}** vs **${team2}** on **${format(
                        matchDate,
                        'yyyy-MM-dd hh:mm a'
                    )}** (${stage}).`,
                    ephemeral: true,
                });
            }
        );
    },
    async autocomplete(interaction, db) {
        const focusedOption = interaction.options.getFocused(true); // Get focused option
    
        if (focusedOption.name === 'team1' || focusedOption.name === 'team2') {
            // Fetch all teams from the database
            db.all('SELECT name FROM teams', [], (err, rows) => {
                if (err) {
                    console.error(err);
                    return interaction.respond([]);
                }
    
                const choices = rows.map((row) => ({ name: row.name, value: row.name }));
    
                if (focusedOption.name === 'team2') {
                    // Exclude the team selected as team1
                    const selectedTeam1 = interaction.options.getString('team1');
                    if (selectedTeam1) {
                        const filteredChoices = choices.filter((choice) => choice.value !== selectedTeam1);
                        interaction.respond(filteredChoices.slice(0, 25)); // Respond with filtered choices
                        return;
                    }
                }
    
                // Respond with unfiltered choices if no filtering is needed
                interaction.respond(choices.slice(0, 25));
            });
        } else if (focusedOption.name === 'date') {
            // Suggest dates (Today, Tomorrow, Next 10 days)
            const dates = Array.from({ length: 10 }, (_, i) => {
                const date = addDays(new Date(), i);
                return {
                    name: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(date, 'yyyy-MM-dd'),
                    value: format(date, 'yyyy-MM-dd'),
                };
            });
            interaction.respond(dates);
        } else if (focusedOption.name === 'time') {
            // Suggest times (4 PM to 11 PM in 15-minute intervals, 12-hour format)
            const startHour = 16; // 4 PM (24-hour clock)
            const endHour = 24; // 12 AM (24-hour clock)
            const intervalMinutes = 15; // Interval in minutes
    
            const times = [];
            for (let hour = startHour; hour <= endHour; hour++) {
                for (let minutes = 0; minutes < 60; minutes += intervalMinutes) {
                    const hour12 = hour > 12 ? hour - 12 : hour; // Convert to 12-hour format
                    const period = hour >= 12 ? 'PM' : 'AM'; // Determine AM/PM
                    const time = `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
                    times.push({ name: time, value: time });
                }
            }
    
            const filtered = times.filter((time) =>
                time.name.toLowerCase().includes(focusedOption.value.toLowerCase())
            );
    
            interaction.respond(filtered.slice(0, 25)); // Respond with up to 25 options
        } else if (focusedOption.name === 'stage') {
            // Suggest stages
            const stages = [
                { name: 'Regular Season', value: 'Regular Season' },
                { name: 'Playoffs', value: 'Playoffs' },
                { name: 'Semifinals', value: 'Semifinals' },
                { name: 'Finals', value: 'Finals' },
            ];
            const filtered = stages.filter((stage) =>
                stage.name.toLowerCase().includes(focusedOption.value.toLowerCase())
            );
            interaction.respond(filtered.slice(0, 25)); // Respond with up to 25 options
        }
    }
};