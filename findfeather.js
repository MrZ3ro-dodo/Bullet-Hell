const fs = require('fs');
const js = fs.readFileSync('F:/Bullet-Hell/script.js', 'utf8');
const idx = js.indexOf("style: 'feather'");
console.log(js.substring(idx - 100, idx + 100));