require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const authMiddleware = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', authMiddleware);

app.use('/api', require('./routes/analyze'));
app.use('/api', require('./routes/meals'));
app.use('/api', require('./routes/goals'));
app.use('/api', require('./routes/stats'));

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CalorieBot server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
});
