require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    res.on('finish', () => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Status: ${res.statusCode}`);
    });
    next();
});

app.use('/images', (req, res, next) => {
    const filePath = path.join(__dirname, 'images', req.url);
    fs.stat(filePath, (err, fileInfo) => {
        if (err) {
            return res.status(404).json({ error: 'Image file does not exist' });
        }
        if (fileInfo.isFile()) {
            res.sendFile(filePath);
        } else {
            next();
        }
    });
});

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
let db;

async function connectDB() {
    try {
        await client.connect();
        db = client.db('school');
        console.log('Connected to MongoDB Atlas (school)');
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('MongoDB connection error:', err);
    }
}
connectDB();

function getTeacherFullName(lesson) {
    const first = String(lesson.teacherFirstName ?? '').trim();
    const last = String(lesson.teacherLastName ?? '').trim();
    return [first, last].filter(Boolean).join(' ');
}

function matchesTeacher(lesson, name) {
    const target = String(name ?? '').trim().toLowerCase();
    if (!target) return false;
    const first = String(lesson.teacherFirstName ?? '').trim().toLowerCase();
    const last = String(lesson.teacherLastName ?? '').trim().toLowerCase();
    const full = getTeacherFullName(lesson).toLowerCase();
    return full === target || first === target || last === target;
}

app.get('/', (req, res) => {
    res.json({ status: 'After School Lessons API is running' });
});

app.get('/lessons', async (req, res) => {
    try {
        const lessons = await db.collection('lessons').find({}).toArray();
        const teacher = typeof req.query.teacher === 'string' ? req.query.teacher.trim() : '';
        if (teacher) {
            return res.json(lessons.filter(lesson => matchesTeacher(lesson, teacher)));
        }
        res.json(lessons);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch lessons' });
    }
});

app.get('/teachers', async (req, res) => {
    try {
        const lessons = await db.collection('lessons').find({}).toArray();
        const teachersMap = new Map();
        lessons.forEach(lesson => {
            const fullName = getTeacherFullName(lesson);
            if (fullName && !teachersMap.has(fullName.toLowerCase())) {
                teachersMap.set(fullName.toLowerCase(), fullName);
            }
        });
        res.json(Array.from(teachersMap.values()).sort());
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch teachers' });
    }
});

app.get('/lessons/teacher/:name', async (req, res) => {
    try {
        const lessons = await db.collection('lessons').find({}).toArray();
        const filtered = lessons.filter(lesson => matchesTeacher(lesson, req.params.name));
        res.json(filtered);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch lessons by teacher' });
    }
});

app.post('/orders', async (req, res) => {
    try {
        const { name, phone, lessons } = req.body;
        if (!name || !phone || !Array.isArray(lessons) || lessons.length === 0) {
            return res.status(400).json({ error: 'Missing required order fields' });
        }
        const result = await db.collection('order').insertOne({ name, phone, lessons });
        res.status(201).json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to save order' });
    }
});

app.put('/lessons/:id', async (req, res) => {
    try {
        const lessonId = req.params.id;
        if (!ObjectId.isValid(lessonId)) {
            return res.status(400).json({ error: 'Invalid lesson ID format' });
        }
        const updates = req.body;
        const result = await db.collection('lessons').updateOne(
            { _id: new ObjectId(lessonId) },
            { $set: updates }
        );
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update lesson' });
    }
});

app.get('/search', async (req, res) => {
    try {
        const q = (typeof req.query.q === 'string' ? req.query.q : '').trim().toLowerCase();
        const allLessons = await db.collection('lessons').find({}).toArray();
        if (!q) {
            return res.json(allLessons);
        }
        const filtered = allLessons.filter(l => {
            const fields = [
                l.subject,
                l.location,
                l.price,
                l.spaces,
                l.teacherFirstName,
                l.teacherLastName,
                getTeacherFullName(l)
            ];
            return fields.some(val => String(val ?? '').toLowerCase().includes(q));
        });
        res.json(filtered);
    } catch (err) {
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/enrolment/:lessonid', async (req, res) => {
    try {
        const lessonId = req.params.lessonid;
        const orders = await db.collection('order').find({}).toArray();
        let enrolled = 0;
        orders.forEach(order => {
            if (Array.isArray(order.lessons)) {
                order.lessons.forEach(item => {
                    if (item.lessonId === lessonId) {
                        enrolled += Number(item.spaces || 0);
                    }
                });
            }
        });
        res.json({ lessonId, enrolled });
    } catch (err) {
        res.status(500).json({ error: 'Failed to calculate enrolment' });
    }
});
