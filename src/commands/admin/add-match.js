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
            type: 3, // String that gets converted to integer for database
            description: 'Specify the week number for this match (Playoffs, #1, ..., #7).',
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

        // Get command inputs
        const team1 = interaction.options.getString('team1');
        const team2 = interaction.options.getString('team2');
        const dateInput = interaction.options.getString('date');
        const timeInput = interaction.options.getString('time');
        const stage = interaction.options.getString('stage');
        const weekInput = interaction.options.getString('week') ?? 'Playoffs';

        // Convert week input for database storage
        const week = weekInput === 'Playoffs' ? 0 : parseInt(weekInput.replace('#', ''), 10);

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
                    content: `Match added successfully for **Week ${weekInput}**: **${team1}** vs **${team2}** on **${format(
                        matchDate,
                        'MMMM d, h:mm a'
                    )}** (${stage}).`,
                    ephemeral: true,
                });
            }
        );
    },
    async autocomplete(interaction, db) {
        const focusedOption = interaction.options.getFocused(true); // Get the focused option
        const userInput = focusedOption.value.toLowerCase(); // Normalize user input for comparison
    
        switch (focusedOption.name) {
            case 'week':
                // Suggest week options
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
    
                // Filter week options dynamically based on user input
                const filteredWeeks = weeks.filter((week) =>
                    week.name.toLowerCase().includes(userInput)
                );
                return interaction.respond(filteredWeeks.slice(0, 25)); // Respond with up to 25 options
    
            case 'team1':
            case 'team2': {
                // Fetch teams from the database
                db.all('SELECT name FROM teams', [], (err, rows) => {
                    if (err) {
                        console.error(err);
                        return interaction.respond([]);
                    }
    
                    let choices = rows.map((row) => ({ name: row.name, value: row.name }));
    
                    if (focusedOption.name === 'team2') {
                        // Exclude team1 from team2 options
                        const selectedTeam1 = interaction.options.getString('team1');
                        if (selectedTeam1) {
                            choices = choices.filter(
                                (choice) => choice.value.toLowerCase() !== selectedTeam1.toLowerCase()
                            );
                        }
                    }
    
                    // Filter based on user input for dynamic narrowing
                    const filteredChoices = choices.filter((choice) =>
                        choice.name.toLowerCase().includes(userInput)
                    );
    
                    return interaction.respond(filteredChoices.slice(0, 25)); // Respond with filtered options
                });
                break;
            }
    
            case 'date': {
                // Suggest dates (Today, Tomorrow, Next 10 days)
                const dates = Array.from({ length: 10 }, (_, i) => {
                    const date = addDays(new Date(), i);
                    return {
                        name: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(date, 'yyyy-MM-dd'),
                        value: format(date, 'yyyy-MM-dd'),
                    };
                });
    
                // Filter dates dynamically
                const filteredDates = dates.filter((date) =>
                    date.name.toLowerCase().includes(userInput)
                );
    
                return interaction.respond(filteredDates.slice(0, 25)); // Respond with up to 25 options
            }
    
            case 'time': {
                // Suggest times (4 PM to 11 PM in 15-minute intervals, 12-hour format)
                const startHour = 16; // 4 PM (24-hour clock)
                const endHour = 24; // 12 AM (24-hour clock)
                const intervalMinutes = 15;
    
                const times = [];
                for (let hour = startHour; hour <= endHour; hour++) {
                    for (let minutes = 0; minutes < 60; minutes += intervalMinutes) {
                        const hour12 = hour > 12 ? hour - 12 : hour; // Convert to 12-hour format
                        const period = hour >= 12 ? 'PM' : 'AM'; // Determine AM/PM
                        const time = `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
                        times.push({ name: time, value: time });
                    }
                }
    
                // Filter times dynamically
                const filteredTimes = times.filter((time) =>
                    time.name.toLowerCase().includes(userInput)
                );
    
                return interaction.respond(filteredTimes.slice(0, 25)); // Respond with up to 25 options
            }
    
            case 'stage': {
                // Suggest stages
                const stages = [
                    { name: 'Regular Season', value: 'Regular Season' },
                    { name: 'Playoffs', value: 'Playoffs' },
                    { name: 'Semifinals', value: 'Semifinals' },
                    { name: 'Finals', value: 'Finals' },
                ];
    
                // Filter stages dynamically
                const filteredStages = stages.filter((stage) =>
                    stage.name.toLowerCase().includes(userInput)
                );
    
                return interaction.respond(filteredStages.slice(0, 25)); // Respond with up to 25 options
            }
    
            default:
                return interaction.respond([]); // Default to empty response for unrecognized options
        }
    },
};