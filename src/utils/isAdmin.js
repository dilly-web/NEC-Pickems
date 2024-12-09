module.exports = async function isAdmin(userId, db) {
    return new Promise((resolve, reject) => {
        db.get('SELECT id FROM admin_users WHERE id = ?', [userId], (err, row) => {
            if (err) {
                console.error(err);
                return reject(err);
            }
            resolve(!!row); // Return true if the user is an admin, false otherwise
        });
    });
};
