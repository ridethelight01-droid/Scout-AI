module.exports = {
  rapidApiKey: process.env.RAPIDAPI_KEY || '',
  anthropicKey: process.env.ANTHROPIC_KEY || '',
  oddsApiKey: process.env.ODDS_API_KEY || '',
  allSportsHost: 'allsportsapi2.p.rapidapi.com',
  footApiHost: 'footapi7.p.rapidapi.com',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'
};
