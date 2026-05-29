const express = require('express');
const cors = require('cors');
const path = require('path');

const healthRoutes = require('./src/routes/health.routes');
const matchRoutes = require('./src/routes/matches.routes');
const analysisRoutes = require('./src/routes/analysis.routes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/health', healthRoutes);
app.use('/api', matchRoutes);
app.use('/api', analysisRoutes);

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('SCOUT IA running on port ' + PORT);
});
