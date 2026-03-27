# Task: Add forgot password to login & remove occupied (blue) function in schedule (WEB ONLY)

## Steps:
1. [x] Update api/models/User.js - add resetToken, resetTokenExpiry fields if missing
2. [x] Install nodemailer if missing
3. [x] Update api/routes/auth.js - add /forgot-password & /reset-password endpoints + sendEmail util
4. [x] Update public/pages/login.html - add forgot link, modal, JS handler
5. [x] Update public/css/styles.css - remove --color-blue-occupied & .room-card__badge--occupied
6. [x] Update public/pages/rooms.html - simplify room status rendering (no occupied)
7. [ ] Update api/routes/rooms.js - simplify status logic (no occupied)
8. [ ] Test: restart server, test forgot flow (console email), check rooms/schedule no blue/occupied

