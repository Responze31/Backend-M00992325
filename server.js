require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');

// express app setup
const app = express();
app.use(cors());
app.use(express.json());

// log each request with its status code
app.use((req, res, next) => {
    res.on('finish', () => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Status: ${res.statusCode}`);
    });
    next();
});

// serve lesson images from the images folder
app.use('/images', (req, res, next) => {
    const imgPath = path.join(__dirname, 'images', req.url);
    fs.stat(imgPath, (err, stats) => {
        if (err) {
            return res.status(404).json({ error: 'Image file does not exist' });
        }
        if (stats.isFile()) {
            res.sendFile(imgPath);
        } else {
            next();
        }
    });
});

// connect to mongodb first, then start the server
const mongoUri = process.env.MONGO_URI;
const client = new MongoClient(mongoUri);
let db;

async function startServer() {
    try {
        await client.connect();
        db = client.db('school');
        console.log('Connected to MongoDB Atlas (school)');
        const port = process.env.PORT || 3000;
        app.listen(port, () => {
            console.log(`Server running on http://localhost:${port}`);
        });
    } catch (err) {
        console.error('MongoDB connection error:', err);
    }
}
startServer();

// combine a lesson's teacher first and last name
function teacherName(lesson) {
    const first = (lesson.teacherFirstName || '').trim();
    const last = (lesson.teacherLastName || '').trim();
    return `${first} ${last}`.trim();
}

// check if a lesson matches a teacher name (full, first, or last)
function isSameTeacher(lesson, queryName) {
    const search = String(queryName || '').trim().toLowerCase();
    if (!search) return false;
    const first = (lesson.teacherFirstName || '').trim().toLowerCase();
    const last = (lesson.teacherLastName || '').trim().toLowerCase();
    const full = teacherName(lesson).toLowerCase();
    return full === search || first === search || last === search;
}

// basic check to see if the api is running
app.get('/', (req, res) => {
    res.json({ status: 'After School Lessons API is running' });
});

// get all lessons, or filter by teacher query
app.get('/lessons', async (req, res) => {
    try {
        const allLessons = await db.collection('lessons').find({}).toArray();
        const teacherQuery = typeof req.query.teacher === 'string' ? req.query.teacher.trim() : '';
        if (teacherQuery) {
            return res.json(allLessons.filter(lesson => isSameTeacher(lesson, teacherQuery)));
        }
        res.json(allLessons);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch lessons' });
    }
});

// get a unique sorted list of teacher names
app.get('/teachers', async (req, res) => {
    try {
        const allLessons = await db.collection('lessons').find({}).toArray();
        const teachers = [];
        const seen = new Set();

        for (const lesson of allLessons) {
            const name = teacherName(lesson);
            const key = name.toLowerCase();
            if (name && !seen.has(key)) {
                seen.add(key);
                teachers.push(name);
            }
        }

        teachers.sort();
        res.json(teachers);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch teachers' });
    }
});

// get lessons taught by a specific teacher
app.get('/lessons/teacher/:name', async (req, res) => {
    try {
        const allLessons = await db.collection('lessons').find({}).toArray();
        const matching = allLessons.filter(lesson => isSameTeacher(lesson, req.params.name));
        res.json(matching);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch lessons by teacher' });
    }
});

// save a new order to the database
app.post('/orders', async (req, res) => {
    try {
        const { name, phone, lessons } = req.body;
        if (!name || !phone || !Array.isArray(lessons) || lessons.length === 0) {
            return res.status(400).json({ error: 'Missing required order fields' });
        }
        const savedOrder = await db.collection('order').insertOne({ name, phone, lessons });
        res.status(201).json(savedOrder);
    } catch (err) {
        res.status(500).json({ error: 'Failed to save order' });
    }
});

// update a lesson (mainly used for spaces after checkout)
app.put('/lessons/:id', async (req, res) => {
    try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid lesson ID format' });
        }
        const updatedFields = req.body;
        const updateResult = await db.collection('lessons').updateOne(
            { _id: new ObjectId(id) },
            { $set: updatedFields }
        );
        res.json(updateResult);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update lesson' });
    }
});

// search lessons across subject, location, price, spaces, and teacher
app.get('/search', async (req, res) => {
    try {
        const term = (typeof req.query.q === 'string' ? req.query.q : '').trim().toLowerCase();
        const allLessons = await db.collection('lessons').find({}).toArray();

        if (!term) {
            return res.json(allLessons);
        }

        const results = allLessons.filter(lesson => {
            const values = [
                lesson.subject,
                lesson.location,
                lesson.price,
                lesson.spaces,
                lesson.teacherFirstName,
                lesson.teacherLastName,
                teacherName(lesson)
            ];
            return values.some(val => (val != null ? String(val) : '').toLowerCase().includes(term));
        });

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: 'Search failed' });
    }
});

// count total booked spaces for a lesson from all orders
app.get('/enrolment/:lessonid', async (req, res) => {
    try {
        const lessonId = req.params.lessonid;
        const allOrders = await db.collection('order').find({}).toArray();
        let enrolled = 0;

        for (const order of allOrders) {
            if (!Array.isArray(order.lessons)) continue;
            for (const item of order.lessons) {
                if (item.lessonId === lessonId) {
                    enrolled += Number(item.spaces || 0);
                }
            }
        }

        res.json({ lessonId, enrolled });
    } catch (err) {
        res.status(500).json({ error: 'Failed to calculate enrolment' });
    }
});
