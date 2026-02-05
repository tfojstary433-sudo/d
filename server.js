const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const DATA_DIR = path.join(__dirname, 'src', 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const readData = (filename) => {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
};

const saveData = (filename, data) => {
    const filePath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
};

app.use(cors());
app.use(express.json());

// Endpoint dla Robloxa
app.post('/api/endmatch', (req, res) => {
    const { matchId, homeTeamId, awayTeamId, homeScore, awayScore, scorers } = req.body;
    console.log([SYSTEM] Przetwarzanie meczu: ${matchId});

    let history = readData('matches_history.json');
    if (history.find(m => m.matchId === matchId)) return res.status(400).json({success:false});

    history.push({ matchId, homeTeamId, awayTeamId, homeScore, awayScore, date: new Date().toISOString() });
    saveData('matches_history.json', history);

    let table = readData('league_table.json');
    let home = table.find(t => t.id === homeTeamId);
    let away = table.find(t => t.id === awayTeamId);

    if (home && away) {
        home.played++; away.played++;
        home.goalsFor += homeScore; home.goalsAgainst += awayScore;
        away.goalsFor += awayScore; away.goalsAgainst += homeScore;
        if (homeScore > awayScore) home.points += 3;
        else if (homeScore < awayScore) away.points += 3;
        else { home.points += 1; away.points += 1; }
        saveData('league_table.json', table);
    }

    res.json({ success: true });
});

app.listen(3000, () => console.log("Serwer śmiga na porcie 3000"));