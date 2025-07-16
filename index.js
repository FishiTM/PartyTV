import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, update, onValue, get } from 'firebase/database';
import WebTorrent from 'webtorrent';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);

// --- Initialize Firebase ---
dotenv.config();
const firebaseConfig = {
    apiKey: process.env.apiKey,
    authDomain: process.env.authDomain,
    databaseURL: process.env.databaseURL,
    projectId: process.env.projectId,
    storageBucket: process.env.storageBucket,
    messagingSenderId: process.env.messagingSenderId,
    appId: process.env.appId
};

const fbApp = initializeApp(firebaseConfig);
const db = getDatabase(fbApp);

let latestSnapshot = null;

// --- WebTorrent Client ---
const client = new WebTorrent();
const DOWNLOAD_BASE_DIR = path.join(process.cwd(), 'downloads');

const activeTorrents = new Map(); // magnet -> { torrent, sessionIds: Set }

if (!fs.existsSync(DOWNLOAD_BASE_DIR)) {
    fs.mkdirSync(DOWNLOAD_BASE_DIR, { recursive: true });
}

// --- Express App Initialization ---
const app = express();
app.use(express.json());

// --- Utility Functions ---
function getAllSessions() {
    const listRef = ref(db, 'sessions');

    // Listen For Data Changes In Real Time
    onValue(listRef, (snapshot) => {
        // Store Latest Snapshot
        latestSnapshot = snapshot.val();

        const data = snapshot.val(); // Get Raw Data As Object

        if (data) {
            console.log(`Snapshot Updated`);
        } else {
            console.log('No Sessions Found.');
        }
    }, (error) => {
        console.error('Error Fetching Sessions:', error);
    });
}

async function createSession(newSessionData) {
    // Create Reference To the Specific List
    const listRef = ref(db, 'sessions');

    try {
        const newRef = await push(listRef, newSessionData);

        console.log(`Session Created With ID: ${newRef.key}`);
        return newRef.key;

    } catch (error) {
        console.error(`Failed To Create Session:`, error);
        throw error;
    }
}

// --- Helper Functions ---
function findStreamableFile(torrent) {
    let file = torrent.files.find(f => {
        return f.name.endsWith('.mp4') || f.name.endsWith('.mkv') || f.name.endsWith('.avi') || f.name.endsWith('.webm');
    });

    if (!file && torrent.files.length > 0) {
        file = torrent.files.reduce((a, b) => a.length > b.length ? a : b);
        console.warn('No common video file extension found. Attempting to stream the largest file:', file.name);
    } else if (!file) {
        console.error('No files found in the torrent.');
        return null;
    }
    return file;
}

// --- Express Routes ---
app.get('/logo.ico', (req, res) => {
    const logoPath = path.join(process.cwd(), '/public/icon.ico');
    res.sendFile(logoPath, (err) => {
        if (err) {
            console.error('Error sending logo.ico:', err);
            if (!res.headersSent) {
                if (err.status === 404) {
                    res.status(404).send('logo.svg not found.');
                } else {
                    res.status(500).send('Error serving logo.svg.');
                }
            }
        }
    });
});

app.get('/', (req, res) => res.sendFile(path.join(process.cwd(), '/pages/index.html')));

app.get('/create', (req, res) => res.sendFile(path.join(process.cwd(), '/pages/new.html')));

app.post('/create', async (req, res) => {
    const { magnet } = req.body;
    if (!magnet) {
        return res.status(400).json({ success: false, message: 'magnet (string) required.' });
    }
    try {
        const newSession = {
            magnet: magnet,
            timestamp: 0,
            playing: false
        };
        const sessionId = await createSession(newSession);
        res.json({ success: true, sessionId });
    } catch (error) {
        console.error('Error Creating Session:', error);
        res.status(500).json({ success: false, message: 'Failed to create session.' });
    }
});

