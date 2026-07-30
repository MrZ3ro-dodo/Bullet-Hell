const fs = require('fs');
let code = fs.readFileSync('F:/Bullet-Hell/script.js', 'utf8');
let applied = 0;

// Edit 3: Add cooldown check to checkConstructionCollision
let old1 = "        if (isColliding) {\n            if (construction.type === 'castle' || construction.type === 'mansion' || construction.type === 'mine') {\n                pendingConstructionId = construction.id;\n                return;\n            }";
if (code.includes(old1)) {
    let new1 = "        if (isColliding) {\n            if ((construction.type === 'castle' || construction.type === 'mansion' || construction.type === 'mine') && (!construction.lastRejectedAt || gameFrameCount - construction.lastRejectedAt >= 120)) {\n                pendingConstructionId = construction.id;\n                return;\n            }";
    code = code.replace(old1, new1);
    console.log('Edit 3 applied');
    applied++;
} else {
    console.log('Edit 3 OLD not found');
}

// Edit cancel click handler
let old2 = "    if (clickX >= noBtnX && clickX <= noBtnX + btnW && clickY >= btnY && clickY <= btnY + btnH) {\n        pendingConstructionId = -1;\n        clearConstructionEntrancePortals();\n        return true;\n    }";
if (code.includes(old2)) {
    let new2 = "    if (clickX >= noBtnX && clickX <= noBtnX + btnW && clickY >= btnY && clickY <= btnY + btnH) {\n        const c = constructions.find(c => c.id === pendingConstructionId);\n        if (c) c.lastRejectedAt = gameFrameCount;\n        pendingConstructionId = -1;\n        clearConstructionEntrancePortals();\n        return true;\n    }";
    code = code.replace(old2, new2);
    console.log('Cancel click handler updated');
    applied++;
} else {
    console.log('Cancel click handler OLD not found');
}

// Edit cancel Escape handler
let old3 = "        } else if (e.key === 'Escape') {\n            e.preventDefault();\n            pendingConstructionId = -1;\n            clearConstructionEntrancePortals();\n        }";
if (code.includes(old3)) {
    let new3 = "        } else if (e.key === 'Escape') {\n            e.preventDefault();\n            const c = constructions.find(c => c.id === pendingConstructionId);\n            if (c) c.lastRejectedAt = gameFrameCount;\n            pendingConstructionId = -1;\n            clearConstructionEntrancePortals();\n        }";
    code = code.replace(old3, new3);
    console.log('Escape handler updated');
    applied++;
} else {
    console.log('Escape handler OLD not found');
}

// Edit enterConstruction clear
let old4 = "    const construction = constructions.find(c => c.id === constructionId);\n    if (!construction || construction.locked) return;";
if (code.includes(old4)) {
    let new4 = "    const construction = constructions.find(c => c.id === constructionId);\n    if (!construction || construction.locked) return;\n    construction.lastRejectedAt = 0;";
    code = code.replace(old4, new4);
    console.log('enterConstruction updated');
    applied++;
} else {
    console.log('enterConstruction OLD not found');
}

if (applied > 0) {
    fs.writeFileSync('F:/Bullet-Hell/script.js', code);
    console.log('All ' + applied + ' edits applied successfully');
} else {
    console.log('No edits were applied');
}