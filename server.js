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

app.get('/', (req, res) => {
    res.json({ status: 'After School Lessons API is running' });
});

app.get('/lessons', async (req, res) => {
    try {
        const lessons = await db.collection('lessons').find({}).toArray();
        res.json(lessons);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch lessons' });
    }
});

app.post('/orders', async (req, res) => {
    try {
        const newOrder = req.body;
        const result = await db.collection('order').insertOne(newOrder);
        res.status(201).json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to save order' });
    }
});

app.put('/lessons/:id', async (req, res) => {
    try {
        const lessonId = req.params.id;
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