app.post('/join', async (req, res) => {
    const sessionId = req.body.sessionId;
    if (!sessionId) {
        return res.status(400).json({ success: false, message: 'sessionId is required.' });
    }
    try {
        const sessionRef = ref(db, `sessions/${sessionId}`);
        const snapshot = await get(sessionRef);
        if (!snapshot.exists()) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }
        const sessionData = snapshot.val();
        if (!sessionData.magnet) {
            return res.status(404).json({ success: false, message: 'Magnet link not found in session.' });
        }

        const sessionDownloadDir = path.join(DOWNLOAD_BASE_DIR, sessionId);

        if (!fs.existsSync(sessionDownloadDir)) {
            fs.mkdirSync(sessionDownloadDir, { recursive: true });
        }

        // Check If Torrent Is Already Being Downloaded
        if (activeTorrents.has(sessionData.magnet)) {
            console.log(`Torrent Already Active For Magnet: ${sessionData.magnet}`);
            const torrentInfo = activeTorrents.get(sessionData.magnet);
            torrentInfo.sessionIds.add(sessionId);
            console.log(`Added Session ${sessionId} To Existing Torrent Download`);
            return res.json({ success: true });
        }

        client.add(sessionData.magnet, { path: sessionDownloadDir }, (torrent) => {
            console.log(`Started Downloading Torrent For Session ${sessionId}:`, torrent.name);

            // Track Torrent
            activeTorrents.set(sessionData.magnet, {
                torrent: torrent,
                sessionIds: new Set([sessionId])
            });

            // Clean Up
            torrent.on('done', () => {
                console.log(`Torrent Completed: ${torrent.name}`);
            });

            torrent.on('error', (err) => {
                console.error(`Torrent Error For Session ${sessionId}:`, err);
                activeTorrents.delete(sessionData.magnet);
            });
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error fetching session:', error);
        return res.status(500).json({ success: false, message: 'Error fetching session data.' });
    }
});

app.get('/play', async (req, res) => {
    const sessionId = req.query.sessionId;
    if (!sessionId) {
        return res.status(400).json({ success: false, message: 'sessionId is required.' });
    }

    try {
        const sessionRef = ref(db, `sessions/${sessionId}`);
        const snapshot = await get(sessionRef);
        if (!snapshot.exists()) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }
        const sessionData = snapshot.val();
        if (!sessionData.magnet) {
            return res.status(404).json({ success: false, message: 'Magnet link not found in session.' });
        }

        const torrentInfo = activeTorrents.get(sessionData.magnet);
        if (!torrentInfo) {
            return res.status(404).json({ success: false, message: 'Torrent not active for this session.' });
        }
        const torrent = torrentInfo.torrent;
        const file = findStreamableFile(torrent);
        if (!file) {
            return res.status(404).json({ success: false, message: 'No streamable file found in torrent.' });
        }

        res.sendFile(path.join(process.cwd(), '/pages/play.html'));
    } catch (error) {
        console.error('Error in /play:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

app.get('/get', async (req, res) => {
    const sessionId = req.query.sessionId;
    if (!sessionId) {
        return res.status(400).json({ success: false, message: 'sessionId is required.' });
    }

    if (!latestSnapshot || !latestSnapshot[sessionId]) {
        return res.status(404).json({ success: false, message: 'Session not found.' });
    }

    let session = latestSnapshot[sessionId];

    if (!session) {
        return res.status(404).json({ success: false, message: 'Session not found.' });
    }

    const torrentInfo = activeTorrents.get(session.magnet);
    if (!torrentInfo) {
        return res.status(404).json({ success: false, message: 'Torrent not active for this session.' });
    }
    if (!file) {
        return res.status(404).json({ success: false, message: 'No streamable file found in torrent.' });
    }
    const filePath = path.join(torrent.path, file.path);

    return res.status(200).json({ playing: session.playing, timestamp: session.timestamp, filePath: filePath })
});

app.post('/update', async (req, res) => {
    const { sessionId, playing, timestamp } = req.body;

    if (!sessionId || typeof playing !== 'boolean' || typeof timestamp !== 'number') {
        return res.status(400).json({
            success: false,
            message: 'sessionId and playing (boolean) and timestamp (number) are required.'
        });
    }

    try {
        const sessionRef = ref(db, `sessions/${sessionId}`);
        await update(sessionRef, {
            playing: playing,
            timestamp: timestamp
        });
        console.log(`Updated Session ${sessionId} Playing Status To: ${playing}, Timestamp: ${timestamp}`);

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating playing status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update playing status.'
        });
    }
});

app.get('/stream/:sessionId/:fileName', (req, res) => {
    const { sessionId, fileName } = req.params;

    if (!latestSnapshot || !latestSnapshot[sessionId]) {
        return res.status(404).send('Session not found.');
    }

    const session = latestSnapshot[sessionId];
    const torrentInfo = activeTorrents.get(session.magnet);

    if (!torrentInfo) {
        return res.status(404).send('Torrent not active for this session.');
    }

    const torrent = torrentInfo.torrent;
    const file = findStreamableFile(torrent);

    if (!file || !fileName.includes(path.basename(file.name))) {
        return res.status(404).send('File not found or not streamable.');
    }

    // MIME Type Handling
    const mimeTypes = {
        mp4: 'video/mp4',
        mkv: 'video/x-matroska',
        avi: 'video/x-msvideo',
        mov: 'video/quicktime',
        wmv: 'video/x-ms-wmv',
        webm: 'video/webm',
        ogg: 'video/ogg'
    };
    const ext = path.extname(file.name).slice(1).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    const fileSize = file.length;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        if (end >= fileSize) end = fileSize - 1;

        if (start >= fileSize || start > end) {
            res.status(416).set({ 'Content-Range': `bytes */${fileSize}` });
            return res.end();
        }

        const chunksize = (end - start) + 1;
        const fileStream = file.createReadStream({ start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType,
        };
        res.writeHead(206, head);
        fileStream.pipe(res);
        fileStream.on('error', (err) => {
            console.error('Stream Error (ranged):', err.message);
            if (!res.writableEnded) res.end();
        });
        req.on('close', () => {
            console.log('Client Closed Ranged Stream Connection.');
            if (!fileStream.destroyed) fileStream.destroy();
        });
    } else {
        const head = { 'Content-Length': fileSize, 'Content-Type': contentType };
        res.writeHead(200, head);
        const fileStream = file.createReadStream();
        fileStream.pipe(res);
        fileStream.on('error', (err) => {
            console.error('Stream error (full):', err.message);
            if (!res.writableEnded) res.end();
        });
        req.on('close', () => {
            console.log('Client Closed Full Stream Connection.');
            if (!fileStream.destroyed) fileStream.destroy();
        });
    }
});

// --- Start Server ---
app.listen(3000, () => {
    getAllSessions();
    console.log(`Server running on http://localhost:${3000}`);
});