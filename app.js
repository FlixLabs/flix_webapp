import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/config', (req, res) => {
    res.json({
        radarr: {
            baseURL: process.env.RADARR_BASE_URL,
            apiKey: process.env.RADARR_API_KEY
        },
        sonarr: {
            baseURL: process.env.SONARR_BASE_URL,
            apiKey: process.env.SONARR_API_KEY
        }
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
