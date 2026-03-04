export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/javascript');
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY || '';
  res.send(`window.GOOGLE_MAPS_API_KEY = '${mapsKey}';`);
}
