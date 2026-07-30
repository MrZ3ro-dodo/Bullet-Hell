const fs = require('fs');
let code = fs.readFileSync('F:/Bullet-Hell/script.js', 'utf8');

// Edit 3: Add cooldown check to checkConstructionCollision
const old1 = `        if (isColliding) {
            if (construction.type === 'castle' || construction.type === 'mansion' || construction.type === 'mine') {
                pendingConstructionId = construction.id;
                return;
            }`;

const new1 = `        if (isColliding) {
            if ((construction.type === 'castle' || construction.type === 'mansion' || construction.type === 'mine') && (!construction.lastRejectedAt || gameFrameCount - construction.lastRejectedAt >= 120)) {
                pendingConstructionId = construction.id;
                return;
            }`;

if (!code.includes(old1)) {
  console.log('ERROR: oldString not found for Edit 3');
  process.exit(1);
}
code = code.replace(old1, new1);
console.log('Edit 3 applied');

// Edit cancel handler for 'Não Entrar' click
const old2 = `    if (clickX >= noBtnX && clickX <= noBtnX + btnW && clickY >= btnY && clickY <= btnY + btnH) {
        pendingConstructionId = -1;
        clearConstructionEntrancePortals();
        return true;
    }`;

const new2 = `    if (clickX >= noBtnX && clickX <= noBtnX + btnW && clickY >= btnY && clickY <= btnY + btnH) {
        const construction = constructions.find(c => c.id === pendingConstructionId);
        if (construction) construction.lastRejectedAt = gameFrameCount;
        pendingConstructionId = -1;
        clearConstructionEntrancePortals();
        return true;
    }`;

if (!code.includes(old2)) {
  console.log('ERROR: oldString not found for cancel click handler');
  process.exit(1);
}
code = code.replace(old2, new2);
console.log('Cancel click handler updated');

// Edit cancel handler for Escape key
const old3 = `        } else if (e.key === 'Escape') {
            e.preventDefault();
            pendingConstructionId = -1;
            clearConstructionEntrancePortals();
        }`;

const new3 = `        } else if (e.key === 'Escape') {
            e.preventDefault();
            const construction = constructions.find(c => c.id === pendingConstructionId);
            if (construction) construction.lastRejectedAt = gameFrameCount;
            pendingConstructionId = -1;
            clearConstructionEntrancePortals();
        }`;

if (!code.includes(old3)) {
  console.log('ERROR: oldString not found for Escape handler');
  process.exit(1);
}
code = code.replace(old3, new3);
console.log('Escape handler updated');

// Edit enterConstruction to clear lastRejectedAt on successful entry
const old4 = `    const construction = constructions.find(c => c.id === constructionId);
    if (!construction || construction.locked) return;`;

const new4 = `    const construction = constructions.find(c => c.id === constructionId);
    if (!construction || construction.locked) return;
    construction.lastRejectedAt = 0;`;

if (!code.includes(old4)) {
  console.log('ERROR: oldString not found for enterConstruction');
  process.exit(1);
}
code = code.replace(old4, new4);
console.log('enterConstruction updated');

fs.writeFileSync('F:/Bullet-Hell/script.js', code);
console.log('All edits applied successfully');