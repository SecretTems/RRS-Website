# RRS v2 Improvements TODO

## 1. Booking Time Limits (7AM-7PM)
- [ ] Backend api/routes/bookings.js POST validation start/end between 07:00-19:00
- [ ] Frontend public/pages/rooms.html booking modal time inputs min/max

## 2. Announcements Enhancements
- [ ] Model api/models/Announcement.js add comments: [{ author: ObjectId(User), text: String, createdAt }]
- [ ] Routes api/routes/announcements.js: POST /:id/comments, GET /:id/comments, PATCH /:id/comments/:commentId, DELETE /:id/comments/:commentId (protect)
- [ ] Frontend public/pages/announcements.html: Each card 'Details' expand (author pic/name, comments list + add comment form)
- [ ] Admin manage: announcements.html add admin buttons edit/delete if admin

## 3. AI Link Confirm
- [ ] announcements.html AI float button onclick=confirm('Leave to AI chat?')

## 4. Admin Rooms Fix
- [ ] admin.html JS: Drag-drop image preview (reuse account.html uploadArea logic), new-imageUrl to base64
- [ ] Edit room modal (fetch room data, form PUT /rooms/:id, drag image)

## 5. Eye SVG Fix
- [ ] login.html/signup.html closed eye SVG path to flat slash

**Eye SVG closed:**
```
<svg viewBox="0 0 24 24"><line x1="3" y1="3" x2="21" y2="21" stroke="#000" stroke-width="2" stroke-linecap="round"/></svg>
```

Proceed step-by-step?
