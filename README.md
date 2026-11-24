# Backend-M00992325

Express backend for my CST3144 coursework using Node.js and MongoDB Atlas.

## Links
- Frontend repo: https://github.com/Responze31/Frontend-M00992325.git
- GitHub Pages: https://responze31.github.io/Frontend-M00992325/
- Backend repo: https://github.com/Responze31/Backend-M00992325
- Render lessons route: https://backend-m00992325.onrender.com/lessons

## Routes
- `GET /lessons` - returns all lessons (or filters with `?teacher=name`)
- `GET /teachers` - returns list of teachers
- `GET /lessons/teacher/:name` - returns lessons by teacher
- `GET /search?q=query` - searches lessons
- `POST /orders` - saves a new order
- `PUT /lessons/:id` - updates a lesson (used for spaces)
- `GET /enrolment/:lessonid` - returns total booked spaces for a lesson
- `GET /images/:filename` - serves lesson images

## Run locally
Install packages with `npm install`, add `MONGO_URI` to `.env`, and run `npm start`.