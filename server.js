const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const FOOTAPI_HOST = 'footapi7.p.rapidapi.com';
const ALLSPORTS_HOST = 'allsportsapi2.p.rapidapi.com';

app.get('/health', function(req, res) {
  res.json({ status: 'ok', rapidapi: !!RAPIDAPI_KEY, anthropic: !!ANTHROPIC_KEY });
});

function fetchFootApi(endpoint) {
  return fetch('https://' + FOOTAPI_HOST + endpoint, {
    method: 'GET',
    headers: { 'x-rapidapi-host': FOOTAPI_HOST, 'x-rapidapi-key': RAPIDAPI_KEY }
  }).then(function(r) { return r.json(); }).catch(function(e) { return { error: e.message }; });
}

function fetchAllSports(endpoint) {
  return fetch('https://' + ALLSPORTS_HOST + endpoint, {
    method: 'GET',
    headers: { 'x-rapidapi-host': ALLSPORTS_HOST, 'x-rapidapi-key': RAPIDAPI_KEY }
  }).then(function(r) { return r.json(); }).catch(function() { return null; });
}

// ── TEST FOOTAPI ──────────────────────────────────────────────────────────
app.get('/api/test-footapi', function(req, res) {
  var today = new Date();
  var day = String(today.getDate()).padStart(2, '0');
  var month = String(today.getMonth() + 1).padStart(2, '0');
  var year = today.getFullYear();
  fetchFootApi('/api/matches/' + day + '/' + month + '/' + year)
    .then(function(data) {
      var events = data.events || data.matches || data || [];
      res.json({
        total: Array.isArray(events) ? events.length : 'voir raw',
        sample: Array.isArray(events) ? events.slice(0, 3) : events,
        raw_keys: data ? Object.keys(data) : []
      });
    });
});

// ── PLACEHOLDER MATCHES ───────────────────────────────────────────────────
app.get('/api/matches', function(req, res) {
  res.json({ live: [], scheduled: [], total: 0, message: 'Migration en cours vers FootApi' });
});

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('SCOUT IA running on port ' + PORT); });
