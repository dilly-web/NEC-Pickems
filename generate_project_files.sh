#!/bin/bash

# Create directories
mkdir -p src/commands/admin src/commands/user src/db src/events src/utils config

# Create files
touch src/commands/admin/add-admin.js
touch src/commands/admin/manage-matches.js
touch src/commands/user/predict.js
touch src/commands/user/schedule.js
touch src/commands/user/leaderboard.js
touch src/db/init.js
touch src/db/admin.js
touch src/db/teams.js
touch src/db/matches.js
touch src/db/leaderboard.js
touch src/db/results.js
touch src/events/ready.js
touch src/events/interaction.js
touch src/utils/scoring.js
touch src/utils/validation.js
touch src/index.js
touch config/config.json
touch config/.env
touch Dockerfile
touch docker-compose.yml
touch README.md
touch package.json

# Add a basic structure to README
echo "# NEC Pickems Bot" > README.md
echo "A Valorant league pickems bot for Nerve Esports Circuit." >> README.md

echo "Project structure has been generated successfully!"
