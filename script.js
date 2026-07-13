const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let overlayCanvas;
let overlayCtx;

function initializeDebugOverlay() {
    createDebugOverlay();
    resizeDebugOverlay();
}

initializeDebugOverlay();

let mouseX = 0;
let mouseY = 0;

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    if (typeof player !== 'undefined' && player) {
        const worldMouseX = mouseX + cameraX;
        const worldMouseY = mouseY + cameraY;
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        player.swordAimAngle = Math.atan2(worldMouseY - py, worldMouseX - px);
    }
});

let viewportWidth;
let viewportHeight;
let gameWidth;
let gameHeight;
let mapWalls = [];
let mapDecor = [];
let spawnZoneEndX;
let upgradeZoneEndX;
let wildZoneEndX;
let cameraX = 0;
let cameraY = 0;
let gameFrameCount = 0;

// Sistema de construções
let constructions = [];
let playerInsideConstruction = false;
let currentConstructionId = -1;
let constructionExitZone = null;
let constructionEntrancePortals = [];

// fila de spawns atrasados (timer em frames)
const delayedProjectileSpawns = [];
const DEBUG_TORNADO_COPY = true;

function createDebugOverlay() {
    if (overlayCanvas) return;
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.id = 'debugOverlayCanvas';
    overlayCanvas.style.position = 'fixed';
    overlayCanvas.style.top = '0';
    overlayCanvas.style.left = '0';
    overlayCanvas.style.right = '0';
    overlayCanvas.style.bottom = '0';
    overlayCanvas.style.width = '100%';
    overlayCanvas.style.height = '100%';
    overlayCanvas.style.pointerEvents = 'none';
    overlayCanvas.style.zIndex = '9999';
    overlayCanvas.style.display = 'none';
    overlayCanvas.style.background = 'transparent';
    document.body.appendChild(overlayCanvas);
    overlayCtx = overlayCanvas.getContext('2d');

    overlayCanvas.addEventListener('click', (event) => {
        if (!isDebugMenuOpen) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = overlayCanvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        if (debugMenuTabGeom.tabRects) {
            for (const tabRect of debugMenuTabGeom.tabRects) {
                if (clickX >= tabRect.x && clickX <= tabRect.x + tabRect.w && clickY >= tabRect.y && clickY <= tabRect.y + tabRect.h) {
                    const tabIndex = debugMenuTabs.findIndex(tab => tab.id === tabRect.id);
                    if (tabIndex >= 0) {
                        debugMenuTabIndex = tabIndex;
                        selectedDebugUpgradeIndex = 0;
                        selectedDebugActionIndex = 0;
                    }
                    return;
                }
            }
        }

        const choices = getDebugMenuChoices();
        const geom = debugMenuListGeom;
        const listX = geom.x;
        const listY = geom.y;
        const listWidth = geom.width;
        const itemHeight = geom.itemHeight;
        const gap = geom.gap;
        const visibleCount = geom.visibleCount;
        const startIndex = geom.startIndex;
        for (let i = 0; i < visibleCount; i++) {
            const index = startIndex + i;
            const itemY = listY + i * (itemHeight + gap);
            if (clickX >= listX && clickX <= listX + listWidth && clickY >= itemY && clickY <= itemY + itemHeight) {
                if (debugMenuTabs[debugMenuTabIndex].id === 'invocar') {
                    selectedDebugActionIndex = index;
                } else {
                    selectedDebugUpgradeIndex = index;
                }
                applyDebugUpgrade();
                break;
            }
        }
    });
}

function resizeDebugOverlay() {
    if (!overlayCanvas) return;
    overlayCanvas.width = window.innerWidth;
    overlayCanvas.height = window.innerHeight;
}

function resizeGameCanvas() {
    const maxViewportWidth = 1600;
    const maxViewportHeight = 1000;
    const availableWidth = Math.min(window.innerWidth - 40, maxViewportWidth);
    const availableHeight = Math.min(window.innerHeight - 220, maxViewportHeight);

    const width = Math.max(320, availableWidth);
    const height = Math.max(240, availableHeight);

    viewportWidth = width;
    viewportHeight = height;
    gameWidth = viewportWidth * 60;
    gameHeight = viewportHeight * 24;

    spawnZoneEndX = viewportWidth * 36;
    upgradeZoneEndX = spawnZoneEndX + viewportWidth * 18;
    wildZoneEndX = gameWidth;

    generateMapWalls();
    createMapDecor();

    canvas.width = viewportWidth;
    canvas.height = viewportHeight;
    canvas.style.width = `${viewportWidth}px`;
    canvas.style.height = `${viewportHeight}px`;
    resizeDebugOverlay();
}

function getMapCircle() {
    const centerX = gameWidth / 2;
    const centerY = gameHeight / 2;
    const radius = Math.min(gameWidth, gameHeight) * 0.5 - 10;
    return {
        centerX,
        centerY,
        radius,
        spawnRadius: radius * 0.30,
        upgradeRadius: radius * 0.60,
        wildRadius: radius
    };
}

function getRandomPointInRing(centerX, centerY, minRadius, maxRadius) {
    const angle = Math.random() * Math.PI * 2;
    const t = Math.random();
    const radius = Math.sqrt(t * (maxRadius * maxRadius - minRadius * minRadius) + minRadius * minRadius);
    return {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
    };
}

function getZoneBounds(zone) {
    const padding = 20;
    const spawnEndX = typeof spawnZoneEndX === 'number' ? spawnZoneEndX : gameWidth * 0.6;
    const upgradeEndX = typeof upgradeZoneEndX === 'number' ? upgradeZoneEndX : gameWidth * 0.9;
    const minX = padding;
    const minY = padding;
    const maxX = Math.max(minX, gameWidth - padding);
    const maxY = Math.max(minY, gameHeight - padding);

    switch (zone) {
        case 'spawn':
            return {
                minX,
                maxX: Math.max(minX, spawnEndX - padding),
                minY,
                maxY
            };
        case 'construction':
        case 'upgrade':
            return {
                minX: Math.max(minX, spawnEndX + padding),
                maxX: Math.max(minX, upgradeEndX - padding),
                minY,
                maxY
            };
        case 'wild':
            return {
                minX: Math.max(minX, upgradeEndX + padding),
                maxX,
                minY,
                maxY
            };
        default:
            return { minX, maxX, minY, maxY };
    }
}

function isPointInsideMapCircle(x, y, size = 0) {
    const { centerX, centerY, radius } = getMapCircle();
    const halfSize = Math.max(0, size / 2);
    const posX = x + halfSize;
    const posY = y + halfSize;
    const dx = posX - centerX;
    const dy = posY - centerY;
    const dist = Math.hypot(dx, dy);
    const maxDist = Math.max(0, radius - halfSize - 1);
    return dist <= maxDist;
}

function getRandomPointInZone(zone, size = 0) {
    const bounds = getZoneBounds(zone);
    const safeMinX = Math.max(bounds.minX, 0);
    const safeMaxX = Math.max(safeMinX, Math.min(bounds.maxX, gameWidth - size));
    const safeMinY = Math.max(bounds.minY, 0);
    const safeMaxY = Math.max(safeMinY, Math.min(bounds.maxY, gameHeight - size));

    for (let attempt = 0; attempt < 200; attempt += 1) {
        const point = {
            x: safeMinX + Math.random() * Math.max(1, safeMaxX - safeMinX),
            y: safeMinY + Math.random() * Math.max(1, safeMaxY - safeMinY)
        };

        if (isPointInsideMapCircle(point.x, point.y, size)) {
            return point;
        }
    }

    const { centerX, centerY } = getMapCircle();
    return {
        x: Math.max(safeMinX, Math.min(safeMaxX, centerX - size / 2)),
        y: Math.max(safeMinY, Math.min(safeMaxY, centerY - size / 2))
    };
}

function getRandomPointInUpgradeRing(size = 0) {
    const { centerX, centerY, spawnRadius, upgradeRadius } = getMapCircle();
    for (let attempt = 0; attempt < 200; attempt += 1) {
        const point = getRandomPointInRing(centerX, centerY, spawnRadius + 20, upgradeRadius - 20);
        if (isPointInsideMapCircle(point.x, point.y, size)) {
            return point;
        }
    }
    return {
        x: centerX - size / 2,
        y: centerY - size / 2
    };
}

function getPlayerInteriorScale() {
    if (!playerInsideConstruction || currentConstructionId < 0) return 1;
    const construction = constructions.find(c => c.id === currentConstructionId);
    return construction && construction.type === 'castle' ? 0.5 : 1;
}

function tryApplyPlayerConfusionFromAttack(sourceType, options = {}) {
    if (!player) return false;

    const chance = typeof options.chance === 'number' ? options.chance : 0;
    const guaranteed = !!options.guaranteed;
    const durationFrames = typeof options.durationFrames === 'number' ? options.durationFrames : 6 * 60;
    const shouldApply = guaranteed || (chance > 0 && Math.random() * 100 < chance);

    if (!shouldApply) return false;

    player.confusedLevel = Math.max(player.confusedLevel || 0, options.level || 3);
    player.confusedTimer = Math.max(player.confusedTimer || 0, durationFrames);
    return true;
}

function createMapDecor() {
    mapDecor = [];
    constructions = [];

    const createDecorEntry = (x, y, scale, alpha, zone, kind = 'tree', extras = []) => {
        const entry = { x, y, scale, alpha, zone, kind, extras };
        if (kind === 'construction') {
            entry.width = 110 * scale;
            entry.height = 96 * scale;
        }
        return entry;
    };

    // Árvores na zona de spawn
    for (let i = 0; i < 5; i++) {
        const pos = getRandomPointInZone('spawn', 70);
        mapDecor.push(createDecorEntry(pos.x, pos.y, 2.2 + Math.random() * 0.9, 0.98, 'spawn'));
    }

    // 3 CONSTRUÇÕES PRINCIPAIS no mapa
    const constructionPositions = [];
    const constructionTypes = ['castle', 'mansion', 'mine'];

    for (let i = 0; i < 3; i++) {
        let pos;
        let isValidPosition = false;
        let attempts = 0;
        const isCastleOrMansion = constructionTypes[i] === 'castle' || constructionTypes[i] === 'mansion';
        const constructionZone = isCastleOrMansion ? 'upgrade' : 'construction';

        // Tentar encontrar uma posição válida que não colida com outras construções
        while (!isValidPosition && attempts < 120) {
            if (isCastleOrMansion) {
                pos = getRandomPointInUpgradeRing(90);
            } else {
                pos = getRandomPointInZone('construction', 90);
            }
            isValidPosition = true;

            // Verificar distância mínima entre construções
            for (const existing of constructionPositions) {
                const dist = Math.hypot(pos.x - existing.x, pos.y - existing.y);
                if (dist < 220) {
                    isValidPosition = false;
                    break;
                }
            }
            attempts++;
        }

        if (!isValidPosition) {
            const { centerX, centerY } = getMapCircle();
            pos = {
                x: centerX + (Math.random() - 0.5) * 1800,
                y: centerY + (Math.random() - 0.5) * 1200
            };
        }

        if (pos) {
            const scale = 2.8 + Math.random() * 1.2;
            const constructionData = {
                id: i,
                x: pos.x,
                y: pos.y,
                scale: scale,
                width: 120 * scale,
                height: 100 * scale,
                type: constructionTypes[i],
                interiorX: gameWidth + (i * 400),
                interiorY: 200 + (i * Math.random() * 100),
                zone: constructionZone,
                locked: false
            };

            constructions.push(constructionData);
            constructionPositions.push(pos);

            // Adicionar ao mapa visual
            const decorEntry = createDecorEntry(pos.x, pos.y, scale, 0.95, constructionZone, 'construction');
            decorEntry.constructionId = i;
            decorEntry.hasEntranceMarker = constructionTypes[i] === 'castle' || constructionTypes[i] === 'mansion';
            mapDecor.push(decorEntry);
        }
    }

    // Árvores na zona selvagem
    for (let i = 0; i < 60; i++) {
        const pos = getRandomPointInZone('wild', 40);
        mapDecor.push(createDecorEntry(pos.x, pos.y, 1.6 + Math.random() * 0.8, 0.82, 'wild'));
    }
}

function drawMapTree(ctx, x, y, scale, alpha = 1, extras = []) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;

    for (const extra of extras) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(94, 190, 94, ${extra.alpha})`;
        ctx.arc(extra.x, extra.y, extra.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    const radius = 40 * scale;
    ctx.beginPath();
    ctx.fillStyle = 'rgba(62, 154, 63, 0.92)';
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(34, 95, 34, 0.85)';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawMapConstruction(ctx, decor, x, y, scale, alpha = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;

    const construction = constructions.find(c => c.id === decor.constructionId);
    const type = construction ? construction.type : 'castle';

    const baseWidth = 120 * scale;
    const baseHeight = 92 * scale;
    const roofHeight = 44 * scale;
    const doorWidth = 22 * scale;
    const doorHeight = 32 * scale;
    const towerSize = 34 * scale;

    // foundation
    ctx.fillStyle = 'rgba(44, 34, 24, 0.98)';
    ctx.fillRect(-baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight);

    // base detail
    ctx.fillStyle = 'rgba(90, 70, 48, 0.95)';
    ctx.fillRect(-baseWidth / 2 + 10 * scale, -baseHeight / 2 + 10 * scale, baseWidth - 20 * scale, baseHeight - 20 * scale);

    if (type === 'castle') {
        const wallThickness = 10 * scale;
        const wallHeight = 24 * scale;
        const towerHeight = 46 * scale;
        const keepWidth = baseWidth * 0.58;
        const keepHeight = baseHeight * 0.6;

        const drawTower = (x, y, width, height) => {
            ctx.fillStyle = 'rgba(98, 106, 120, 0.98)';
            ctx.fillRect(x, y, width, height);

            ctx.fillStyle = 'rgba(72, 80, 94, 0.95)';
            ctx.fillRect(x + 6 * scale, y + 6 * scale, width - 12 * scale, height - 12 * scale);

            ctx.fillStyle = 'rgba(244, 214, 120, 0.86)';
            ctx.beginPath();
            ctx.moveTo(x - 2 * scale, y);
            ctx.lineTo(x + width / 2, y - 12 * scale);
            ctx.lineTo(x + width + 2 * scale, y);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
            ctx.fillRect(x + 8 * scale, y + 10 * scale, width * 0.26, 8 * scale);
            ctx.fillRect(x + width * 0.55, y + 10 * scale, width * 0.2, 8 * scale);
        };

        ctx.fillStyle = 'rgba(70, 58, 40, 0.98)';
        ctx.fillRect(-baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight);

        ctx.fillStyle = 'rgba(108, 102, 86, 0.98)';
        ctx.fillRect(-baseWidth / 2 + 12 * scale, -baseHeight / 2 + 12 * scale, baseWidth - 24 * scale, baseHeight - 24 * scale);

        ctx.fillStyle = 'rgba(128, 122, 108, 0.98)';
        ctx.fillRect(-baseWidth / 2 + 18 * scale, -baseHeight / 2 + 18 * scale, baseWidth - 36 * scale, baseHeight - 36 * scale);

        ctx.fillStyle = 'rgba(118, 120, 134, 0.95)';
        ctx.fillRect(-baseWidth / 2 + 8 * scale, -baseHeight / 2 + 8 * scale, baseWidth - 16 * scale, wallHeight);
        ctx.fillRect(-baseWidth / 2 + 8 * scale, baseHeight / 2 - wallHeight - 8 * scale, baseWidth - 16 * scale, wallHeight);
        ctx.fillRect(-baseWidth / 2 + 8 * scale, -baseHeight / 2 + 8 * scale, wallThickness, baseHeight - 16 * scale);
        ctx.fillRect(baseWidth / 2 - wallThickness - 8 * scale, -baseHeight / 2 + 8 * scale, wallThickness, baseHeight - 16 * scale);

        ctx.fillStyle = 'rgba(86, 92, 108, 0.96)';
        for (let i = -baseWidth / 2 + 16 * scale; i < baseWidth / 2 - 16 * scale; i += 20 * scale) {
            ctx.fillRect(i, -baseHeight / 2 + 8 * scale - 6 * scale, 10 * scale, 6 * scale);
            ctx.fillRect(i, baseHeight / 2 - 8 * scale, 10 * scale, 6 * scale);
        }

        drawTower(-baseWidth / 2 + 6 * scale, -baseHeight / 2 + 6 * scale, towerSize, towerHeight);
        drawTower(baseWidth / 2 - towerSize - 6 * scale, -baseHeight / 2 + 6 * scale, towerSize, towerHeight);
        drawTower(-baseWidth / 2 + 6 * scale, baseHeight / 2 - towerHeight - 6 * scale, towerSize, towerHeight);
        drawTower(baseWidth / 2 - towerSize - 6 * scale, baseHeight / 2 - towerHeight - 6 * scale, towerSize, towerHeight);

        ctx.fillStyle = 'rgba(136, 132, 146, 0.97)';
        ctx.fillRect(-keepWidth / 2, -keepHeight / 2 + 8 * scale, keepWidth, keepHeight);

        ctx.fillStyle = 'rgba(160, 176, 204, 0.93)';
        ctx.beginPath();
        ctx.moveTo(-keepWidth / 2 - 4 * scale, -keepHeight / 2 + 8 * scale);
        ctx.lineTo(0, -keepHeight / 2 - 20 * scale);
        ctx.lineTo(keepWidth / 2 + 4 * scale, -keepHeight / 2 + 8 * scale);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(28, 28, 34, 0.95)';
        ctx.fillRect(-doorWidth / 2, baseHeight / 2 - doorHeight - 6 * scale, doorWidth, doorHeight + 6 * scale);

        ctx.fillStyle = 'rgba(255, 230, 160, 0.28)';
        ctx.fillRect(-baseWidth / 2 + 22 * scale, -baseHeight / 2 + 28 * scale, 20 * scale, 16 * scale);
        ctx.fillRect(baseWidth / 2 - 42 * scale, -baseHeight / 2 + 28 * scale, 20 * scale, 16 * scale);
        ctx.fillRect(-8 * scale, -baseHeight / 2 + 8 * scale, 16 * scale, 12 * scale);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.fillRect(-baseWidth / 2 + 28 * scale, -baseHeight / 2 + 50 * scale, 12 * scale, 8 * scale);
        ctx.fillRect(baseWidth / 2 - 40 * scale, -baseHeight / 2 + 50 * scale, 12 * scale, 8 * scale);

        if (decor.hasEntranceMarker) {
            ctx.save();
            const markerBaseY = baseHeight / 2 + 8 * scale;
            const markerWidth = 30 * scale;
            const markerHeight = 26 * scale;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, markerBaseY + markerHeight * 0.25);
            ctx.lineTo(0, markerBaseY + markerHeight * 0.8);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(-markerWidth * 0.45, markerBaseY + markerHeight * 0.3);
            ctx.lineTo(0, markerBaseY + markerHeight * 0.05);
            ctx.lineTo(markerWidth * 0.45, markerBaseY + markerHeight * 0.3);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255, 220, 120, 0.95)';
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.font = `${10 * scale}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('ENTRADA', 0, markerBaseY + markerHeight * 0.25);
            ctx.fillStyle = 'rgba(255, 200, 60, 0.95)';
            const doorMarkerW = doorWidth + 12 * scale;
            const doorMarkerH = Math.max(6, 6 * scale);
            ctx.fillRect(-doorMarkerW / 2, baseHeight / 2 - doorMarkerH - 2 * scale, doorMarkerW, doorMarkerH);
            ctx.restore();
        }

        if (construction && construction.locked && type === 'castle') {
            ctx.save();
            const lockY = -baseHeight / 2 + 24 * scale;
            const lockWidth = 24 * scale;
            const lockHeight = 18 * scale;

            ctx.fillStyle = 'rgba(60, 60, 80, 0.95)';
            ctx.fillRect(-lockWidth / 2, lockY, lockWidth, lockHeight);

            ctx.strokeStyle = 'rgba(200, 200, 220, 0.95)';
            ctx.lineWidth = 2;
            ctx.strokeRect(-lockWidth / 2, lockY, lockWidth, lockHeight);

            ctx.beginPath();
            ctx.arc(0, lockY, lockWidth * 0.4, Math.PI, 0, false);
            ctx.stroke();
            ctx.fillStyle = 'rgba(200, 200, 220, 0.95)';
            ctx.beginPath();
            ctx.arc(0, lockY + lockHeight * 0.35, lockWidth * 0.12, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    } else if (type === 'mansion') {
        const wingWidth = baseWidth * 0.34;
        const wingHeight = baseHeight * 0.44;
        const keepWidth = baseWidth * 0.42;
        const keepHeight = baseHeight * 0.56;

        ctx.fillStyle = 'rgba(132, 98, 66, 0.98)';
        ctx.fillRect(-baseWidth / 2 + 16 * scale, -baseHeight / 2 + 16 * scale, baseWidth - 32 * scale, baseHeight - 32 * scale);

        ctx.fillStyle = 'rgba(92, 68, 44, 0.96)';
        ctx.fillRect(-baseWidth / 2 + 22 * scale, -baseHeight / 2 + 22 * scale, baseWidth - 44 * scale, baseHeight - 44 * scale);

        ctx.fillStyle = 'rgba(118, 104, 88, 0.98)';
        ctx.fillRect(-keepWidth / 2, -keepHeight / 2 + 8 * scale, keepWidth, keepHeight);
        ctx.fillRect(-baseWidth / 2 + 10 * scale, -baseHeight / 2 + 16 * scale, wingWidth, wingHeight);
        ctx.fillRect(baseWidth / 2 - wingWidth - 10 * scale, -baseHeight / 2 + 16 * scale, wingWidth, wingHeight);

        ctx.fillStyle = 'rgba(180, 148, 92, 0.95)';
        ctx.beginPath();
        ctx.moveTo(-keepWidth / 2 - 4 * scale, -keepHeight / 2 + 8 * scale);
        ctx.lineTo(0, -keepHeight / 2 - 22 * scale);
        ctx.lineTo(keepWidth / 2 + 4 * scale, -keepHeight / 2 + 8 * scale);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(76, 48, 24, 0.95)';
        ctx.fillRect(-doorWidth / 2, baseHeight / 2 - doorHeight - 4 * scale, doorWidth, doorHeight + 4 * scale);

        ctx.fillStyle = 'rgba(255, 214, 128, 0.8)';
        ctx.fillRect(-baseWidth / 2 + 24 * scale, -baseHeight / 2 + 28 * scale, 20 * scale, 16 * scale);
        ctx.fillRect(baseWidth / 2 - 44 * scale, -baseHeight / 2 + 28 * scale, 20 * scale, 16 * scale);

        ctx.fillStyle = 'rgba(120, 80, 38, 0.85)';
        ctx.fillRect(-baseWidth / 2 + 16 * scale, -baseHeight / 2 + 32 * scale, 14 * scale, 18 * scale);
        ctx.fillRect(baseWidth / 2 - 30 * scale, -baseHeight / 2 + 32 * scale, 14 * scale, 18 * scale);

        ctx.fillStyle = 'rgba(255, 200, 110, 0.45)';
        ctx.fillRect(-10 * scale, -baseHeight / 2 + 12 * scale, 20 * scale, 14 * scale);
        ctx.fillRect(-baseWidth / 2 + 32 * scale, baseHeight / 2 - 40 * scale, 20 * scale, 14 * scale);
        ctx.fillRect(baseWidth / 2 - 52 * scale, baseHeight / 2 - 40 * scale, 20 * scale, 14 * scale);

        if (decor.hasEntranceMarker) {
            ctx.save();
            const markerBaseY = baseHeight / 2 + 8 * scale;
            const markerWidth = 30 * scale;
            const markerHeight = 26 * scale;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, markerBaseY + markerHeight * 0.25);
            ctx.lineTo(0, markerBaseY + markerHeight * 0.8);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(-markerWidth * 0.45, markerBaseY + markerHeight * 0.3);
            ctx.lineTo(0, markerBaseY + markerHeight * 0.05);
            ctx.lineTo(markerWidth * 0.45, markerBaseY + markerHeight * 0.3);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255, 220, 120, 0.95)';
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.font = `${10 * scale}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('ENTRADA', 0, markerBaseY + markerHeight * 0.25);
            ctx.fillStyle = 'rgba(255, 200, 60, 0.95)';
            const doorMarkerW = doorWidth + 12 * scale;
            const doorMarkerH = Math.max(6, 6 * scale);
            ctx.fillRect(-doorMarkerW / 2, baseHeight / 2 - doorMarkerH - 2 * scale, doorMarkerW, doorMarkerH);
            ctx.restore();
        }
    } else if (type === 'mine') {
        ctx.fillStyle = 'rgba(72, 72, 84, 0.97)';
        ctx.fillRect(-baseWidth / 2 + 16 * scale, -baseHeight / 2 + 16 * scale, baseWidth - 32 * scale, baseHeight - 32 * scale);

        ctx.fillStyle = 'rgba(40, 40, 48, 0.96)';
        ctx.fillRect(-baseWidth / 2 + 24 * scale, -baseHeight / 2 + 24 * scale, baseWidth - 48 * scale, 28 * scale);

        ctx.fillStyle = 'rgba(255, 150, 0, 0.92)';
        ctx.beginPath();
        ctx.moveTo(-baseWidth / 2 - 6 * scale, -baseHeight / 2 + 4 * scale);
        ctx.lineTo(0, -baseHeight / 2 - roofHeight);
        ctx.lineTo(baseWidth / 2 + 6 * scale, -baseHeight / 2 + 4 * scale);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 90, 0, 0.55)';
        ctx.fillRect(-baseWidth / 2 + 18 * scale, -baseHeight / 2 + 22 * scale, 24 * scale, 20 * scale);
        ctx.fillRect(baseWidth / 2 - 42 * scale, -baseHeight / 2 + 22 * scale, 24 * scale, 20 * scale);

        ctx.fillStyle = 'rgba(20, 20, 30, 0.96)';
        ctx.fillRect(-doorWidth / 2, baseHeight / 2 - doorHeight, doorWidth, doorHeight);

        ctx.fillStyle = 'rgba(255, 220, 120, 0.35)';
        ctx.fillRect(-baseWidth / 2 + 26 * scale, -baseHeight / 2 + 42 * scale, 16 * scale, 10 * scale);
        ctx.fillRect(baseWidth / 2 - 42 * scale, -baseHeight / 2 + 42 * scale, 16 * scale, 10 * scale);

        ctx.fillStyle = 'rgba(255, 140, 0, 0.28)';
        ctx.fillRect(-10 * scale, -baseHeight / 2 + 10 * scale, 20 * scale, 12 * scale);
        ctx.fillRect(-baseWidth / 2 + 34 * scale, baseHeight / 2 - 42 * scale, 18 * scale, 10 * scale);
        ctx.fillRect(baseWidth / 2 - 52 * scale, baseHeight / 2 - 42 * scale, 18 * scale, 10 * scale);
    }

    ctx.restore();
}

function drawMapDecor() {
    for (const decor of mapDecor) {
        if (decor.kind === 'construction') {
            drawMapConstruction(ctx, decor, decor.x, decor.y, decor.scale, decor.alpha);
        } else {
            drawMapTree(ctx, decor.x, decor.y, decor.scale, decor.alpha, decor.extras);
        }
    }
}

function initializeMapDecor() {
    createMapDecor();
}

// Função para desenhar o background quando o jogador está dentro de uma construção
function drawConstructionInterior() {
    const construction = constructions.find(c => c.id === currentConstructionId);
    const type = construction ? construction.type : 'castle';

    if (type === 'castle') {
        drawCastleInterior();
    } else if (type === 'mansion') {
        drawMansionInterior();
    } else if (type === 'mine') {
        drawMineInterior();
    } else {
        drawCastleInterior();
    }
}

function drawCastleInterior() {
    // Piso de pedra cinzenta
    ctx.fillStyle = 'rgba(120, 120, 135, 1)';
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);
    
    // Parede de pedra texturizada cinzenta
    ctx.fillStyle = 'rgba(100, 100, 120, 0.9)';
    for (let i = 0; i < viewportWidth; i += 40) {
        for (let j = 0; j < viewportHeight; j += 40) {
            if ((Math.floor(i / 40) + Math.floor(j / 40)) % 2 === 0) {
                ctx.fillRect(i, j, 40, 40);
            }
        }
    }
    
    // Bordas mais escuras
    ctx.fillStyle = 'rgba(70, 70, 85, 0.8)';
    ctx.fillRect(0, 0, viewportWidth, 20);
    ctx.fillRect(0, viewportHeight - 20, viewportWidth, 20);
    ctx.fillRect(0, 0, 20, viewportHeight);
    ctx.fillRect(viewportWidth - 20, 0, 20, viewportHeight);
    
    // Iluminação azulada (lâmpadas mágicas do castelo)
    const gradient = ctx.createRadialGradient(viewportWidth / 2, viewportHeight / 2, 0, viewportWidth / 2, viewportHeight / 2, Math.max(viewportWidth, viewportHeight));
    gradient.addColorStop(0, 'rgba(150, 180, 220, 0.15)');
    gradient.addColorStop(1, 'rgba(80, 110, 180, 0.2)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);

    // Tochas nas paredes
    ctx.fillStyle = 'rgba(255, 150, 50, 0.6)';
    ctx.beginPath();
    ctx.arc(30, 50, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(viewportWidth - 30, 50, 12, 0, Math.PI * 2);
    ctx.fill();

    // Símbolo de teleporte do castelo
    drawCastleTeleportArea();
}

function drawCastleTeleportArea() {
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight - 120;
    
    // Círculo base (plataforma mágica)
    ctx.fillStyle = 'rgba(100, 150, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 60, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(150, 200, 255, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 60, 0, Math.PI * 2);
    ctx.stroke();
    
    // Efeito de brilho pulsante
    const pulse = 0.5 + 0.3 * Math.sin(performance.now() * 0.004);
    ctx.strokeStyle = `rgba(200, 230, 255, ${pulse * 0.6})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 70, 0, Math.PI * 2);
    ctx.stroke();
    
    // Brasão dentro do círculo
    ctx.fillStyle = 'rgba(218, 165, 32, 0.9)';
    ctx.beginPath();
    ctx.arc(centerX, centerY - 5, 15, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'rgba(139, 69, 19, 0.8)';
    ctx.beginPath();
    ctx.arc(centerX, centerY - 5, 10, 0, Math.PI * 2);
    ctx.fill();
}

function drawMansionInterior() {
    // Piso de madeira clara
    ctx.fillStyle = 'rgba(160, 130, 100, 1)';
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);
    
    // Tábuas de madeira
    ctx.fillStyle = 'rgba(140, 110, 80, 0.85)';
    for (let i = 0; i < viewportWidth; i += 50) {
        ctx.fillRect(i, 0, 2, viewportHeight);
    }
    for (let i = 0; i < viewportHeight; i += 30) {
        ctx.fillRect(0, i, viewportWidth, 1);
    }
    
    // Parede de papel/pintura clara
    ctx.fillStyle = 'rgba(200, 180, 160, 0.95)';
    ctx.fillRect(0, 0, viewportWidth, 100);
    ctx.fillRect(0, 0, 100, viewportHeight);
    ctx.fillRect(viewportWidth - 100, 0, 100, viewportHeight);
    
    // Moldura decorativa
    ctx.strokeStyle = 'rgba(160, 140, 110, 0.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(15, 15, viewportWidth - 30, viewportHeight - 30);
    
    // Iluminação quente
    const gradient = ctx.createRadialGradient(viewportWidth / 2, viewportHeight / 2, 0, viewportWidth / 2, viewportHeight / 2, Math.max(viewportWidth, viewportHeight));
    gradient.addColorStop(0, 'rgba(220, 200, 160, 0.1)');
    gradient.addColorStop(1, 'rgba(160, 120, 80, 0.15)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);

    // Chandeliers (lustres)
    for (let x = 200; x < viewportWidth; x += 400) {
        ctx.fillStyle = 'rgba(255, 200, 100, 0.7)';
        ctx.beginPath();
        ctx.arc(x, 50, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(200, 150, 50, 0.8)';
        ctx.beginPath();
        ctx.arc(x, 55, 8, 0, Math.PI * 2);
        ctx.fill();
    }

    // Área de teleporte da mansão
    drawMansionTeleportArea();

    if (!mansionExitOpen) {
        ctx.save();
        ctx.fillStyle = 'rgba(40, 10, 60, 0.92)';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SAÍDA TRANCADA', viewportWidth / 2, 110);
        ctx.font = '18px Arial';
        ctx.fillText('Mate todos os fantasmas para abrir a saída', viewportWidth / 2, 140);
        ctx.restore();
    }
}

function drawMansionTeleportArea() {
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight - 120;
    
    // Tapete decorativo
    ctx.fillStyle = 'rgba(200, 50, 50, 0.6)';
    ctx.fillRect(centerX - 70, centerY - 40, 140, 80);
    
    // Borda dourada do tapete
    ctx.strokeStyle = 'rgba(218, 165, 32, 0.9)';
    ctx.lineWidth = 4;
    ctx.strokeRect(centerX - 70, centerY - 40, 140, 80);
    
    // Padrão geométrico no tapete
    ctx.strokeStyle = 'rgba(218, 165, 32, 0.6)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(centerX - 60 + i * 25, centerY - 35);
        ctx.lineTo(centerX - 60 + i * 25, centerY + 35);
        ctx.stroke();
    }
    
    // Aura mágica pulsante no tapete
    const pulse = 0.4 + 0.3 * Math.sin(performance.now() * 0.003);
    ctx.fillStyle = `rgba(255, 200, 100, ${pulse * 0.3})`;
    ctx.fillRect(centerX - 65, centerY - 35, 130, 70);
}

function drawMineInterior() {
    // Piso de rocha/minério escuro
    ctx.fillStyle = 'rgba(60, 60, 70, 1)';
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);
    
    // Parede de rocha texturizada
    ctx.fillStyle = 'rgba(80, 80, 95, 0.9)';
    for (let i = 0; i < viewportWidth; i += 50) {
        for (let j = 0; j < viewportHeight; j += 50) {
            if ((Math.floor(i / 50) + Math.floor(j / 50)) % 2 === 0) {
                ctx.fillRect(i, j, 50, 50);
            }
        }
    }
    
    // Brilho de minério/cristais
    ctx.fillStyle = 'rgba(255, 180, 0, 0.4)';
    for (let i = 0; i < 5; i++) {
        const x = Math.random() * viewportWidth;
        const y = Math.random() * viewportHeight;
        ctx.fillRect(x, y, 20 + Math.random() * 20, 3);
    }
    
    // Bordas mais escuras
    ctx.fillStyle = 'rgba(40, 40, 50, 0.8)';
    ctx.fillRect(0, 0, viewportWidth, 25);
    ctx.fillRect(0, viewportHeight - 25, viewportWidth, 25);
    ctx.fillRect(0, 0, 25, viewportHeight);
    ctx.fillRect(viewportWidth - 25, 0, 25, viewportHeight);
    
    // Iluminação alaranjada
    const gradient = ctx.createRadialGradient(viewportWidth / 2, viewportHeight / 2, 0, viewportWidth / 2, viewportHeight / 2, Math.max(viewportWidth, viewportHeight));
    gradient.addColorStop(0, 'rgba(255, 150, 50, 0.1)');
    gradient.addColorStop(1, 'rgba(120, 60, 20, 0.25)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);

    // Tochas de fogo na mina
    ctx.fillStyle = 'rgba(255, 100, 30, 0.7)';
    ctx.beginPath();
    ctx.arc(50, 60, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(viewportWidth - 50, 60, 10, 0, Math.PI * 2);
    ctx.fill();

    // Plataforma de teleporte da mina
    drawMineTeleportArea();
}

function drawMineTeleportArea() {
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight - 120;
    
    // Plataforma de minério brilhante (hexágono)
    ctx.fillStyle = 'rgba(255, 150, 0, 0.4)';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 / 6) * i;
        const x = centerX + Math.cos(angle) * 60;
        const y = centerY + Math.sin(angle) * 60;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    
    // Borda do hexágono
    ctx.strokeStyle = 'rgba(255, 180, 0, 0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Cristais brilhando no hexágono
    ctx.fillStyle = 'rgba(255, 200, 100, 0.8)';
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 / 6) * i;
        const x = centerX + Math.cos(angle) * 40;
        const y = centerY + Math.sin(angle) * 40;
        
        ctx.beginPath();
        ctx.moveTo(x, y - 8);
        ctx.lineTo(x + 8, y + 8);
        ctx.lineTo(x - 8, y + 8);
        ctx.closePath();
        ctx.fill();
    }
    
    // Aura de perigo pulsante
    const pulse = 0.5 + 0.3 * Math.sin(performance.now() * 0.005);
    ctx.strokeStyle = `rgba(255, 100, 0, ${pulse * 0.7})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 / 6) * i;
        const x = centerX + Math.cos(angle) * 75;
        const y = centerY + Math.sin(angle) * 75;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
}

// Função para desenhar a zona de saída da construção
function drawConstructionExitZone() {
    if (!constructionExitZone) return;
    
    const construction = constructions.find(c => c.id === currentConstructionId);
    const type = construction ? construction.type : 'castle';

    if (type === 'castle') {
        if (!castleExitOpen) return;
        drawCastleExitGate();
    } else if (type === 'mansion') {
        if (!mansionExitOpen) return;
        drawMansionExitGate();
    } else if (type === 'mine') {
        drawMineExitGate();
    } else {
        drawCastleExitGate();
    }
}

function drawCastleExitGate() {
    if (!constructionExitZone) return;
    
    ctx.save();
    ctx.translate(constructionExitZone.x + constructionExitZone.width / 2, 
                  constructionExitZone.y + constructionExitZone.height / 2);
    
    // Portão de ferro medieval do castelo
    ctx.fillStyle = '#4a4a5a';
    ctx.fillRect(-constructionExitZone.width / 2, -constructionExitZone.height / 2, 
                 constructionExitZone.width, constructionExitZone.height);
    
    // Borda de ferro forjado
    ctx.strokeStyle = '#6a6a7a';
    ctx.lineWidth = 4;
    ctx.strokeRect(-constructionExitZone.width / 2, -constructionExitZone.height / 2, 
                   constructionExitZone.width, constructionExitZone.height);
    
    // Grades de ferro (vertical)
    ctx.strokeStyle = '#8a8a9a';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
        const x = -constructionExitZone.width / 2 + (constructionExitZone.width / 7) * i;
        ctx.beginPath();
        ctx.moveTo(x, -constructionExitZone.height / 2);
        ctx.lineTo(x, constructionExitZone.height / 2);
        ctx.stroke();
    }
    
    // Brasão (escudo dourado no topo)
    ctx.fillStyle = 'rgba(218, 165, 32, 0.9)';
    ctx.beginPath();
    ctx.arc(0, -constructionExitZone.height / 2 - 15, 12, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'rgba(139, 69, 19, 0.8)';
    ctx.beginPath();
    ctx.arc(0, -constructionExitZone.height / 2 - 15, 8, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
    
    // Texto de instrução
    ctx.save();
    ctx.fillStyle = '#6effff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('PORTÃO DO CASTELO', 
        constructionExitZone.x + constructionExitZone.width / 2,
        constructionExitZone.y - 35);
    ctx.fillText('(Subir para sair)', 
        constructionExitZone.x + constructionExitZone.width / 2,
        constructionExitZone.y - 15);
    ctx.restore();
}

function drawMansionExitGate() {
    if (!constructionExitZone) return;
    
    ctx.save();
    ctx.translate(constructionExitZone.x + constructionExitZone.width / 2, 
                  constructionExitZone.y + constructionExitZone.height / 2);
    
    // Porta ornamentada da mansão
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(-constructionExitZone.width / 2, -constructionExitZone.height / 2, 
                 constructionExitZone.width, constructionExitZone.height);
    
    // Borda decorativa dourada
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 3;
    ctx.strokeRect(-constructionExitZone.width / 2 + 3, -constructionExitZone.height / 2 + 3, 
                   constructionExitZone.width - 6, constructionExitZone.height - 6);
    
    // Painel esquerdo da porta
    ctx.fillStyle = '#7a5a3a';
    ctx.fillRect(-constructionExitZone.width / 2 + 5, -constructionExitZone.height / 2 + 5, 
                 constructionExitZone.width / 2 - 5, constructionExitZone.height - 10);
    
    // Painel direito da porta
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(-constructionExitZone.width / 2 + constructionExitZone.width / 2, 
                 -constructionExitZone.height / 2 + 5, 
                 constructionExitZone.width / 2 - 5, constructionExitZone.height - 10);
    
    // Divisória central
    ctx.strokeStyle = '#a0860d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -constructionExitZone.height / 2 + 5);
    ctx.lineTo(0, constructionExitZone.height / 2 - 5);
    ctx.stroke();
    
    // Maçanetas ornamentadas
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(-constructionExitZone.width / 4, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d4a337';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(constructionExitZone.width / 4, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d4a337';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Brilho na porta
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-constructionExitZone.width / 2 + 8, -constructionExitZone.height / 2 + 8, 
                 constructionExitZone.width / 3, constructionExitZone.height / 4);
    
    ctx.restore();
    
    // Texto de instrução
    ctx.save();
    ctx.fillStyle = '#daa520';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('PORTA DA MANSÃO', 
        constructionExitZone.x + constructionExitZone.width / 2,
        constructionExitZone.y - 35);
    ctx.fillText('(Subir para sair)', 
        constructionExitZone.x + constructionExitZone.width / 2,
        constructionExitZone.y - 15);
    ctx.restore();
}

function drawMineExitGate() {
    if (!constructionExitZone) return;
    
    ctx.save();
    ctx.translate(constructionExitZone.x + constructionExitZone.width / 2, 
                  constructionExitZone.y + constructionExitZone.height / 2);
    
    // Portão reforçado da mina (metal pesado)
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(-constructionExitZone.width / 2, -constructionExitZone.height / 2, 
                 constructionExitZone.width, constructionExitZone.height);
    
    // Borda de metal
    ctx.strokeStyle = '#5a5a6a';
    ctx.lineWidth = 5;
    ctx.strokeRect(-constructionExitZone.width / 2, -constructionExitZone.height / 2, 
                   constructionExitZone.width, constructionExitZone.height);
    
    // Parafusos de metal
    ctx.fillStyle = '#7a7a8a';
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
            const x = -constructionExitZone.width / 2 + (constructionExitZone.width / 3) * i + 25;
            const y = -constructionExitZone.height / 2 + (constructionExitZone.height / 2) * j + 20;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    // Símbolo de perigo (listras)
    ctx.fillStyle = 'rgba(255, 100, 0, 0.8)';
    for (let i = 0; i < 3; i++) {
        ctx.fillRect(-constructionExitZone.width / 2 + 10, -constructionExitZone.height / 2 + 30 + i * 15, 
                     constructionExitZone.width - 20, 8);
    }
    
    // Alavanca de abertura
    ctx.fillStyle = '#888899';
    ctx.fillRect(constructionExitZone.width / 2 - 15, -constructionExitZone.height / 2 + 10, 8, 20);
    ctx.fillStyle = '#aaaaaa';
    ctx.beginPath();
    ctx.arc(constructionExitZone.width / 2 - 11, -constructionExitZone.height / 2 + 25, 4, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
    
    // Texto de instrução
    ctx.save();
    ctx.fillStyle = '#ff6400';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('PORTÃO DA MINA', 
        constructionExitZone.x + constructionExitZone.width / 2,
        constructionExitZone.y - 35);
    ctx.fillText('(Subir para sair)', 
        constructionExitZone.x + constructionExitZone.width / 2,
        constructionExitZone.y - 15);
    ctx.restore();
}

// Função para entrar em uma construção
function enterConstruction(constructionId) {
    const construction = constructions.find(c => c.id === constructionId);
    if (!construction || construction.locked) return;
    
    playerInsideConstruction = true;
    currentConstructionId = constructionId;
    
    // Teleportar o jogador para o interior da construção em coordenadas locais da viewport
    player.x = viewportWidth / 2 - player.width / 2;
    player.y = viewportHeight / 2 - player.height / 2;
    
    // Criar zona de saída local à construção interior
    const exitZoneX = player.x - 50;
    const exitZoneY = player.y - 150;
    
    constructionExitZone = {
        x: exitZoneX,
        y: exitZoneY,
        width: 200,
        height: 80
    };
    
    // Desativar monstro temporariamente
    if (currentMonster) {
        currentMonster.x = -999999;
        currentMonster.y = -999999;
    }
    
    // Spawn first wave of enemies if this is a castle interior
    if (construction.type === 'castle') {
        clearCastleInterior();
        spawnCastleInteriorWave();
    } else if (construction.type === 'mansion') {
        construction.locked = true;
        clearMansionInterior();
    }
}

// Função para sair de uma construção
function exitConstruction() {
    if (!playerInsideConstruction) return;
    
    const construction = constructions.find(c => c.id === currentConstructionId);
    if (!construction) return;
    
    playerInsideConstruction = false;
    currentConstructionId = -1;
    if (construction.type === 'castle' || construction.type === 'mansion') {
        construction.locked = true;
    }
    if (construction.type === 'mansion') {
        mansionExitOpen = false;
    }
    constructionExitZone = null;
    clearConstructionEntrancePortals();
    
    // Teleportar o jogador para perto da construção (entrada)
    player.x = construction.x - player.width / 2;
    player.y = construction.y + construction.height / 2;
    
    // Reativar monstro
    if (currentMonster) {
        const mapCenter = getMapCircle();
        currentMonster.x = mapCenter.centerX - currentMonster.width / 2;
        currentMonster.y = mapCenter.centerY - currentMonster.height / 2;
    }
}

function clearConstructionEntrancePortals() {
    constructionEntrancePortals = [];
}

function createConstructionEntrancePortalsAroundPlayer() {
    if (!player || !gameStarted || !Array.isArray(constructions) || constructions.length === 0) return;
    if (playerInsideConstruction) return;

    constructionEntrancePortals = [];

    const centerX = player.x + player.width / 2;
    const centerY = player.y + player.height / 2;
    const portalWidth = 60;
    const portalHeight = 60;
    const total = constructions.length;

    for (let i = 0; i < total; i += 1) {
        const construction = constructions[i];
        if ((construction.type === 'castle' || construction.type === 'mansion') && construction.locked) continue;

        const angle = (i / total) * Math.PI * 2;
        const radius = 92;
        const x = centerX + Math.cos(angle) * radius - portalWidth / 2;
        const y = centerY + Math.sin(angle) * radius - portalHeight / 2;

        constructionEntrancePortals.push({
            constructionId: construction.id,
            x,
            y,
            width: portalWidth,
            height: portalHeight,
            type: construction.type
        });
    }
}

function checkConstructionEntranceCollision() {
    if (!player || playerInsideConstruction || !constructionEntrancePortals.length) return;
    
    for (const portal of constructionEntrancePortals) {
        const isColliding =
            player.x < portal.x + portal.width &&
            player.x + player.width > portal.x &&
            player.y < portal.y + portal.height &&
            player.y + player.height > portal.y;

        if (isColliding) {
            enterConstruction(portal.constructionId);
            clearConstructionEntrancePortals();
            break;
        }
    }
}

function drawConstructionEntrancePortals() {
    if (!ctx || !constructionEntrancePortals.length) return;

    for (const portal of constructionEntrancePortals) {
        const color = portal.type === 'mine'
            ? 'rgba(255, 175, 60, 0.85)'
            : portal.type === 'mansion'
                ? 'rgba(180, 120, 255, 0.85)'
                : 'rgba(110, 215, 255, 0.85)';

        ctx.save();
        ctx.translate(portal.x + portal.width / 2, portal.y + portal.height / 2);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(0, 0, portal.width / 2 - 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = portal.type === 'mine' ? 'MINA' : portal.type === 'mansion' ? 'MANSÃO' : 'CASTELO';
        ctx.fillText(label, portal.x + portal.width / 2, portal.y + portal.height / 2);
        ctx.restore();
    }
}

// Função para verificar colisão com construções
function checkConstructionCollision() {
    if (playerInsideConstruction) return;
    
    for (const construction of constructions) {
        if ((construction.type === 'castle' || construction.type === 'mansion') && construction.locked) continue;

        const isColliding = 
            player.x < construction.x + construction.width &&
            player.x + player.width > construction.x &&
            player.y < construction.y + construction.height &&
            player.y + player.height > construction.y;
        
        if (isColliding) {
            enterConstruction(construction.id);
            break;
        }
    }
}

// Função para verificar se o jogador está tentando sair da construção
function checkConstructionExit() {
    if (!playerInsideConstruction || !constructionExitZone) return;
    
    const isInExitZone = 
        player.x < constructionExitZone.x + constructionExitZone.width &&
        player.x + player.width > constructionExitZone.x &&
        player.y < constructionExitZone.y + constructionExitZone.height &&
        player.y + player.height > constructionExitZone.y;
    
    if (isInExitZone) {
        const construction = constructions.find(c => c.id === currentConstructionId);
        if (construction) {
            if (construction.type === 'castle' && !castleExitOpen) {
                return;
            }
            if (construction.type === 'mansion' && !mansionExitOpen) {
                return;
            }
        }
        exitConstruction();
    }
}

function clampEntityToMapCircle(entity) {
    const { centerX, centerY, radius } = getMapCircle();
    const halfW = entity.width / 2;
    const halfH = entity.height / 2;
    const posX = entity.x + halfW;
    const posY = entity.y + halfH;
    const dx = posX - centerX;
    const dy = posY - centerY;
    const dist = Math.hypot(dx, dy);
    const maxDist = Math.max(0, radius - Math.max(halfW, halfH) - 1);
    if (dist <= maxDist) return false;
    const scale = maxDist / (dist || 1);
    entity.x = centerX + dx * scale - halfW;
    entity.y = centerY + dy * scale - halfH;
    return true;
}

function resolveEntityViewportBounds(entity, prevX, prevY, margin = 16) {
    let collided = false;
    const targetX = entity.x;
    const targetY = entity.y;
    let resolvedX = targetX;
    let resolvedY = targetY;

    entity.x = targetX;
    entity.y = prevY;
    const maxAllowedX = Math.max(margin, Math.min(viewportWidth - entity.width - margin, prevX));
    if (entity.x < margin || entity.x > viewportWidth - entity.width - margin) {
        resolvedX = maxAllowedX;
        collided = true;
    }

    entity.x = resolvedX;
    entity.y = targetY;
    const maxAllowedY = Math.max(margin, Math.min(viewportHeight - entity.height - margin, prevY));
    if (entity.y < margin || entity.y > viewportHeight - entity.height - margin) {
        resolvedY = maxAllowedY;
        collided = true;
    }

    entity.x = resolvedX;
    entity.y = resolvedY;
    return collided;
}

function isMonsterTransitionActive() {
    return !!(
        (currentMonster && currentMonster.isDying) ||
        upgradeDelayTimer > 0 ||
        upgradeOverlayAnimating ||
        isUpgrading
    );
}

function updateCamera() {
    if (!player) return;

    if (playerInsideConstruction) {
        cameraX = 0;
        cameraY = 0;
        return;
    }

    let targetX = player.x + player.width / 2 - viewportWidth / 2;
    let targetY = player.y + player.height / 2 - viewportHeight / 2;

    if (currentMonster && currentMonster.isDying) {
        targetX = currentMonster.x + currentMonster.width / 2 - viewportWidth / 2;
        targetY = currentMonster.y + currentMonster.height / 2 - viewportHeight / 2;
    }

    if (roarFreezeTimer > 0 && currentMonster && currentMonster.type === 'croc') {
        targetX = currentMonster.crocDecoyX - viewportWidth / 2;
        targetY = currentMonster.crocDecoyY - viewportHeight / 2;
    } else if (currentMonster && currentMonster.type === 'croc' && currentMonster.roarTimer > 0) {
        targetX = currentMonster.crocDecoyX - viewportWidth / 2;
        targetY = currentMonster.crocDecoyY - viewportHeight / 2;
    } else if (typeof cameraLockTarget === 'object' && cameraLockTarget !== null && cameraLockTarget.timer > 0) {
        targetX = cameraLockTarget.x - viewportWidth / 2;
        targetY = cameraLockTarget.y - viewportHeight / 2;
    }

    cameraX = Math.max(0, Math.min(targetX, gameWidth - viewportWidth));
    cameraY = Math.max(0, Math.min(targetY, gameHeight - viewportHeight));
}

function beginCamera() {
    updateCamera();
    ctx.save();
    ctx.translate(-cameraX, -cameraY);
}

function endCamera() {
    ctx.restore();
}

// retorna a distância mínima do ponto (px,py) ao segmento (x1,y1)-(x2,y2)
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const wx = px - x1;
    const wy = py - y1;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(px - x1, py - y1);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(px - x2, py - y2);
    const b = c1 / c2;
    const bx = x1 + b * vx;
    const by = y1 + b * vy;
    return Math.hypot(px - bx, py - by);
}

window.addEventListener('resize', () => {
    resizeGameCanvas();
    if (typeof player !== 'undefined') {
        clampEntityToMapCircle(player);
    }
    if (typeof currentMonster !== 'undefined') {
        clampEntityToMapCircle(currentMonster);
    }
});

resizeGameCanvas();

// ===== CLASSES DO JOGO =====
class Projectile {
    constructor(x, y, targetX, targetY, damage, color, speed, owner = 'player', size = 8, opts = {}) {
        this.x = x;
        this.y = y;
        this.size = size;
        // Apply global speed reduction: reduce by 50%
        const actualSpeed = (typeof speed === 'number') ? speed * 0.5 : 0;
        this.speed = actualSpeed;
        this.baseActualSpeed = actualSpeed;
        const dx = targetX - x;
        const dy = targetY - y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        this.vx = (dx / dist) * actualSpeed;
        this.vy = (dy / dist) * actualSpeed;
        this.damage = damage;
        this.color = color;
        this.owner = owner;
        this.maxDistance = opts.maxDistance || 800;
        this.traveled = 0;
        this.critPercent = opts.critPercent || 0;
        this.homing = opts.homing || false;
        this.homingTarget = opts.homingTarget || null;
        this.homingStrength = opts.homingStrength || 0.06;
        this.homingDuration = typeof opts.homingDuration === 'number' ? opts.homingDuration : -1;
        this.splitOnPlayerAttack = opts.splitOnPlayerAttack || false;
        this.splitDistance = opts.splitDistance || 90;
        this.hurricaneBoosted = opts.hurricaneBoosted || false;
        this.boostRadius = opts.boostRadius || 0;
        this.splitTriggered = false;
        this.delayTimer = opts.delayTimer || 0;
        this.delayDuration = opts.delayDuration || 0;
        this.monsterType = opts.monsterType || null;
        this.style = opts.style || (owner === 'monster' ? getMonsterProjectileStyle(this.monsterType) : '');
        this.projectileEmoji = opts.projectileEmoji || opts.emoji || null;
        this.hitTarget = opts.hitTarget || false;
        this.ignoreCollision = opts.ignoreCollision || false;
        this.isGunOriginal = opts.isGunOriginal || false;
        this.pullStrength = opts.pullStrength || 0;
        this.pullRadius = opts.pullRadius || 0;
        this.lifetime = opts.lifetime || null;
        this.immortal = opts.immortal || false;
        this.rotation = opts.rotation || 0;
        this.rotationSpeed = opts.rotationSpeed || 0;
        this.afterImageTrail = opts.afterImageTrail || false;
        this.afterImageInterval = typeof opts.afterImageInterval === 'number' ? opts.afterImageInterval : 2;
        this.afterImageTimer = this.afterImageTrail ? this.afterImageInterval : 0;
        this.savedVx = this.vx;
        this.savedVy = this.vy;
        // Propriedades de órbita para lanças copiadas do tornado
        this.orbitingHurricane = opts.orbitingHurricane || false;
        this.orbitTimer = opts.orbitTimer || 0;
        this.orbitMaxTimer = opts.orbitMaxTimer || 0;
        this.orbitCenterX = opts.orbitCenterX || 0;
        this.orbitCenterY = opts.orbitCenterY || 0;
        this.orbitRadius = opts.orbitRadius || 0;
        this.orbitAngle = opts.orbitAngle || 0;
        this.targetMonsterX = null;
        this.targetMonsterY = null;
        this.preLaunchTimer = 0;
        this.preLaunchTargetX = null;
        this.preLaunchTargetY = null;
        this.preLaunchSpeed = 0;
        this.shakeTimer = 0;
        this.shakeIntensity = 0;
        this.pendingRicochetDestroy = false;
        // contador de frames fora da viewport antes de remover (1s = ~60 frames)
        this.offscreenTimer = 0;
        this.offscreenLimit = typeof opts.offscreenLimit === 'number' ? opts.offscreenLimit : 60;
    }

    update() {
        // Lógica de orbiting ao redor do tornado (para lanças copiadas)
        if (this.orbitingHurricane && this.orbitTimer !== undefined && this.orbitTimer > 0) {
            this.orbitTimer--;
            
            // Easing suave: começa lento, acelera, desacelera
            const progress = 1 - (this.orbitTimer / this.orbitMaxTimer);
            const smoothProgress = Math.sin(progress * Math.PI) * 0.5 + 0.5;
            
            // Rotacionar ao redor do tornado com velocidade constante
            this.orbitAngle += (Math.PI * 2 / (0.6 * 60)) * 0.65; // ~1.1 rotações em 0.6s
            
            // Posição ao redor do tornado
            const hurricaneX = this.orbitCenterX;
            const hurricaneY = this.orbitCenterY;
            const radius = this.orbitRadius;
            
            this.x = hurricaneX + Math.cos(this.orbitAngle) * radius;
            this.y = hurricaneY + Math.sin(this.orbitAngle) * radius;
            this.vx = 0;
            this.vy = 0;
            
            // Atualizar o alvo do monstro enquanto orbita, para lançar rumo ao monstro atualizado
            if (currentMonster) {
                this.targetMonsterX = currentMonster.x + currentMonster.width / 2;
                this.targetMonsterY = currentMonster.y + currentMonster.height / 2;
            }
            
            // Se chegou ao fim da órbita, preparar o lançamento homing
            if (this.orbitTimer <= 0) {
                this.orbitingHurricane = false;
                let target = null;
                if (playerInsideConstruction) {
                    target = getCastleOrCurrentTargetCenter();
                } else if (currentMonster) {
                    target = { x: currentMonster.x + currentMonster.width / 2, y: currentMonster.y + currentMonster.height / 2 };
                }
                const targetX = target ? target.x : this.x + 300;
                const targetY = target ? target.y : this.y;
                const dx = targetX - this.x;
                const dy = targetY - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const backDistance = 20;
                const backDuration = 10;

                this.preLaunchTimer = backDuration;
                this.preLaunchTargetX = targetX;
                this.preLaunchTargetY = targetY;
                this.preLaunchSpeed = backDistance / backDuration;
                this.vx = -(dx / dist) * this.preLaunchSpeed;
                this.vy = -(dy / dist) * this.preLaunchSpeed;
                this.homing = false;
                this.homingTarget = null;
                this.homingDuration = -1;
                this.afterImageTrail = true;
            }
        }

        if (this.preLaunchTimer > 0) {
            this.preLaunchTimer--;
            if (this.preLaunchTimer <= 0) {
                let target = null;
                if (playerInsideConstruction) {
                    target = getCastleOrCurrentTargetCenter();
                } else if (currentMonster) {
                    target = { x: currentMonster.x + currentMonster.width / 2, y: currentMonster.y + currentMonster.height / 2 };
                }
                const targetX = target ? target.x : this.preLaunchTargetX || this.x + 300;
                const targetY = target ? target.y : this.preLaunchTargetY || this.y;
                const dx = targetX - this.x;
                const dy = targetY - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const launchSpeed = 12;
                this.vx = (dx / dist) * launchSpeed;
                this.vy = (dy / dist) * launchSpeed;
                this.homing = true;
                this.homingTarget = getCastleOrCurrentHomingTarget();
                this.homingStrength = 0.14;
                this.homingDuration = 180;
                this.targetMonsterX = null;
                this.targetMonsterY = null;
            }
        }
        
        // Se está em delay, não se move ainda
        if (this.delayTimer > 0) { 
            this.delayTimer--;
            this.vx = 0;
            this.vy = 0;
            if (this.shakeTimer > 0) this.shakeTimer -= 1;
            return;
        }
        
        // Restaurar velocidade após o delay
        if (this.delayTimer === 0 && this.delayDuration > 0) { 
            this.vx = this.savedVx;
            this.vy = this.savedVy;
            this.delayDuration = 0;
        }
        
        if (this.style === 'bowArrow' && this.ricochetActive && this.homing && (!this.homingTarget || this.homingTarget.owner !== 'monster' || !projectiles.includes(this.homingTarget))) {
            let nextTarget = null;
            let closestDist = Infinity;
            try {
                const playerCenterX = (player.x || 0) + (player.width || 0) / 2;
                const playerCenterY = (player.y || 0) + (player.height || 0) / 2;
                for (let k = 0; k < projectiles.length; k++) {
                    const other = projectiles[k];
                    if (!other || other === this || other.owner !== 'monster') continue;
                    const dx2 = other.x - playerCenterX;
                    const dy2 = other.y - playerCenterY;
                    const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                    if (dist2 < closestDist) {
                        closestDist = dist2;
                        nextTarget = other;
                    }
                }
            } catch (e) {}
            if (nextTarget) {
                this.homingTarget = nextTarget;
            }
        }
        if (this.homing && this.homingTarget && this.homingDuration !== 0) {
            const tx = this.homingTarget.x + (this.homingTarget.width || 0) / 2;
            const ty = this.homingTarget.y + (this.homingTarget.height || 0) / 2;
            const dx = tx - this.x;
            const dy = ty - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy) || 1;
            const desiredVx = (dx / dist) * speed;
            const desiredVy = (dy / dist) * speed;
            this.vx += (desiredVx - this.vx) * this.homingStrength;
            this.vy += (desiredVy - this.vy) * this.homingStrength;
            if (this.homingDuration > 0) {
                this.homingDuration -= 1;
            }
        }

        if (this.lifetime !== null) {
            this.lifetime -= 1;
            if (this.lifetime <= 0 && !this.immortal) {
                this.traveled = this.maxDistance + 1;
            }
        }

        const ts = timeScale || 1;
        const projectileTs = timeScale < 1 ? Math.max(0.75, timeScale * 0.85) : 1;
        this.x += this.vx * projectileTs;
        this.y += this.vy * projectileTs;
        this.traveled += Math.sqrt(this.vx * this.vx + this.vy * this.vy) * projectileTs;
        this.rotation += this.rotationSpeed * ts;

        // Rastrear se o projétil está fora da viewport visível; só remover após offscreenLimit
        try {
            const onScreen = this.x >= cameraX && this.x <= cameraX + viewportWidth && this.y >= cameraY && this.y <= cameraY + viewportHeight;
            if (onScreen) {
                this.offscreenTimer = 0;
            } else {
                this.offscreenTimer++;
            }
        } catch (e) {
            // variáveis de viewport podem não estar definidas durante inicialização; ignore
        }

        if (this.afterImageTrail) {
            this.afterImageTimer--;
            if (this.afterImageTimer <= 0) {
                this.afterImageTimer = this.afterImageInterval;
                spawnAfterImage({
                    kind: 'projectile',
                    x: this.x,
                    y: this.y,
                    size: this.size,
                    color: this.color,
                    style: this.style,
                    life: 12,
                    maxLife: 12,
                    baseAlpha: 0.22
                });
            }
        }

        if (this.shakeTimer > 0) {
            this.shakeTimer -= 1;
        }
    }

    draw() {
        ctx.save();
        const shakeX = this.shakeTimer > 0 ? (Math.random() * 2 - 1) * this.shakeIntensity : 0;
        const shakeY = this.shakeTimer > 0 ? (Math.random() * 2 - 1) * this.shakeIntensity : 0;
        ctx.translate(shakeX, shakeY);

        // If this projectile is being pulled by a hurricane, render it at 50% opacity
        if (this.pulledByHurricane) ctx.globalAlpha = 0.5;
        const angle = Math.atan2(this.vy, this.vx);
        const style = this.style || '';

        if (this.projectileEmoji) {
            ctx.translate(this.x, this.y);
            ctx.font = `${Math.max(14, this.size * 2.6)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            ctx.shadowBlur = 10;
            ctx.fillText(this.projectileEmoji, 0, 0);
            ctx.restore();
            return;
        }

        if (style === 'tankOrbit') {
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size + 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size + 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            return;
        }

        if (style === 'tankCounter') {
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size + 5, 0, Math.PI * 2);
            ctx.stroke();

            for (let i = 0; i < 5; i++) {
                const a = (Math.PI * 2 * i) / 5;
                const px = this.x + Math.cos(a) * (this.size + 10);
                const py = this.y + Math.sin(a) * (this.size + 10);
                ctx.beginPath();
                ctx.arc(px, py, 1.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.fill();
            }
            ctx.restore();
            return;
        }

        if (style === 'spinAttack') {
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 24;
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const a = (Math.PI * 2 * i) / 5;
                ctx.lineTo(Math.cos(a) * this.size * 2.1, Math.sin(a) * this.size * 2.1);
                ctx.lineTo(Math.cos(a + Math.PI / 5) * this.size * 0.8, Math.sin(a + Math.PI / 5) * this.size * 0.8);
            }
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, this.size * 0.9, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.restore();
            return;
        }

        if (style === 'bowArrow') {
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 18;

            ctx.beginPath();
            ctx.moveTo(-this.size * 1.8, -this.size * 0.26);
            ctx.lineTo(this.size * 1.2, -this.size * 0.26);
            ctx.lineTo(this.size * 1.2, -this.size * 0.62);
            ctx.lineTo(this.size * 1.95, 0);
            ctx.lineTo(this.size * 1.2, this.size * 0.62);
            ctx.lineTo(this.size * 1.2, this.size * 0.26);
            ctx.lineTo(-this.size * 1.8, this.size * 0.26);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.95)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(-this.size * 1.42, -this.size * 0.12);
            ctx.lineTo(this.size * 0.88, -this.size * 0.12);
            ctx.moveTo(-this.size * 1.42, this.size * 0.12);
            ctx.lineTo(this.size * 0.88, this.size * 0.12);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(-this.size * 1.72, -this.size * 0.7);
            ctx.lineTo(-this.size * 1.22, -this.size * 0.24);
            ctx.moveTo(-this.size * 1.72, this.size * 0.7);
            ctx.lineTo(-this.size * 1.22, this.size * 0.24);
            ctx.stroke();

            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.arc(this.size * 0.75, 0, this.size * 0.16, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }

        if (style === 'swarmBug') {
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            ctx.shadowColor = 'rgba(190, 110, 255, 0.98)';
            ctx.shadowBlur = 30;

            // Corpo do inseto roxo
            const swarmBody = ctx.createRadialGradient(0, 0, this.size * 0.14, 0, 0, this.size * 1.1);
            swarmBody.addColorStop(0, 'rgba(255, 235, 255, 0.98)');
            swarmBody.addColorStop(0.35, this.color || '#9c4fff');
            swarmBody.addColorStop(1, 'rgba(120, 45, 190, 0.85)');
            ctx.fillStyle = swarmBody;
            ctx.beginPath();
            ctx.ellipse(0, 0, this.size * 1.05, this.size * 0.65, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(205, 145, 255, 0.95)';
            for (let i = -1; i <= 1; i++) {
                ctx.beginPath();
                ctx.ellipse(i * this.size * 0.34, 0, this.size * 0.34, this.size * 0.2, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            // Cabeça pequena
            ctx.fillStyle = 'rgba(225, 165, 255, 0.98)';
            ctx.beginPath();
            ctx.arc(-this.size * 0.95, 0, this.size * 0.42, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.75)';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Ferrão
            ctx.fillStyle = 'rgba(35, 8, 65, 0.95)';
            ctx.beginPath();
            ctx.moveTo(this.size * 0.92, 0);
            ctx.lineTo(this.size * 1.55, -this.size * 0.18);
            ctx.lineTo(this.size * 1.55, this.size * 0.18);
            ctx.closePath();
            ctx.fill();

            // Listras roxas escuras
            ctx.strokeStyle = 'rgba(50, 10, 80, 0.96)';
            ctx.lineWidth = 2;
            for (let s = -1; s <= 1; s++) {
                ctx.beginPath();
                ctx.ellipse(s * this.size * 0.2, 0, this.size * 0.63, this.size * 0.27, 0, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Asas translúcidas roxas
            ctx.fillStyle = 'rgba(210, 180, 255, 0.3)';
            ctx.strokeStyle = 'rgba(200, 160, 255, 0.45)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(this.size * 0.18, -this.size * 0.5, this.size * 0.48, this.size * 0.24, -0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(this.size * 0.18, this.size * 0.52, this.size * 0.48, this.size * 0.24, 0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Olhos
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.beginPath();
            ctx.arc(-this.size * 1.05, -this.size * 0.14, this.size * 0.12, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(-this.size * 1.05, this.size * 0.14, this.size * 0.12, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
            return;
        }

        if (style === 'gunBullet') {
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 16;
            ctx.beginPath();
            ctx.moveTo(-this.size * 1.2, -this.size * 0.55);
            ctx.lineTo(this.size * 0.9, -this.size * 0.55);
            ctx.arc(this.size * 0.9, 0, this.size * 0.55, -Math.PI / 2, Math.PI / 2);
            ctx.lineTo(-this.size * 1.2, this.size * 0.55);
            ctx.arc(-this.size * 1.2, 0, this.size * 0.55, Math.PI / 2, -Math.PI / 2);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.75)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-this.size * 1.3, 0);
            ctx.lineTo(-this.size * 2.3, 0);
            ctx.stroke();
            ctx.restore();
            return;
        }

        if (style === 'yarnBall') {
            ctx.translate(this.x, this.y);
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(0, 0, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = Math.max(1, this.size * 0.12);
            ctx.beginPath();
            ctx.arc(0, 0, this.size * 0.72, 0, Math.PI * 1.4);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, this.size * 0.5, Math.PI * 0.3, Math.PI * 1.7);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-this.size * 0.45, -this.size * 0.2);
            ctx.quadraticCurveTo(0, -this.size * 0.6, this.size * 0.45, -this.size * 0.2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-this.size * 0.4, this.size * 0.25);
            ctx.quadraticCurveTo(0, this.size * 0.65, this.size * 0.4, this.size * 0.25);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.24)';
            ctx.beginPath();
            ctx.arc(-this.size * 0.18, -this.size * 0.12, this.size * 0.28, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }

        if (style === 'staffOrb') {
            ctx.translate(this.x, this.y);
            const grad = ctx.createRadialGradient(0, 0, this.size * 0.2, 0, 0, this.size);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.28, this.color);
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 24;
            ctx.beginPath();
            ctx.arc(0, 0, this.size, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 1.8;
            for (let i = 0; i < 4; i++) {
                const a = i * Math.PI / 2;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * this.size * 0.35, Math.sin(a) * this.size * 0.35);
                ctx.lineTo(Math.cos(a) * this.size * 1.25, Math.sin(a) * this.size * 1.25);
                ctx.stroke();
            }

            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.arc(this.size * 0.22, -this.size * 0.12, this.size * 0.16, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }

        if (style === 'coneShard') {
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.moveTo(-this.size * 0.5, -this.size * 1.2);
            ctx.lineTo(this.size * 1.6, 0);
            ctx.lineTo(-this.size * 0.5, this.size * 1.2);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
            return;
        }

        if (style === 'tornadoLance') {
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            ctx.shadowColor = 'rgba(170, 235, 255, 0.9)';
            ctx.shadowBlur = 22;
            const shaftLength = Math.max(18, this.size * 10);
            const shaftWidth = Math.max(2.8, this.size * 0.5);

            const shaftGrad = ctx.createLinearGradient(-shaftLength * 0.15, 0, shaftLength + this.size * 1.6, 0);
            shaftGrad.addColorStop(0, 'rgba(105, 175, 255, 0.35)');
            shaftGrad.addColorStop(0.3, 'rgba(130, 215, 255, 0.95)');
            shaftGrad.addColorStop(0.6, 'rgba(210, 245, 255, 1)');
            shaftGrad.addColorStop(1, 'rgba(90, 150, 255, 0.95)');
            ctx.fillStyle = shaftGrad;
            ctx.beginPath();
            ctx.moveTo(-shaftLength * 0.15, -shaftWidth);
            ctx.lineTo(shaftLength, -shaftWidth);
            ctx.lineTo(shaftLength + this.size * 1.6, 0);
            ctx.lineTo(shaftLength, shaftWidth);
            ctx.lineTo(-shaftLength * 0.15, shaftWidth);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(-shaftLength * 0.15, -shaftWidth);
            ctx.lineTo(shaftLength, -shaftWidth);
            ctx.lineTo(shaftLength + this.size * 1.6, 0);
            ctx.lineTo(shaftLength, shaftWidth);
            ctx.lineTo(-shaftLength * 0.15, shaftWidth);
            ctx.closePath();
            ctx.stroke();

            ctx.fillStyle = 'rgba(220, 245, 255, 0.93)';
            ctx.beginPath();
            ctx.moveTo(shaftLength * 0.55, -shaftWidth * 1.2);
            ctx.lineTo(shaftLength * 0.6, -shaftWidth);
            ctx.lineTo(shaftLength * 0.75, 0);
            ctx.lineTo(shaftLength * 0.6, shaftWidth);
            ctx.lineTo(shaftLength * 0.55, shaftWidth * 1.2);
            ctx.lineTo(shaftLength * 0.35, shaftWidth * 0.6);
            ctx.lineTo(shaftLength * 0.35, -shaftWidth * 0.6);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.beginPath();
            ctx.moveTo(shaftLength * 0.72, 0);
            ctx.lineTo(shaftLength * 0.51, -shaftWidth * 1.05);
            ctx.lineTo(shaftLength * 0.51, shaftWidth * 1.05);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = 'rgba(170,235,255,0.75)';
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(shaftLength * 0.25, 0);
            ctx.quadraticCurveTo(shaftLength * 0.4, -shaftWidth * 3.5, shaftLength * 0.55, -shaftWidth * 1.2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(shaftLength * 0.25, 0);
            ctx.quadraticCurveTo(shaftLength * 0.4, shaftWidth * 3.5, shaftLength * 0.55, shaftWidth * 1.2);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(255,255,255,0.75)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(-shaftLength * 0.15, -shaftWidth);
            ctx.lineTo(-shaftLength * 0.25, 0);
            ctx.lineTo(-shaftLength * 0.15, shaftWidth);
            ctx.stroke();

            ctx.restore();
            return;
        }

        if (style === 'tornadoLanceCopy') {
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            ctx.shadowColor = 'rgba(0, 255, 255, 0.95)';
            ctx.shadowBlur = 28;
            const shaftLength = Math.max(18, this.size * 10);
            const shaftWidth = Math.max(2.8, this.size * 0.5);

            const shaftGrad = ctx.createLinearGradient(-shaftLength * 0.15, 0, shaftLength + this.size * 1.6, 0);
            shaftGrad.addColorStop(0, 'rgba(0, 200, 255, 0.35)');
            shaftGrad.addColorStop(0.3, 'rgba(0, 255, 255, 0.98)');
            shaftGrad.addColorStop(0.6, 'rgba(100, 255, 255, 1)');
            shaftGrad.addColorStop(1, 'rgba(0, 220, 255, 0.98)');
            ctx.fillStyle = shaftGrad;
            ctx.beginPath();
            ctx.moveTo(-shaftLength * 0.15, -shaftWidth);
            ctx.lineTo(shaftLength, -shaftWidth);
            ctx.lineTo(shaftLength + this.size * 1.6, 0);
            ctx.lineTo(shaftLength, shaftWidth);
            ctx.lineTo(-shaftLength * 0.15, shaftWidth);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = 'rgba(100,255,255,0.95)';
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(-shaftLength * 0.15, -shaftWidth);
            ctx.lineTo(shaftLength, -shaftWidth);
            ctx.lineTo(shaftLength + this.size * 1.6, 0);
            ctx.lineTo(shaftLength, shaftWidth);
            ctx.lineTo(-shaftLength * 0.15, shaftWidth);
            ctx.closePath();
            ctx.stroke();

            ctx.fillStyle = 'rgba(150, 255, 255, 0.96)';
            ctx.beginPath();
            ctx.moveTo(shaftLength * 0.55, -shaftWidth * 1.2);
            ctx.lineTo(shaftLength * 0.6, -shaftWidth);
            ctx.lineTo(shaftLength * 0.75, 0);
            ctx.lineTo(shaftLength * 0.6, shaftWidth);
            ctx.lineTo(shaftLength * 0.55, shaftWidth * 1.2);
            ctx.lineTo(shaftLength * 0.35, shaftWidth * 0.6);
            ctx.lineTo(shaftLength * 0.35, -shaftWidth * 0.6);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = 'rgba(200,255,255,0.95)';
            ctx.beginPath();
            ctx.moveTo(shaftLength * 0.72, 0);
            ctx.lineTo(shaftLength * 0.51, -shaftWidth * 1.05);
            ctx.lineTo(shaftLength * 0.51, shaftWidth * 1.05);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = 'rgba(0,255,255,0.85)';
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.moveTo(shaftLength * 0.25, 0);
            ctx.quadraticCurveTo(shaftLength * 0.4, -shaftWidth * 3.5, shaftLength * 0.55, -shaftWidth * 1.2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(shaftLength * 0.25, 0);
            ctx.quadraticCurveTo(shaftLength * 0.4, shaftWidth * 3.5, shaftLength * 0.55, shaftWidth * 1.2);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(100,255,255,0.9)';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(-shaftLength * 0.15, -shaftWidth);
            ctx.lineTo(-shaftLength * 0.25, 0);
            ctx.lineTo(-shaftLength * 0.15, shaftWidth);
            ctx.stroke();

            ctx.restore();
            return;
        }

            if (style === 'tornadoHurricane') {
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.shadowColor = 'rgba(170, 235, 255, 0.4)';
            ctx.shadowBlur = 20;
            const outerRadius = this.size * 1.55;
            const swirlRadius = this.size * 1.18;
            const coreRadius = this.size * 0.9;

            const baseGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, outerRadius);
            baseGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
            baseGrad.addColorStop(0.2, 'rgba(190, 240, 255, 0.9)');
            baseGrad.addColorStop(0.5, 'rgba(125, 205, 255, 0.85)');
            baseGrad.addColorStop(1, 'rgba(20, 75, 170, 0.18)');
            ctx.fillStyle = baseGrad;
            ctx.beginPath();
            ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 3.2;
            ctx.beginPath();
            ctx.arc(0, 0, this.size * 1.05, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(180, 235, 255, 0.9)';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.arc(0, 0, swirlRadius, -Math.PI * 0.35, Math.PI * 0.85);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, swirlRadius + this.size * 0.12, Math.PI * 0.05, Math.PI * 1.5);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(255,255,255,0.75)';
            ctx.lineWidth = 2.4;
            for (let i = 0; i < 4; i++) {
                const angle = i * Math.PI / 2 + (this.x + this.y) * 0.004;
                ctx.beginPath();
                ctx.arc(Math.cos(angle) * this.size * 0.35, Math.sin(angle) * this.size * 0.35, this.size * 0.7, angle - 0.7, angle + 0.7);
                ctx.stroke();
            }

            const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreRadius);
            coreGrad.addColorStop(0, 'rgba(255,255,255,0.98)');
            coreGrad.addColorStop(0.45, 'rgba(210, 245, 255, 0.92)');
            coreGrad.addColorStop(1, 'rgba(135, 205, 255, 0.55)');
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(0, 0, coreRadius * 0.55, 0, Math.PI * 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(-coreRadius * 0.26, -coreRadius * 0.08);
            ctx.quadraticCurveTo(-coreRadius * 0.08, -coreRadius * 0.3, coreRadius * 0.35, -coreRadius * 0.18);
            ctx.stroke();

            const boostRadius = this.boostRadius || (outerRadius + 16);
            ctx.strokeStyle = 'rgba(140, 230, 255, 0.35)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, boostRadius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(-coreRadius * 0.15, coreRadius * 0.3);
            ctx.quadraticCurveTo(coreRadius * 0.15, coreRadius * 0.08, coreRadius * 0.38, coreRadius * 0.04);
            ctx.stroke();

            ctx.restore();
            return;
        }

        if (style === 'toothBolt') {
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            ctx.fillStyle = '#f8f8f2';
            ctx.shadowColor = 'rgba(255,255,255,0.2)';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(-this.size * 0.35, -this.size * 0.9);
            ctx.lineTo(-this.size * 0.1, this.size * 1.05);
            ctx.lineTo(0, this.size * 0.85);
            ctx.lineTo(this.size * 0.1, this.size * 1.05);
            ctx.lineTo(this.size * 0.35, -this.size * 0.9);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(120,120,120,0.85)';
            ctx.lineWidth = 1.6;
            ctx.stroke();

            ctx.fillStyle = 'rgba(220,220,210,0.7)';
            ctx.beginPath();
            ctx.moveTo(-this.size * 0.25, -this.size * 0.75);
            ctx.lineTo(0, -this.size * 0.2);
            ctx.lineTo(this.size * 0.25, -this.size * 0.75);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = 'rgba(100,100,100,0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-this.size * 0.05, -this.size * 0.35);
            ctx.lineTo(0, -this.size * 0.3);
            ctx.lineTo(this.size * 0.05, -this.size * 0.35);
            ctx.stroke();
            ctx.restore();
            return;
        }

        if (style === 'shooterBolt') {
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.65)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 1.5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            return;
        }

        if (style === 'tankShell') {
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 1.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
            return;
        }

        if (style === 'tankShock') {
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 1.05, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI * 2 * i) / 6;
                ctx.beginPath();
                ctx.moveTo(this.x + Math.cos(a) * this.size * 1.3, this.y + Math.sin(a) * this.size * 1.3);
                ctx.lineTo(this.x + Math.cos(a) * this.size * 1.8, this.y + Math.sin(a) * this.size * 1.8);
                ctx.stroke();
            }
            ctx.restore();
            return;
        }

        if (style === 'swarmPod') {
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 1.8;
            ctx.stroke();
            for (let i = 0; i < 3; i++) {
                const a = (Math.PI * 2 * i) / 3;
                ctx.beginPath();
                ctx.arc(this.x + Math.cos(a) * this.size * 0.6, this.y + Math.sin(a) * this.size * 0.6, 1.8, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
            }
            ctx.restore();
            return;
        }

        if (style === 'casterShard' || style === 'casterBurst') {
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 22;
            ctx.beginPath();
            ctx.moveTo(0, -this.size * 1.4);
            ctx.lineTo(this.size * 0.7, -this.size * 0.3);
            ctx.lineTo(this.size * 0.2, this.size * 1.4);
            ctx.lineTo(-this.size * 0.6, this.size * 0.8);
            ctx.lineTo(-this.size * 0.4, -this.size * 0.8);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.88)';
            ctx.lineWidth = 1.8;
            ctx.stroke();
            if (style === 'casterBurst') {
                ctx.strokeStyle = 'rgba(255,255,255,0.25)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, this.size * 1.8, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
            return;
        }

        if (style === 'crowBolt') {
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);

            const isAvian = this.monsterType === 'avianightmare';
            const sizeMult = isAvian ? 1.1 : 1;
            const fillCol = isAvian ? '#7fd6ff' : '#2e3646';
            const glowCol = isAvian ? 'rgba(125,210,255,0.98)' : 'rgba(110,165,255,0.95)';
            const strokeAlpha = isAvian ? 0.95 : 0.22;
            const innerFill = isAvian ? 'rgba(255,255,255,0.95)' : 'rgba(150,185,235,0.45)';

            ctx.fillStyle = fillCol;
            ctx.shadowColor = glowCol;
            ctx.shadowBlur = isAvian ? 36 : 28;
            ctx.beginPath();
            ctx.moveTo(-this.size * 0.45 * sizeMult, 0);
            ctx.lineTo(0, -this.size * 1.12 * sizeMult);
            ctx.lineTo(this.size * 0.45 * sizeMult, 0);
            ctx.lineTo(this.size * 0.28 * sizeMult, this.size * 0.35 * sizeMult);
            ctx.lineTo(this.size * 0.18 * sizeMult, this.size * 0.2 * sizeMult);
            ctx.lineTo(-this.size * 0.18 * sizeMult, this.size * 0.2 * sizeMult);
            ctx.lineTo(-this.size * 0.28 * sizeMult, this.size * 0.35 * sizeMult);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = `rgba(255,255,255,${strokeAlpha})`;
            ctx.lineWidth = 2.2;
            ctx.stroke();

            ctx.fillStyle = innerFill;
            ctx.beginPath();
            ctx.moveTo(-this.size * 0.18 * sizeMult, -this.size * 0.25 * sizeMult);
            ctx.lineTo(0, -this.size * 0.55 * sizeMult);
            ctx.lineTo(this.size * 0.18 * sizeMult, -this.size * 0.25 * sizeMult);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, this.size * 0.95 * sizeMult);
            ctx.lineTo(-this.size * 0.24 * sizeMult, this.size * 0.78 * sizeMult);
            ctx.lineTo(0, this.size * 0.64 * sizeMult);
            ctx.lineTo(this.size * 0.24 * sizeMult, this.size * 0.78 * sizeMult);
            ctx.closePath();
            ctx.fillStyle = isAvian ? 'rgba(30,40,50,0.98)' : 'rgba(56,67,92,0.92)';
            ctx.fill();

            ctx.strokeStyle = isAvian ? 'rgba(255,240,200,0.95)' : 'rgba(120,180,255,0.5)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(0, -this.size * 1.12 * sizeMult);
            ctx.lineTo(0, this.size * 0.95 * sizeMult);
            ctx.stroke();

            ctx.restore();
            return;
        }

        if (style === 'smartBolt') {
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            ctx.fillStyle = '#8de8ff';
            ctx.shadowColor = 'rgba(100, 220, 255, 0.9)';
            ctx.shadowBlur = 22;
            ctx.beginPath();
            ctx.moveTo(-this.size * 0.35, -this.size * 0.25);
            ctx.lineTo(0, -this.size * 1.2);
            ctx.lineTo(this.size * 0.35, -this.size * 0.25);
            ctx.lineTo(this.size * 0.15, this.size * 0.4);
            ctx.lineTo(-this.size * 0.15, this.size * 0.4);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 1.8;
            ctx.stroke();

            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.beginPath();
            ctx.arc(0, -this.size * 0.35, this.size * 0.18, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }

        if (style === 'basicFire') {
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.beginPath();
            ctx.arc(this.x, this.y - this.size * 0.3, this.size * 0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,200,0,0.5)';
            ctx.beginPath();
            ctx.moveTo(this.x - this.size * 1.2, this.y + this.size * 0.1);
            ctx.lineTo(this.x - this.size * 1.8, this.y + this.size * 0.4);
            ctx.lineTo(this.x - this.size * 1.2, this.y + this.size * 0.7);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            return;
        }

        if (style === 'casterFlameCircle' || style === 'casterFlameSpiral' || style === 'casterFlameRing' || style === 'casterFlameVolley' || style === 'casterShard' || style === 'casterBurst') {
            ctx.fillStyle = '#ff9e3c';
            ctx.shadowColor = '#ff9e3c';
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 0.9, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.beginPath();
            ctx.arc(this.x - this.size * 0.24, this.y - this.size * 0.26, this.size * 0.28, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }

        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = Math.min(24, this.size * 3);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = Math.max(1, this.size * 0.15);
        ctx.stroke();
        ctx.restore();
    }

    isAlive() {
        if (this.style === 'tornadoHurricane') {
            return this.lifetime === null || this.lifetime > 0;
        }
        // Se saiu dos limites do mapa, remover imediatamente
        const withinMap = this.x > 0 && this.x < gameWidth && this.y > 0 && this.y < gameHeight;
        const offscreenOk = (typeof this.offscreenTimer === 'undefined') || (this.offscreenTimer <= (this.offscreenLimit || 60));
        return this.traveled < this.maxDistance && withinMap && offscreenOk;
    }
}

class Player {
    constructor() {
        this.width = 12.5;
        this.height = 12.5;
        const mapCenter = getMapCircle();
        this.x = mapCenter.centerX - this.width / 2;
        this.y = mapCenter.centerY - this.height / 2;
        this.speed = 3;
        this.health = 100;
        this.maxHealth = 100;
        this.attackCooldown = 0;
        this.attacking = false;
        this.meleeAttacking = false;
        this.coneAttacking = false;
        this.meleeTimer = 0;
        this.meleeHitRegistered = false;
        this.coneHitRegistered = false;
        this.attackRange = 80;
        this.baseDamage = 1.0;
        this.coneDirection = 0;
        this.coneAngle = Math.PI / 3;
        this.coneRange = 0;
        this.coneAttackCount = 0;
        this.lateShots = 0;
        this.pendingLateShots = [];
        this.critChance = 0.1;
        this.critDamage = 0.5;
        this.weaponDamage = 0;
        this.cooldownReduction = 0;
        this.damageReduction = 0;
        this.healthRegen = 0;
        this.regenTimer = 0;
        this.extraProjectiles = 0;
        this.spreadProjectiles = 0;
        this.attackMove = 0;
        this.parryChargePerHit = 0;
        this.parryChargeAccumulator = 0;
        this.parryDefenseBonus = 0;
        this.parryHealOnUse = 0;
        this.parryHealOverTime = 0;
        this.parryHealOverTimeTimer = 0;
        this.parryConfusionChance = 0;
        this.parryConfusionDuration = 0;
        this.spinAttackLevel = 0;
        this.spinAttack = false;
        this.spinAttackCharges = false;
        this.attackSpeed = 0;
        this.projectileSpeedBonus = 0;
        this.bombStunPerHitSeconds = 0;
        this.bombFragmentConfusionSeconds = 0;
        this.bombFragmentConfusionLevels = 0;
        this.bombFragmentCountBonus = 0;
        this.bombBurnDamagePerSecond = 0;
        this.bombBurnDurationSeconds = 3;
        this.bombFragmentSpeedBonus = 0;
        this.bombFragmentPierce = 0;
        this.bombThrowSpeedBonus = 0;
        this.bombFireZoneDurationBonusSeconds = 0;
        this.bombFireZoneMoveSpeedBonus = 0;
        this.bombCooldownMoveSpeedBonus = 0;
        this.bombFireZoneRadiusBonus = 0;
        this.bombFragmentSizeBonus = 0;
        this.bombCooldown = 0;
        this.grenadeCooldown = 0;
        this.gunAmmo = 12;
        this.gunMaxAmmo = 12;
        this.gunReloadCooldown = 0;
        this.gunReloadCooldownMax = 120;
        this.gunBurstFire = 0;
        this.gunExplosiveAmmo = 0;
        this.staffHomingBurst = 0;
        this.gunReloadHitCount = 0;
        this.gunReloadHitMax = 13;
        // Monster-based passives
        this.shooterMachineGunUnlocked = false;
        this.shooterMachineGunCount = 0;
        this.swarmNubeUnlocked = false;
        this.swarmNubeCount = 0;
        this.casterPortalUnlocked = false;
        this.casterPortalCount = 0;
        this.avianTrackerUnlocked = false;
        this.avianTrackerCount = 0;
        this.smartRicochetUnlocked = false;
        this.smartRicochetCount = 0;
        this.simpleExplosiveUnlocked = false;
        this.simpleExplosiveCount = 0;
        this.crocFreezerUnlocked = false;
        this.crocFreezerCount = 0;
        this.tankImpulseUnlocked = false;
        this.tankImpulseCount = 0;
        this.gunReloadHitsToTrigger = 12;
        this.gunReloadInvulnCharges = 0;
        this.gunReloadFlashTicker = 0;
        this.gunReloadMoveBonus = 0;
        this.gunReloadAfterImageTimer = 0;
        this.gunReloadMoveBonusMax = 1.8;
        this.gunReloadMoveBonusRate = 0.04;
        this.gunReloadMoveBonusDecay = 0.12;
        this.bowDashCharges = 2;
        this.bowDashMaxCharges = 2;
        this.bowCritChance = 0;
        this.bowRicochet = 0;
        this.bowFirstShot = 0;
        this.bowFirstShotUsed = false;
        this.bowReadyStance = 0;
        this.dashTimer = 0;
        this.dashVectorX = 0;
        this.dashVectorY = 0;
        this.dashHasHitMonster = false;
        this.dashSpeed = 12;
        this.dashRadius = 32;
        this.postDashInvulnTimer = 0;
        this.weapon = null;
        this.meleeCritPercent = 0;
        this.coneCritPercent = 0;
        this.meleeDirection = 0;
        this.meleeAngle = 160 * Math.PI / 180;
        this.swordAimAngle = 0;
        this.swordAimOffsetAngle = 0;
        this.swordAimAnimationPhase = null;
        this.swordAimAnimationTimer = 0;
        this.swordAimAnimationDuration = 0;
        this.swordAimAnimationBackDuration = 0;
        this.swordAimAnimationHoldTimer = 0;
        this.swordAimAnimationTargetAngle = 0;
        this.swordAlwaysActive = true;
        this.swordThickness = 18;
        this.swordDashCooldown = 0;
        this.swordDashCooldownMax = 14;

        this.castleBoneUnlocked = false;
        this.castleBoneHitCounter = 0;
        this.castleBoneOrbiters = [];

        this.swordAimOffsetTimer = 0;
        this.swordHitCooldown = 0;
        this.swordComboCount = 0;
        this.swordComboTimer = 0;
        this.staffOrbitAngle = 0;
        this.staffOrbitSpeed = 0.018;
        this.shakeTimer = 0;
        this.impactShakeTimer = 0;
        this.parryCooldown = 0;
        this.parryMax = 240;
        this.tornadoCharge = 0;
        this.tornadoChargeMax = 20;
        this.tornadoBurst = null;
        this.hurricaneCooldown = 0;
        this.hurricaneCooldownMax = 360;
        this.tankHitCount = 0;
        this.tankHitWindow = 0;
        this.currentMonsterHitCount = 0;
        this.autoAttackEnabled = false;
        // Staff charge mechanic: acumula cargas quando tentam spawnar >5 orbs
        this.staffCharge = 0;
        this.staffChargeMax = 15; // preencher a barra requer 15 cargas
        this.staffChargeBurstCount = 5; // quando cheio, solta 5 projéteis pequenos
        this.staffBurstCooldown = 0;
        this.staffBurstCooldownMax = 120; // ~2 segundos a 60fps
        // Status negativos
        this.poisonTimer = 0; // frames remaining
        this.poisonTickTimer = 0; // frames until next poison tick
        this.poisonDamagePerTick = 0; // damage applied each tick
        this.damageOutputMultiplier = 1.0;
        this.stunTimer = 0;
        this.confusedLevel = 0;
        this.confusedTimer = 0;
        this.mansionGhostCopyUnlocked = false;
        this.mansionGhostCopyChance = 0.33;
        this.mansionGhostCopyDamageRatio = 0.5;
        this.mansionGhostCopyStunFrames = 24;
        
        // Sistema de aceleração por cooldown de dash
        this.dashAccelerationTimer = 0; // contador para 0.5s (30 frames)
        this.dashAccelerationSpeedBonus = 0; // bônus acumulado
        
        // Sistema de bônus por alinhamento com espada
        this.swordAlignmentTimer = 0; // contador para 2s (120 frames)
        this.swordAlignmentSpeedBonus = 0; // bônus de velocidade (máx 75%)
        this.lastMoveDirX = 0; // última direção de movimento
        this.lastMoveDirY = 0;
        
        // Sistema de Investida Cortante com múltiplos dashes
        this.slashDashQueue = 0; // número de dashes pendentes da investida cortante
        this.slashDashCounter = 0; // contador atual de dashes executados
        this.slashDashInvulnTimer = 0; // invulnerabilidade durante dash
        this.slashDashIsNormal = false; // true quando os dashes da investida são dashes normais (1 por nível)
    }

    startSwordAimAnimation(targetAngle, duration = 6, returnDuration = null) {
        this.swordAimAnimationTargetAngle = targetAngle;
        this.swordAimAnimationDuration = Math.max(1, duration);
        this.swordAimAnimationBackDuration = returnDuration !== null ? Math.max(1, returnDuration) : Math.max(1, Math.round(duration * 2.0));
        this.swordAimAnimationTimer = this.swordAimAnimationDuration;
        this.swordAimAnimationPhase = 'out';
        this.swordAimAnimationHoldTimer = 0;
        this.swordAimOffsetAngle = 0;

        frameFreeze = Math.max(frameFreeze || 0, 6);
        screenShakeTimer = 9;

        if (currentMonster) {
            const px = this.x + this.width / 2;
            const py = this.y + this.height / 2;
            const mx = currentMonster.x + currentMonster.width / 2;
            const my = currentMonster.y + currentMonster.height / 2;
            const dx = mx - px;
            const dy = my - py;
            const dist = Math.hypot(dx, dy) || 1;
            const pushDistance = 180;
            if (dist < pushDistance * 1.4) {
                const nx = dx / dist;
                const ny = dy / dist;
                const startX = currentMonster.x;
                const startY = currentMonster.y;
                const endX = Math.max(0, Math.min(currentMonster.x + nx * pushDistance, gameWidth - currentMonster.width));
                const endY = Math.max(0, Math.min(currentMonster.y + ny * pushDistance, gameHeight - currentMonster.height));
                currentMonster.x = endX;
                currentMonster.y = endY;
                currentMonster.stunTimer = Math.max(currentMonster.stunTimer, 30);
                const afterImageCount = 5;
                for (let j = 1; j <= afterImageCount; j++) {
                    const t = j / (afterImageCount + 1);
                    spawnAfterImage({
                        kind: 'monster',
                        x: startX + (endX - startX) * t,
                        y: startY + (endY - startY) * t,
                        width: currentMonster.width,
                        height: currentMonster.height,
                        type: currentMonster.type,
                        orbitalAngle: currentMonster.orbitalAngle || 0,
                        life: 18,
                        maxLife: 18,
                        baseAlpha: 0.38
                    });
                }
            }
        }
    }

    getFireZoneSpeedBonus() {
        if (!fireZones || !fireZones.length) return 0;
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const insideFireZone = fireZones.some((zone) => Math.hypot(centerX - zone.x, centerY - zone.y) <= zone.radius);
        return insideFireZone && this.bombFireZoneMoveSpeedBonus > 0 ? this.speed * this.bombFireZoneMoveSpeedBonus : 0;
    }

    getBombCooldownSpeedBonus() {
        if (!this || this.bombCooldown <= 0) return 0;
        return this.speed * this.bombCooldownMoveSpeedBonus;
    }

    getWeaponMountPoint(aimAngle = null) {
        const px = this.x + this.width / 2;
        const py = this.y + this.height / 2;
        const weapon = this.weapon;
        if (!weapon) {
            return { offsetX: 0, offsetY: 0, tipX: px, tipY: py, aimAngle: 0 };
        }

        const targetAngle = typeof aimAngle === 'number' ? aimAngle : (
            (typeof this.swordAimAngle === 'number' && isFinite(this.swordAimAngle)) ? this.swordAimAngle : 0
        );

        if (weapon.type === 'gun') {
            const offsetX = Math.cos(targetAngle) * 13;
            const offsetY = Math.sin(targetAngle) * 13;
            return {
                offsetX,
                offsetY,
                tipX: px + Math.cos(targetAngle) * 22,
                tipY: py + Math.sin(targetAngle) * 22,
                aimAngle: targetAngle
            };
        }

        if (weapon.type === 'bow') {
            const offsetX = Math.cos(targetAngle + 0.28) * 10;
            const offsetY = Math.sin(targetAngle + 0.28) * 10;
            return {
                offsetX,
                offsetY,
                tipX: px + Math.cos(targetAngle) * 24,
                tipY: py + Math.sin(targetAngle) * 24,
                aimAngle: targetAngle
            };
        }

        if (weapon.type === 'staff') {
            const orbitAngle = (this.staffOrbitAngle || 0) + Math.PI / 2;
            const radius = 16 + Math.sin((this.staffOrbitAngle || 0) * 1.4) * 2;
            const offsetX = Math.cos(orbitAngle) * radius;
            const offsetY = Math.sin(orbitAngle) * radius;
            const tipAngle = orbitAngle + Math.PI / 2;
            return {
                offsetX,
                offsetY,
                tipX: px + offsetX + Math.cos(tipAngle) * 18,
                tipY: py + offsetY + Math.sin(tipAngle) * 18,
                aimAngle: orbitAngle,
                orbitAngle,
                tipAngle
            };
        }

        if (weapon.type === 'grenade') {
            const offsetX = Math.cos(targetAngle) * 12;
            const offsetY = Math.sin(targetAngle) * 12;
            return {
                offsetX,
                offsetY,
                tipX: px + Math.cos(targetAngle) * 18,
                tipY: py + Math.sin(targetAngle) * 18,
                aimAngle: targetAngle
            };
        }

        return { offsetX: 0, offsetY: 0, tipX: px, tipY: py, aimAngle: targetAngle };
    }

    update(keys) {
        const ts = timeScale || 1;
        const prevX = this.x;
        const prevY = this.y;
        const interiorScale = getPlayerInteriorScale();
        if (this.swordDashCooldown > 0) this.swordDashCooldown--;
        
        // === Sistema de aceleração por cooldown de dash (Espada) ===
        if (this.weapon && this.weapon.type === 'sword') {
            if (this.swordDashCooldown > 0) {
                // Dash está em cooldown, acumula aceleração
                this.dashAccelerationTimer++;
                if (this.dashAccelerationTimer >= 30) { // 0.5s em 60fps
                    this.dashAccelerationSpeedBonus += 0.1; // +10%
                    this.dashAccelerationTimer = 0;
                }
            } else {
                // Dash está disponível, reseta aceleração
                this.dashAccelerationTimer = 0;
                this.dashAccelerationSpeedBonus = 0;
            }
        } else {
            // Não está com espada, reseta
            this.dashAccelerationTimer = 0;
            this.dashAccelerationSpeedBonus = 0;
        }
        
        if (this.weapon && this.weapon.type === 'staff') {
            this.staffOrbitAngle = (this.staffOrbitAngle + this.staffOrbitSpeed * ts) % (Math.PI * 2);
        }

        if (this.confusedTimer > 0) {
            this.confusedTimer--;
        }

        if (this.stunTimer > 0) {
            this.stunTimer--;
            this.dashTimer = 0;
            this.slashDashQueue = 0;
            this.slashDashCounter = 0;
            this.attackCooldown = Math.max(this.attackCooldown, 1);
        } else if (this.dashTimer > 0) {
            this.x += this.dashVectorX * this.dashSpeed * ts * interiorScale;
            this.y += this.dashVectorY * this.dashSpeed * ts * interiorScale;
            this.dashTimer--;

            if (this.dashTimer % 2 === 0) {
                const isSwordDash = this.weapon && this.weapon.type === 'sword';
                spawnAfterImage({
                    kind: 'player',
                    x: this.x,
                    y: this.y,
                    width: this.width,
                    height: this.height,
                    life: isSwordDash ? 16 : 14,
                    maxLife: isSwordDash ? 16 : 14,
                    baseAlpha: isSwordDash ? 0.64 : 0.4,
                    variant: isSwordDash ? 'swordDash' : 'player',
                    angle: Math.atan2(this.dashVectorY, this.dashVectorX),
                    color: isSwordDash ? (this.weapon.color || '#ffd880') : '#55ff7f'
                });
            }

            if (this.dashTimer === 0) {
                // Se há mais dashes de Investida Cortante na fila, executar próximo
                if (this.slashDashQueue > 0) {
                    this.performSwordDash(); // Executar próximo dash automaticamente
                } else {
                    // Caso contrário, apenas invulnerabilidade pós-dash normal
                    this.postDashInvulnTimer = 19;
                }
            }

            if (!this.dashHasHitMonster && currentMonster && isRectOverlap(this.x, this.y, this.width, this.height, currentMonster.x, currentMonster.y, currentMonster.width, currentMonster.height)) {
                this.dashHasHitMonster = true;
                
                // Verificar se é um dash de Investida Cortante (slash-dash curto)
                const isSlashDash = this.slashDashCounter > 0 && !this.slashDashIsNormal;
                const damageAmount = isSlashDash ? 5 : 25;
                const pushDistanceFactor = isSlashDash ? 0.2 : 1.0;
                
                currentMonster.takeDamage(damageAmount);

                frameFreeze = 2;
                currentMonster.flashTimer = 20;
                spawnEvaporationEffect(currentMonster.x + currentMonster.width / 2, currentMonster.y + currentMonster.height / 2, '#ffffff', 18, 18);

                const startX = currentMonster.x;
                const startY = currentMonster.y;
                const pushDistance = 250 * pushDistanceFactor;
                const endX = Math.max(0, Math.min(startX + this.dashVectorX * pushDistance, gameWidth - currentMonster.width));
                const endY = Math.max(0, Math.min(startY + this.dashVectorY * pushDistance, gameHeight - currentMonster.height));

                currentMonster.x = endX;
                currentMonster.y = endY;

                const afterImageCount = 6;
                for (let j = 1; j <= afterImageCount; j++) {
                    const t = j / (afterImageCount + 1);
                    spawnAfterImage({
                        kind: 'monster',
                        x: startX + (endX - startX) * t,
                        y: startY + (endY - startY) * t,
                        width: currentMonster.width,
                        height: currentMonster.height,
                        type: currentMonster.type,
                        orbitalAngle: currentMonster.orbitalAngle || 0,
                        life: 18,
                        maxLife: 18,
                        baseAlpha: 0.45 - t * 0.18
                    });
                }
            }
        } else {
            const prevX = this.x;
            const prevY = this.y;
            const isReloadingGun = this.weapon && this.weapon.type === 'gun' && this.gunReloadCooldown > 0;
            const moveX = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0);
            const moveY = (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0);
            const confusionMultiplier = this.confusedTimer > 0 ? -1 : 1;
            const invertedMoveX = moveX * confusionMultiplier;
            const invertedMoveY = moveY * confusionMultiplier;
            const isMoving = invertedMoveX !== 0 || invertedMoveY !== 0;

            if (isReloadingGun) {
                if (this.gunReloadInvulnCharges <= 0) {
                    this.gunReloadInvulnCharges = 1;
                }
                if (isMoving) {
                    this.gunReloadMoveBonus = Math.min(this.gunReloadMoveBonusMax, this.gunReloadMoveBonus + this.gunReloadMoveBonusRate);
                    this.gunReloadAfterImageTimer--;
                    if (this.gunReloadAfterImageTimer <= 0) {
                        this.gunReloadAfterImageTimer = 6;
                        spawnAfterImage({
                            kind: 'player',
                            x: this.x,
                            y: this.y,
                            width: this.width,
                            height: this.height,
                            life: 16,
                            maxLife: 16,
                            baseAlpha: 0.28
                        });
                    }
                } else {
                    this.gunReloadMoveBonus = Math.max(0, this.gunReloadMoveBonus - this.gunReloadMoveBonusDecay);
                }
                this.gunReloadFlashTicker = (this.gunReloadFlashTicker + 1) % 12;
            } else {
                this.gunReloadMoveBonus = Math.max(0, this.gunReloadMoveBonus - this.gunReloadMoveBonusDecay);
                this.gunReloadAfterImageTimer = 0;
                this.gunReloadFlashTicker = 0;
            }

            // Calcular bônus de velocidade
            let speedBonus = this.dashAccelerationSpeedBonus + this.swordAlignmentSpeedBonus;
            const baseSpeed = this.speed * (1 + speedBonus);
            const fireZoneSpeedBonus = this.getFireZoneSpeedBonus();
            const cooldownSpeedBonus = this.getBombCooldownSpeedBonus();
            const movementSpeed = (baseSpeed + (isReloadingGun ? this.speed * 0.25 : 0) + this.gunReloadMoveBonus + fireZoneSpeedBonus + cooldownSpeedBonus) * ts * interiorScale;
            
            if (invertedMoveY < 0) this.y -= movementSpeed;
            if (invertedMoveY > 0) this.y += movementSpeed;
            if (invertedMoveX < 0) this.x -= movementSpeed;
            if (invertedMoveX > 0) this.x += movementSpeed;
            
            // === Partículas de aceleração (Espada) ===
            if (this.weapon && this.weapon.type === 'sword' && this.dashAccelerationSpeedBonus > 0 && isMoving) {
                const accelLevel = this.dashAccelerationSpeedBonus;
                this.accelParticleTimer = (this.accelParticleTimer || 0) + 1;
                const interval = Math.max(1, Math.round(5 - accelLevel * 8));
                if (this.accelParticleTimer >= interval) {
                    this.accelParticleTimer = 0;
                    const mvx = invertedMoveX, mvy = invertedMoveY;
                    const ml = Math.hypot(mvx, mvy) || 1;
                    const dirX = mvx / ml, dirY = mvy / ml;
                    const cx = this.x + this.width / 2;
                    const cy = this.y + this.height / 2;
                    const count = 1 + Math.floor(accelLevel * 4);
                    for (let i = 0; i < count; i++) {
                        const spread = (Math.random() - 0.5) * 14;
                        const px = cx - dirX * (6 + Math.random() * 6) - dirY * spread;
                        const py = cy - dirY * (6 + Math.random() * 6) + dirX * spread;
                        accelParticles.push({
                            x: px,
                            y: py,
                            vx: -dirX * (1.5 + accelLevel * 4) - (Math.random() - 0.5) * 0.6,
                            vy: -dirY * (1.5 + accelLevel * 4) - (Math.random() - 0.5) * 0.6,
                            life: 14 + Math.floor(Math.random() * 8),
                            maxLife: 21 + Math.floor(Math.random() * 8),
                            len: 8 + accelLevel * 30 + Math.random() * 6,
                            width: 1.5 + accelLevel * 2,
                            color: this.weapon.color || '#ffd880',
                            angle: Math.atan2(dirY, dirX)
                        });
                    }
                }
            }
            // Rastrear direção de movimento para bônus de alinhamento com espada
            if (isMoving) {
                const moveLen = Math.hypot(invertedMoveX, invertedMoveY);
                this.lastMoveDirX = invertedMoveX / moveLen;
                this.lastMoveDirY = invertedMoveY / moveLen;
                
                // === Sistema de bônus por alinhamento com espada ===
                if (this.weapon && this.weapon.type === 'sword') {
                    // Calcular ângulo da espada
                    const swordAngle = this.swordAimAngle + (this.swordAimOffsetAngle || 0);
                    const swordDirX = Math.cos(swordAngle);
                    const swordDirY = Math.sin(swordAngle);
                    
                    // Calcular dot product para verificar alinhamento
                    const alignment = this.lastMoveDirX * swordDirX + this.lastMoveDirY * swordDirY;
                    
                    if (alignment > 0.7) { // Movendo ~45 graus ou menos de diferença
                        this.swordAlignmentTimer++;
                        if (this.swordAlignmentTimer >= 120) { // 2s em 60fps
                            this.swordAlignmentSpeedBonus = Math.min(0.75, this.swordAlignmentSpeedBonus + 0.15); // +15%, máx 75%
                            this.swordAlignmentTimer = 0;
                        }
                    } else {
                        // Não está alinhado, reseta timer
                        this.swordAlignmentTimer = 0;
                    }
                } else {
                    this.swordAlignmentTimer = 0;
                    this.swordAlignmentSpeedBonus = 0;
                }
            } else {
                // Não está movendo, reseta timers
                this.swordAlignmentTimer = 0;
                if (!this.weapon || this.weapon.type !== 'sword') {
                    this.swordAlignmentSpeedBonus = 0;
                }
            }
        }

        if (playerInsideConstruction) {
            resolveEntityViewportBounds(this, prevX, prevY, 16);
        } else {
            clampEntityToMapCircle(this);
        }

        if (!playerInsideConstruction) {
            if (resolveEntityWallCollision(this, prevX, prevY) && this.dashTimer > 0) {
                this.dashTimer = 0;
            }
            clampEntityToMapCircle(this);
        }

        if (this.postDashInvulnTimer > 0) {
            this.postDashInvulnTimer--;
        }

        if (this.slashDashInvulnTimer > 0) {
            this.slashDashInvulnTimer--;
        }

        if (this.healthRegen > 0) {
            this.regenTimer++;
            if (this.regenTimer >= 60) {
                this.health = Math.min(this.maxHealth, this.health + this.healthRegen);
                this.regenTimer = 0;
            }
        }

        // Processar veneno (dano ao longo do tempo)
        if (this.poisonTimer > 0) {
            this.poisonTimer--;
            this.poisonTickTimer--;
            if (this.poisonTickTimer <= 0) {
                this.poisonTickTimer = 60; // aplicar a cada 1s
                const dmg = this.poisonDamagePerTick || 1;
                this.health = Math.max(0, this.health - dmg);
                // efeito visual simples
                spawnAfterImage({ kind: 'player', x: this.x, y: this.y, width: this.width, height: this.height, life: 18, maxLife: 18, baseAlpha: 0.45 });
            }
        }
        // Ajustar multiplicador de dano do jogador enquanto envenenado
        this.damageOutputMultiplier = this.poisonTimer > 0 ? 0.85 : 1.0;

        if (this.meleeTimer > 0) {
            this.meleeTimer--;
            if (this.meleeTimer === 0) {
                this.attacking = false;
                this.meleeAttacking = false;
                this.coneAttacking = false;
                this.meleeHitRegistered = false;
                this.coneHitRegistered = false;
                this.meleeCritPercent = 0.2;
                this.coneCritPercent = 0.9;
                this.slashAlpha = 0;
            }
        }

        if (this.attackCooldown > 0) {
            this.attackCooldown--;
            if (this.attackCooldown === 0 && this.weapon && this.weapon.type === 'bow') {
                this.bowDashCharges = this.bowDashMaxCharges;
            }
        }
        if (this.bombCooldown > 0) this.bombCooldown--;
        if (this.grenadeCooldown > 0) this.grenadeCooldown--;
        if (this.gunReloadCooldown > 0) {
            this.gunReloadCooldown--;
            if (this.gunReloadCooldown === 0) {
                this.gunAmmo = this.gunMaxAmmo;
                this.gunReloadInvulnCharges = 0;
                this.gunReloadFlashTicker = 0;
                this.gunReloadHitCount = 0;
            }
        }
        if (this.parryCooldown > 0) this.parryCooldown--;
        if (this.parryHealOverTimeTimer > 0) {
            this.parryHealOverTimeTimer--;
            if (this.parryHealOverTime > 0) {
                const healAmount = this.maxHealth * (0.04 * this.parryHealOverTime) / 60;
                this.health = Math.min(this.maxHealth, this.health + healAmount);
            }
        }
        if (this.staffBurstCooldown > 0) this.staffBurstCooldown--;
        if (this.slashTimer > 0) {
            this.slashTimer--;
            this.slashAlpha = Math.max(0, this.slashAlpha - 0.1);
        }
        if (this.swordHitCooldown > 0) this.swordHitCooldown--;
        if (this.swordComboTimer > 0) {
            this.swordComboTimer--;
            if (this.swordComboTimer === 0) {
                this.swordComboCount = 0;
            }
        }
        if (this.swordAimAnimationTimer > 0) {
            this.swordAimAnimationTimer--;
            const phaseDuration = this.swordAimAnimationPhase === 'back'
                ? this.swordAimAnimationBackDuration
                : this.swordAimAnimationDuration;
            const elapsed = phaseDuration - this.swordAimAnimationTimer;
            const progress = Math.min(1, Math.max(0, elapsed / phaseDuration));
            if (this.swordAimAnimationPhase === 'out') {
                this.swordAimOffsetAngle = this.swordAimAnimationTargetAngle * progress;
            } else if (this.swordAimAnimationPhase === 'back') {
                this.swordAimOffsetAngle = this.swordAimAnimationTargetAngle * (1 - progress);
            }
            if (this.swordAimAnimationTimer % 2 === 0) {
                spawnAfterImage({
                    kind: 'player',
                    x: this.x,
                    y: this.y,
                    width: this.width,
                    height: this.height,
                    life: 12,
                    maxLife: 12,
                    baseAlpha: 0.28
                });
            }
            if (this.swordAimAnimationTimer === 0) {
                if (this.swordAimAnimationPhase === 'out') {
                    this.swordAimAnimationHoldTimer = 30;
                } else {
                    this.swordAimAnimationPhase = null;
                    this.swordAimOffsetAngle = 0;
                }
            }
        } else if (this.swordAimAnimationPhase === 'out' && this.swordAimAnimationHoldTimer > 0) {
            this.swordAimAnimationHoldTimer--;
            if (this.swordAimAnimationHoldTimer === 0) {
                this.swordAimAnimationPhase = 'back';
                this.swordAimAnimationTimer = this.swordAimAnimationBackDuration;
            }
        }
        
        // Decrementar janela de acertos no tank (0.75 segundos = 45 frames)
        if (this.tankHitWindow > 0) {
            this.tankHitWindow--;
        } else {
            this.tankHitCount = 0;
        }
    }

    draw() {
        ctx.save();
        const playerShakeTimer = Math.max(this.shakeTimer || 0, this.impactShakeTimer || 0);
        if (playerShakeTimer > 0) {
            const shakeAmount = 5;
            const shakeX = (Math.random() - 0.5) * shakeAmount;
            const shakeY = (Math.random() - 0.5) * shakeAmount;
            ctx.translate(shakeX, shakeY);
            if (this.shakeTimer > 0) this.shakeTimer -= 1;
            if (this.impactShakeTimer > 0) this.impactShakeTimer -= 1;
        }
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const playerScale = getPlayerInteriorScale();

        ctx.translate(centerX, centerY);
        ctx.scale(playerScale, playerScale);

        // Aura visual quando envenenado (player)
        if (this.poisonTimer > 0) {
            const pulse = 0.9 + 0.2 * Math.sin(performance.now() * 0.02);
            ctx.save();
            ctx.globalAlpha = 0.36;
            ctx.fillStyle = '#34ff7a';
            ctx.beginPath();
            ctx.arc(0, 0, 26 * pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(60,255,120,0.6)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 34 * pulse, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // pequenas partículas indicando veneno
            if (Math.random() < 0.06) {
                spawnAfterImage({ kind: 'player', x: centerX + (Math.random() - 0.5) * 18, y: centerY + (Math.random() - 0.5) * 18, width: 6, height: 6, life: 30, maxLife: 30, baseAlpha: 0.25 });
            }
        }

        // Aura visual quando queimado (bomba)
        if (this.burnTimer > 0 && this.burnTimer > 0) {
            const burnIntensity = Math.min(1, this.burnTimer / 180);
            const burnPulse = 0.8 + 0.3 * Math.sin(performance.now() * 0.025);
            ctx.save();
            
            // Primeiro anel - laranja
            ctx.globalAlpha = 0.4 * burnIntensity * burnPulse;
            ctx.fillStyle = '#ff8800';
            ctx.beginPath();
            ctx.arc(0, 0, 22 * burnPulse, 0, Math.PI * 2);
            ctx.fill();
            
            // Segundo anel - vermelho
            ctx.globalAlpha = 0.28 * burnIntensity;
            ctx.fillStyle = '#ff3300';
            ctx.beginPath();
            ctx.arc(0, 0, 30 * burnPulse, 0, Math.PI * 2);
            ctx.fill();
            
            // Contorno com brilho
            ctx.globalAlpha = 0.5 * burnIntensity;
            ctx.strokeStyle = 'rgba(255,100,0,0.8)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, 28 * burnPulse, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.restore();
            
            // Partículas de fogo ocasionais
            if (Math.random() < 0.08 * burnIntensity) {
                const angle = Math.random() * Math.PI * 2;
                const distance = 18 + Math.random() * 12;
                const px = centerX + Math.cos(angle) * distance;
                const py = centerY + Math.sin(angle) * distance;
                spawnEvaporationEffect(px, py, Math.random() < 0.5 ? '#ff6600' : '#ffaa00', 4, 1);
            }
        }

        // Desenhar escudos visuais quando em cooldown de parry
        if (this.parryCooldown > 0 && this.parryDefenseBonus > 0) {
            ctx.save();
            
            const shieldRadius = 45;
            const totalShields = Math.round(this.parryDefenseBonus / 12.5);
            const shieldsPerCircle = Math.max(3, Math.min(8, totalShields));
            const angleStep = (Math.PI * 2) / shieldsPerCircle;
            
            for (let i = 0; i < totalShields; i++) {
                const circleIndex = Math.floor(i / shieldsPerCircle);
                const indexInCircle = i % shieldsPerCircle;
                const currentRadius = shieldRadius + circleIndex * 28;
                const angle = angleStep * indexInCircle + (performance.now() * 0.0008 + circleIndex * 0.3);
                
                const shieldX = Math.cos(angle) * currentRadius;
                const shieldY = Math.sin(angle) * currentRadius;
                
                // Pulso e cor com base na rotação
                const pulse = 0.85 + 0.15 * Math.sin(performance.now() * 0.003 + i * 0.8);
                const hue = (angle * 180 / Math.PI + circleIndex * 30) % 360;
                
                ctx.save();
                ctx.translate(shieldX, shieldY);
                ctx.globalAlpha = 0.7 * pulse;
                
                // Desenhar escudo como um pequeno círculo
                const shieldSize = 6;
                ctx.fillStyle = `hsl(${hue}, 80%, 55%)`;
                ctx.shadowColor = `hsl(${hue}, 80%, 55%)`;
                ctx.shadowBlur = 12;
                
                // Desenhar como círculo com brilho
                ctx.beginPath();
                ctx.arc(0, 0, shieldSize, 0, Math.PI * 2);
                ctx.fill();
                
                // Contorno
                ctx.strokeStyle = `hsl(${hue}, 100%, 70%)`;
                ctx.lineWidth = 1.5;
                ctx.stroke();
                
                ctx.restore();
            }
            
            ctx.restore();
        }

        const canBowDash = this.weapon && this.weapon.type === 'bow' && this.bowDashCharges > 0 && this.attackCooldown > 0 && this.dashTimer === 0;
        const dashGlowActive = canBowDash;

        ctx.scale(1.7, 1.7);
        const isReloadingGun = this.weapon && this.weapon.type === 'gun' && this.gunReloadCooldown > 0 && this.gunReloadInvulnCharges > 0;
        const isFlashing = isReloadingGun && this.gunReloadFlashTicker < 6;
        ctx.fillStyle = isFlashing ? '#ffffff' : '#55ff7f';
        ctx.shadowColor = isFlashing ? '#ffffff' : 'transparent';
        ctx.shadowBlur = isFlashing ? 24 : 0;
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(10, 0);
        ctx.lineTo(4, 10);
        ctx.lineTo(-4, 10);
        ctx.lineTo(-10, 0);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#14b84a';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(0, 0, 2.8, 0, Math.PI * 2);
        ctx.fill();

        if (dashGlowActive) {
            const glowTick = performance.now() * 0.0052;
            const pulse = 1 + Math.sin(glowTick * 1.7) * 0.08;
            const outlineAlpha = 0.32 + Math.sin(glowTick * 1.4) * 0.08;
            const dotAlpha = 0.18 + Math.sin(glowTick * 2.0) * 0.08;

            const drawPlayerShape = (scale) => {
                ctx.beginPath();
                ctx.moveTo(0, -10 * scale);
                ctx.lineTo(10 * scale, 0);
                ctx.lineTo(4 * scale, 10 * scale);
                ctx.lineTo(-4 * scale, 10 * scale);
                ctx.lineTo(-10 * scale, 0);
                ctx.closePath();
            };

            ctx.save();
            ctx.lineWidth = 4.5;
            ctx.strokeStyle = 'rgba(110, 255, 235, 1)';
            ctx.globalAlpha = Math.min(1, outlineAlpha + 0.08);
            drawPlayerShape(1.28 + 0.05 * Math.sin(glowTick * 1.5));
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = 'rgba(90, 245, 210, 0.92)';
            ctx.globalAlpha = Math.min(1, outlineAlpha * 0.98);
            drawPlayerShape(1.16 + 0.03 * Math.cos(glowTick * 1.6));
            ctx.stroke();
            ctx.restore();

            const particlePositions = [
                { x: 0, y: -14 },
                { x: 12, y: 2 },
                { x: 5, y: 12 },
                { x: -5, y: 12 },
                { x: -12, y: 2 },
                { x: 0, y: 8 }
            ];
            for (let i = 0; i < particlePositions.length; i++) {
                const pos = particlePositions[i];
                const wobble = 1.9 + Math.sin(glowTick * 2.4 + i * 1.1) * 1.9;
                ctx.save();
                ctx.fillStyle = 'rgba(140, 255, 235, 1)';
                ctx.globalAlpha = Math.min(1, dotAlpha * (0.88 + (i / 9)));
                ctx.beginPath();
                ctx.arc(pos.x * pulse, pos.y * pulse, 2.6 + Math.cos(glowTick * 1.8 + i) * 1.0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            ctx.save();
            ctx.fillStyle = 'rgba(70, 210, 185, 0.16)';
            ctx.globalAlpha = 0.24;
            drawPlayerShape(1.3 + 0.1 * Math.sin(glowTick * 0.9));
            ctx.fill();
            ctx.restore();
        }

        const weapon = this.weapon;
        const weaponAimAngle = (typeof this.swordAimAngle === 'number' && isFinite(this.swordAimAngle)) ? this.swordAimAngle : 0;
        const weaponInfo = this.getWeaponMountPoint(weaponAimAngle);
        if (weapon && (weapon.type === 'gun' || weapon.type === 'bow' || weapon.type === 'staff')) {
            ctx.save();
            ctx.translate(weaponInfo.offsetX, weaponInfo.offsetY);
            ctx.globalAlpha = 0.96;

            if (weapon.type === 'gun') {
                ctx.rotate(weaponInfo.aimAngle);
                ctx.fillStyle = '#0f172a';
                ctx.shadowColor = 'rgba(255,255,255,0.35)';
                ctx.shadowBlur = 10;
                ctx.fillRect(-10, -5.5, 18, 11);
                ctx.fillRect(-10, -3.5, 8, 7);
                ctx.fillStyle = '#64748b';
                ctx.fillRect(-8.5, -4.2, 8, 8.4);
                ctx.fillStyle = '#f8fafc';
                ctx.fillRect(-3.2, -2.4, 3.6, 4.8);
                ctx.fillStyle = '#e2e8f0';
                ctx.fillRect(8.8, -4, 7.2, 8);
                ctx.fillStyle = '#111827';
                ctx.fillRect(12.4, -2.6, 3.4, 5.2);
                ctx.fillRect(4.2, -2.8, 4.4, 5.6);
                ctx.fillStyle = '#facc15';
                ctx.beginPath();
                ctx.arc(8.2, 0, 2.8, 0, Math.PI * 2);
                ctx.fill();
            } else if (weapon.type === 'bow') {
                ctx.rotate(weaponInfo.aimAngle);
                ctx.strokeStyle = '#8b5a2b';
                ctx.lineWidth = 3.0;
                ctx.beginPath();
                ctx.moveTo(-9.8, -8.2);
                ctx.quadraticCurveTo(-1.4, -5.2, 2.8, -1.5);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(-9.8, 8.2);
                ctx.quadraticCurveTo(-1.4, 5.2, 2.8, 1.5);
                ctx.stroke();

                ctx.strokeStyle = '#f8fafc';
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(-9.2, -8.0);
                ctx.quadraticCurveTo(-1.4, -3.8, 12.8, -0.8);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(-9.2, 8.0);
                ctx.quadraticCurveTo(-1.4, 3.8, 12.8, 0.8);
                ctx.stroke();

                ctx.fillStyle = '#0f172a';
                ctx.fillRect(-10.2, -3.2, 8.2, 6.4);
                ctx.fillStyle = '#f59e0b';
                ctx.fillRect(-8.8, -2.2, 5.3, 4.4);

                ctx.fillStyle = '#fde68a';
                ctx.beginPath();
                ctx.moveTo(11.8, -2.2);
                ctx.lineTo(16.4, 0);
                ctx.lineTo(11.8, 2.2);
                ctx.lineTo(13.4, 0);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = '#f8fafc';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(13.0, -0.8);
                ctx.lineTo(18.0, 0);
                ctx.lineTo(13.0, 0.8);
                ctx.stroke();
            } else if (weapon.type === 'staff') {
                ctx.rotate(-Math.PI / 2);

                const staffColor = weapon.color || '#38bdf8';

                ctx.fillStyle = '#1f2937';
                ctx.fillRect(-4.8, -1.6, 15.2, 3.2);

                ctx.fillStyle = '#f8fafc';
                ctx.fillRect(-4.0, -1.0, 13.6, 2.0);

                ctx.fillStyle = staffColor;
                ctx.fillRect(-2.2, -0.8, 11.8, 1.6);

                ctx.fillStyle = '#0f172a';
                ctx.fillRect(-4.8, -2.4, 1.4, 4.8);

                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.beginPath();
                ctx.arc(12.6, 0, 2.2, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = staffColor;
                ctx.beginPath();
                ctx.arc(12.6, 0, 1.2, 0, Math.PI * 2);
                ctx.fill();
            } else if (weapon.type === 'grenade') {
                ctx.rotate(weaponInfo.aimAngle);
                ctx.fillStyle = '#7c2d12';
                ctx.beginPath();
                ctx.arc(0, 0, 6.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#f97316';
                ctx.beginPath();
                ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fde68a';
                ctx.fillRect(-1.4, -2.6, 2.8, 5.2);
            }

            ctx.restore();
        }

        ctx.restore();

        if (this.attacking) {
            const playerScale = getPlayerInteriorScale();
            if (this.weapon && this.weapon.type === 'sword') {
                const px = this.x + this.width / 2;
                const py = this.y + this.height / 2;
                const extraRange = Math.max(0, this.attackRange - 80) * playerScale;
                const swordLen = ((this.weapon.range || 45) + extraRange) * playerScale;
                const baseAim = (typeof this.swordAimAngle === 'number') ? this.swordAimAngle : this.meleeDirection || 0;
                const aim = baseAim + (this.swordAimOffsetAngle || 0);

                // faint arc showing sword reach
                const arcAccent = this.weapon.color || '#ffd880';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.strokeStyle = arcAccent;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.arc(px, py, swordLen, aim - (this.meleeAngle || (160 * Math.PI / 180)) / 2, aim + (this.meleeAngle || (160 * Math.PI / 180)) / 2);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // draw sword pointing to mouse
                ctx.save();
                ctx.translate(px, py);
                ctx.rotate(aim);

                const accent = this.weapon.color || '#ffd880';
                const dark = '#0b1220';

                // grip / handle
                ctx.fillStyle = dark;
                ctx.fillRect(-15, -2.6, 11, 5.2);
                ctx.fillStyle = '#1f2937';
                for (let g = 0; g < 5; g++) {
                    ctx.fillRect(-14 + g * 2.2, -2.6, 1.1, 5.2);
                }
                // pommel
                ctx.fillStyle = accent;
                ctx.shadowColor = accent;
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(-15.5, 0, 3.0, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                // crossguard
                ctx.fillStyle = '#e5e7eb';
                ctx.fillRect(-4.5, -6, 3, 12);
                ctx.fillStyle = accent;
                ctx.fillRect(-4.5, -6, 1.2, 12);

                // glowing energy blade with gradient
                const grad = ctx.createLinearGradient(0, 0, swordLen, 0);
                grad.addColorStop(0, '#ffffff');
                grad.addColorStop(0.18, accent);
                grad.addColorStop(1, accent);
                ctx.beginPath();
                ctx.moveTo(0, -3.4);
                ctx.lineTo(swordLen * 0.12, -1.3);
                ctx.lineTo(swordLen * 0.85, -0.5);
                ctx.lineTo(swordLen, 0);
                ctx.lineTo(swordLen * 0.85, 0.5);
                ctx.lineTo(swordLen * 0.12, 1.3);
                ctx.lineTo(0, 3.4);
                ctx.closePath();
                ctx.fillStyle = grad;
                ctx.shadowColor = accent;
                ctx.shadowBlur = 22;
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.95)';
                ctx.lineWidth = 1.3;
                ctx.stroke();
                ctx.shadowBlur = 0;

                // fuller / bright center line
                ctx.beginPath();
                ctx.moveTo(2, 0);
                ctx.lineTo(swordLen * 0.92, 0);
                ctx.strokeStyle = 'rgba(255,255,255,0.45)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // glowing tip
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(swordLen, 0, 1.8, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();

                // optional slash indicator while attacking
                if (this.slashTimer > 0) {
                    ctx.save();
                    ctx.translate(px, py);
                    ctx.rotate(aim);
                    ctx.globalAlpha = Math.max(0, this.slashAlpha || 0);
                    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(swordLen * 0.2, -8);
                    ctx.lineTo(swordLen * 0.9, 0);
                    ctx.lineTo(swordLen * 0.2, 8);
                    ctx.stroke();
                    ctx.restore();
                }
            } else {
                const playerScale = getPlayerInteriorScale();
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 3;
                const meleeRadius = this.weapon && this.weapon.type === 'sword'
                    ? (this.weapon.range + Math.max(0, this.attackRange - 80)) * playerScale
                    : this.attackRange * playerScale;
                ctx.beginPath();
                if (this.weapon && this.weapon.type === 'sword') {
                    ctx.arc(this.x + this.width / 2, this.y + this.height / 2, meleeRadius, this.meleeDirection - this.meleeAngle / 2, this.meleeDirection + this.meleeAngle / 2);
                } else {
                    ctx.arc(this.x + this.width / 2, this.y + this.height / 2, meleeRadius, 0, Math.PI * 2);
                }
                ctx.stroke();
            }
        }
        // draw sword even when not actively attacking if always active
        if (!this.attacking && this.weapon && this.weapon.type === 'sword' && this.swordAlwaysActive) {
            const playerScale = getPlayerInteriorScale();
            const px = this.x + this.width / 2;
            const py = this.y + this.height / 2;
            const extraRange = Math.max(0, this.attackRange - 80) * playerScale;
            const swordLen = ((this.weapon.range || 45) + extraRange) * playerScale;
            const baseAim = (typeof this.swordAimAngle === 'number') ? this.swordAimAngle : this.meleeDirection || 0;
            const aim = baseAim + (this.swordAimOffsetAngle || 0);

            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(aim);

            const accent = this.weapon.color || '#ffd880';
            const dark = '#0b1220';

            // grip
            ctx.fillStyle = dark;
            ctx.fillRect(-12, -2, 9, 4);
            // pommel
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.arc(-12.5, 0, 2.4, 0, Math.PI * 2);
            ctx.fill();
            // crossguard
            ctx.fillStyle = '#e5e7eb';
            ctx.fillRect(-3.5, -4.5, 2.4, 9);

            // glowing energy blade
            const grad = ctx.createLinearGradient(0, 0, swordLen, 0);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.2, accent);
            grad.addColorStop(1, accent);
            ctx.beginPath();
            ctx.moveTo(0, -2.6);
            ctx.lineTo(swordLen * 0.12, -1.0);
            ctx.lineTo(swordLen * 0.86, -0.4);
            ctx.lineTo(swordLen, 0);
            ctx.lineTo(swordLen * 0.86, 0.4);
            ctx.lineTo(swordLen * 0.12, 1.0);
            ctx.lineTo(0, 2.6);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.shadowColor = accent;
            ctx.shadowBlur = 14;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            ctx.restore();
        }
    }

    computeDashAngle() {
        const px = this.x + this.width / 2;
        const py = this.y + this.height / 2;
        let targetX = null, targetY = null;

        const nearest = (typeof getNearestInteriorEnemy === 'function') ? getNearestInteriorEnemy() : null;
        if (nearest) {
            targetX = nearest.x + nearest.width / 2;
            targetY = nearest.y + nearest.height / 2;
        }
        if (currentMonster && currentMonster.health > 0 && !currentMonster.isDying) {
            const cmx = currentMonster.x + currentMonster.width / 2;
            const cmy = currentMonster.y + currentMonster.height / 2;
            if (targetX === null || Math.hypot(px - cmx, py - cmy) < Math.hypot(px - targetX, py - targetY)) {
                targetX = cmx;
                targetY = cmy;
            }
        }

        if (targetX !== null) {
            return Math.atan2(targetY - py, targetX - px);
        }
        const baseAim = (typeof this.swordAimAngle === 'number') ? this.swordAimAngle : (this.meleeDirection || 0);
        return baseAim + (this.swordAimOffsetAngle || 0);
    }

    tryInvestidaDash() {
        if (this.attackMove > 0 && this.swordDashCooldown === 0 && this.dashTimer === 0) {
            this.performSwordDash();
        }
    }

    performSwordDash() {
        if (!this.weapon || this.weapon.type !== 'sword') return false;
        if (this.dashTimer > 0) return false;
        
        // Verificar se já há dashes da Investida Cortante na fila
        if (this.slashDashQueue > 0) {
            // Executar o próximo dash da Investida Cortante
            const dashAngle = this.computeDashAngle();

            this.dashVectorX = Math.cos(dashAngle);
            this.dashVectorY = Math.sin(dashAngle);
            this.swordAimAngle = dashAngle;
            if (this.slashDashIsNormal) {
                // Investida Cortante: cada nível ativa um dash normal
                this.dashTimer = 10;
                this.dashSpeed = 17;
            } else {
                this.dashTimer = 2; // 20% do tamanho original (10 * 0.2)
                this.dashSpeed = 3.4; // 20% da velocidade original (17 * 0.2)
            }
            this.dashHasHitMonster = false;
            this.slashDashInvulnTimer = 2; // Invulnerável durante o dash
            this.attacking = false;
            this.meleeAttacking = false;
            this.coneAttacking = false;
            
            this.slashDashQueue--;
            this.slashDashCounter++;
            
            return true;
        }
        
        // Verificar se pode fazer um dash normal ou iniciar Investida Cortante
        if (this.swordDashCooldown > 0) return false;

        const dashAngle = this.computeDashAngle();
        this.swordAimAngle = dashAngle;

        this.dashVectorX = Math.cos(dashAngle);
        this.dashVectorY = Math.sin(dashAngle);
        
        // Verificar se tem upgrade de Investida Cortante
        const slashUpgradeCount = Math.max(0, Math.floor((this.attackMove || 0) / 6));
        if (slashUpgradeCount > 0) {
            // Investida Cortante: cada nível ativa um dash normal
            this.dashTimer = 10; // dash normal
            this.dashSpeed = 17; // dash normal
            this.slashDashQueue = slashUpgradeCount - 1; // Fila dos dashes normais restantes (1 por nível)
            this.slashDashCounter = 1;
            this.slashDashInvulnTimer = 2; // Invulnerável durante o dash
            this.slashDashIsNormal = true;
        } else {
            // Dash normal
            this.dashTimer = 10;
            this.dashSpeed = 17;
            this.slashDashQueue = 0;
            this.slashDashCounter = 0;
            this.slashDashInvulnTimer = 0;
            this.slashDashIsNormal = false;
        }
        
        this.dashHasHitMonster = false;
        this.swordDashCooldown = this.swordDashCooldownMax;
        this.postDashInvulnTimer = 0;
        this.attacking = false;
        this.meleeAttacking = false;
        this.coneAttacking = false;
        return true;
    }

    attack() {
        if (this.attackCooldown === 0) {
            this.attacking = true;
            this.attackCooldown = 20;
            setTimeout(() => { this.attacking = false; }, 100);
            return true;
        }
        return false;
    }
}

class Monster {
    constructor(phase, type = null) {
        this.phase = phase;
        this.type = type || this.chooseType();
        this.width = 100 + phase * 20;
        this.height = 100 + phase * 20;
        this.x = Math.random() * (gameWidth - this.width);
        this.y = 50 + Math.random() * 100;
        this.attackRange = 120;
        this.attackCooldown = 0;
        this.projectileAttackCooldown = 0;
        this.areaAttackCooldown = 0;
        this.attackEffectTimer = 0;
        this.dashCooldown = 0;
        this.flashTimer = 0;
        this.dashTimer = 0;
        this.splitAttackCooldown = 0;
        this.stunTimer = 0;
        this.isDying = false;
        this.deathTimer = 0;
        this.deathMaxTimer = 0;
        this.deathShards = [];
        this.tookDamage = false;
        this.direction = Math.random() > 0.5 ? 1 : -1;
        this.shakeTimer = 0;
        this.impactShakeTimer = 0;
        this.fleeTimer = 0;
        this.fearCooldown = 0;
        this.confusedTimer = 0;

        if (this.type === 'shooter') {
            this.health = 37.5 + phase * 11;
            this.speed = 0.75 + phase * 0.075;
            this.maxHealth = this.health;
            this.desiredDistance = 1200; // aumentado drasticamente
            this.projectileSpeed = 4.5 + phase * 0.25;
        } else if (this.type === 'tank') {
            this.health = 101.25 + phase * 30;
            this.speed = 0.6 + phase * 0.075;
            this.maxHealth = this.health;
            this.dashCooldown = 100;
            this.dashTimer = 0;
            this.dashSpeed = 3.75 + phase * 0.375;
            this.triggered75 = false;
            this.triggered50 = false;
            this.triggered25 = false;
            this.rangedAttackWarningTimer = 0;
            this.armorBarrageWarningTimer = 0;
            this.chargeMissilesWarningTimer = 0;
            this.burstAttackWarningTimer = 0;
            this.shockwaveAttackWarningTimer = 0;
            // Caster movement/teleport targets
            this.patrolTarget = {
                x: Math.random() * Math.max(1, gameWidth - 40) + 20,
                y: Math.random() * Math.max(1, gameHeight - 40) + 20
            };
            // Teleport target: choose one of the four corners
            const corners = [
                { x: 50, y: 50 },
                { x: gameWidth - 50, y: 50 },
                { x: 50, y: gameHeight - 50 },
                { x: gameWidth - 50, y: gameHeight - 50 }
            ];
            this.teleportTarget = corners[Math.floor(Math.random() * corners.length)];
            this.reachedPatrol = false;
            this.hasTeleported = false;
        } else if (this.type === 'swarm') {
            this.health = 41.25 + phase * 10;
            this.speed = 1.35 + phase * 0.175;
            this.maxHealth = this.health;
            this.swarmCooldown = 0;
            this.orbitalAngle = 0;
            this.markSpawnCooldown = 0;
        } else if (this.type === 'caster') {
            this.health = 52.5 + phase * 12.5;
            this.speed = 0.375 + phase * 0.05;
            this.speed *= 3; // aumentar velocidade do caster em 3x (base)
            this.maxHealth = this.health;
            this.portalCooldown = 0;
            this.portalWarningTimer = 0;
            this.portalTimer = 0;
            this.portalX = this.x + this.width / 2;
            this.portalY = this.y + this.height / 2;
            this.portalAttackMode = 'circular'; // 'circular', 'spiral', 'ring' ou 'aim16'
            this.portalModeToggleCooldown = 0;
            this.spiralProjectileCount = 0; // rastreador de projéteis da espiral
            this.nextPortalActiveDuration = null; // custom duration for specific attack modes
            this.remoteAttackCooldown = Math.round(1.5 * 60); // frames (~1.5s)
            this.remoteAttackTimer = Math.round(Math.random() * this.remoteAttackCooldown);
            // Patrol / on-fire mechanics
            this.patrolTimer = 0; // frames gastas indo ao patrolTarget
            this.patrolTimeout = 8 * 60; // 8 segundos em frames
            this.onFire = false; // estado ativado se demorar muito
            this.fireAttackBoost = 1.5; // 50% mais poder de ataque quando em chamas
        } else if (this.type === 'smart') {
            this.health = 54 + phase * 14;
            this.speed = 1.2375 + phase * 0.11;
            this.maxHealth = this.health;
            this.hitscanCooldown = 0;
            this.hitscanWarningTimer = 0;
            this.hitscanTargetX = null;
            this.hitscanTargetY = null;
            this.predictiveCooldown = 0;
            this.circleAngle = 0;
            this.smartRange = 180 + phase * 6;
        } else if (this.type === 'avianightmare') {
            this.health = 48.75 + phase * 15;
            this.speed = 0.7875 + phase * 0.225;
            this.maxHealth = this.health;
            this.attackRange = 110;
            this.projectileSpeed = 3.75 + phase * 0.2;
            this.areaAttackCooldown = 0;
            this.projectileAttackCooldown = 0;
        } else if (this.type === 'castle_bone_sphere') {
            this.health = 120 + phase * 48;
            this.maxHealth = this.health;
            this.speed = 0.95 + phase * 0.05;
            this.attackRange = 220;
            this.rotationAngle = Math.random() * Math.PI * 2;
            this.boneRainCooldown = 0;
            this.boneRingCooldown = 20;
            this.specialAttackCooldown = 120;
            this.stunTimer = 0;
        } else if (this.type === 'simple') {
            this.health = 22.5 + phase * 4;
            this.maxHealth = this.health;
            this.attackRange = 70;
            this.projectileAttackCooldown = 0;
            this.areaAttackCooldown = 0;
            this.clawAttackTimer = 0;
            this.simpleVariant = 'default';
            this.simpleDashOpen = 0;
            this.simpleDashCooldown = 0;
            this.simpleDashPauseTimer = 0;
            this.simpleDashTimer = 0;
            this.simpleDashSpeed = 13.5 + phase * 0.6;
            this.simpleDashVx = 0;
            this.simpleDashVy = 0;
            this.simpleClawDirection = 0;
            this.simpleClawAngle = Math.PI * 0.95;
            this.simpleClawRange = this.attackRange * 3;
            this.speed = 1.45 + phase * 0.18;
        } else if (this.type === 'croc') {
            this.health = 22.5 + phase * 4;
            this.maxHealth = this.health;
            this.attackRange = 70;
            this.speed = 0;
            this.simpleDashCooldown = 45 + Math.round(Math.random() * 30);
            this.simpleDashPauseTimer = 0;
            this.simpleDashWarningTimer = 0;
            this.simpleDashWarningDuration = Math.round(0.35 * 60);
            this.simpleDashTimer = 0;
            this.simpleDashSpeed = 16.5 + phase * 0.7;
            this.simpleDashDistance = 35;
            this.simpleDashDirection = 0;
            this.simpleDashVx = 0;
            this.simpleDashVy = 0;
            this.simpleDashOpen = 0;
            this.attackCooldown = 1;
            this.simpleVariant = 'croc';
            this.isOffScreen = false;
            this.lastOnScreenFrame = 0;
            this.roarQueued = false;
            this.roarTimer = 0;
            this.sprintEscapeTimer = 0;
            this.sprintEscapeDir = 0;
            this.crocCircleAngle = Math.random() * Math.PI * 2;
            this.crocCircleRadius = 90 + Math.random() * 120;
            this.crocCircleSpeed = 0.035 + Math.random() * 0.02;
            this.hitsTakenThisLife = 0;
            this.lastHitFrame = -999;
            this.consecutiveHitsOnPlayer = 0;
            this.confusedTimer = 0;
            this.confusedLevel = 0;
            this.postConfusionRoar = false;
            this.hasRoaredThisEntry = false;
            this.crocDecoyX = this.x + this.width / 2;
            this.crocDecoyY = this.y + this.height / 2;
            this.crocDecoyAngle = Math.random() * Math.PI * 2;
            this.crocDecoyWanderTimer = 60 + Math.floor(Math.random() * 120);
            this.crocOffsetAngle = Math.random() * Math.PI * 2;
            this.crocOffsetDist = 60 + Math.random() * 80;
            this.x = Math.max(0, Math.min(gameWidth - this.width, this.crocDecoyX + Math.cos(this.crocOffsetAngle) * this.crocOffsetDist - this.width / 2));
            this.y = Math.max(0, Math.min(gameHeight - this.height, this.crocDecoyY + Math.sin(this.crocOffsetAngle) * this.crocOffsetDist - this.height / 2));
            this.fakeMarkerX = this.crocDecoyX;
            this.fakeMarkerY = this.crocDecoyY;
        } else {
            this.health = 56.25 + phase * 22.5;
            this.speed = 1.0875 + phase * 0.3625;
            this.maxHealth = this.health;
        }
    }

    chooseType() {
        return chooseMonsterType();
    }

    startDeathAnimation() {
        if (this.isDying || this.deathTimer > 0) return;
        this.isDying = true;
        this.deathTimer = 24;
        this.deathMaxTimer = 24;
        this.deathShards = [];
        spawnMonsterDeathEffect(this);

        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const shardCount = 16 + Math.floor(Math.random() * 8);

        for (let i = 0; i < shardCount; i++) {
            const angle = (Math.PI * 2 / shardCount) * i + (Math.random() - 0.5) * 0.35;
            const speed = 1.2 + Math.random() * 4.4;
            this.deathShards.push({
                x: centerX,
                y: centerY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed * 0.7,
                size: 4 + Math.random() * 8,
                rotation: Math.random() * Math.PI * 2,
                spin: (Math.random() - 0.5) * 0.18,
                life: 18 + Math.floor(Math.random() * 12)
            });
        }
    }

    updateDeathAnimation() {
        if (!this.isDying || this.deathTimer <= 0) return;
        this.deathTimer--;
        const progress = 1 - this.deathTimer / this.deathMaxTimer;

        for (let i = this.deathShards.length - 1; i >= 0; i--) {
            const shard = this.deathShards[i];
            shard.x += shard.vx;
            shard.y += shard.vy;
            shard.vy += 0.08 + progress * 0.03;
            shard.vx *= 0.96;
            shard.vy *= 0.98;
            shard.rotation += shard.spin;
            shard.life--;
            if (shard.life <= 0) {
                this.deathShards.splice(i, 1);
            }
        }

        if (this.deathTimer <= 0) {
            this.deathShards = [];
        }
    }

    update(playerX, playerY) {
        if (this.isDying) {
            this.updateDeathAnimation();
            return;
        }

        const ts = timeScale || 1;
        const monsterCenterX = this.x + this.width / 2;
        const monsterCenterY = this.y + this.height / 2;
        const dx = playerX - monsterCenterX;
        const dy = playerY - monsterCenterY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const safeDist = Math.max(dist, 0.0001);

        if (this.flashTimer > 0) {
            this.flashTimer--;
        }
        if (this.fallStarsTimer > 0) {
            this.fallStarsTimer--;
        }

        if (this.impactShakeTimer > 0) {
            this.impactShakeTimer--;
        }

        if (this.confusedTimer > 0) {
            this.confusedTimer--;
        }

        if (this.stunTimer > 0) {
            this.stunTimer--;
            return;
        }

        if (this.type === 'shooter') {
            const fearRange = this.desiredDistance * 2;
            const trembleDuration = 60; // 1 segundo em 60fps
            const fleeDuration = 50;

            if (this.fearCooldown > 0) {
                this.fearCooldown--;
            }

            if (dist < fearRange && this.shakeTimer === 0 && this.fleeTimer === 0 && this.fearCooldown === 0) {
                this.shakeTimer = trembleDuration;
            }

            if (this.shakeTimer > 0) {
                this.shakeTimer--;
                if (this.shakeTimer === 0) {
                    this.fleeTimer = fleeDuration;
                    this.fearCooldown = 90;
                }
            }

            if (this.shakeTimer > 0 || this.fleeTimer > 0) {
                if (Math.random() < 0.45) {
                    const sweatX = this.x + Math.random() * this.width;
                    const sweatY = this.y + this.height * 0.16;
                    spawnSweatEffect(sweatX, sweatY);
                }
            }

            if (this.fleeTimer > 0) {
                this.fleeTimer--;
                const awayX = (monsterCenterX - playerX) / safeDist;
                const awayY = (monsterCenterY - playerY) / safeDist;
                const fleeSpeed = this.speed * 1.8;
                this.x += awayX * fleeSpeed * ts;
                this.y += awayY * fleeSpeed * ts;
            } else if (dist < this.desiredDistance * 0.8) {
                const awayX = (monsterCenterX - playerX) / safeDist;
                const awayY = (monsterCenterY - playerY) / safeDist;
                this.x += awayX * this.speed * ts;
                this.y += awayY * this.speed * ts;
            } else if (dist > this.desiredDistance + 40) {
                this.x += (dx / safeDist) * this.speed * 0.6 * ts;
                this.y += (dy / safeDist) * this.speed * 0.6 * ts;
            } else {
                this.x += this.speed * (Math.random() > 0.5 ? 1 : -1) * ts;
            }

            if (this.fleeTimer <= 0) {
                if (this.projectileAttackCooldown <= 0) {
                    const attackPool = [
                        { name: 'sprayAttack', cooldown: Math.max(60, 100 - this.phase * 10) },
                        { name: 'flareAttack', cooldown: Math.max(65, 105 - this.phase * 10) },
                        { name: 'spiralWaveAttack', cooldown: Math.max(70, 110 - this.phase * 10) },
                        { name: 'burstArc', cooldown: Math.max(60, 100 - this.phase * 10) }
                    ];

                    const comboChance = Math.random();
                    let comboCount = 1;
                    if (comboChance < 0.25) comboCount = 4;
                    else if (comboChance < 0.45) comboCount = 3;
                    else if (comboChance < 0.65) comboCount = 2;

                    const selectedIndices = [];
                    let maxCooldown = 0;

                    for (let i = 0; i < comboCount; i++) {
                        let randomIndex = Math.floor(Math.random() * attackPool.length);
                        while (selectedIndices.includes(randomIndex) && selectedIndices.length < attackPool.length) {
                            randomIndex = Math.floor(Math.random() * attackPool.length);
                        }
                        if (!selectedIndices.includes(randomIndex)) {
                            selectedIndices.push(randomIndex);
                            const attack = attackPool[randomIndex];
                            this[attack.name](playerX, playerY);
                            maxCooldown = Math.max(maxCooldown, attack.cooldown);
                        }
                    }

                    this.projectileAttackCooldown = maxCooldown + (comboCount - 1) * 5;
                } else {
                    this.projectileAttackCooldown--;
                }

                if (dist < this.attackRange + 40 && this.areaAttackCooldown <= 0) {
                    this.burstAttack();
                    this.areaAttackCooldown = Math.max(140, 180 - this.phase * 10);
                } else if (this.areaAttackCooldown > 0) {
                    this.areaAttackCooldown--;
                }
            } else {
                if (this.projectileAttackCooldown > 0) {
                    this.projectileAttackCooldown--;
                }
                if (this.areaAttackCooldown > 0) {
                    this.areaAttackCooldown--;
                }
            }
        } else if (this.type === 'tank') {
            // Verificar milestones de vida para spawnar counter attack
            const healthPercent = this.health / this.maxHealth;
            if (healthPercent <= 0.75 && !this.triggered75) {
                this.triggered75 = true;
                spawnTankCounterAttack();
            }
            if (healthPercent <= 0.50 && !this.triggered50) {
                this.triggered50 = true;
                spawnTankCounterAttack();
            }
            if (healthPercent <= 0.25 && !this.triggered25) {
                this.triggered25 = true;
                spawnTankCounterAttack();
            }
            
            if (this.dashTimer > 0) {
                this.x += (dx / dist) * this.dashSpeed * ts;
                this.y += (dy / dist) * this.dashSpeed * ts;
                this.dashTimer--;
            } else {
                if (dist > this.attackRange) {
                    this.x += (dx / dist) * this.speed * ts;
                    this.y += (dy / dist) * this.speed * ts;
                }

                if (this.projectileAttackCooldown <= 0 && dist < 400) {
                    const attackChoice = Math.random();
                    if (attackChoice < 0.33) {
                        if (this.rangedAttackWarningTimer <= 0) {
                            this.rangedAttackWarningTimer = 12;
                        }
                    } else if (attackChoice < 0.7) {
                        if (this.armorBarrageWarningTimer <= 0) {
                            this.armorBarrageWarningTimer = 12;
                        }
                    } else {
                        if (this.chargeMissilesWarningTimer <= 0) {
                            this.chargeMissilesWarningTimer = 12;
                        }
                    }
                } else if (this.projectileAttackCooldown > 0) {
                    this.projectileAttackCooldown--;
                }
                
                // Process warning timers for ranged attacks
                if (this.rangedAttackWarningTimer > 0) {
                    this.rangedAttackWarningTimer--;
                    if (this.rangedAttackWarningTimer === 0) {
                        this.rangedAttack(playerX, playerY);
                        this.projectileAttackCooldown = Math.max(70, 100 - this.phase * 8);
                    }
                }
                if (this.armorBarrageWarningTimer > 0) {
                    this.armorBarrageWarningTimer--;
                    if (this.armorBarrageWarningTimer === 0) {
                        this.armorBarrage(playerX, playerY);
                        this.projectileAttackCooldown = Math.max(90, 110 - this.phase * 8);
                    }
                }
                if (this.chargeMissilesWarningTimer > 0) {
                    this.chargeMissilesWarningTimer--;
                    if (this.chargeMissilesWarningTimer === 0) {
                        this.chargeMissiles(playerX, playerY);
                        this.projectileAttackCooldown = Math.max(100, 120 - this.phase * 8);
                    }
                }

                if (this.areaAttackCooldown <= 0 && dist < this.attackRange + 30) {
                    if (Math.random() < 0.5) {
                        if (this.burstAttackWarningTimer <= 0) {
                            this.burstAttackWarningTimer = 12;
                        }
                    } else {
                        if (this.shockwaveAttackWarningTimer <= 0) {
                            this.shockwaveAttackWarningTimer = 12;
                        }
                    }
                } else if (this.areaAttackCooldown > 0) {
                    this.areaAttackCooldown--;
                }
                
                // Process warning timers for area attacks
                if (this.burstAttackWarningTimer > 0) {
                    this.burstAttackWarningTimer--;
                    if (this.burstAttackWarningTimer === 0) {
                        this.burstAttack();
                        this.areaAttackCooldown = Math.max(160, 200 - this.phase * 12);
                    }
                }
                if (this.shockwaveAttackWarningTimer > 0) {
                    this.shockwaveAttackWarningTimer--;
                    if (this.shockwaveAttackWarningTimer === 0) {
                        this.shockwaveAttack();
                        this.areaAttackCooldown = Math.max(160, 200 - this.phase * 12);
                    }
                }

                if (this.dashCooldown <= 0) {
                    this.dashTimer = 18;
                    this.dashCooldown = 140 - this.phase * 10;
                } else {
                    this.dashCooldown--;
                }
            }
        } else if (this.type === 'swarm') {
            // Swarm: se move rapidamente e spawna enxames de projéteis homing
            this.x += (dx / dist) * this.speed * 0.8 * ts;
            this.y += (dy / dist) * this.speed * 0.8 * ts;
            
            this.orbitalAngle += 0.15 * ts;
            
            if (this.swarmCooldown <= 0) {
                // Spawna 3 projéteis em formação giratória
                for (let i = 0; i < 3; i++) {
                    const angle = this.orbitalAngle + (i * Math.PI * 2 / 3);
                    const spawnX = this.x + this.width / 2 + Math.cos(angle) * 60;
                    const spawnY = this.y + this.height / 2 + Math.sin(angle) * 60;
                    
                    // 25% chance for the projectile to be homing (was usually homing); prefer marks still makes it non-homing
                    let targetX = playerX;
                    let targetY = playerY;
                    let homingOpt = (Math.random() < 0.25) ? { homing: true, homingTarget: player, homingStrength: 0.08 } : {};
                    if (Math.random() < 0.2 && swarmMarks.length > 0) {
                        const mk = swarmMarks[Math.floor(Math.random() * swarmMarks.length)];
                        targetX = mk.x;
                        targetY = mk.y;
                        homingOpt = {}; // go straight to the mark (non-homing)
                    }
                    const baseDamage = this.getAttackDamage() * 0.6;
                    const projDamage = homingOpt.homing ? Math.max(1, Math.round(baseDamage * 0.75)) : Math.max(1, Math.round(baseDamage));
                    spawnMonsterProjectile(
                        spawnX, spawnY,
                        targetX, targetY,
                        projDamage,
                        '#9c4fff',
                        6 + this.phase * 0.35,
                        Object.assign({ monsterType: this.type, size: 7, style: 'swarmBug', afterImageTrail: true, afterImageInterval: 3 }, homingOpt)
                    );
                }
                this.swarmCooldown = Math.max(50, 80 - this.phase * 6);
            } else {
                this.swarmCooldown--;
            }
            
            // Spawnar marcas a cada 1.75 segundos (105 frames)
            if (this.markSpawnCooldown <= 0) {
                const markX = Math.random() * (gameWidth - 40) + 20;
                const markY = Math.random() * (gameHeight - 40) + 20;
                swarmMarks.push({
                    x: markX,
                    y: markY,
                    radius: 15 * 1.5, // aumentar 50%
                    active: false,
                    lifetime: 300 // 5 segundos
                });
                this.markSpawnCooldown = 105; // 1.75 segundos a 60 fps
            } else {
                this.markSpawnCooldown--;
            }
        } else if (this.type === 'caster') {
            // Caster: patrulha até um ponto aleatório e pode teletransportar quando ferido
            // Teleporte quando ficar abaixo de 35% de vida (uma única vez)
            const healthPercent = this.health / this.maxHealth;
            if (healthPercent <= 0.35 && !this.hasTeleported) {
                // guard against missing teleportTarget
                if (!this.teleportTarget || typeof this.teleportTarget.x !== 'number' || typeof this.teleportTarget.y !== 'number') {
                    const corners = [
                        { x: 50, y: 50 },
                        { x: Math.max(1, gameWidth - 50), y: 50 },
                        { x: 50, y: Math.max(1, gameHeight - 50) },
                        { x: Math.max(1, gameWidth - 50), y: Math.max(1, gameHeight - 50) }
                    ];
                    this.teleportTarget = corners[Math.floor(Math.random() * corners.length)];
                }
                try {
                    try { spawnEvaporationEffect(this.x + this.width / 2, this.y + this.height / 2, '#ffffff', 18, 18); } catch (e) {}
                    // Teleportar para o teleportTarget
                    this.x = Math.max(0, Math.min(gameWidth - this.width, this.teleportTarget.x - this.width / 2));
                    this.y = Math.max(0, Math.min(gameHeight - this.height, this.teleportTarget.y - this.height / 2));
                    try { spawnEvaporationEffect(this.x + this.width / 2, this.y + this.height / 2, '#ffffff', 18, 18); } catch (e) {}
                    this.hasTeleported = true;
                    // depois do teleporte, considere que alcançou patrulha para ficar parado
                    this.reachedPatrol = true;
                } catch (e) {
                    console.error('Caster teleport failed', e && e.stack ? e.stack : e, { teleportTarget: this.teleportTarget });
                }
            }

            // Movimento: ir até patrolTarget e ficar parado quando alcançado
            if (!this.reachedPatrol && this.patrolTarget) {
                const patrolCenterX = this.x + this.width / 2;
                const patrolCenterY = this.y + this.height / 2;
                const pdx = this.patrolTarget.x - patrolCenterX;
                const pdy = this.patrolTarget.y - patrolCenterY;
                const pDist = Math.hypot(pdx, pdy) || 0.0001;
                const patrolSpeed = this.speed * 1.0;

                // Incrementar timer de patrulha para casters
                if (this.type === 'caster') {
                    this.patrolTimer = (this.patrolTimer || 0) + 1;
                    if (!this.onFire && this.patrolTimer >= (this.patrolTimeout || 480)) {
                        this.onFire = true;
                        // Aumentar muito a velocidade quando em chamas
                        this.speed = (this.speed || 0.5) * 6.0;
                        this.fireAttackCooldown = 0;
                    }
                }

                if (pDist > 18) {
                    this.x += (pdx / pDist) * patrolSpeed * ts;
                    this.y += (pdy / pDist) * patrolSpeed * ts;
                } else {
                    this.reachedPatrol = true;
                }
            }
            
            const portalWarningDuration = 30; // 0.5 segundos
            const portalActiveDuration = 45;
            const portalInterval = Math.max(140 - this.phase * 8, 90);
            const portalIdleAfterActive = Math.max(portalInterval - portalActiveDuration - portalWarningDuration, 0);
            const portalModeToggleInterval = 240; // Alterna entre circular e spiral a cada 4 segundos

            // Atualiza o cooldown de alternância de modo
            if (this.portalModeToggleCooldown > 0) {
                this.portalModeToggleCooldown--;
            } else {
                // Alterna o modo de ataque entre as variantes do caster
                const portalModes = ['circular', 'spiral', 'ring', 'aim16', 'ember'];
                const currentIndex = portalModes.indexOf(this.portalAttackMode);
                this.portalAttackMode = portalModes[(currentIndex + 1) % portalModes.length];
                this.portalModeToggleCooldown = portalModeToggleInterval;
                this.spiralProjectileCount = 0;
            }

            // determine screen center (fallback para player se camera não definido)
            const screenCenterX = (typeof cameraX !== 'undefined' && typeof viewportWidth !== 'undefined') ? cameraX + viewportWidth / 2 : playerX;
            const screenCenterY = (typeof cameraY !== 'undefined' && typeof viewportHeight !== 'undefined') ? cameraY + viewportHeight / 2 : playerY;

            if (this.portalTimer <= 0 && this.portalWarningTimer <= 0 && this.portalCooldown <= 0) {
                // Inicia aviso antes de aparecer o portal — spawnar próximo/visível na tela do jogador
                this.portalX = screenCenterX + (Math.random() - 0.5) * (viewportWidth || 800);
                this.portalY = screenCenterY + (Math.random() - 0.5) * (viewportHeight || 600);
                this.portalWarningTimer = portalWarningDuration;
                this.portalTimer = 0;
            }

            // Remote periodic caster attacks (independent of the original caster state)
            if (typeof this.remoteAttackTimer === 'number') {
                if (this.remoteAttackTimer <= 0) {
                    this.spawnRemoteCasterAttack(screenCenterX, screenCenterY);
                    this.remoteAttackTimer = this.remoteAttackCooldown;
                } else {
                    this.remoteAttackTimer--;
                }
            }

            if (this.portalWarningTimer > 0) {
                this.portalWarningTimer--;
                if (this.portalWarningTimer === 0) {
                    try {
                        // Use custom portal duration if set (e.g., for aim16)
                        const effectivePortalDuration = this.nextPortalActiveDuration || portalActiveDuration;
                        this.portalTimer = effectivePortalDuration;
                        this.nextPortalActiveDuration = null; // reset for next use
                        this.spiralProjectileCount = 0; // Reset spiral counter
                        // Execute single-shot portal attacks immediately when the portal becomes active
                                    if (this.portalAttackMode === 'ring') {
                            this.casterRingWaveAttack();
                        } else if (this.portalAttackMode === 'aim16') {
                            this.casterAimedVolley(screenCenterX, screenCenterY);
                        } else if (this.portalAttackMode === 'ember') {
                            this.casterEmberBurst(screenCenterX, screenCenterY);
                        }
                    } catch (e) {
                        console.error('Error activating caster portal attack', { err: e && e.stack ? e.stack : e, portalAttackMode: this.portalAttackMode, portalX: this.portalX, portalY: this.portalY, playerX, playerY });
                        // Fail-safe: disable portal timers to avoid repeated crashes
                        this.portalTimer = 0;
                        this.portalWarningTimer = 0;
                        this.portalCooldown = Math.max(portalInterval - portalActiveDuration - portalWarningDuration, 0);
                    }
                }
            } else if (this.portalTimer > 0) {
                const fireBoost = this.onFire ? this.fireAttackBoost : 1;
                if (this.portalTimer % 12 === 0) {
                    if (this.portalAttackMode === 'circular') {
                        // Ataque circular com chamas breves
                        const rayCount = 5 + this.phase;
                        for (let i = 0; i < rayCount; i++) {
                            const angle = (Math.PI * 2 * i) / rayCount;
                            const targetX = this.portalX + Math.cos(angle) * 1200;
                            const targetY = this.portalY + Math.sin(angle) * 1200;
                            spawnMonsterProjectile(
                                this.portalX, this.portalY,
                                targetX, targetY,
                                Math.max(2, Math.round(this.getAttackDamage() * 0.7 * fireBoost)),
                                '#ff9e3c',
                                4.5 + this.phase * 0.2,
                                { monsterType: this.type, size: 16, style: 'casterFlameCircle', homing: false, afterImageTrail: false, afterImageInterval: 5 }
                            );
                        }
                    } else if (this.portalAttackMode === 'spiral') {
                        // Ataque em espiral de chamas
                        const fireBoost = this.onFire ? this.fireAttackBoost : 1;
                        const spiralCount = 5 + this.phase;
                        const spiralSpacing = 0.25; // Ângulo entre cada projétil na espiral
                        for (let i = 0; i < spiralCount; i++) {
                            const angle = (Math.PI * 2 * i) / spiralCount + this.spiralProjectileCount * spiralSpacing;
                            const targetX = this.portalX + Math.cos(angle) * 1200;
                            const targetY = this.portalY + Math.sin(angle) * 1200;
                            spawnMonsterProjectile(
                                this.portalX, this.portalY,
                                targetX, targetY,
                                Math.max(2, Math.round(this.getAttackDamage() * 0.7 * fireBoost)),
                                '#ff6a2d',
                                4.5 + this.phase * 0.2,
                                { monsterType: this.type, size: 16, style: 'casterFlameSpiral', homing: false, afterImageTrail: false, afterImageInterval: 5 }
                            );
                        }
                        this.spiralProjectileCount++; // Incrementa para próxima rodada
                    } else if (this.portalAttackMode === 'ring' && this.portalTimer === portalActiveDuration) {
                        this.casterRingWaveAttack();
                    } else if (this.portalAttackMode === 'aim16' && this.portalTimer === portalActiveDuration) {
                        this.casterAimedVolley(screenCenterX, screenCenterY);
                    } else if (this.portalAttackMode === 'ember' && this.portalTimer === portalActiveDuration) {
                        this.casterEmberBurst(screenCenterX, screenCenterY);
                    }
                }
                this.portalTimer--;
                    if (this.portalTimer === 0) {
                    this.portalCooldown = portalIdleAfterActive;
                }
            } else if (this.portalCooldown > 0) {
                this.portalCooldown--;
            }
        } else if (this.type === 'smart') {
            const predicted = getPredictedPlayerPosition(24);
        this.circleAngle += (0.04 + this.phase * 0.005) * ts;
        const targetOrbitX = playerX + Math.cos(this.circleAngle) * this.smartRange;
        const targetOrbitY = playerY + Math.sin(this.circleAngle) * this.smartRange;
        const angleToOrbit = Math.atan2(targetOrbitY - this.y, targetOrbitX - this.x);

        this.x += Math.cos(angleToOrbit) * this.speed * 0.96 * ts;
        this.y += Math.sin(angleToOrbit) * this.speed * 0.96 * ts;
            if (this.hitscanWarningTimer > 0) {
                this.hitscanWarningTimer--;
                if (this.hitscanWarningTimer === 0 && this.hitscanTargetX !== null && this.hitscanTargetY !== null) {
                    this.smartHitscan(this.hitscanTargetX, this.hitscanTargetY);
                    this.hitscanTargetX = null;
                    this.hitscanTargetY = null;
                }
            }

            if (this.projectileAttackCooldown <= 0) {
                this.smartVolley(predicted.x, predicted.y);
                if (Math.random() < 0.45) {
                    this.startSmartHitscanWarning(predicted.x, predicted.y);
                }
                this.projectileAttackCooldown = Math.max(90, 120 - this.phase * 6);
            } else {
                this.projectileAttackCooldown--;
            }

            if (this.areaAttackCooldown <= 0 && dist < this.smartRange + 60) {
                this.smartBurst(predicted.x, predicted.y);
                this.areaAttackCooldown = Math.max(130, 160 - this.phase * 8);
            } else if (this.areaAttackCooldown > 0) {
                this.areaAttackCooldown--;
            }
        } else if (this.type === 'simple') {
            if (this.simpleVariant === 'croc') {
                if (this.simpleDashPauseTimer > 0) {
                    this.simpleDashPauseTimer--;
                    this.attackCooldown = 1;
                } else if (this.simpleDashTimer > 0) {
                    this.x += this.simpleDashVx * ts;
                    this.y += this.simpleDashVy * ts;
                    this.simpleDashTimer--;
                    if (this.simpleDashTimer <= 0) {
                        this.simpleDashPauseTimer = 30;
                        this.simpleDashCooldown = 45 + Math.round(Math.random() * 20);
                        this.attackCooldown = 60;
                    }
                } else if (this.simpleDashCooldown > 0) {
                    this.simpleDashCooldown--;
                    this.attackCooldown = 1;
                } else {
                    let dashDir = Math.atan2(playerY - monsterCenterY, playerX - monsterCenterX);
                    if (this.confusedTimer > 0) dashDir += Math.PI;
                    this.simpleDashDirection = dashDir;
                    this.simpleDashVx = Math.cos(dashDir) * this.simpleDashSpeed;
                    this.simpleDashVy = Math.sin(dashDir) * this.simpleDashSpeed;
                    this.simpleDashTimer = 12;
                    this.attackCooldown = 0;
                }
                const targetOpen = this.simpleDashTimer > 0 ? 1 : 0;
                this.simpleDashOpen += (targetOpen - this.simpleDashOpen) * 0.18;
                this.x = Math.max(0, Math.min(this.x, gameWidth - this.width));
                this.y = Math.max(0, Math.min(this.y, gameHeight - this.height));
            } else {
                const approachSpeed = this.speed * 1.05 * ts;

                if (dist > this.attackRange * 0.95) {
                    this.x += (dx / safeDist) * approachSpeed;
                    this.y += (dy / safeDist) * approachSpeed;
                } else {
                    const swirl = Math.sin(gameFrameCount * 0.16) * 0.14;
                    this.x += (dx / safeDist) * approachSpeed * 0.3 + (-dy / safeDist) * approachSpeed * swirl;
                    this.y += (dy / safeDist) * approachSpeed * 0.3 + (dx / safeDist) * approachSpeed * swirl;
                }

                if (this.projectileAttackCooldown > 0) {
                    this.projectileAttackCooldown--;
                }
                if (this.clawAttackTimer > 0) {
                    this.clawAttackTimer--;
                    if (this.clawAttackTimer === 8) {
                        const attackDir = this.simpleClawDirection !== undefined
                            ? this.simpleClawDirection
                            : Math.atan2(playerY - (this.y + this.height / 2), playerX - (this.x + this.width / 2));
                        const playerDir = Math.atan2(playerY - (this.y + this.height / 2), playerX - (this.x + this.width / 2));
                        let delta = Math.abs(playerDir - attackDir);
                        while (delta > Math.PI) delta = Math.abs(delta - Math.PI * 2);
                        const coneAngle = this.simpleClawAngle || Math.PI * 0.78;
                        const coneRange = this.simpleClawRange || this.attackRange * 2.2;

                        if (dist <= coneRange && delta <= coneAngle / 2) {
                            // Verificar invulnerabilidade do jogador
                            if (player.dashTimer <= 0 && player.postDashInvulnTimer <= 0 && player.slashDashInvulnTimer <= 0) {
                                const meleeDamage = Math.max(1, this.getAttackDamage() + 1);
                                const effectiveDamage = Math.max(0, meleeDamage - (player.damageReduction || 0));
                                player.health -= effectiveDamage;
                                if (this.type === 'simple') {
                                    tryApplyPlayerConfusionFromAttack(this.type, { chance: 2 });
                                }
                                spawnAfterImage({
                                    kind: 'player',
                                    x: player.x,
                                    y: player.y,
                                    width: player.width,
                                    height: player.height,
                                    life: 14,
                                    maxLife: 14,
                                    baseAlpha: 0.45
                                });
                            }
                        }
                    }
                }
                const meleeThreshold = (this.simpleClawRange || this.attackRange * 2.2) + 18;
                if (dist > meleeThreshold) {
                    if (this.projectileAttackCooldown <= 0) {
                        const pawAngle = Math.atan2(playerY - (this.y + this.height / 2), playerX - (this.x + this.width / 2));
                        const projSpeed = 4.5 + this.phase * 0.2;
                        for (let i = -1; i <= 1; i++) {
                            const angleOffset = i * 0.18;
                            const angle = pawAngle + angleOffset;
                            const targetX = this.x + this.width / 2 + Math.cos(angle) * 220;
                            const targetY = this.y + this.height / 2 + Math.sin(angle) * 220;
                            spawnMonsterProjectile(
                                this.x + this.width / 2,
                                this.y + this.height / 2,
                                targetX,
                                targetY,
                                Math.max(2, this.getAttackDamage() - 1),
                                '#f9b9ff',
                                projSpeed,
                                { monsterType: 'simple', size: 12, style: 'yarnBall' }
                            );
                        }
                        this.projectileAttackCooldown = Math.max(70, 90 - this.phase * 3);
                    }
                } else if (this.attackCooldown <= 0 && this.clawAttackTimer === 0) {
                    this.attackCooldown = 42;
                    this.attackEffectTimer = 28;
                    this.clawAttackTimer = 20;
                    this.simpleClawDirection = Math.atan2(playerY - (this.y + this.height / 2), playerX - (this.x + this.width / 2));
                    this.simpleClawAngle = Math.PI * 0.78;
                    this.simpleClawRange = this.attackRange * 2.2;
                }
            }
        } else if (this.type === 'castle_bone_sphere') {
            if (this.specialAttackCooldown > 0) this.specialAttackCooldown--;
            const angleToPlayer = Math.atan2(playerY - monsterCenterY, playerX - monsterCenterX);
            const angleDelta = normalizeAngle(angleToPlayer - this.rotationAngle);
            this.rotationAngle += angleDelta * 0.12 * ts;
            this.rotationAngle = normalizeAngle(this.rotationAngle);

            const movingSpeed = this.speed * ts;
            if (dist > this.attackRange * 0.9) {
                this.x += Math.cos(angleToPlayer) * movingSpeed;
                this.y += Math.sin(angleToPlayer) * movingSpeed;
            } else {
                const orbitAngle = angleToPlayer + Math.PI / 2;
                this.x += Math.cos(orbitAngle) * movingSpeed * 0.25;
                this.y += Math.sin(orbitAngle) * movingSpeed * 0.25;
            }

            if (this.boneRainCooldown <= 0) {
                this.attackEffectTimer = 18;
                const projectileCount = 5;
                for (let i = 0; i < projectileCount; i += 1) {
                    const spread = (i - (projectileCount - 1) / 2) * 0.18 + (Math.random() - 0.5) * 0.08;
                    const angle = angleToPlayer + spread;
                    const startX = monsterCenterX + Math.cos(angle) * 48 + (Math.random() - 0.5) * 12;
                    const startY = monsterCenterY + Math.sin(angle) * 48 + (Math.random() - 0.5) * 12;
                    const targetX = playerX + (Math.random() - 0.5) * 100;
                    const targetY = playerY + (Math.random() - 0.5) * 100;
                    spawnMonsterProjectile(
                        startX,
                        startY,
                        targetX,
                        targetY,
                        Math.max(3, Math.round(this.getAttackDamage() * 0.85)),
                        '#ffffff',
                        5.2,
                        {
                            monsterType: 'castle_bone_sphere',
                            projectileEmoji: '☠',
                            size: 12,
                            style: 'boneShard',
                            homing: true,
                            homingTarget: player,
                            homingStrength: 0.14,
                            homingDuration: 110,
                            maxDistance: 980,
                            afterImageTrail: true,
                            afterImageInterval: 6
                        }
                    );
                }
                this.boneRainCooldown = Math.max(80, 120 - this.phase * 4);
            } else {
                this.boneRainCooldown -= 1;
            }

            if (this.boneRingCooldown <= 0) {
                spawnCastleBossProjectileRing(monsterCenterX, monsterCenterY, this.rotationAngle, 10, 5.0, '#9cb8ff', '🦴');
                this.boneRingCooldown = Math.max(110, 150 - this.phase * 4);
            } else {
                this.boneRingCooldown -= 1;
            }

            if (this.specialAttackCooldown <= 0 && dist < this.attackRange * 1.05) {
                this.attackEffectTimer = 20;
                    this.specialAttackCooldown = 210;
                if (player) player.stunTimer = 120;
                spawnCastleBossProjectileRing(monsterCenterX, monsterCenterY, this.rotationAngle + Math.PI / 6, 12, 4.6, '#d6e4ff', '☠');
                for (let i = 0; i < 4; i += 1) {
                    const angle = Math.random() * Math.PI * 2;
                    const startX = monsterCenterX + Math.cos(angle) * 38;
                    const startY = monsterCenterY + Math.sin(angle) * 38;
                    const targetX = monsterCenterX + Math.cos(angle) * (240 + Math.random() * 90);
                    const targetY = monsterCenterY + Math.sin(angle) * (240 + Math.random() * 90);
                    spawnMonsterProjectile(
                        startX,
                        startY,
                        targetX,
                        targetY,
                        Math.max(4, Math.round(this.getAttackDamage() * 0.95)),
                        '#dfe8ff',
                        5.4,
                        {
                            monsterType: 'castle_bone_sphere',
                            projectileEmoji: '☠',
                            size: 14,
                            style: 'tankOrbit',
                            homing: false,
                            maxDistance: 980,
                            afterImageTrail: true,
                            afterImageInterval: 6
                        }
                    );
                }
            }

            if (this.stunTimer > 0) {
                this.stunTimer -= 1;
                return;
            }
        } else if (this.type === 'croc') {
            this.crocDecoyWanderTimer--;
            if (this.crocDecoyWanderTimer <= 0) {
                this.crocDecoyWanderTimer = 60 + Math.floor(Math.random() * 120);
                this.crocDecoyAngle += (Math.random() - 0.5) * Math.PI * 1.5;
            }
            const decoySpeed = 1.0 * ts;
            this.crocDecoyX += Math.cos(this.crocDecoyAngle) * decoySpeed;
            this.crocDecoyY += Math.sin(this.crocDecoyAngle) * decoySpeed;
            this.crocDecoyX = Math.max(20, Math.min(gameWidth - 20, this.crocDecoyX));
            this.crocDecoyY = Math.max(20, Math.min(gameHeight - 20, this.crocDecoyY));

            if (this.confusedTimer > 0) {
                this.confusedTimer--;
                if (this.confusedTimer === 0 && this.postConfusionRoar) {
                    this.postConfusionRoar = false;
                    this.roarQueued = true;
                    this.roarTimer = 60;
                    this.stunTimer = 0;
                    this.sprintEscapeTimer = 0;
                    this.simpleDashTimer = 0;
                    this.simpleDashWarningTimer = 0;
                    this.simpleDashPauseTimer = 0;
                    this.simpleDashCooldown = 0;
                    this.hasRoaredThisEntry = true;
                    const roarCenterX = this.crocDecoyX;
                    const roarCenterY = this.crocDecoyY;
                    cameraLockTarget = { x: roarCenterX, y: roarCenterY, timer: 60 };
                    roarFreezeTimer = 60;
                    slowdownTimer = 0;
                    screenShakeTimer = Math.max(screenShakeTimer, 60);
                    if (this.isOffScreen) {
                        const spawnAngle = this.crocOffsetAngle;
                        const spawnDist = this.crocOffsetDist;
                        const spawnX = Math.max(0, Math.min(gameWidth - this.width, this.crocDecoyX + Math.cos(spawnAngle) * spawnDist - this.width / 2));
                        const spawnY = Math.max(0, Math.min(gameHeight - this.height, this.crocDecoyY + Math.sin(spawnAngle) * spawnDist - this.height / 2));
                        this.x = spawnX;
                        this.y = spawnY;
                        this.isOffScreen = false;
                        this.fakeMarkerX = this.crocDecoyX;
                        this.fakeMarkerY = this.crocDecoyY;
                    }
                }
            }

            const isOnScreen = this.x + this.width >= cameraX &&
                this.x <= cameraX + viewportWidth &&
                this.y + this.height >= cameraY &&
                this.y <= cameraY + viewportHeight;
            const wasOffScreen = this.isOffScreen;
            this.isOffScreen = !isOnScreen;

            if (this.isOffScreen && !wasOffScreen) {
                this.hasRoaredThisEntry = false;
            }

            if (this.isOffScreen) {
                this.crocCircleAngle += this.crocCircleSpeed * ts * 2;
                const orbitX = this.crocDecoyX + Math.cos(this.crocCircleAngle) * this.crocCircleRadius;
                const orbitY = this.crocDecoyY + Math.sin(this.crocCircleAngle) * this.crocCircleRadius;
                const angleToOrbit = Math.atan2(orbitY - this.y, orbitX - this.x);
                const offScreenSpeed = (this.simpleDashSpeed || 16.5) * 2 * ts;
                this.x += Math.cos(angleToOrbit) * offScreenSpeed;
                this.y += Math.sin(angleToOrbit) * offScreenSpeed;
                this.alpha = 0;
                this.simpleDashOpen += (0 - this.simpleDashOpen) * 0.25;

                if (wasOffScreen && !isOnScreen) {
                    this.fakeMarkerX = this.crocDecoyX;
                    this.fakeMarkerY = this.crocDecoyY;
                }
            } else {
                this.alpha = 1;
                this.fakeMarkerX = this.crocDecoyX;
                this.fakeMarkerY = this.crocDecoyY;

                if (wasOffScreen && isOnScreen) {
                    this.lastOnScreenFrame = gameFrameCount;
                    if (!this.roarQueued && !this.postConfusionRoar && !this.hasRoaredThisEntry) {
                        this.roarQueued = true;
                        this.roarTimer = 60;
                        this.hasRoaredThisEntry = true;
                        const roarCenterX = this.crocDecoyX;
                        const roarCenterY = this.crocDecoyY;
                        cameraLockTarget = { x: roarCenterX, y: roarCenterY, timer: 60 };
                        roarFreezeTimer = 60;
                        screenShakeTimer = Math.max(screenShakeTimer, 60);
                    }
                }

                if (this.roarTimer > 0) {
                    this.roarTimer--;
                    this.simpleDashOpen += (1 - this.simpleDashOpen) * 0.22;
                    this.x = Math.max(0, Math.min(this.x, gameWidth - this.width));
                    this.y = Math.max(0, Math.min(this.y, gameHeight - this.height));
                    if (this.roarTimer === 20) {
                        screenShakeTimer = Math.max(screenShakeTimer, 22);
                        if (player) {
                            player.stunTimer = Math.max(player.stunTimer || 0, 12);
                            tryApplyPlayerConfusionFromAttack('croc', {
                                chance: 100,
                                durationFrames: Math.round(0.75 * 60)
                            });
                        }
                    }
                    if (this.roarTimer <= 0) {
                        this.roarQueued = false;
                        this.simpleDashCooldown = 45 + Math.round(Math.random() * 20);
                    }
                } else if (this.sprintEscapeTimer > 0) {
                    this.sprintEscapeTimer--;
                    const sprintSpeed = this.simpleDashSpeed * 1.6 * ts;
                    this.x += Math.cos(this.sprintEscapeDir) * sprintSpeed;
                    this.y += Math.sin(this.sprintEscapeDir) * sprintSpeed;
                    this.simpleDashOpen += (1 - this.simpleDashOpen) * 0.24;
                    this.x = Math.max(0, Math.min(this.x, gameWidth - this.width));
                    this.y = Math.max(0, Math.min(this.y, gameHeight - this.height));
                    if (this.sprintEscapeTimer <= 0) {
                        this.simpleDashCooldown = 45 + Math.round(Math.random() * 20);
                        this.consecutiveHitsOnPlayer = 0;
                    }
                } else if (this.stunTimer > 0) {
                    this.stunTimer--;
                    this.simpleDashOpen += (0 - this.simpleDashOpen) * 0.2;
                } else if (this.simpleDashPauseTimer > 0) {
                    this.simpleDashPauseTimer--;
                    this.attackCooldown = 1;
                    this.simpleDashOpen += (0 - this.simpleDashOpen) * 0.18;
                } else if (this.simpleDashWarningTimer > 0) {
                    this.simpleDashWarningTimer--;
                    this.simpleDashOpen += (0.5 - this.simpleDashOpen) * 0.18;
                    if (this.simpleDashWarningTimer <= 0) {
                        this.simpleDashTimer = 20;
                        this.attackCooldown = 0;
                    }
                } else if (this.simpleDashTimer > 0) {
                    this.x += this.simpleDashVx * ts;
                    this.y += this.simpleDashVy * ts;
                    this.simpleDashTimer--;
                    this.simpleDashOpen += (1 - this.simpleDashOpen) * 0.22;
                    if (this.simpleDashTimer <= 0) {
                        this.simpleDashPauseTimer = 30;
                        this.simpleDashCooldown = 45 + Math.round(Math.random() * 20);
                        this.attackCooldown = 60;
                    }
                } else if (this.simpleDashCooldown > 0) {
                    this.simpleDashCooldown--;
                    this.attackCooldown = 1;
                    this.simpleDashOpen += (0 - this.simpleDashOpen) * 0.18;
                } else {
                    let dashDir = Math.atan2(playerY - monsterCenterY, playerX - monsterCenterX);
                    if (this.confusedTimer > 0) dashDir += Math.PI;
                    this.simpleDashDirection = dashDir;
                    this.simpleDashVx = Math.cos(dashDir) * this.simpleDashSpeed;
                    this.simpleDashVy = Math.sin(dashDir) * this.simpleDashSpeed;
                    this.simpleDashWarningTimer = this.simpleDashWarningDuration;
                    this.attackCooldown = 1;
                    this.simpleDashOpen += (0 - this.simpleDashOpen) * 0.18;
                }
                this.x = Math.max(0, Math.min(this.x, gameWidth - this.width));
                this.y = Math.max(0, Math.min(this.y, gameHeight - this.height));
            }
        } else {
            // Basic: fallback
            if (dist > this.attackRange) {
                if (dx > 0) this.x += this.speed * ts;
                else this.x -= this.speed * ts;
                if (dy > 0) this.y += this.speed * ts;
                else this.y -= this.speed * ts;
            }

            if (this.tookDamage && this.splitAttackCooldown <= 0) {
                this.splitAwareAttack(playerX, playerY);
                this.splitAttackCooldown = 120;
                this.tookDamage = false;
            }

            if (this.projectileAttackCooldown <= 0 && dist > this.attackRange + 30) {
                this.guidedAttack(playerX, playerY);
                this.projectileAttackCooldown = this.type === 'avianightmare'
                    ? Math.max(100, 130 - this.phase * 6) * 4
                    : Math.max(80, 110 - this.phase * 8) * 4;
            } else if (this.projectileAttackCooldown > 0) {
                this.projectileAttackCooldown--;
            }

            if (this.areaAttackCooldown <= 0 && dist < this.attackRange + 25) {
                this.burstAttack();
                this.areaAttackCooldown = this.type === 'avianightmare'
                    ? Math.max(190, 230 - this.phase * 12)
                    : Math.max(170, 210 - this.phase * 12);
            } else if (this.areaAttackCooldown > 0) {
                this.areaAttackCooldown--;
            }

            if (this.splitAttackCooldown > 0) {
                this.splitAttackCooldown--;
            }
        }

        this.x = Math.max(0, Math.min(this.x, gameWidth - this.width));
        this.y = Math.max(0, Math.min(this.y, gameHeight - this.height / 2));

        if (this.attackEffectTimer > 0) this.attackEffectTimer--;
        if (this.attackCooldown > 0) this.attackCooldown--;
    }

    rangedAttack(playerX, playerY) {
        const shots = this.type === 'shooter'
            ? 8 + this.phase
            : Math.floor(Math.random() * 4) + 2;

        const speed = this.type === 'shooter'
            ? (this.projectileSpeed || 6) * 0.25
            : this.type === 'tank' ? 8 : 5;

        for (let i = 0; i < shots; i++) {
            const angle = (Math.PI * 2 / shots) * i;
            const targetX = this.x + this.width / 2 + Math.cos(angle) * 120;
            const targetY = this.y + this.height / 2 + Math.sin(angle) * 120;

            spawnMonsterProjectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                this.getAttackDamage(),
                '#00ccff',
                speed,
                { monsterType: this.type }
            );
        }
    }

    burstAttack() {
        this.attackEffectTimer = 12;
        const particles = 6;
        const color = this.type === 'tank' ? '#ff5555' : this.type === 'shooter' ? '#88ddff' : '#ffdd55';
        const speed = this.type === 'tank' ? 6.65 : this.type === 'shooter' ? 1.5 : 4.5;

        for (let i = 0; i < particles; i++) {
            const angle = (Math.PI * 2 / particles) * i;
            const targetX = this.x + this.width / 2 + Math.cos(angle) * 120;
            const targetY = this.y + this.height / 2 + Math.sin(angle) * 120;

            spawnMonsterProjectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                Math.max(2, this.getAttackDamage() - 2),
                color,
                speed,
                { monsterType: this.type }
            );
        }
    }

    casterRingWaveAttack() {
        this.attackEffectTimer = 14;
        const fireBoost = this.onFire ? this.fireAttackBoost : 1;
        const waveCount = 1 + Math.floor(Math.random() * 3);
        const baseSpeed = 3.4 + this.phase * 0.14;
        const framesBetweenWaves = Math.round(0.35 * 60);

        // Schedule each wave with a delay so they appear separated in time
        for (let wave = 0; wave < waveCount; wave++) {
            const delay = wave * framesBetweenWaves;
            const ringCount = 18;
            const radius = 960 + wave * 192;
            const speed = Math.max(1.6, baseSpeed - wave * 0.22);
            const damage = Math.max(2, Math.round(this.getAttackDamage() * 0.6 * fireBoost));
            const color = '#ffb95d';

            const projectilesForWave = [];
            for (let i = 0; i < ringCount; i++) {
                const angle = (Math.PI * 2 / ringCount) * i + wave * 0.1;
                const targetX = this.portalX + Math.cos(angle) * radius;
                const targetY = this.portalY + Math.sin(angle) * radius;
                projectilesForWave.push({ targetX, targetY, damage, color, speed, size: 16, style: 'casterFlameRing' });
            }

            delayedProjectileSpawns.push({
                timer: delay,
                kind: 'monsterRing',
                srcX: this.portalX,
                srcY: this.portalY,
                projectiles: projectilesForWave
            });
        }
    }

    casterEmberBurst(playerX, playerY, srcX = this.portalX, srcY = this.portalY) {
        const fireBoost = this.onFire ? this.fireAttackBoost : 1;
        const burstCount = 7 + Math.min(3, this.phase);
        const baseAngle = Math.atan2(playerY - srcY, playerX - srcX);
        for (let i = 0; i < burstCount; i++) {
            const spread = (i - (burstCount - 1) / 2) * 0.22;
            const angle = baseAngle + spread;
            const targetX = srcX + Math.cos(angle) * 480;
            const targetY = srcY + Math.sin(angle) * 480;
            spawnMonsterProjectile(
                srcX,
                srcY,
                targetX,
                targetY,
                Math.max(2, Math.round(this.getAttackDamage() * 0.5 * fireBoost)),
                '#ff9e3c',
                3.4 + this.phase * 0.1,
                {
                    monsterType: this.type,
                    size: 13,
                    style: 'casterFlameCircle',
                    homing: true,
                    homingStrength: 0.05,
                    homingDuration: 140,
                    explodeOnExpire: true,
                    explodeCount: 3
                }
            );
        }
        this.attackEffectTimer = 12;
    }

    casterAimedVolley(playerX, playerY) {
        if (this.confusedTimer > 0) {
            playerX = this.x + this.width / 2 - (playerX - (this.x + this.width / 2));
            playerY = this.y + this.height / 2 - (playerY - (this.y + this.height / 2));
        }
        this.attackEffectTimer = 14;
        const fireBoost = this.onFire ? this.fireAttackBoost : 1;
        const shots = 16;
        const speed = (2.2 + this.phase * 0.08) * 1.8; // increased by ~1.8x
        const baseX = playerX; // capture player position at spawn time
        const baseY = playerY; // capture player position at spawn time
        const framesPerShot = Math.max(1, Math.round(0.05 * 60 * 10 * 3)); // 3x interval

        for (let i = 0; i < shots; i++) {
            const offset = (i - (shots - 1) / 2) * 0.06;
            const targetX = baseX + Math.cos(offset) * 27;
            const targetY = baseY + Math.sin(offset) * 27;
            const delay = i * framesPerShot;

            delayedProjectileSpawns.push({
                timer: delay,
                kind: 'monsterAimed',
                srcX: this.portalX,
                srcY: this.portalY,
                targetX,
                targetY,
                damage: Math.max(2, Math.round(this.getAttackDamage() * 0.64 * fireBoost)),
                color: this.confusedTimer > 0 ? '#ffd880' : '#ffb14a',
                speed,
                monsterType: this.type,
                size: 16,
                style: 'casterFlameVolley',
                explodeOnExpire: true,
                explodeCount: 3
            });
        }

        // Calculate portal duration: portal should disappear when last shot appears
        this.nextPortalActiveDuration = (shots - 1) * framesPerShot + 10;
    }

    spawnRemoteCasterAttack(playerX, playerY) {
        // Choose a remote location roughly on the opposite side of the player
        const margin = 60;
        const srcX = (playerX < gameWidth / 2) ? (gameWidth - margin) : margin;
        const srcY = Math.max(40, Math.min(gameHeight - 40, Math.random() * (gameHeight - 80) + 40));
        const fireBoost = this.onFire ? this.fireAttackBoost : 1;

        // choose attack mode
        const modes = ['circular', 'spiral', 'ring', 'aim16', 'ember'];
        const mode = modes[Math.floor(Math.random() * modes.length)];

        if (mode === 'circular') {
            const rayCount = 5 + this.phase;
            const speed = 4.0 + this.phase * 0.2;
            for (let i = 0; i < rayCount; i++) {
                const angle = (Math.PI * 2 / rayCount) * i;
                const targetX = srcX + Math.cos(angle) * 1200;
                const targetY = srcY + Math.sin(angle) * 1200;
                spawnMonsterProjectile(srcX, srcY, targetX, targetY, Math.max(2, Math.round(this.getAttackDamage() * 0.7 * fireBoost)), '#ff9c46', speed, { monsterType: this.type, size: 16, style: 'casterFlameCircle', explodeOnExpire: true, explodeCount: 3, homing: false, afterImageTrail: false, afterImageInterval: 5 });
            }
        } else if (mode === 'spiral') {
            const spiralCount = 5 + this.phase;
            const spiralSpacing = 0.25;
            const speed = 4.0 + this.phase * 0.2;
            for (let i = 0; i < spiralCount; i++) {
                const angle = (Math.PI * 2 * i) / spiralCount + Math.random() * spiralSpacing;
                const targetX = srcX + Math.cos(angle) * 1200;
                const targetY = srcY + Math.sin(angle) * 1200;
                spawnMonsterProjectile(srcX, srcY, targetX, targetY, Math.max(2, Math.round(this.getAttackDamage() * 0.7 * fireBoost)), '#ff7430', speed, { monsterType: this.type, size: 16, style: 'casterFlameSpiral', explodeOnExpire: true, explodeCount: 3, homing: false, afterImageTrail: false, afterImageInterval: 5 });
            }
        } else if (mode === 'ring') {
            // schedule 1-3 waves like casterRingWaveAttack did
            const waveCount = 1 + Math.floor(Math.random() * 3);
            const baseSpeed = 3.4 + this.phase * 0.14;
            const framesBetweenWaves = Math.round(0.35 * 60);
            for (let wave = 0; wave < waveCount; wave++) {
                const delay = wave * framesBetweenWaves;
                const ringCount = 18;
                const radius = 960 + wave * 192;
                const speed = Math.max(1.6, baseSpeed - wave * 0.22);
                const damage = Math.max(2, Math.round(this.getAttackDamage() * 0.6 * fireBoost));
                const color = '#ffb95d';
                const projectilesForWave = [];
                for (let i = 0; i < ringCount; i++) {
                    const angle = (Math.PI * 2 / ringCount) * i + wave * 0.1;
                    const targetX = srcX + Math.cos(angle) * radius;
                    const targetY = srcY + Math.sin(angle) * radius;
                    projectilesForWave.push({ targetX, targetY, damage, color, speed, size: 16, style: 'casterFlameRing', explodeOnExpire: true, explodeCount: 4 });
                }
                delayedProjectileSpawns.push({ timer: delay, kind: 'monsterRing', srcX, srcY, projectiles: projectilesForWave });
            }
        } else if (mode === 'aim16') {
            const shots = 16;
            const speed = (2.2 + this.phase * 0.08) * 1.8; // match the increased speed
            const framesPerShot = Math.max(1, Math.round(0.05 * 60 * 10 * 3)); // same cadence as adjusted aim16
            for (let i = 0; i < shots; i++) {
                const offset = (i - (shots - 1) / 2) * 0.06;
                const targetX = playerX + Math.cos(offset) * 27;
                const targetY = playerY + Math.sin(offset) * 27;
                const delay = i * framesPerShot;
                delayedProjectileSpawns.push({ timer: delay, kind: 'monsterAimed', srcX, srcY, targetX, targetY, damage: Math.max(2, Math.round(this.getAttackDamage() * 0.64 * fireBoost)), color: this.confusedTimer > 0 ? '#ffd880' : '#ffb14a', speed, monsterType: this.type, size: 16, style: 'casterFlameVolley', explodeOnExpire: true, explodeCount: 3 });
            }
        }
    }

    smartVolley(targetX, targetY) {
        if (this.confusedTimer > 0) {
            targetX = this.x + this.width / 2 - (targetX - (this.x + this.width / 2));
            targetY = this.y + this.height / 2 - (targetY - (this.y + this.height / 2));
        }
        const shots = 5 + Math.min(3, this.phase);
        const speed = 7 + this.phase * 0.25;
        for (let i = 0; i < shots; i++) {
            const spread = (i - (shots - 1) / 2) * 0.15;
            const angle = Math.atan2(targetY - (this.y + this.height / 2), targetX - (this.x + this.width / 2)) + spread;
            const projTargetX = this.x + this.width / 2 + Math.cos(angle) * 360;
            const projTargetY = this.y + this.height / 2 + Math.sin(angle) * 360;
            spawnMonsterProjectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                projTargetX,
                projTargetY,
                this.getAttackDamage(),
                '#88eeff',
                speed,
                { monsterType: this.type, size: 12 }
            );
        }
        this.attackEffectTimer = 10;
    }

    smartBurst(targetX, targetY) {
        if (this.confusedTimer > 0) {
            targetX = this.x + this.width / 2 - (targetX - (this.x + this.width / 2));
            targetY = this.y + this.height / 2 - (targetY - (this.y + this.height / 2));
        }
        const particles = 8;
        const speed = 5.5 + this.phase * 0.2;
        const baseAngle = Math.atan2(targetY - (this.y + this.height / 2), targetX - (this.x + this.width / 2));
        const projectileColor = this.confusedTimer > 0 ? '#ffe080' : '#66ddff';
        for (let i = 0; i < particles; i++) {
            const angle = baseAngle + (i - (particles - 1) / 2) * 0.18;
            const projTargetX = this.x + this.width / 2 + Math.cos(angle) * 320;
            const projTargetY = this.y + this.height / 2 + Math.sin(angle) * 320;
            spawnMonsterProjectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                projTargetX,
                projTargetY,
                Math.max(3, this.getAttackDamage() - 1),
                projectileColor,
                speed,
                { monsterType: this.type, size: 11 }
            );
        }
        this.attackEffectTimer = 14;
    }

    smartHitscan(targetX, targetY) {
        if (this.confusedTimer > 0) {
            targetX = this.x + this.width / 2 - (targetX - (this.x + this.width / 2));
            targetY = this.y + this.height / 2 - (targetY - (this.y + this.height / 2));
        }
        const startX = this.x + this.width / 2;
        const startY = this.y + this.height / 2;
        const angle = Math.atan2(targetY - startY, targetX - startX);
        const distance = Math.max(gameWidth, gameHeight) * 1.5;
        const hitX = startX + Math.cos(angle) * distance;
        const hitY = startY + Math.sin(angle) * distance;
        const hitscanColor = this.confusedTimer > 0 ? 'rgba(255,210,110,0.95)' : 'rgba(255,80,80,0.95)';
        spawnMonsterHitscan(startX, startY, hitX, hitY, Math.max(8, this.getAttackDamage()), hitscanColor, 20, 30);
    }

    startSmartHitscanWarning(targetX, targetY) {
        this.hitscanWarningTimer = 60;
        this.hitscanTargetX = targetX;
        this.hitscanTargetY = targetY;
    }

    sprayAttack(playerX, playerY) {
        if (this.confusedTimer > 0) {
            playerX = this.x + this.width / 2 - (playerX - (this.x + this.width / 2));
            playerY = this.y + this.height / 2 - (playerY - (this.y + this.height / 2));
        }
        const shots = 6 + this.phase;
        const speed = (this.projectileSpeed || 6) * 0.25;
        const projectileColor = this.confusedTimer > 0 ? '#ffe080' : '#66bbff';

        for (let i = 0; i < shots; i++) {
            const angle = (Math.PI * 2 / shots) * i + (Math.random() - 0.5) * 0.2;
            const targetX = this.x + this.width / 2 + Math.cos(angle) * 180;
            const targetY = this.y + this.height / 2 + Math.sin(angle) * 180;

            spawnMonsterProjectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                this.getAttackDamage(),
                projectileColor,
                speed,
                { monsterType: this.type }
            );
        }

        this.attackEffectTimer = 8;
    }

    spiralWaveAttack(playerX, playerY) {
        if (this.confusedTimer > 0) {
            playerX = this.x + this.width / 2 - (playerX - (this.x + this.width / 2));
            playerY = this.y + this.height / 2 - (playerY - (this.y + this.height / 2));
        }
        const shots = 10 + this.phase * 2;
        const speed = 4.5 * 0.67;
        const baseAngle = Math.atan2(playerY - (this.y + this.height / 2), playerX - (this.x + this.width / 2));
        const projectileColor = this.confusedTimer > 0 ? '#ffd880' : '#44aaff';

        for (let i = 0; i < shots; i++) {
            const angle = baseAngle + i * 0.45;
            const targetX = this.x + this.width / 2 + Math.cos(angle) * 360;
            const targetY = this.y + this.height / 2 + Math.sin(angle) * 360;

            spawnMonsterProjectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                this.getAttackDamage(),
                projectileColor,
                speed,
                { monsterType: this.type }
            );
        }

        this.attackEffectTimer = 10;
    }

    burstArc(playerX, playerY) {
        if (this.confusedTimer > 0) {
            playerX = this.x + this.width / 2 - (playerX - (this.x + this.width / 2));
            playerY = this.y + this.height / 2 - (playerY - (this.y + this.height / 2));
        }
        const shots = 7;
        const speed = 5.5;
        const baseAngle = Math.atan2(playerY - (this.y + this.height / 2), playerX - (this.x + this.width / 2));

        const projectileColor = this.confusedTimer > 0 ? '#ffd880' : '#88eeff';
        for (let i = 0; i < shots; i++) {
            const angle = baseAngle + (i - (shots - 1) / 2) * 0.22;
            const targetX = this.x + this.width / 2 + Math.cos(angle) * 330;
            const targetY = this.y + this.height / 2 + Math.sin(angle) * 330;

            spawnMonsterProjectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                this.getAttackDamage(),
                projectileColor,
                speed,
                { monsterType: this.type }
            );
        }

        this.attackEffectTimer = 10;
    }

    splitAwareAttack(playerX, playerY) {
        if (this.confusedTimer > 0) {
            playerX = this.x + this.width / 2 - (playerX - (this.x + this.width / 2));
            playerY = this.y + this.height / 2 - (playerY - (this.y + this.height / 2));
        }
        const speed = 5;
        const angle = Math.atan2(playerY - (this.y + this.height / 2), playerX - (this.x + this.width / 2));
        const targetX = this.x + this.width / 2 + Math.cos(angle) * 400;
        const targetY = this.y + this.height / 2 + Math.sin(angle) * 400;

        spawnMonsterProjectile(
            this.x + this.width / 2,
            this.y + this.height / 2,
            targetX,
            targetY,
            this.getAttackDamage(),
            this.confusedTimer > 0 ? '#ffd880' : '#ff6633',
            speed,
            { monsterType: this.type, size: 10, splitOnPlayerAttack: true, splitDistance: 160, maxDistance: 1400 }
        );
    }

    armorBarrage(playerX, playerY) {
        if (this.confusedTimer > 0) {
            playerX = this.x + this.width / 2 - (playerX - (this.x + this.width / 2));
            playerY = this.y + this.height / 2 - (playerY - (this.y + this.height / 2));
        }
        const shots = 4 + Math.min(3, this.phase);
        const speed = 7;
        const baseAngle = Math.atan2(playerY - (this.y + this.height / 2), playerX - (this.x + this.width / 2));
        const projectileColor = this.confusedTimer > 0 ? '#ffd880' : '#cc4444';

        for (let i = 0; i < shots; i++) {
            const angle = baseAngle + (i - (shots - 1) / 2) * 0.22;
            const targetX = this.x + this.width / 2 + Math.cos(angle) * 240;
            const targetY = this.y + this.height / 2 + Math.sin(angle) * 240;

            spawnMonsterProjectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                this.getAttackDamage() + 2,
                projectileColor,
                speed,
                { monsterType: this.type, size: 12 }
            );
        }

        this.attackEffectTimer = 14;
    }

    chargeMissiles(playerX, playerY) {
        if (this.confusedTimer > 0) {
            playerX = this.x + this.width / 2 - (playerX - (this.x + this.width / 2));
            playerY = this.y + this.height / 2 - (playerY - (this.y + this.height / 2));
        }
        const missiles = 3;
        const speed = 6.75;
        const baseAngle = Math.atan2(playerY - (this.y + this.height / 2), playerX - (this.x + this.width / 2));
        const damage = Math.max(6, this.getAttackDamage() + 1);

        const missileColor = this.confusedTimer > 0 ? '#ffd880' : '#ff8844';
        const homingTarget = this.confusedTimer > 0
            ? { x: playerX, y: playerY }
            : player;

        for (let i = 0; i < missiles; i++) {
            const orbitAngle = baseAngle + (i - 1) * (Math.PI / 4);
            const spawnX = this.x + this.width / 2 + Math.cos(orbitAngle) * 38;
            const spawnY = this.y + this.height / 2 + Math.sin(orbitAngle) * 38;
            const targetX = spawnX + Math.cos(baseAngle) * 220;
            const targetY = spawnY + Math.sin(baseAngle) * 220;

            let missileDamage = Math.max(1, Math.round(damage * 0.75));
            spawnMonsterProjectile(
                spawnX,
                spawnY,
                targetX,
                targetY,
                missileDamage,
                missileColor,
                speed,
                {
                    monsterType: this.type,
                    size: 11,
                    homing: true,
                    homingTarget,
                    homingStrength: 0.08,
                    delayTimer: 28,
                    delayDuration: 28,
                    style: 'tankOrbit'
                }
            );
        }

        this.attackEffectTimer = 14;
    }

    shockwaveAttack() {
        const particles = 10;
        const speed = 6.6;
        const color = '#ff6666';

        for (let i = 0; i < particles; i++) {
            const angle = (Math.PI * 2 / particles) * i;
            const targetX = this.x + this.width / 2 + Math.cos(angle) * 220;
            const targetY = this.y + this.height / 2 + Math.sin(angle) * 220;

            spawnMonsterProjectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                Math.max(4, this.getAttackDamage() - 1),
                color,
                speed,
                { monsterType: this.type }
            );
        }

        this.attackEffectTimer = 16;
    }

    guidedAttack(playerX, playerY) {
        if (this.confusedTimer > 0) {
            playerX = this.x + this.width / 2 - (playerX - (this.x + this.width / 2));
            playerY = this.y + this.height / 2 - (playerY - (this.y + this.height / 2));
        }
        const missiles = 3;
        const speed = 8;
        let damage = Math.max(4, this.getAttackDamage() - 1);
        damage = Math.max(1, Math.round(damage * 0.75));

        const missileColor = this.confusedTimer > 0 ? '#ffd880' : '#ff3333';
        const homingTarget = this.confusedTimer > 0
            ? { x: playerX, y: playerY }
            : player;

        for (let i = 0; i < missiles; i++) {
            const angleOffset = (i - (missiles - 1) / 2) * 0.2;
            const targetX = playerX + Math.cos(angleOffset) * 60;
            const targetY = playerY + Math.sin(angleOffset) * 60;

            spawnMonsterProjectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                damage,
                missileColor,
                speed,
                { monsterType: this.type, homing: true, homingTarget, critPercent: 100, size: 10 }
            );
        }
    }

    flareAttack(playerX, playerY) {
        let speed = ((this.projectileSpeed || 6) + 1) * 0.25;
        speed *= 0.67;
        const angles = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, 5 * Math.PI / 4, 3 * Math.PI / 2, 7 * Math.PI / 4];

        for (let angle of angles) {
            const targetX = this.x + this.width / 2 + Math.cos(angle) * 210;
            const targetY = this.y + this.height / 2 + Math.sin(angle) * 210;

            spawnMonsterProjectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                Math.max(4, this.getAttackDamage() - 1),
                '#99ddff',
                speed,
                { monsterType: this.type }
            );
        }

        this.attackEffectTimer = 12;
    }

    draw(overrideFillColor = null, overrideStrokeColor = null, overrideAlpha = 1, isFlashOverlay = false) {
        ctx.save();
        // Combine override alpha with monster-specific alpha (for transparency while thrown)
        let useAlpha = (overrideAlpha !== 1) ? overrideAlpha : 1;
        if (typeof this.alpha === 'number') useAlpha *= this.alpha;
        if (useAlpha !== 1) ctx.globalAlpha = useAlpha;
        const monsterShakeTimer = Math.max(this.shakeTimer || 0, this.impactShakeTimer || 0);
        if (monsterShakeTimer > 0) {
            const shakeAmount = 8;
            const shakeX = (Math.random() - 0.5) * shakeAmount;
            const shakeY = (Math.random() - 0.5) * shakeAmount;
            ctx.translate(shakeX, shakeY);
        }
        const liftOffset = Math.max(0, this.thrownArcHeight || 0);
        if (liftOffset > 0) ctx.translate(0, -liftOffset);
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const radius = Math.max(this.width, this.height) / 2;
        let fillColor = '#cc0000';
        let strokeColor = '#ff0000';
        let gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.1, centerX, centerY, radius);
        const deathProgress = this.isDying ? (1 - this.deathTimer / this.deathMaxTimer) : 0;

        if (this.isDying) {
            fillColor = '#ffffff';
            strokeColor = '#ffffff';
            ctx.globalAlpha = Math.max(0.15, Math.min(useAlpha, 1 - deathProgress * 0.7));
        }

        if (this.type === 'shooter') {
            fillColor = '#1a5eff';
            strokeColor = '#70d6ff';
            gradient.addColorStop(0, '#7fd6ff');
            gradient.addColorStop(0.4, '#1b6dff');
            gradient.addColorStop(1, '#07235a');
        } else if (this.type === 'tank') {
            fillColor = '#be2222';
            strokeColor = '#ff7f7f';
            gradient.addColorStop(0, '#ff9999');
            gradient.addColorStop(0.4, '#d32f2f');
            gradient.addColorStop(1, '#450909');
        } else if (this.type === 'swarm') {
            fillColor = '#d000d3';
            strokeColor = '#ff8cff';
            gradient.addColorStop(0, '#ff98ff');
            gradient.addColorStop(0.4, '#c700c7');
            gradient.addColorStop(1, '#420042');
        } else if (this.type === 'caster') {
            fillColor = '#00aac7';
            strokeColor = '#56ffff';
            gradient.addColorStop(0, '#9df4ff');
            gradient.addColorStop(0.4, '#15c7ee');
            gradient.addColorStop(1, '#06314d');
        } else if (this.type === 'smart') {
            fillColor = '#33d8ff';
            strokeColor = '#a3f4ff';
            gradient.addColorStop(0, '#d2fbff');
            gradient.addColorStop(0.4, '#6fe6ff');
            gradient.addColorStop(1, '#0f404a');
        } else if (this.type === 'avianightmare') {
            fillColor = '#2a3245';
            strokeColor = '#4b5a76';
            gradient.addColorStop(0, '#758398');
            gradient.addColorStop(0.4, '#3b4a63');
            gradient.addColorStop(1, '#11192a');
        } else if (this.type === 'castle_bone_sphere') {
            fillColor = '#e8f0ff';
            strokeColor = '#9db8ff';
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.4, '#dce8ff');
            gradient.addColorStop(1, '#8ba3d9');
        } else {
            fillColor = '#cc3333';
            strokeColor = '#ff5d5d';
            gradient.addColorStop(0, '#ff9e9e');
            gradient.addColorStop(0.4, '#d83b3b');
            gradient.addColorStop(1, '#3f0f0f');
        }

        if (overrideFillColor !== null) {
            fillColor = overrideFillColor;
        }
        if (overrideStrokeColor !== null) {
            strokeColor = overrideStrokeColor;
        }

        ctx.fillStyle = overrideFillColor !== null ? overrideFillColor : gradient;
        ctx.shadowColor = strokeColor;
        ctx.shadowBlur = 26;

        if (this.type === 'tank') {
            const tankRadius = Math.max(this.width, this.height) * 0.45;
            ctx.beginPath();
            ctx.arc(centerX, centerY, tankRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 5;
            ctx.stroke();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.beginPath();
            ctx.arc(centerX - tankRadius * 0.25, centerY - tankRadius * 0.15, tankRadius * 0.18, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(centerX + tankRadius * 0.25, centerY - tankRadius * 0.15, tankRadius * 0.18, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#ffaaaa';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(centerX, centerY - tankRadius * 1.1);
            ctx.stroke();
        } else if (this.type === 'swarm') {
            // Desenhar inseto (vespa/abelha) roxa com tema natural
            
            // Corpo/Abdômen segmentado
            ctx.fillStyle = gradient;
            const segmentHeight = radius * 0.35;
            const segmentWidth = radius * 1.2;
            
            // Segmentos do abdômen
            for (let i = 0; i < 3; i++) {
                const segY = centerY - radius * 0.4 + i * (segmentHeight * 0.65);
                ctx.beginPath();
                ctx.ellipse(centerX, segY, segmentWidth * (1 - i * 0.15), segmentHeight * (0.8 - i * 0.1), 0, 0, Math.PI * 2);
                ctx.fill();
                
                // Linhas de separação entre segmentos
                if (i < 2) {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.ellipse(centerX, segY + segmentHeight * 0.4, segmentWidth * (1 - i * 0.15), segmentHeight * (0.5 - i * 0.08), 0, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
            
            // Cabeça (círculo no topo)
            ctx.fillStyle = fillColor;
            ctx.beginPath();
            ctx.arc(centerX, centerY - radius * 0.65, radius * 0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 3;
            ctx.stroke();
            
            // Olhos
            ctx.fillStyle = 'rgba(255, 200, 255, 0.8)';
            ctx.beginPath();
            ctx.arc(centerX - radius * 0.15, centerY - radius * 0.75, radius * 0.08, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(centerX + radius * 0.15, centerY - radius * 0.75, radius * 0.08, 0, Math.PI * 2);
            ctx.fill();
            
            // Antenas
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(centerX - radius * 0.12, centerY - radius * 0.85);
            ctx.quadraticCurveTo(centerX - radius * 0.35, centerY - radius * 1.1, centerX - radius * 0.4, centerY - radius * 1.3);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(centerX + radius * 0.12, centerY - radius * 0.85);
            ctx.quadraticCurveTo(centerX + radius * 0.35, centerY - radius * 1.1, centerX + radius * 0.4, centerY - radius * 1.3);
            ctx.stroke();
            
            // Asas (oscilantes)
            const wingFlap = Math.sin(gameFrameCount * 0.1) * 0.3;
            ctx.fillStyle = 'rgba(255, 200, 255, 0.3)';
            
            // Asa esquerda
            ctx.beginPath();
            ctx.ellipse(
                centerX - radius * 0.5, 
                centerY - radius * 0.2, 
                radius * 0.4, 
                radius * 0.6, 
                -0.5 + wingFlap, 
                0, 
                Math.PI * 2
            );
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 150, 255, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            // Asa direita
            ctx.beginPath();
            ctx.ellipse(
                centerX + radius * 0.5, 
                centerY - radius * 0.2, 
                radius * 0.4, 
                radius * 0.6, 
                0.5 - wingFlap, 
                0, 
                Math.PI * 2
            );
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 150, 255, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            // Linha de contorno do corpo
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius * 0.9, 0, Math.PI * 2);
            ctx.stroke();
        } else if (this.type === 'castle_bone_sphere') {
            const bossRadius = Math.max(radius * 0.98, radius);
            const coreGradient = ctx.createRadialGradient(centerX, centerY, bossRadius * 0.15, centerX, centerY, bossRadius);
            coreGradient.addColorStop(0, '#f9fbff');
            coreGradient.addColorStop(0.4, '#dfe8ff');
            coreGradient.addColorStop(1, '#7f8acc');
            ctx.fillStyle = coreGradient;
            ctx.shadowColor = '#b7c7ff';
            ctx.shadowBlur = 30;
            ctx.beginPath();
            ctx.arc(centerX, centerY, bossRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#adbeff';
            ctx.lineWidth = 6;
            ctx.stroke();

            const boneCount = 6;
            for (let i = 0; i < boneCount; i += 1) {
                const angle = this.rotationAngle + (Math.PI * 2 / boneCount) * i;
                const boneX = centerX + Math.cos(angle) * (bossRadius * 0.85);
                const boneY = centerY + Math.sin(angle) * (bossRadius * 0.85);
                ctx.font = `${Math.max(16, bossRadius * 0.4)}px Arial`;
                ctx.fillStyle = '#e1e9ff';
                ctx.fillText('🦴', boneX, boneY);
            }

            ctx.fillStyle = '#28304b';
            ctx.font = `${Math.max(48, bossRadius * 0.9)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('☠', centerX, centerY);
        } else if (this.type === 'caster') {
            ctx.save();
            ctx.translate(centerX, centerY);

            const faceRadius = radius * 0.75;
            const hatBrimWidth = faceRadius * 1.3;
            const hatBrimHeight = faceRadius * 0.14;
            const hatConeWidth = faceRadius * 0.6;
            const hatTopY = -faceRadius * 0.5 - faceRadius * 1.35;

            // Rostinho grande cinzento
            ctx.fillStyle = '#9a9a9a';
            ctx.beginPath();
            ctx.arc(0, -faceRadius * 0.2, faceRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Olhos do mago
            ctx.fillStyle = '#242424';
            ctx.beginPath();
            ctx.arc(-faceRadius * 0.18, -faceRadius * 0.45, faceRadius * 0.12, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(faceRadius * 0.18, -faceRadius * 0.45, faceRadius * 0.12, 0, Math.PI * 2);
            ctx.fill();

            // Boca simples
            ctx.strokeStyle = '#242424';
            ctx.lineWidth = 2.8;
            ctx.beginPath();
            ctx.arc(0, -faceRadius * 0.07, faceRadius * 0.24, 0.12 * Math.PI, 0.88 * Math.PI);
            ctx.stroke();

            // Barba do mago
            ctx.fillStyle = '#5c5c5c';
            ctx.beginPath();
            ctx.moveTo(-faceRadius * 0.72, faceRadius * 0.08);
            ctx.lineTo(-faceRadius * 0.4, faceRadius * 0.9);
            ctx.lineTo(-faceRadius * 0.14, faceRadius * 1.05);
            ctx.lineTo(0, faceRadius * 1.2);
            ctx.lineTo(faceRadius * 0.14, faceRadius * 1.05);
            ctx.lineTo(faceRadius * 0.4, faceRadius * 0.9);
            ctx.lineTo(faceRadius * 0.72, faceRadius * 0.08);
            ctx.quadraticCurveTo(faceRadius * 0.45, faceRadius * 0.45, 0, faceRadius * 0.95);
            ctx.quadraticCurveTo(-faceRadius * 0.45, faceRadius * 0.45, -faceRadius * 0.72, faceRadius * 0.08);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#363636';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Bigode/linha de transição da barba
            ctx.strokeStyle = '#2b2b2b';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(-faceRadius * 0.35, faceRadius * 0.18);
            ctx.quadraticCurveTo(0, faceRadius * 0.33, faceRadius * 0.35, faceRadius * 0.18);
            ctx.stroke();

            // Chapéu azul estilo emoji de mago
            ctx.fillStyle = '#2f5bef';
            ctx.strokeStyle = '#8db5ff';
            ctx.lineWidth = 3;

            ctx.beginPath();
            ctx.ellipse(0, -faceRadius * 0.85, hatBrimWidth * 1.05, hatBrimHeight, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(-hatConeWidth, -faceRadius * 0.85);
            ctx.quadraticCurveTo(-hatConeWidth * 0.3, hatTopY + faceRadius * 0.05, 0, hatTopY);
            ctx.quadraticCurveTo(hatConeWidth * 0.3, hatTopY + faceRadius * 0.05, hatConeWidth, -faceRadius * 0.85);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#8db5ff';
            ctx.beginPath();
            ctx.moveTo(-hatConeWidth, -faceRadius * 0.85);
            ctx.lineTo(hatConeWidth, -faceRadius * 0.85);
            ctx.lineTo(hatConeWidth * 0.95, -faceRadius * 0.96);
            ctx.lineTo(-hatConeWidth * 0.95, -faceRadius * 0.96);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#ffeb7f';
            const starPositions = [
                { x: -hatConeWidth * 0.4, y: hatTopY + faceRadius * 0.28 },
                { x: hatConeWidth * 0.1, y: hatTopY + faceRadius * 0.08 },
                { x: hatConeWidth * 0.45, y: hatTopY + faceRadius * 0.35 }
            ];
            for (const pos of starPositions) {
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, faceRadius * 0.06, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        } else if (this.type === 'simple' && this.simpleVariant === 'croc') {
            const open = this.simpleDashOpen > 0.05;
            const jawOpen = radius * 0.3 + this.simpleDashOpen * radius * 1.8;
            const tilt = Math.sin(gameFrameCount * 0.18) * 0.04;
            const skinColor = '#4f7243';
            const jawColor = '#789d58';
            const mouthColor = '#1f2b11';
            const toothColor = '#f7f3dd';
            const eyeColor = '#fbf37f';

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(tilt);

            // Head shape with improved texture
            const headGradient = ctx.createLinearGradient(-radius, -radius * 0.35, radius, radius * 0.15);
            headGradient.addColorStop(0, '#79a15d');
            headGradient.addColorStop(0.5, '#5d7a43');
            headGradient.addColorStop(1, '#4b6133');
            ctx.fillStyle = headGradient;
            ctx.beginPath();
            ctx.moveTo(-radius, -radius * 0.35);
            ctx.quadraticCurveTo(-radius * 0.9, -radius * 0.8, -radius * 0.3, -radius * 0.95);
            ctx.lineTo(radius * 0.3, -radius * 0.95);
            ctx.quadraticCurveTo(radius * 0.9, -radius * 0.8, radius, -radius * 0.35);
            ctx.lineTo(radius, -radius * 0.08);
            ctx.quadraticCurveTo(radius * 0.6, 0, radius * 0.4, radius * 0.15);
            ctx.lineTo(-radius * 0.4, radius * 0.15);
            ctx.quadraticCurveTo(-radius * 0.6, 0, -radius, -radius * 0.08);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#29321a';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Head texture and scales
            ctx.fillStyle = 'rgba(18, 18, 10, 0.15)';
            for (let i = 0; i < 6; i++) {
                const px = -radius * 0.55 + i * radius * 0.22;
                const py = -radius * 0.53 + Math.sin(i * 0.9) * radius * 0.03;
                ctx.beginPath();
                ctx.ellipse(px, py, radius * 0.07, radius * 0.035, -0.15, 0, Math.PI * 2);
                ctx.fill();
            }

            // Lower jaw with shading
            const jawGradient = ctx.createLinearGradient(-radius, -radius * 0.08, radius, radius * 0.18);
            jawGradient.addColorStop(0, '#8cab71');
            jawGradient.addColorStop(0.5, '#708a4f');
            jawGradient.addColorStop(1, '#5b7242');
            ctx.fillStyle = jawGradient;
            ctx.beginPath();
            ctx.moveTo(-radius, -radius * 0.08);
            ctx.quadraticCurveTo(0, jawOpen, radius, -radius * 0.08);
            ctx.lineTo(radius * 0.8, radius * 0.18);
            ctx.quadraticCurveTo(0, jawOpen * 0.65, -radius * 0.8, radius * 0.18);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Jaw texture
            ctx.fillStyle = 'rgba(18, 18, 8, 0.14)';
            for (let i = 0; i < 4; i++) {
                const px = -radius * 0.45 + i * radius * 0.3;
                const py = radius * 0.04 + Math.max(0, jawOpen - radius * 0.04);
                ctx.beginPath();
                ctx.ellipse(px, py, radius * 0.06, radius * 0.03, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            // Subtle tongue
            if (jawOpen > radius * 0.1) {
                ctx.fillStyle = 'rgba(172, 88, 36, 0.35)';
                ctx.beginPath();
                ctx.moveTo(-radius * 0.32, radius * 0.02);
                ctx.quadraticCurveTo(0, radius * 0.14 + jawOpen * 0.08, radius * 0.32, radius * 0.02);
                ctx.quadraticCurveTo(radius * 0.28, radius * 0.08 + jawOpen * 0.05, -radius * 0.28, radius * 0.08 + jawOpen * 0.05);
                ctx.closePath();
                ctx.fill();
            }

            // Mouth interior
            ctx.fillStyle = mouthColor;
            ctx.beginPath();
            ctx.moveTo(-radius * 0.8, -radius * 0.02);
            ctx.quadraticCurveTo(0, jawOpen * 0.55, radius * 0.8, -radius * 0.02);
            ctx.lineTo(radius * 0.7, radius * 0.18);
            ctx.quadraticCurveTo(0, jawOpen * 0.4, -radius * 0.7, radius * 0.18);
            ctx.closePath();
            ctx.fill();

            // Teeth
            ctx.fillStyle = toothColor;
            const toothCount = 4;
            for (let i = 0; i < toothCount; i++) {
                const x = -radius * 0.72 + i * (radius * 0.48);
                const topY = -radius * 0.05;
                ctx.beginPath();
                ctx.moveTo(x, topY);
                ctx.lineTo(x + radius * 0.12, topY + radius * 0.18);
                ctx.lineTo(x - radius * 0.12, topY + radius * 0.18);
                ctx.closePath();
                ctx.fill();
                const bottomY = radius * 0.08;
                ctx.beginPath();
                ctx.moveTo(x, bottomY);
                ctx.lineTo(x + radius * 0.12, bottomY - radius * 0.18);
                ctx.lineTo(x - radius * 0.12, bottomY - radius * 0.18);
                ctx.closePath();
                ctx.fill();
            }

            // Eye
            ctx.fillStyle = eyeColor;
            ctx.beginPath();
            ctx.arc(radius * 0.45, -radius * 0.72, radius * 0.11, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#21220f';
            ctx.beginPath();
            ctx.arc(radius * 0.45, -radius * 0.72, radius * 0.04, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.arc(radius * 0.52, -radius * 0.78, radius * 0.03, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        } else if (this.type === 'croc') {
            const isDashing = this.simpleDashOpen > 0.05;
            const jawOpen = radius * 0.32 + this.simpleDashOpen * radius * 1.8;
            const rotation = 0;
            const tilt = Math.sin(gameFrameCount * 0.16) * 0.03;
            const skinColor = '#4f7243';
            const jawColor = '#7aa26b';
            const mouthColor = '#17230f';
            const toothColor = '#f8f4df';
            const eyeColor = '#fcf57f';

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(rotation + tilt);

            // Head shape with richer scales and shading
            const headGradient = ctx.createLinearGradient(-radius * 1.1, -radius * 0.4, radius * 1.1, radius * 0.18);
            headGradient.addColorStop(0, '#6c9851');
            headGradient.addColorStop(0.45, '#4f6f3a');
            headGradient.addColorStop(1, '#3c552c');
            ctx.fillStyle = headGradient;
            ctx.beginPath();
            ctx.moveTo(-radius * 1.1, -radius * 0.4);
            ctx.quadraticCurveTo(-radius * 1.0, -radius * 0.95, -radius * 0.35, -radius * 1.05);
            ctx.lineTo(radius * 0.35, -radius * 1.05);
            ctx.quadraticCurveTo(radius * 1.0, -radius * 0.95, radius * 1.1, -radius * 0.4);
            ctx.lineTo(radius * 1.1, -radius * 0.08);
            ctx.quadraticCurveTo(radius * 0.65, 0, radius * 0.45, radius * 0.18);
            ctx.lineTo(-radius * 0.45, radius * 0.18);
            ctx.quadraticCurveTo(-radius * 0.65, 0, -radius * 1.1, -radius * 0.08);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#273217';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Upper snout ridge
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(-radius * 0.95, -radius * 0.35);
            ctx.quadraticCurveTo(-radius * 0.45, -radius * 0.85, 0, -radius * 1.0);
            ctx.quadraticCurveTo(radius * 0.45, -radius * 0.85, radius * 0.95, -radius * 0.35);
            ctx.stroke();

            // Nostrils and brow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
            ctx.beginPath();
            ctx.ellipse(-radius * 0.42, -radius * 0.72, radius * 0.07, radius * 0.035, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(-radius * 0.25, -radius * 0.75, radius * 0.03, radius * 0.015, 0, 0, Math.PI * 2);
            ctx.fill();

            // Head scale detail
            ctx.fillStyle = 'rgba(22, 18, 8, 0.16)';
            for (let i = 0; i < 7; i++) {
                const px = -radius * 0.85 + i * radius * 0.28;
                const py = -radius * 0.57 + Math.cos(i * 1.1) * radius * 0.04;
                ctx.beginPath();
                ctx.ellipse(px, py, radius * 0.095, radius * 0.05, -0.18, 0, Math.PI * 2);
                ctx.fill();
            }

            // Lower jaw with stronger shading
            const jawGradient = ctx.createLinearGradient(-radius * 1.1, -radius * 0.08, radius * 1.1, radius * 0.2);
            jawGradient.addColorStop(0, '#93b47a');
            jawGradient.addColorStop(0.5, '#719356');
            jawGradient.addColorStop(1, '#556d43');
            ctx.fillStyle = jawGradient;
            ctx.beginPath();
            ctx.moveTo(-radius * 1.1, -radius * 0.08);
            ctx.quadraticCurveTo(0, jawOpen, radius * 1.1, -radius * 0.08);
            ctx.lineTo(radius * 0.9, radius * 0.2);
            ctx.quadraticCurveTo(0, jawOpen * 0.65, -radius * 0.9, radius * 0.2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Jaw texture
            ctx.fillStyle = 'rgba(22, 18, 8, 0.15)';
            for (let i = 0; i < 6; i++) {
                const px = -radius * 0.55 + i * radius * 0.3;
                const py = radius * 0.05 + Math.max(0, jawOpen - radius * 0.05);
                ctx.beginPath();
                ctx.ellipse(px, py, radius * 0.08, radius * 0.035, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            // Tongue detail
            if (jawOpen > radius * 0.12) {
                ctx.fillStyle = 'rgba(175, 76, 34, 0.35)';
                ctx.beginPath();
                ctx.moveTo(-radius * 0.4, radius * 0.04);
                ctx.quadraticCurveTo(0, radius * 0.18 + jawOpen * 0.07, radius * 0.4, radius * 0.04);
                ctx.lineTo(radius * 0.35, radius * 0.14 + jawOpen * 0.05);
                ctx.quadraticCurveTo(0, radius * 0.2 + jawOpen * 0.1, -radius * 0.35, radius * 0.14 + jawOpen * 0.05);
                ctx.closePath();
                ctx.fill();
            }

            // Mouth interior
            ctx.fillStyle = mouthColor;
            ctx.beginPath();
            ctx.moveTo(-radius * 0.9, -radius * 0.02);
            ctx.quadraticCurveTo(0, jawOpen * 0.55, radius * 0.9, -radius * 0.02);
            ctx.lineTo(radius * 0.75, radius * 0.18);
            ctx.quadraticCurveTo(0, jawOpen * 0.4, -radius * 0.75, radius * 0.18);
            ctx.closePath();
            ctx.fill();

            // Garganta e dentes internos (apenas enquanto a boca está aberta)
            if (jawOpen > radius * 0.05) {
                const throatColor = '#0a0f06';
                const throatWidth = radius * 0.8;
                const throatDepth = jawOpen * 1.2;
                const toothHeight = radius * 0.14;
                const toothCount = 9;
                
                // Lados da garganta com pele verde
                const sideSkinGradient = ctx.createLinearGradient(-throatWidth, radius * 0.08, -throatWidth * 0.2, radius * 0.08 + throatDepth);
                sideSkinGradient.addColorStop(0, skinColor);
                sideSkinGradient.addColorStop(1, '#3d5928');
                ctx.fillStyle = sideSkinGradient;
                ctx.beginPath();
                ctx.moveTo(-throatWidth, radius * 0.08);
                ctx.lineTo(-throatWidth * 0.35, radius * 0.08 + throatDepth);
                ctx.lineTo(-throatWidth * 0.15, radius * 0.08 + throatDepth * 0.5);
                ctx.lineTo(-throatWidth * 0.15, radius * 0.08);
                ctx.closePath();
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(throatWidth, radius * 0.08);
                ctx.lineTo(throatWidth * 0.35, radius * 0.08 + throatDepth);
                ctx.lineTo(throatWidth * 0.15, radius * 0.08 + throatDepth * 0.5);
                ctx.lineTo(throatWidth * 0.15, radius * 0.08);
                ctx.closePath();
                ctx.fill();

                ctx.fillStyle = throatColor;
                ctx.beginPath();
                ctx.moveTo(-throatWidth, radius * 0.08);
                ctx.lineTo(throatWidth, radius * 0.08);
                ctx.quadraticCurveTo(throatWidth * 0.7, radius * 0.08 + throatDepth * 0.5, throatWidth * 0.35, radius * 0.08 + throatDepth);
                ctx.lineTo(-throatWidth * 0.35, radius * 0.08 + throatDepth);
                ctx.quadraticCurveTo(-throatWidth * 0.7, radius * 0.08 + throatDepth * 0.5, -throatWidth, radius * 0.08);
                ctx.closePath();
                ctx.fill();

                // Dentes superiores da garganta
                ctx.fillStyle = toothColor;
                for (let i = 0; i < toothCount; i++) {
                    const t = i / (toothCount - 1);
                    const x = -throatWidth + t * (throatWidth * 2);
                    const y = radius * 0.08;
                    ctx.beginPath();
                    ctx.moveTo(x - radius * 0.065, y);
                    ctx.lineTo(x, y + toothHeight);
                    ctx.lineTo(x + radius * 0.065, y);
                    ctx.closePath();
                    ctx.fill();
                }

                // Dentes inferiores da garganta (removendo 2 de cada lado)
                for (let i = 2; i <= 6; i++) {
                    const t = i / (toothCount - 1);
                    const x = -throatWidth + t * (throatWidth * 2);
                    const y = radius * 0.08 + throatDepth;
                    ctx.beginPath();
                    ctx.moveTo(x - radius * 0.065, y);
                    ctx.lineTo(x, y - toothHeight);
                    ctx.lineTo(x + radius * 0.065, y);
                    ctx.closePath();
                    ctx.fill();
                }

                // Base sob os dentes inferiores (queixo / suporte)
                const baseTop = radius * 0.08 + throatDepth;
                const baseBottom = baseTop + radius * 0.08;
                ctx.fillStyle = '#1c2410';
                ctx.beginPath();
                ctx.moveTo(-throatWidth * 0.95, baseTop);
                ctx.quadraticCurveTo(-throatWidth * 0.4, baseTop + radius * 0.03, -throatWidth * 0.25, baseBottom);
                ctx.lineTo(throatWidth * 0.25, baseBottom);
                ctx.quadraticCurveTo(throatWidth * 0.4, baseTop + radius * 0.03, throatWidth * 0.95, baseTop);
                ctx.closePath();
                ctx.fill();

                // Brilho da garganta (reflexo)
                ctx.fillStyle = 'rgba(255, 100, 50, 0.15)';
                ctx.beginPath();
                ctx.ellipse(0, radius * 0.1 + throatDepth * 0.3, throatWidth * 0.3, throatDepth * 0.2, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            // Eyes
            ctx.fillStyle = eyeColor;
            ctx.beginPath();
            ctx.arc(radius * 0.5, -radius * 0.78, radius * 0.12, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(-radius * 0.5, -radius * 0.78, radius * 0.12, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#232511';
            ctx.beginPath();
            ctx.arc(radius * 0.5, -radius * 0.78, radius * 0.045, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(-radius * 0.5, -radius * 0.78, radius * 0.045, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.beginPath();
            ctx.arc(radius * 0.56, -radius * 0.82, radius * 0.03, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(-radius * 0.44, -radius * 0.82, radius * 0.03, 0, Math.PI * 2);
            ctx.fill();

            if (this.simpleDashWarningTimer > 0) {
                const progress = 1 - (this.simpleDashWarningTimer / this.simpleDashWarningDuration);
                const alpha = 0.25 + 0.55 * progress;
                ctx.strokeStyle = `rgba(255, 120, 60, ${alpha})`;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.arc(0, 0, radius * 1.45, 0, Math.PI * 2);
                ctx.stroke();

                if (typeof this.simpleDashDirection === 'number') {
                    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(this.simpleDashDirection) * radius * 1.45, Math.sin(this.simpleDashDirection) * radius * 1.45);
                    ctx.stroke();
                }
            }

            ctx.restore();
        } else if (this.type === 'simple') {
            const bodyRadius = radius * 0.95;
            const bodyX = centerX;
            const bodyY = centerY + radius * 0.05;
            const headRadius = radius * 0.55;
            const earHeight = headRadius * 0.75;
            const earWidth = headRadius * 0.42;
            const bodyColor = '#ffb3d7';
            const accentColor = '#ff6ab8';
            const earInner = '#ffd5f0';

            // Tail
            ctx.save();
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = radius * 0.16;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(bodyX + bodyRadius * 0.68, bodyY + bodyRadius * 0.05);
            ctx.quadraticCurveTo(bodyX + bodyRadius * 1.28, bodyY - bodyRadius * 0.16, bodyX + bodyRadius * 0.72, bodyY - bodyRadius * 0.76);
            ctx.stroke();
            ctx.restore();

            // Body
            ctx.fillStyle = bodyColor;
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = radius * 0.08;
            ctx.beginPath();
            ctx.ellipse(bodyX, bodyY, bodyRadius, bodyRadius * 0.76, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Body stripes
            ctx.strokeStyle = 'rgba(255, 120, 180, 0.6)';
            ctx.lineWidth = radius * 0.08;
            for (let i = -1; i <= 1; i++) {
                const stripeY = bodyY - bodyRadius * 0.12 + i * bodyRadius * 0.24;
                ctx.beginPath();
                ctx.moveTo(bodyX - bodyRadius * 0.5, stripeY);
                ctx.quadraticCurveTo(bodyX - bodyRadius * 0.15, stripeY - bodyRadius * 0.08, bodyX + bodyRadius * 0.25, stripeY - bodyRadius * 0.04);
                ctx.stroke();
            }

            // Head
            const headX = bodyX;
            const headY = bodyY - bodyRadius * 0.82;
            ctx.fillStyle = bodyColor;
            ctx.beginPath();
            ctx.arc(headX, headY, headRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Ears
            ctx.fillStyle = earInner;
            ctx.beginPath();
            ctx.moveTo(headX - earWidth * 1.1, headY - headRadius * 0.12);
            ctx.lineTo(headX - earWidth * 0.35, headY - earHeight * 1.12);
            ctx.lineTo(headX - earWidth * 0.05, headY - headRadius * 0.28);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(headX + earWidth * 1.1, headY - headRadius * 0.12);
            ctx.lineTo(headX + earWidth * 0.35, headY - earHeight * 1.12);
            ctx.lineTo(headX + earWidth * 0.05, headY - headRadius * 0.28);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Inner ears
            ctx.fillStyle = '#ffd9f4';
            ctx.beginPath();
            ctx.moveTo(headX - earWidth * 0.68, headY - headRadius * 0.34);
            ctx.lineTo(headX - earWidth * 0.36, headY - earHeight * 0.78);
            ctx.lineTo(headX - earWidth * 0.14, headY - headRadius * 0.32);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(headX + earWidth * 0.68, headY - headRadius * 0.34);
            ctx.lineTo(headX + earWidth * 0.36, headY - earHeight * 0.78);
            ctx.lineTo(headX + earWidth * 0.14, headY - headRadius * 0.32);
            ctx.closePath();
            ctx.fill();

            // Front paws
            ctx.fillStyle = bodyColor;
            ctx.beginPath();
            ctx.ellipse(bodyX - headRadius * 0.7, bodyY + headRadius * 0.8, headRadius * 0.28, headRadius * 0.18, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(bodyX + headRadius * 0.7, bodyY + headRadius * 0.8, headRadius * 0.28, headRadius * 0.18, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffd2e3';
            ctx.beginPath();
            ctx.arc(bodyX - headRadius * 0.7, bodyY + headRadius * 0.78, headRadius * 0.08, 0, Math.PI * 2);
            ctx.arc(bodyX - headRadius * 0.55, bodyY + headRadius * 0.78, headRadius * 0.08, 0, Math.PI * 2);
            ctx.arc(bodyX - headRadius * 0.85, bodyY + headRadius * 0.78, headRadius * 0.08, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(bodyX + headRadius * 0.7, bodyY + headRadius * 0.78, headRadius * 0.08, 0, Math.PI * 2);
            ctx.arc(bodyX + headRadius * 0.55, bodyY + headRadius * 0.78, headRadius * 0.08, 0, Math.PI * 2);
            ctx.arc(bodyX + headRadius * 0.85, bodyY + headRadius * 0.78, headRadius * 0.08, 0, Math.PI * 2);
            ctx.fill();

            // Attack scratch effect aligned to claw direction
            if (this.attackEffectTimer > 0) {
                const attackAlpha = Math.max(0.18, this.attackEffectTimer / 18);
                const slashAngle = this.simpleClawDirection !== undefined
                    ? this.simpleClawDirection
                    : Math.atan2(player.y + player.height / 2 - bodyY, player.x + player.width / 2 - bodyX);
                const slashLength = radius * 1.7;
                const slashOriginX = bodyX + Math.cos(slashAngle) * bodyRadius * 0.55;
                const slashOriginY = bodyY + Math.sin(slashAngle) * bodyRadius * 0.55;

                ctx.save();
                ctx.translate(slashOriginX, slashOriginY);
                ctx.rotate(slashAngle);
                ctx.lineCap = 'round';

                ctx.strokeStyle = `rgba(255, 120, 170, ${attackAlpha})`;
                ctx.lineWidth = radius * 0.16;
                for (let i = -1; i <= 1; i++) {
                    const offsetY = i * radius * 0.14;
                    ctx.beginPath();
                    ctx.moveTo(radius * 0.12, offsetY);
                    ctx.lineTo(slashLength, offsetY - radius * 0.14);
                    ctx.stroke();
                }

                ctx.strokeStyle = `rgba(255, 225, 235, ${attackAlpha * 0.8})`;
                ctx.lineWidth = radius * 0.08;
                ctx.beginPath();
                ctx.moveTo(radius * 0.12, 0);
                ctx.quadraticCurveTo(radius * 0.85, -radius * 0.32, slashLength, -radius * 0.06);
                ctx.stroke();

                ctx.restore();
            }
        } else if (this.type === 'smart') {
            const outerRadius = radius * 0.95;
            ctx.beginPath();
            ctx.ellipse(centerX, centerY, outerRadius, outerRadius * 0.7, -0.25, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 5;
            ctx.stroke();

            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(centerX, centerY, outerRadius * 0.7, outerRadius * 0.45, -0.25, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.beginPath();
            ctx.arc(centerX, centerY - outerRadius * 0.08, outerRadius * 0.18, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(0,0,0,0.25)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY - outerRadius * 0.08);
            ctx.lineTo(centerX, centerY + outerRadius * 0.32);
            ctx.moveTo(centerX - outerRadius * 0.22, centerY + outerRadius * 0.06);
            ctx.lineTo(centerX + outerRadius * 0.22, centerY + outerRadius * 0.06);
            ctx.stroke();

            ctx.fillStyle = 'rgba(100, 220, 255, 0.85)';
            const chipRadius = outerRadius * 0.18;
            ctx.beginPath();
            ctx.rect(centerX - chipRadius * 0.65, centerY + outerRadius * 0.12, chipRadius * 1.3, chipRadius * 0.7);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(centerX - chipRadius * 0.25, centerY + outerRadius * 0.18);
            ctx.lineTo(centerX + chipRadius * 0.25, centerY + outerRadius * 0.18);
            ctx.stroke();
        } else if (this.type === 'avianightmare') {
            ctx.beginPath();
            ctx.moveTo(centerX, centerY - radius * 0.95);
            ctx.bezierCurveTo(centerX + radius * 0.95, centerY - radius * 0.7, centerX + radius * 0.92, centerY + radius * 0.6, centerX, centerY + radius * 0.95);
            ctx.bezierCurveTo(centerX - radius * 0.92, centerY + radius * 0.6, centerX - radius * 0.95, centerY - radius * 0.7, centerX, centerY - radius * 0.95);
            ctx.fill();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 5;
            ctx.stroke();

            // Penas pontiagudas e sombreamento interno
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 2;
            const featherStart = centerY - radius * 0.2;
            for (let i = -2; i <= 2; i++) {
                const offset = i * radius * 0.18;
                ctx.beginPath();
                ctx.moveTo(centerX + offset, featherStart);
                ctx.lineTo(centerX + offset * 0.5, centerY - radius * 0.55);
                ctx.stroke();
            }

            // Bico mais ameaçador
            ctx.fillStyle = '#10131b';
            ctx.beginPath();
            ctx.moveTo(centerX, centerY + radius * 0.16);
            ctx.lineTo(centerX - radius * 0.28, centerY + radius * 0.05);
            ctx.lineTo(centerX - radius * 0.16, centerY + radius * 0.28);
            ctx.lineTo(centerX + radius * 0.16, centerY + radius * 0.28);
            ctx.lineTo(centerX + radius * 0.28, centerY + radius * 0.05);
            ctx.closePath();
            ctx.fill();

            // Traços sombrios e fissuras
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(centerX - radius * 0.34, centerY + radius * 0.2);
            ctx.lineTo(centerX - radius * 0.08, centerY + radius * 0.36);
            ctx.lineTo(centerX + radius * 0.34, centerY + radius * 0.2);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius * 0.95, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 4;
            ctx.stroke();
        }

        if (this.isDying && this.deathShards.length > 0) {
            const progress = 1 - this.deathTimer / this.deathMaxTimer;
            ctx.save();
            ctx.globalAlpha = Math.max(0.08, 0.7 - progress * 0.25);
            for (const shard of this.deathShards) {
                ctx.save();
                ctx.translate(shard.x, shard.y);
                ctx.rotate(shard.rotation);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(-shard.size / 2, -shard.size / 2, shard.size, shard.size);
                ctx.restore();
            }
            ctx.restore();
        }

        ctx.restore();

        if (this.confusedTimer > 0) {
            const starCount = 4;
            const orbitRadius = radius * 1.05;
            const baseRotation = performance.now() * 0.0009;
            const starBaseY = centerY - radius * 1.3;
            const opacity = 0.75 + 0.18 * Math.sin(performance.now() * 0.0025);

            ctx.save();
            ctx.translate(centerX, starBaseY);
            for (let i = 0; i < starCount; i++) {
                const angle = (Math.PI * 2 / starCount) * i + baseRotation;
                const starX = Math.cos(angle) * orbitRadius;
                const starY = Math.sin(angle) * orbitRadius * 0.35;
                const starSize = radius * 0.14 * (0.9 + 0.1 * Math.sin(performance.now() * 0.003 + i));
                const innerRadius = starSize * 0.45;

                ctx.save();
                ctx.translate(starX, starY);
                ctx.rotate(angle + baseRotation * 1.4);
                ctx.fillStyle = `rgba(255, 240, 140, ${opacity})`;
                ctx.beginPath();
                for (let p = 0; p < 10; p++) {
                    const pointAngle = p * (Math.PI / 5);
                    const r = (p % 2 === 0) ? starSize : innerRadius;
                    ctx.lineTo(Math.cos(pointAngle) * r, Math.sin(pointAngle) * r);
                }
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
            ctx.restore();
        }

        if (this.type === 'tank') {
            const tankRadius = Math.max(this.width, this.height) * 0.45;
            ctx.fillStyle = '#ffffcc';
            ctx.beginPath();
            ctx.arc(centerX - tankRadius * 0.22, centerY - tankRadius * 0.16, tankRadius * 0.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(centerX + tankRadius * 0.22, centerY - tankRadius * 0.16, tankRadius * 0.1, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'avianightmare') {
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            const wingOffset = radius * 0.75;
            ctx.beginPath();
            ctx.ellipse(centerX - wingOffset * 0.6, centerY + radius * 0.18, wingOffset * 0.35, radius * 0.18, -0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(centerX + wingOffset * 0.6, centerY + radius * 0.18, wingOffset * 0.35, radius * 0.18, 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.beginPath();
            ctx.moveTo(centerX - radius * 0.56, centerY - radius * 0.1);
            ctx.lineTo(centerX - radius * 0.36, centerY + radius * 0.36);
            ctx.lineTo(centerX - radius * 0.46, centerY + radius * 0.42);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(centerX + radius * 0.56, centerY - radius * 0.1);
            ctx.lineTo(centerX + radius * 0.36, centerY + radius * 0.36);
            ctx.lineTo(centerX + radius * 0.46, centerY + radius * 0.42);
            ctx.closePath();
            ctx.fill();
        }

        if (this.type === 'shooter') {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + this.height - 16, 7, 0, Math.PI * 2);
            ctx.fill();
        }

        if (this.type === 'swarm') {
            ctx.strokeStyle = '#ff8cff';
            ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                const angle = this.orbitalAngle + (i * Math.PI * 2 / 3);
                const px = centerX + Math.cos(angle) * 34;
                const py = centerY + Math.sin(angle) * 34;
                ctx.beginPath();
                ctx.arc(px, py, 4, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        if (this.type === 'caster') {
            if (this.portalWarningTimer > 0) {
                const warningRadius = 42;
                const warningProgress = 1 - this.portalWarningTimer / 30;

                ctx.strokeStyle = 'rgba(0, 255, 255, 0.35)';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(this.portalX, this.portalY, warningRadius, 0, Math.PI * 2);
                ctx.stroke();

                ctx.strokeStyle = 'rgba(0, 255, 255, 0.95)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(this.portalX, this.portalY, warningRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * warningProgress);
                ctx.stroke();

                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText((this.portalWarningTimer / 60).toFixed(1), this.portalX, this.portalY);
            } else if (this.portalTimer > 0) {
                ctx.fillStyle = 'rgba(0, 255, 255, 0.25)';
                ctx.beginPath();
                ctx.arc(this.portalX, this.portalY, 42, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }

        if (this.type === 'smart' && this.hitscanWarningTimer > 0 && this.hitscanTargetX !== null && this.hitscanTargetY !== null) {
            const warningDuration = 60;
            const warningProgress = 1 - this.hitscanWarningTimer / warningDuration;

            // draw a preview beam shaped like the final hitscan
            const startX = this.x + this.width / 2;
            const startY = this.y + this.height / 2;
            const predictedX = this.hitscanTargetX;
            const predictedY = this.hitscanTargetY;
            const angle = Math.atan2(predictedY - startY, predictedX - startX);
            const distance = Math.max(gameWidth, gameHeight) * 1.5;
            const hitX = startX + Math.cos(angle) * distance;
            const hitY = startY + Math.sin(angle) * distance;
            const color = 'rgba(255,80,80,0.95)';
            const thickness = 20;

            ctx.save();
            const flashFrames = 12;
            const isFlashing = this.hitscanWarningTimer <= flashFrames;
            const baseAlpha = 0.85;
            const flashAlpha = isFlashing ? baseAlpha + Math.sin((this.hitscanWarningTimer / flashFrames) * Math.PI * 8) * 0.35 : baseAlpha;
            ctx.globalAlpha = Math.max(0.5, flashAlpha * (0.7 + 0.3 * warningProgress));

            ctx.fillStyle = color;
            ctx.strokeStyle = color;
            ctx.lineWidth = thickness;
            ctx.shadowColor = color;
            ctx.shadowBlur = 28;

            const perp = thickness * 0.6;
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);
            const ox = -dy * perp;
            const oy = dx * perp;

            ctx.beginPath();
            ctx.moveTo(startX + ox, startY + oy);
            ctx.lineTo(hitX + ox, hitY + oy);
            ctx.lineTo(hitX - ox, hitY - oy);
            ctx.lineTo(startX - ox, startY - oy);
            ctx.closePath();
            ctx.fill();

            ctx.globalAlpha = Math.max(0.35, (isFlashing ? 1.0 : 0.85) * (0.6 + 0.4 * warningProgress));
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(hitX, hitY);
            ctx.stroke();

            ctx.restore();

            // small countdown at predicted target
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((this.hitscanWarningTimer / 60).toFixed(1), predictedX, predictedY);
        }

        if (this.flashTimer > 0 && !isFlashOverlay) {
            this.draw('#ffffff', '#ffffff', 0.5, true);
        }

        if (this.attackEffectTimer > 0) {
            if (this.type === 'simple') {
                const slashDir = this.simpleClawDirection !== undefined
                    ? this.simpleClawDirection
                    : Math.atan2(player.y + player.height / 2 - centerY, player.x + player.width / 2 - centerX);
                const originX = centerX + Math.cos(slashDir) * radius * 0.45;
                const originY = centerY + Math.sin(slashDir) * radius * 0.45;
                const slashLength = radius * 1.8;
                const alpha = Math.max(0.24, this.attackEffectTimer / 18);

                ctx.save();
                ctx.translate(originX, originY);
                ctx.rotate(slashDir);
                ctx.lineCap = 'round';

                ctx.strokeStyle = `rgba(255, 170, 200, ${alpha})`;
                ctx.lineWidth = radius * 0.16;
                for (let i = -1; i <= 1; i++) {
                    const offsetY = i * radius * 0.14;
                    ctx.beginPath();
                    ctx.moveTo(radius * 0.12, offsetY);
                    ctx.lineTo(slashLength, offsetY - radius * 0.12);
                    ctx.stroke();
                }

                ctx.strokeStyle = `rgba(255, 235, 245, ${alpha * 0.8})`;
                ctx.lineWidth = radius * 0.08;
                ctx.beginPath();
                ctx.moveTo(radius * 0.12, 0);
                ctx.quadraticCurveTo(radius * 0.85, -radius * 0.3, slashLength, -radius * 0.06);
                ctx.stroke();

                ctx.restore();
            } else {
                ctx.strokeStyle = '#ffff88';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(centerX, centerY, this.attackRange + 15, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }

    getAttackDamage() {
        if (this.type === 'shooter') return 6 + this.phase * 1;
        if (this.type === 'tank') return 3.75 + this.phase * 0.625;
        if (this.type === 'swarm') return 4.5 + this.phase * 1.25;
        if (this.type === 'caster') return 5.25 + this.phase * 1.5;
        if (this.type === 'avianightmare') return 2.25 + this.phase * 0.75;
        if (this.type === 'simple') return 2.25 + this.phase * 0.75;
        if (this.type === 'croc') return (12 + this.phase * 5) * 0.5; // croc now deals much less damage
        return 3.75 + this.phase * 1.5;
    }

    takeDamage(amount) {
        const finalDamage = this.type === 'tank'
            ? Math.max(0, amount * 0.85)
            : amount;
        this.health -= finalDamage;
        this.tookDamage = true;
        if (this.health > 0 && !this.isDying) {
            maybeSpawnMansionGhostCopy(this, finalDamage);
        }
        return finalDamage;
    }
}

// ===== VARIÁVEIS GLOBAIS =====
let player = new Player();
let currentMonster;
let phase = 1;
let monstersDefeated = 0;
let defeatedTotal = 0;
let upgradesAcquired = 0;
let keys = {};
let gameOver = false;
let isUpgrading = false;
let isDebugMenuOpen = false;
let selectedUpgradeIndex = 0;
let selectedDebugUpgradeIndex = 0;
let debugMenuQuantity = 1;
let upgradeChoices = [];
let debugMenuUpgradeChoices = [];
let debugMenuFlashTimer = 0;
let debugMenuFlashText = '';
let debugMenuScrollOffset = 0;
let debugMenuListGeom = { x: 0, y: 0, width: 0, itemHeight: 46, gap: 8, visibleCount: 8, startIndex: 0, listPanelH: 0 };
let debugMenuTabIndex = 0;
const debugMenuTabs = [
    { id: 'upgrades', label: 'MELHORIAS' },
    { id: 'invocar', label: 'INVOCAR' }
];
let selectedDebugActionIndex = 0;
let debugMenuActionChoices = [];
let debugMenuTabGeom = { x: 0, y: 0, tabRects: [] };
let gameStarted = false;
let isSelectingWeapon = false;
let selectedWeaponIndex = 0;
let roundStartTimer = 0;
let upgradeDelayTimer = 0;
let pendingUpgrade = false;
let upgradeOverlayY = 0;
let upgradeOverlayAlpha = 1;
let upgradeOverlayAnimating = false;
let projectiles = [];
let thrownExplosives = [];
let fireZones = [];
let grenadeFragments = [];
let critEffects = [];
let sweatEffects = [];
let evaporationEffects = [];
let swarmMarks = [];
let ambientAnimals = [];
let ambientAnimalSpawnTimer = 0;
const ambientAnimalMaxCount = 20;
const ambientAnimalSpawnIntervalMin = 30;
const ambientAnimalSpawnIntervalMax = 120;
let ambientCritters = [];
let ambientCritterSpawnTimer = 0;
const ambientCritterMaxCount = 12;
const ambientCritterSpawnIntervalMin = 90;
const ambientCritterSpawnIntervalMax = 180;
let monsterHitscans = [];
let monsterTypeKills = {
    shooter: false,
    swarm: false,
    caster: false,
    avianightmare: false,
    smart: false
};
let lastMonsterType = null;
let phaseMonsterTypes = new Set();
let prevPhaseMonsterTypes = new Set();
let simpleMonsterSpawnedInEarlyPhases = false;
let selectionBackgroundTick = 0;
let frameFreeze = 0;
let slowdownTimer = 0;
const slowdownRampFrames = 4; // ~0.067s at 60fps
const slowdownHoldFrames = 14; // active slow duration
const slowdownTarget = 0.975;
const slowdownFlashFrames = 3;
let timeScale = 1;
let slowdownInsectSprites = [];
let screenShakeTimer = 0;
let cameraLockTarget = null;
let roarFreezeTimer = 0;
let afterImages = [];
let accelParticles = [];
let weaponPickups = [];
let weaponPickupSpawnCounter = 0;
let monsterDeathEffects = [];
let portalEffects = [];
let machineGunEffects = [];
let explosionEffects = [];
let trackerProjectiles = [];
let ghostArmyUnlocked = false;
let ghostArmyEntities = [];

let castleInteriorEnemies = [];
let castleInteriorEnemyIdCounter = 0;
let castleInteriorWaveIndex = 0;
let castleInteriorKills = 0;
let castleInteriorWaveDelay = 0;
let castleInteriorWaveSpawnQueue = [];
let castleInteriorWaveSpawnTimer = 0;
let castleExitOpen = false;
let castleBossQueued = false;
let castleBossSpawnCheckTimer = 1200;
let castleBossSpawnChance = 0.01;
let castleBossAlertText = '';
let castleBossAlertTimer = 0;
let savedCurrentMonster = null;
let castleSkullWarningEffects = [];
let castleEnemyAttackEffects = [];

let mansionInteriorEnemies = [];
let mansionInteriorEnemyIdCounter = 0;
let mansionInteriorSpawnTimer = 0;
let mansionInteriorSpawnIndex = 0;
let mansionInteriorKills = 0;
let mansionPeriodicWaveTimer = 0;
let mansionExitOpen = false;
let mansionGhostCountTier1 = 35;
let mansionGhostCountTier2 = 35;
let mansionGhostCountTier3 = 30;
const mansionTotalGhosts = 100;
const mansionMaxActiveGhosts = 30;
const mansionSpawnIntervalMinFrames = 60;
const mansionSpawnIntervalMaxFrames = 120;
const mansionPeriodicWaveIntervalFrames = 300;
const mansionGhostTierPools = {
    0: ['shadowling', 'apparition', 'shade'],
    1: ['poltergeist', 'phantom', 'specter', 'banshee'],
    2: ['wraith', 'haunt', 'phantasm']
};
const mansionGhostTypes = [
    { type: 'shadowling', width: 48, height: 48, health: 10, speed: 1.6, damage: 5, color: '#423f5a', accent: '#c4b0ff', visuals: ['👻'], ranged: false, attackStyle: 'slash', attackEmoji: '👻', windupFrames: 16, attackStartMultiplier: 2.2, dashEnabled: true, teleportEnabled: false, dodgeChance: 0.32 },
    { type: 'poltergeist', width: 44, height: 44, health: 12, speed: 1.3, damage: 4, color: '#b4b0ff', accent: '#89c8ff', visuals: ['💀'], ranged: true, attackStyle: 'rain', attackInterval: 100, attackEmoji: '💨', windupFrames: 18, dashEnabled: false, teleportEnabled: true, dodgeChance: 0.22, attackStartMultiplier: 2.8 },
    { type: 'banshee', width: 52, height: 52, health: 14, speed: 1.1, damage: 6, color: '#e8d8ff', accent: '#ffacff', visuals: ['👻'], ranged: false, attackStyle: 'stun', attackEmoji: '⚡', windupFrames: 20, attackStartMultiplier: 2.3, dashEnabled: false, teleportEnabled: true, dodgeChance: 0.28, stunOnHit: true },
    { type: 'apparition', width: 38, height: 38, health: 8, speed: 2.0, damage: 4, color: '#95dfff', accent: '#ffffff', visuals: ['🌀'], ranged: false, attackStyle: 'slash', attackEmoji: '🌀', windupFrames: 16, attackStartMultiplier: 2.0, dashEnabled: true, teleportEnabled: true, dodgeChance: 0.44 },
    { type: 'phantom', width: 56, height: 56, health: 16, speed: 1.05, damage: 7, color: '#c4c4ee', accent: '#eed8ff', visuals: ['👁️'], ranged: true, attackStyle: 'burst', attackInterval: 90, attackEmoji: '💥', windupFrames: 22, dashEnabled: true, teleportEnabled: false, dodgeChance: 0.18, attackStartMultiplier: 2.9, confusionOnAttackChance: 20 },
    { type: 'specter', width: 46, height: 46, health: 12, speed: 1.45, damage: 5, color: '#6a5c9f', accent: '#c4b0ff', visuals: ['👀'], ranged: true, attackStyle: 'rain', attackInterval: 88, attackEmoji: '🌫️', windupFrames: 16, dashEnabled: false, teleportEnabled: true, dodgeChance: 0.30, attackStartMultiplier: 2.6, confusionOnAttackChance: 24 },
    { type: 'wraith', width: 52, height: 52, health: 18, speed: 1.15, damage: 7, color: '#403f5a', accent: '#99b3ff', visuals: ['🕯️'], ranged: false, attackStyle: 'charge', attackEmoji: '💨', windupFrames: 22, attackStartMultiplier: 2.4, dashEnabled: true, teleportEnabled: false, dodgeChance: 0.18, knockbackOnHit: true },
    { type: 'shade', width: 50, height: 50, health: 14, speed: 1.3, damage: 6, color: '#2f2a45', accent: '#d9d5ff', visuals: ['🖤'], ranged: false, attackStyle: 'slash', attackEmoji: '🖤', windupFrames: 18, attackStartMultiplier: 2.1, dashEnabled: true, teleportEnabled: true, dodgeChance: 0.38 },
    { type: 'haunt', width: 60, height: 60, health: 20, speed: 0.95, damage: 8, color: '#8a7bff', accent: '#fff1ff', visuals: ['💀'], ranged: true, attackStyle: 'sigil', attackInterval: 98, attackEmoji: '🌀', windupFrames: 24, dashEnabled: false, teleportEnabled: false, dodgeChance: 0.16, attackStartMultiplier: 3.0, confusionOnAttackChance: 42 },
    { type: 'phantasm', width: 60, height: 60, health: 18, speed: 1.2, damage: 7, color: '#a89eff', accent: '#f2d4ff', visuals: ['🌙'], ranged: true, attackStyle: 'slam', attackInterval: 110, attackEmoji: '🌪️', windupFrames: 26, dashEnabled: true, teleportEnabled: true, dodgeChance: 0.20, attackStartMultiplier: 2.7, confusionOnAttackGuaranteed: true }
];

const castleInteriorWaves = [3, 5, 7, 10, 15, 25, 35];
const castleSkeletonTypes = [
    { type: 'skeleton_grunt', width: 70, height: 70, health: 26, speed: 1.25, damage: 8, color: '#d8d8d8', accent: '#ffffff', visuals: ['☠', '☠', '🗡️', '☠', '☠'], attackStyle: 'slash', attackEmoji: '✂️', windupFrames: 18, attackStartMultiplier: 2.2 },
    { type: 'skeleton_archer', width: 66, height: 66, health: 22, speed: 1.12, damage: 6, color: '#c4c4d0', accent: '#e8e8f0', ranged: true, attackInterval: 110, visuals: ['☠', '🏹', '☠', '☠', '☠'], attackStyle: 'rain', attackEmoji: '🏹', windupFrames: 22, attackStartMultiplier: 2.8 },
    { type: 'skeleton_knight', width: 82, height: 82, health: 34, speed: 0.95, damage: 10, color: '#c0c0c0', accent: '#f0f0f8', visuals: ['☠', '🗡️', '🛡️', '☠', '☠'], attackStyle: 'slam', attackEmoji: '🛡️', windupFrames: 24, attackStartMultiplier: 2.4 },
    { type: 'skeleton_brawler', width: 76, height: 76, health: 28, speed: 1.35, damage: 9, color: '#d0d0d0', accent: '#f8f8f8', visuals: ['☠', '👊', '🔨', '☠', '☠'], attackStyle: 'pound', attackEmoji: '👊', windupFrames: 20, attackStartMultiplier: 2.6 },
    { type: 'skeleton_revenant', width: 72, height: 72, health: 24, speed: 1.4, damage: 7, color: '#e0e0e0', accent: '#ffffff', visuals: ['☠', '☠', '☠', '🕯️', '☠'], attackStyle: 'burst', attackEmoji: '🔥', windupFrames: 26, attackStartMultiplier: 2.8 },
    { type: 'skeleton_shooter_elite', width: 96, height: 96, health: 48, speed: 0.92, damage: 11, color: '#a8a8b0', accent: '#ffe66d', ranged: true, attackInterval: 100, elite: true, visuals: ['☠', '🥊', '⚡', '☠', '☠'], attackStyle: 'boxer', attackEmoji: '🥊⚡', windupFrames: 20, attackStartMultiplier: 3.0 },
    { type: 'skeleton_tank_elite', width: 108, height: 108, health: 74, speed: 0.72, damage: 14, color: '#9a9aa8', accent: '#d4d4e0', elite: true, visuals: ['☠', '🪓', '🛡️', '☠', '☠'], attackStyle: 'charge', attackEmoji: '🪓', windupFrames: 28, attackStartMultiplier: 2.4 },
    { type: 'skeleton_caster_elite', width: 98, height: 98, health: 52, speed: 0.86, damage: 10, color: '#b8b8c8', accent: '#dfe0ff', ranged: true, attackInterval: 120, elite: true, visuals: ['☠', '🔮', '☠', '☠', '☠'], attackStyle: 'sigil', attackEmoji: '🌀', windupFrames: 24, attackStartMultiplier: 2.9 }
];

function getNearestCastleEnemy() {
    if (!castleInteriorEnemies.length) return null;
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;
    let nearest = null;
    let best = Infinity;
    for (const enemy of castleInteriorEnemies) {
        if (enemy.isDying) continue;
        const ex = enemy.x + enemy.width / 2;
        const ey = enemy.y + enemy.height / 2;
        const dist = Math.hypot(px - ex, py - ey);
        if (dist < best) {
            best = dist;
            nearest = enemy;
        }
    }
    return nearest;
}

function getNearestCastleEnemyCenter() {
    const enemy = getNearestCastleEnemy();
    if (!enemy) return null;
    return {
        x: enemy.x + enemy.width / 2,
        y: enemy.y + enemy.height / 2
    };
}

function getCastleOrCurrentHomingTarget() {
    if (playerInsideConstruction) {
        const interior = getNearestInteriorEnemy();
        return interior ? { x: interior.x + interior.width / 2, y: interior.y + interior.height / 2 } : null;
    }
    return currentMonster || null;
}

function getCastleOrCurrentTargetCenter() {
    if (playerInsideConstruction) {
        return getNearestInteriorEnemy() ? { x: getNearestInteriorEnemy().x + getNearestInteriorEnemy().width / 2, y: getNearestInteriorEnemy().y + getNearestInteriorEnemy().height / 2 } : null;
    }
    if (!currentMonster) return null;
    return {
        x: currentMonster.x + currentMonster.width / 2,
        y: currentMonster.y + currentMonster.height / 2
    };
}

function getPreferredTarget() {
    // When inside a construction, prefer the nearest interior enemy
    if (playerInsideConstruction) {
        const interiorTarget = getNearestInteriorEnemy();
        if (interiorTarget) return { x: interiorTarget.x + interiorTarget.width / 2, y: interiorTarget.y + interiorTarget.height / 2 };
        return { x: mouseX, y: mouseY };
    }

    // Outside: prefer visible monster, otherwise world mouse position
    const worldMouseX = mouseX + cameraX;
    const worldMouseY = mouseY + cameraY;
    const monsterVisible = currentMonster && (currentMonster.x + currentMonster.width >= cameraX) && (currentMonster.x <= cameraX + viewportWidth) && (currentMonster.y + currentMonster.height >= cameraY) && (currentMonster.y <= cameraY + viewportHeight);
    if (monsterVisible && currentMonster) {
        return { x: currentMonster.x + currentMonster.width / 2, y: currentMonster.y + currentMonster.height / 2 };
    }
    return { x: worldMouseX, y: worldMouseY };
}

function openCastleExitIfReady() {
    if (!castleExitOpen && castleInteriorKills >= 100) {
        castleExitOpen = true;
        screenShakeTimer = Math.max(screenShakeTimer, 48);
        castleBossAlertText = 'um novo inimigo aparece.';
        castleBossAlertTimer = 120;
        if (player && !player.castleBoneUnlocked) {
            player.castleBoneUnlocked = true;
            player.castleBoneHitCounter = 0;
            player.castleBoneOrbiters = [];
            spawnCastleSkullSummonAt(player.x + player.width / 2, player.y + player.height / 2, 4);
        }
    }
}

function spawnCastleSkullSummonAt(x, y, count = 3) {
    const skullCount = Math.max(2, Math.min(4, count));
    for (let i = 0; i < skullCount; i += 1) {
        const spreadX = (Math.random() - 0.5) * 54;
        const spreadY = (Math.random() - 0.5) * 54;
        castleSkullWarningEffects.push({
            x: x + spreadX,
            y: y + spreadY,
            targetX: x,
            targetY: y,
            size: 12 + Math.random() * 10,
            life: 16 + Math.floor(Math.random() * 8),
            maxLife: 16 + Math.floor(Math.random() * 8),
            drift: (Math.random() - 0.5) * 0.9
        });
    }
}

function updateCastleSkullWarningEffects() {
    for (let i = castleSkullWarningEffects.length - 1; i >= 0; i -= 1) {
        const effect = castleSkullWarningEffects[i];
        effect.life -= 1;
        effect.x += (effect.targetX - effect.x) * 0.2;
        effect.y += (effect.targetY - effect.y) * 0.2;
        effect.x += Math.sin((effect.maxLife - effect.life) * 0.35) * effect.drift * 0.18;
        effect.y += Math.cos((effect.maxLife - effect.life) * 0.25) * effect.drift * 0.16;
        if (effect.life <= 0) {
            castleSkullWarningEffects.splice(i, 1);
        }
    }
}

function drawCastleSkullWarningEffects() {
    for (const effect of castleSkullWarningEffects) {
        const alpha = Math.max(0, effect.life / effect.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `${effect.size}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💀', effect.x, effect.y);
        ctx.restore();
    }
}

function normalizeAngle(angle) {
    while (angle <= -Math.PI) angle += Math.PI * 2;
    while (angle > Math.PI) angle -= Math.PI * 2;
    return angle;
}

function spawnCastleBossProjectileRing(centerX, centerY, baseAngle, count, speed, color, emoji) {
    for (let i = 0; i < count; i += 1) {
        const angle = baseAngle + (i / count) * Math.PI * 2;
        const targetX = centerX + Math.cos(angle) * 300;
        const targetY = centerY + Math.sin(angle) * 300;
        spawnMonsterProjectile(
            centerX,
            centerY,
            targetX,
            targetY,
            3,
            color,
            speed,
            {
                monsterType: 'castle_bone_sphere',
                projectileEmoji: emoji,
                size: 14,
                style: 'boneRing',
                maxDistance: 980,
                afterImageTrail: true,
                afterImageInterval: 7
            }
        );
    }
}

function spawnCastleBossSkeletons(count = 1) {
    const skeletonCount = Math.max(1, Math.min(3, count));
    const skeletonEmojis = ['☠', '🗡️', '🏹', '🛡️', '👊', '🔮'];
    for (let i = 0; i < skeletonCount; i += 1) {
        if (!currentMonster) return;
        const angle = Math.random() * Math.PI * 2;
        const distance = 40 + Math.random() * 32;
        const startX = currentMonster.x + currentMonster.width / 2 + Math.cos(angle) * distance;
        const startY = currentMonster.y + currentMonster.height / 2 + Math.sin(angle) * distance;
        const targetX = player.x + player.width / 2 + (Math.random() - 0.5) * 120;
        const targetY = player.y + player.height / 2 + (Math.random() - 0.5) * 120;
        const emoji = skeletonEmojis[Math.floor(Math.random() * skeletonEmojis.length)];
        spawnMonsterProjectile(
            startX,
            startY,
            targetX,
            targetY,
            Math.max(3, Math.round((20 + currentMonster.phase * 3) * 0.18)),
            '#ffffff',
            4.4,
            {
                monsterType: 'castle_bone_sphere',
                projectileEmoji: emoji,
                size: 12,
                homing: true,
                homingTarget: player,
                homingStrength: 0.18,
                homingDuration: 90,
                maxDistance: 980,
                afterImageTrail: true,
                afterImageInterval: 7
            }
        );
    }
}

function spawnCastleBossDeathWaves() {
    if (!currentMonster) return;
    const centerX = currentMonster.x + currentMonster.width / 2;
    const centerY = currentMonster.y + currentMonster.height / 2;
    for (let angleOffset = 0; angleOffset < Math.PI * 2; angleOffset += Math.PI / 3) {
        const targetX = centerX + Math.cos(angleOffset) * 340;
        const targetY = centerY + Math.sin(angleOffset) * 340;
        spawnMonsterProjectile(
            centerX,
            centerY,
            targetX,
            targetY,
            Math.max(3, Math.round(currentMonster.getAttackDamage() * 0.75)),
            '#9dd3ff',
            4.8,
            {
                monsterType: 'castle_bone_sphere',
                projectileEmoji: '🦴',
                size: 16,
                style: 'boneRing',
                maxDistance: 1120,
                afterImageTrail: true,
                afterImageInterval: 6
            }
        );
    }
}

function spawnCastleBossDeathSkeletons() {
    if (!currentMonster) return;
    const centerX = currentMonster.x + currentMonster.width / 2;
    const centerY = currentMonster.y + currentMonster.height / 2;
    const baseDamage = Math.max(1, Math.round(currentMonster.getAttackDamage() * 0.55));

    for (let i = 0; i < 4; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const startX = centerX + Math.cos(angle) * 34;
        const startY = centerY + Math.sin(angle) * 34;
        const targetX = centerX + Math.cos(angle) * (220 + Math.random() * 100);
        const targetY = centerY + Math.sin(angle) * (220 + Math.random() * 100);
        spawnMonsterProjectile(
            startX,
            startY,
            targetX,
            targetY,
            baseDamage,
            '#ffffff',
            4.8,
            {
                monsterType: 'castle_bone_sphere',
                projectileEmoji: '☠',
                size: 12,
                style: 'boneShard',
                homing: true,
                homingTarget: player,
                homingStrength: 0.12,
                homingDuration: 110,
                maxDistance: 840,
                afterImageTrail: true,
                afterImageInterval: 8
            }
        );
    }

    for (let i = 0; i < 3; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const startX = centerX + Math.cos(angle) * 40;
        const startY = centerY + Math.sin(angle) * 40;
        const targetX = centerX + Math.cos(angle) * (300 + Math.random() * 100);
        const targetY = centerY + Math.sin(angle) * (300 + Math.random() * 100);
        spawnMonsterProjectile(
            startX,
            startY,
            targetX,
            targetY,
            Math.max(3, Math.round(currentMonster.getAttackDamage() * 0.9)),
            '#c8d1ff',
            5.2,
            {
                monsterType: 'castle_bone_sphere',
                projectileEmoji: '🦴',
                size: 14,
                style: 'tankOrbit',
                homing: true,
                homingTarget: player,
                homingStrength: 0.10,
                homingDuration: 90,
                maxDistance: 920,
                afterImageTrail: true,
                afterImageInterval: 6
            }
        );
    }
}

function updateCastleBossSpawnTimer() {
    if (!castleExitOpen || playerInsideConstruction) return;
    if (castleBossQueued || (currentMonster && currentMonster.type === 'castle_bone_sphere')) return;

    castleBossSpawnCheckTimer -= 1;
    if (castleBossSpawnCheckTimer <= 0) {
        castleBossSpawnCheckTimer = 1200;
        if (Math.random() < castleBossSpawnChance) {
            castleBossQueued = true;
            castleBossAlertText = 'um novo inimigo aparece.';
            castleBossAlertTimer = 120;
            spawnCastleSkullSummonAt(player.x + player.width / 2, player.y + player.height / 2, 3);
        }
    }
}

function updateCastleBossAlert() {
    if (castleBossAlertTimer > 0) {
        castleBossAlertTimer -= 1;
        if (castleBossAlertTimer <= 0) {
            castleBossAlertText = '';
        }
    }
}

function drawCastleBossAlertOverlay() {
    if (!castleBossAlertText || castleBossAlertTimer <= 0) return;
    const alpha = Math.min(1, castleBossAlertTimer / 30);
    drawCountdownOverlay(castleBossAlertText, '', canvas.height / 2, alpha);
}

function spawnCastleEnemyAttackEffect(x, y, emoji, size = 24) {
    castleEnemyAttackEffects.push({
        x,
        y,
        emoji,
        size,
        life: 14,
        maxLife: 14,
        drift: (Math.random() - 0.5) * 1.4,
        vy: -1.1
    });
}

function updateCastleEnemyAttackEffects() {
    for (let i = castleEnemyAttackEffects.length - 1; i >= 0; i -= 1) {
        const effect = castleEnemyAttackEffects[i];
        effect.life -= 1;
        effect.y += effect.vy;
        effect.x += effect.drift;
        if (effect.life <= 0) {
            castleEnemyAttackEffects.splice(i, 1);
        }
    }
}

function drawCastleEnemyAttackEffects() {
    for (const effect of castleEnemyAttackEffects) {
        const alpha = Math.max(0, effect.life / effect.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `${effect.size}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(effect.emoji, effect.x, effect.y);
        ctx.restore();
    }
}

function spawnCastleBoneOrbiters() {
    if (!player || !player.castleBoneUnlocked) return;

    const centerX = player.x + player.width / 2;
    const centerY = player.y + player.height / 2;
    const boneCount = 3;
    const baseAngle = Math.random() * Math.PI * 2;

    for (let i = 0; i < boneCount; i += 1) {
        const angle = baseAngle + (i / boneCount) * Math.PI * 2;
        player.castleBoneOrbiters.push({
            angle,
            radius: 34 + i * 7 + Math.random() * 4,
            orbitSpeed: 0.024 + Math.random() * 0.008,
            size: 7 + Math.random() * 2,
            spin: (Math.random() - 0.5) * 0.12,
            hitCooldown: 0,
            x: centerX,
            y: centerY
        });
    }
}

function updateCastleBoneOrbiters() {
    if (!player || !player.castleBoneUnlocked) return;

    const centerX = player.x + player.width / 2;
    const centerY = player.y + player.height / 2;

    for (let i = player.castleBoneOrbiters.length - 1; i >= 0; i -= 1) {
        const bone = player.castleBoneOrbiters[i];
        bone.angle += bone.orbitSpeed;
        bone.x = centerX + Math.cos(bone.angle) * bone.radius;
        bone.y = centerY + Math.sin(bone.angle) * bone.radius;
        bone.hitCooldown = Math.max(0, (bone.hitCooldown || 0) - 1);

        const boneHalf = (bone.size || 8) + 2;
        if (playerInsideConstruction) {
            for (const enemy of castleInteriorEnemies) {
                if (enemy.isDying || bone.hitCooldown > 0) continue;
                if (bone.x + boneHalf > enemy.x && bone.x - boneHalf < enemy.x + enemy.width && bone.y + boneHalf > enemy.y && bone.y - boneHalf < enemy.y + enemy.height) {
                    applyDamageToCastleEnemy(enemy, 10);
                    bone.hitCooldown = 14;
                    break;
                }
            }
        } else if (currentMonster && currentMonster.health > 0 && !currentMonster.isDying && bone.hitCooldown <= 0) {
            const mx = currentMonster.x + currentMonster.width / 2;
            const my = currentMonster.y + currentMonster.height / 2;
            if (Math.hypot(bone.x - mx, bone.y - my) <= (currentMonster.width + currentMonster.height) / 4 + boneHalf) {
                currentMonster.takeDamage(10);
                bone.hitCooldown = 14;
            }
        }
    }
}

function drawCastleBoneOrbiters() {
    if (!player || !player.castleBoneUnlocked) return;

    for (const bone of player.castleBoneOrbiters) {
        ctx.save();
        ctx.translate(bone.x, bone.y);
        ctx.rotate(bone.angle * 0.6 + bone.spin);
        ctx.font = `${Math.max(20, bone.size * 3.2)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🦴', 0, 0);
        ctx.restore();
    }
}

function executeCastleEnemyAttack(enemy, px, py) {
    const ex = enemy.x + enemy.width / 2;
    const ey = enemy.y + enemy.height / 2;
    const dx = px - ex;
    const dy = py - ey;
    const dist = Math.hypot(dx, dy) || 1;
    const normalizedX = dx / dist;
    const normalizedY = dy / dist;

    switch (enemy.attackStyle) {
        case 'slash': {
            enemy.x += normalizedX * 34;
            enemy.y += normalizedY * 34;
            const hitX = enemy.x + enemy.width / 2;
            const hitY = enemy.y + enemy.height / 2;
            if (Math.hypot(px - hitX, py - hitY) <= 174 && player.dashTimer <= 0 && player.postDashInvulnTimer <= 0) {
                const effectiveDamage = Math.max(0, enemy.damage - player.damageReduction);
                player.health -= effectiveDamage;
                spawnCastleEnemyAttackEffect(hitX, hitY - 10, enemy.attackEmoji || '✂️', 30);
            }
            break;
        }
        case 'rain': {
            for (let i = 0; i < 5; i += 1) {
                const leadX = px + normalizedX * 28;
                const leadY = py + normalizedY * 28;
                const targetX = leadX + (Math.random() - 0.5) * 20;
                const targetY = leadY + (Math.random() - 0.5) * 20;
                spawnMonsterProjectile(ex, ey, targetX, targetY, Math.max(1, Math.round(enemy.damage * 0.8)), '#9ad4ff', 4.6 + i * 0.08, {
                    monsterType: enemy.type,
                    size: enemy.isElite ? 21 : 18,
                    style: enemy.isElite ? 'enemyArrow' : 'enemyBolt',
                    maxDistance: 2400,
                    projectileEmoji: '🗡️'
                });
            }
            break;
        }
        case 'slam': {
            for (let i = 0; i < 8; i += 1) {
                const angle = (i / 8) * Math.PI * 2;
                const targetX = ex + Math.cos(angle) * 360;
                const targetY = ey + Math.sin(angle) * 360;
                spawnMonsterProjectile(ex, ey, targetX, targetY, Math.max(1, Math.round(enemy.damage * 0.7)), '#ff7b7b', 2.7, {
                    monsterType: enemy.type,
                    size: 18,
                    style: 'enemyBolt',
                    maxDistance: 1500,
                    projectileEmoji: enemy.attackEmoji || '🛡️'
                });
            }
            if (player) {
                tryApplyPlayerConfusionFromAttack(enemy.type || 'skeleton_knight', { guaranteed: true });
            }
            break;
        }
        case 'pound': {
            if (Math.hypot(px - ex, py - ey) <= 288 && player.dashTimer <= 0 && player.postDashInvulnTimer <= 0) {
                const effectiveDamage = Math.max(0, enemy.damage + 2 - player.damageReduction);
                player.health -= effectiveDamage;
                if (enemy.type === 'skeleton_brawler') {
                    tryApplyPlayerConfusionFromAttack(enemy.type, { chance: 50 });
                }
                spawnCastleEnemyAttackEffect(px + normalizedX * 10, py + normalizedY * 10, enemy.attackEmoji || '👊', 34);
            }
            break;
        }
        case 'stun': {
            if (Math.hypot(px - ex, py - ey) <= 248 && player.dashTimer <= 0 && player.postDashInvulnTimer <= 0) {
                const effectiveDamage = Math.max(0, enemy.damage + 1 - player.damageReduction);
                player.health -= effectiveDamage;
                player.stunTimer = Math.max(player.stunTimer || 0, 45);
                spawnCastleEnemyAttackEffect(px + normalizedX * 8, py + normalizedY * 8, enemy.attackEmoji || '⚡', 34);
            }
            break;
        }
        case 'burst': {
            for (let i = 0; i < 6; i += 1) {
                const burstAngle = (i / 6) * Math.PI * 2;
                const targetX = ex + Math.cos(burstAngle) * 660;
                const targetY = ey + Math.sin(burstAngle) * 660;
                spawnMonsterProjectile(ex, ey, targetX, targetY, Math.max(1, Math.round(enemy.damage * 0.6)), '#c77dff', 3.4, {
                    monsterType: enemy.type,
                    size: 15,
                    style: 'enemyBolt',
                    maxDistance: 1950,
                    projectileEmoji: enemy.attackEmoji || '🔥'
                });
            }
            break;
        }
        case 'boxer': {
            const closeRange = Math.hypot(px - ex, py - ey) <= 336;
            if (closeRange) {
                enemy.x += normalizedX * 84;
                enemy.y += normalizedY * 84;
                const hitX = enemy.x + enemy.width / 2;
                const hitY = enemy.y + enemy.height / 2;
                if (Math.hypot(px - hitX, py - hitY) <= 216 && player.dashTimer <= 0 && player.postDashInvulnTimer <= 0) {
                    const effectiveDamage = Math.max(0, enemy.damage + 1 - player.damageReduction);
                    player.health -= effectiveDamage;
                    spawnCastleEnemyAttackEffect(hitX, hitY - 8, enemy.attackEmoji || '🥊⚡', 34);
                }
            } else {
                const targetX = px + normalizedX * 48;
                const targetY = py + normalizedY * 48;
                spawnMonsterProjectile(ex, ey, targetX, targetY, Math.max(1, Math.round(enemy.damage * 0.8)), '#ffe66d', 4.8, {
                    monsterType: enemy.type,
                    size: 21,
                    style: 'enemyBolt',
                    maxDistance: 2100,
                    projectileEmoji: enemy.attackEmoji || '🥊⚡'
                });
            }
            break;
        }
        case 'charge': {
            enemy.x += normalizedX * 168;
            enemy.y += normalizedY * 168;
            const hitX = enemy.x + enemy.width / 2;
            const hitY = enemy.y + enemy.height / 2;
            if (Math.hypot(px - hitX, py - hitY) <= 210 && player.dashTimer <= 0 && player.postDashInvulnTimer <= 0) {
                const effectiveDamage = Math.max(0, enemy.damage + 1 - player.damageReduction);
                player.health -= effectiveDamage;
                if (enemy.knockbackOnHit) {
                    const knockbackForce = 10;
                    player.x = Math.max(0, Math.min(viewportWidth - player.width, player.x + normalizedX * knockbackForce));
                    player.y = Math.max(0, Math.min(viewportHeight - player.height, player.y + normalizedY * knockbackForce));
                }
                if (enemy.type === 'skeleton_tank_elite') {
                    tryApplyPlayerConfusionFromAttack(enemy.type, { guaranteed: true });
                }
                spawnCastleEnemyAttackEffect(hitX, hitY - 10, enemy.attackEmoji || '🪓', 34);
            }
            break;
        }
        case 'sigil': {
            for (let i = 0; i < 4; i += 1) {
                const targetX = px + normalizedX * 36 + (Math.random() - 0.5) * 12;
                const targetY = py + normalizedY * 36 + (Math.random() - 0.5) * 12;
                spawnMonsterProjectile(ex, ey, targetX, targetY, Math.max(1, Math.round(enemy.damage * 0.75)), '#8be9fd', 3.8, {
                    monsterType: enemy.type,
                    size: 18,
                    style: 'enemyBolt',
                    maxDistance: 2250,
                    projectileEmoji: enemy.attackEmoji || '🌀'
                });
            }
            if (enemy.confusionOnAttackGuaranteed) {
                tryApplyPlayerConfusionFromAttack(enemy.type, { guaranteed: true });
            } else if (enemy.confusionOnAttackChance) {
                tryApplyPlayerConfusionFromAttack(enemy.type, { chance: enemy.confusionOnAttackChance });
            }
            break;
        }
        default:
            if (enemy.ranged) {
                spawnMonsterProjectile(ex, ey, px, py, Math.max(1, Math.round(enemy.damage * 0.9)), '#9ad4ff', 4.5, {
                    monsterType: enemy.type,
                    size: enemy.isElite ? 8 : 6,
                    style: enemy.isElite ? 'enemyArrow' : 'enemyBolt',
                    maxDistance: 900,
                    projectileEmoji: enemy.attackEmoji || '🗡️'
                });
            } else if (player.dashTimer <= 0 && player.postDashInvulnTimer <= 0) {
                const effectiveDamage = Math.max(0, enemy.damage - player.damageReduction);
                player.health -= effectiveDamage;
            }
            break;
    }
}

function getCastleInteriorSpawnDelay(waveIndex, spawnIndex) {
    const isLastWave = waveIndex === castleInteriorWaves.length - 1;
    if (isLastWave && spawnIndex < 2) return 18;
    if (waveIndex >= Math.max(0, castleInteriorWaves.length - 2)) return 30;
    return 0;
}

function spawnCastleInteriorEnemyFromTemplate(typeTemplate, waveIndex, x, y) {
    const attackStartMultiplier = typeTemplate.attackStartMultiplier || (typeTemplate.ranged ? 2.8 : 2.2);
    castleInteriorEnemies.push({
        id: castleInteriorEnemyIdCounter++,
        type: typeTemplate.type,
        x,
        y,
        width: typeTemplate.width,
        height: typeTemplate.height,
        health: typeTemplate.health + waveIndex * 3,
        maxHealth: typeTemplate.health + waveIndex * 3,
        speed: typeTemplate.speed,
        damage: typeTemplate.damage,
        color: typeTemplate.color,
        accent: typeTemplate.accent,
        visuals: typeTemplate.visuals || ['☠', '☠', '☠', '☠', '☠'],
        ranged: !!typeTemplate.ranged,
        attackStyle: typeTemplate.attackStyle || 'melee',
        attackEmoji: typeTemplate.attackEmoji || '⚔️',
        windupFrames: Math.max(8, Math.round((typeTemplate.windupFrames || 20) * 0.7)),
        attackState: 'idle',
        attackWindupTimer: 0,
        attackInterval: Math.max(36, Math.round((typeTemplate.attackInterval || 90) * 0.72)),
        isAppearing: true,
        appearanceTimer: 16 + Math.floor(Math.random() * 8),
        attackCooldown: Math.round(Math.random() * 30),
        attackRange: Math.max(24, Math.round((typeTemplate.ranged ? 90 : 24) * attackStartMultiplier)),
        isElite: !!typeTemplate.elite,
        isDying: false,
        deathTimer: 0,
        deathMaxTimer: 18,
        stunTimer: 0,
        flashTimer: 0,
        vx: 0,
        vy: 0
    });
}

function spawnCastleInteriorWave() {
    if (castleInteriorWaveIndex >= castleInteriorWaves.length) {
        openCastleExitIfReady();
        return;
    }

    const waveIndex = castleInteriorWaveIndex;
    const count = castleInteriorWaves[waveIndex] || 0;
    const eliteTypes = castleSkeletonTypes.filter(t => t.elite);
    const normalTypes = castleSkeletonTypes.filter(t => !t.elite);
    const eliteChance = Math.max(0, (waveIndex - 2) * 0.12);
    const shouldStagger = waveIndex >= Math.max(0, castleInteriorWaves.length - 2);

    castleInteriorWaveSpawnQueue = [];
    castleInteriorWaveSpawnTimer = 0;

    if (!shouldStagger) {
        for (let i = 0; i < count; i += 1) {
            const typeTemplate = Math.random() < eliteChance && eliteTypes.length > 0
                ? eliteTypes[Math.floor(Math.random() * eliteTypes.length)]
                : normalTypes[Math.floor(Math.random() * normalTypes.length)];

            const x = Math.random() < 0.5
                ? Math.random() * (viewportWidth - 120) + 40
                : Math.random() < 0.5 ? 40 : viewportWidth - 120;
            const y = Math.random() * (viewportHeight - 120) + 40;

            spawnCastleSkullSummonAt(x, y, 2 + Math.floor(Math.random() * 3));
            spawnCastleInteriorEnemyFromTemplate(typeTemplate, waveIndex, x, y);
        }

        castleInteriorWaveIndex += 1;
        return;
    }

    for (let i = 0; i < count; i += 1) {
        const typeTemplate = Math.random() < eliteChance && eliteTypes.length > 0
            ? eliteTypes[Math.floor(Math.random() * eliteTypes.length)]
            : normalTypes[Math.floor(Math.random() * normalTypes.length)];

        const x = Math.random() < 0.5
            ? Math.random() * (viewportWidth - 120) + 40
            : Math.random() < 0.5 ? 40 : viewportWidth - 120;
        const y = Math.random() * (viewportHeight - 120) + 40;

        castleInteriorWaveSpawnQueue.push({
            typeTemplate,
            waveIndex,
            x,
            y,
            delay: i === 0 ? 0 : getCastleInteriorSpawnDelay(waveIndex, i)
        });
    }

    if (castleInteriorWaveSpawnQueue.length > 0) {
        castleInteriorWaveSpawnTimer = castleInteriorWaveSpawnQueue[0].delay;
    }

    castleInteriorWaveIndex += 1;
}

function updateCastleInteriorEnemies() {
    updateCastleSkullWarningEffects();
    updateCastleEnemyAttackEffects();

    if (castleInteriorWaveSpawnQueue.length > 0) {
        if (castleInteriorWaveSpawnTimer > 0) {
            castleInteriorWaveSpawnTimer -= 1;
        }
        if (castleInteriorWaveSpawnTimer <= 0) {
            const nextSpawn = castleInteriorWaveSpawnQueue.shift();
            if (nextSpawn) {
                spawnCastleSkullSummonAt(nextSpawn.x, nextSpawn.y, 2 + Math.floor(Math.random() * 3));
                spawnCastleInteriorEnemyFromTemplate(nextSpawn.typeTemplate, nextSpawn.waveIndex, nextSpawn.x, nextSpawn.y);
            }
            if (castleInteriorWaveSpawnQueue.length > 0) {
                castleInteriorWaveSpawnTimer = castleInteriorWaveSpawnQueue[0].delay;
            } else {
                castleInteriorWaveSpawnTimer = 0;
            }
        }
    }

    for (let i = castleInteriorEnemies.length - 1; i >= 0; i -= 1) {
        const enemy = castleInteriorEnemies[i];
        if (enemy.isDying) {
            enemy.deathTimer -= 1;
            if (enemy.deathTimer <= 0) {
                castleInteriorEnemies.splice(i, 1);
                castleInteriorKills += 1;
                openCastleExitIfReady();
                if (castleInteriorEnemies.length === 0 && castleInteriorWaveSpawnQueue.length === 0 && castleInteriorWaveIndex < castleInteriorWaves.length && castleInteriorWaveDelay <= 0) {
                    castleInteriorWaveDelay = 90;
                }
            }
            continue;
        }

        if (enemy.isAppearing) {
            enemy.appearanceTimer -= 1;
            if (enemy.appearanceTimer <= 0) {
                enemy.isAppearing = false;
            }
            continue;
        }

        if (enemy.flashTimer > 0) {
            enemy.flashTimer -= 1;
        }
        if (enemy.stunTimer > 0) {
            enemy.stunTimer -= 1;
            continue;
        }

        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        const ex = enemy.x + enemy.width / 2;
        const ey = enemy.y + enemy.height / 2;
        const dx = px - ex;
        const dy = py - ey;
        const dist = Math.hypot(dx, dy) || 1;
        const normalizedX = dx / dist;
        const normalizedY = dy / dist;

        if (enemy.attackState === 'windup') {
            enemy.attackWindupTimer -= 1;
            if (enemy.attackWindupTimer <= 0) {
                enemy.attackState = 'idle';
                enemy.attackCooldown = enemy.attackInterval;
                executeCastleEnemyAttack(enemy, px, py);
            }
            enemy.x = Math.max(16, Math.min(enemy.x, viewportWidth - enemy.width - 16));
            enemy.y = Math.max(16, Math.min(enemy.y, viewportHeight - enemy.height - 16));
            continue;
        }

        if (enemy.attackCooldown > 0) {
            enemy.attackCooldown -= 1;
        }

        const attackThreshold = enemy.attackRange || (enemy.ranged ? 90 : 24);
        if (enemy.ranged) {
            if (dist > attackThreshold * 0.75) {
                enemy.x += normalizedX * enemy.speed;
                enemy.y += normalizedY * enemy.speed;
            }

            if (enemy.attackCooldown <= 0 && dist <= attackThreshold + 16) {
                enemy.attackState = 'windup';
                enemy.attackWindupTimer = enemy.windupFrames || 24;
                enemy.attackCooldown = 1;
            }
        } else {
            if (dist > attackThreshold) {
                enemy.x += normalizedX * enemy.speed;
                enemy.y += normalizedY * enemy.speed;
            }
            if (enemy.attackCooldown <= 0 && dist <= attackThreshold) {
                enemy.attackState = 'windup';
                enemy.attackWindupTimer = enemy.windupFrames || 24;
                enemy.attackCooldown = 1;
            }
        }

        enemy.x = Math.max(16, Math.min(enemy.x, viewportWidth - enemy.width - 16));
        enemy.y = Math.max(16, Math.min(enemy.y, viewportHeight - enemy.height - 16));
    }

    if (castleInteriorEnemies.length === 0 && castleInteriorWaveSpawnQueue.length === 0 && castleInteriorWaveDelay > 0) {
        castleInteriorWaveDelay -= 1;
        if (castleInteriorWaveDelay <= 0) {
            castleInteriorWaveDelay = 0;
            spawnCastleInteriorWave();
        }
    }
}

function drawCastleInteriorEnemies() {
    drawCastleSkullWarningEffects();
    drawCastleEnemyAttackEffects();

    for (const enemy of castleInteriorEnemies) {
        if (enemy.isAppearing) continue;

        const alpha = enemy.isDying ? Math.max(0, enemy.deathTimer / enemy.deathMaxTimer) : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = enemy.color;
        ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
        ctx.strokeStyle = enemy.accent;
        ctx.lineWidth = enemy.isElite ? 3 : 2;
        ctx.strokeRect(enemy.x, enemy.y, enemy.width, enemy.height);
        ctx.fillStyle = '#2d2d2d';
        ctx.font = `${Math.max(18, Math.round(enemy.width * 0.22))}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const centerX = enemy.x + enemy.width / 2;
        const centerY = enemy.y + enemy.height / 2;
        const placements = [
            { x: centerX, y: centerY, emoji: enemy.visuals[0] || '☠' },
            { x: enemy.x + enemy.width * 0.28, y: enemy.y + enemy.height * 0.28, emoji: enemy.visuals[1] || '☠' },
            { x: enemy.x + enemy.width * 0.72, y: enemy.y + enemy.height * 0.28, emoji: enemy.visuals[2] || '☠' },
            { x: enemy.x + enemy.width * 0.28, y: enemy.y + enemy.height * 0.72, emoji: enemy.visuals[3] || '☠' },
            { x: enemy.x + enemy.width * 0.72, y: enemy.y + enemy.height * 0.72, emoji: enemy.visuals[4] || '☠' }
        ];

        placements.forEach(placement => {
            ctx.fillText(placement.emoji, placement.x, placement.y);
        });

        if (enemy.attackState === 'windup') {
            const progress = enemy.attackWindupTimer / (enemy.windupFrames || 24);
            const indicatorAlpha = Math.max(0.25, progress);
            ctx.save();
            ctx.globalAlpha = indicatorAlpha;
            ctx.strokeStyle = enemy.attackStyle === 'rain' ? '#8fd8ff' : enemy.attackStyle === 'pound' ? '#ffd166' : enemy.attackStyle === 'slam' ? '#ff7c5c' : enemy.attackStyle === 'burst' ? '#c77dff' : enemy.attackStyle === 'charge' ? '#7cffb2' : enemy.attackStyle === 'boxer' ? '#ffe66d' : '#ff4d4d';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(centerX, centerY, enemy.width * 0.72 + (1 - progress) * 24, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(centerX, centerY - 16);
            ctx.lineTo(centerX + (player.x + player.width / 2 - centerX) * 0.18, centerY + (player.y + player.height / 2 - centerY) * 0.18);
            ctx.stroke();
            ctx.font = `${Math.max(16, Math.round(enemy.width * 0.2))}px Arial`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(enemy.attackEmoji || (enemy.attackStyle === 'rain' ? '🏹' : enemy.attackStyle === 'pound' ? '💥' : enemy.attackStyle === 'slam' ? '⚡' : enemy.attackStyle === 'burst' ? '☠' : enemy.attackStyle === 'charge' ? '💨' : enemy.attackStyle === 'boxer' ? '🥊⚡' : '⚔️'), centerX, centerY - 28);
            ctx.restore();
        }

        if (enemy.isElite) {
            ctx.strokeStyle = 'rgba(255, 215, 140, 0.75)';
            ctx.lineWidth = 4;
            ctx.strokeRect(enemy.x + 2, enemy.y + 2, enemy.width - 4, enemy.height - 4);
        }
        ctx.restore();

        const healthFrac = Math.max(0, Math.min(1, enemy.health / enemy.maxHealth));
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(enemy.x, enemy.y - 10, enemy.width, 6);
        ctx.fillStyle = enemy.isElite ? '#ffd966' : '#80e080';
        ctx.fillRect(enemy.x, enemy.y - 10, enemy.width * healthFrac, 6);
        ctx.restore();
    }
}

function getCastleAttackTarget() {
    if (playerInsideConstruction && castleInteriorEnemies.length) {
        const center = getNearestCastleEnemyCenter();
        if (center) return center;
    }
    if (currentMonster) {
        return {
            x: currentMonster.x + currentMonster.width / 2,
            y: currentMonster.y + currentMonster.height / 2
        };
    }
    return null;
}

function findCastleEnemyInRectangle(x, y, width, height) {
    for (const enemy of castleInteriorEnemies) {
        if (enemy.isDying) continue;
        if (x < enemy.x + enemy.width && x + width > enemy.x && y < enemy.y + enemy.height && y + height > enemy.y) {
            return enemy;
        }
    }
    return null;
}

function findCastleEnemyHitByMelee(x1, y1, x2, y2, threshold) {
    let bestEnemy = null;
    let bestDist = Infinity;
    for (const enemy of castleInteriorEnemies) {
        if (enemy.isDying) continue;
        const mx = enemy.x + enemy.width / 2;
        const my = enemy.y + enemy.height / 2;
        const distToSegment = pointToSegmentDistance(mx, my, x1, y1, x2, y2);
        if (distToSegment <= threshold + Math.max(enemy.width, enemy.height) / 2 && distToSegment < bestDist) {
            bestDist = distToSegment;
            bestEnemy = enemy;
        }
    }
    return bestEnemy;
}

function applyDamageToCastleEnemy(enemy, damage) {
    if (!enemy || enemy.isDying) return;
    enemy.health = Math.max(0, enemy.health - damage);
    enemy.flashTimer = 10;
    if (enemy.health <= 0) {
        enemy.isDying = true;
        enemy.deathTimer = enemy.deathMaxTimer;
        spawnMonsterDeathEffect(enemy);
    }
}

function maybeSpawnMansionGhostCopy(target, originalDamage) {
    if (!player || !player.mansionGhostCopyUnlocked || !target || target.isDying) return false;
    if (typeof target.health !== 'number' || target.health <= 0) return false;
    if (Math.random() >= (player.mansionGhostCopyChance || 0.33)) return false;

    const ghostDamage = Math.max(1, Math.round((originalDamage || 0) * (player.mansionGhostCopyDamageRatio || 0.5)));
    const stunFrames = Math.max(6, Math.round(player.mansionGhostCopyStunFrames || 24));
    const targetCenterX = (target.x || 0) + (target.width || 0) / 2;
    const targetCenterY = (target.y || 0) + (target.height || 0) / 2;

    target.health = Math.max(0, target.health - ghostDamage);
    target.tookDamage = true;
    target.flashTimer = Math.max(target.flashTimer || 0, 12);
    target.stunTimer = Math.max(target.stunTimer || 0, stunFrames);

    if (target.health <= 0) {
        target.isDying = true;
        target.deathTimer = target.deathMaxTimer || 16;
        spawnMonsterDeathEffect(target);
    }

    spawnEvaporationEffect(targetCenterX, targetCenterY, '#f7eaff', 16, 12);
    spawnAfterImage({
        kind: 'monster',
        x: targetCenterX - 12,
        y: targetCenterY - 12,
        width: 24,
        height: 24,
        life: 14,
        maxLife: 14,
        baseAlpha: 0.42,
        color: '#f4e2ff',
        type: target.type || 'ghost'
    });
    return true;
}

function getCurrentInteriorEnemies() {
    const construction = constructions.find(c => c.id === currentConstructionId);
    if (!construction) return [];
    return construction.type === 'mansion' ? mansionInteriorEnemies : castleInteriorEnemies;
}

function findInteriorEnemyInRectangle(x, y, width, height) {
    const enemies = getCurrentInteriorEnemies();
    for (const enemy of enemies) {
        if (enemy.isDying || enemy.isInvisible) continue;
        if (x < enemy.x + enemy.width && x + width > enemy.x && y < enemy.y + enemy.height && y + height > enemy.y) {
            return enemy;
        }
    }
    return null;
}

function findInteriorEnemyHitByMelee(x1, y1, x2, y2, threshold) {
    let bestEnemy = null;
    let bestDist = Infinity;
    const enemies = getCurrentInteriorEnemies();
    for (const enemy of enemies) {
        if (enemy.isDying || enemy.isInvisible) continue;
        const mx = enemy.x + enemy.width / 2;
        const my = enemy.y + enemy.height / 2;
        const distToSegment = pointToSegmentDistance(mx, my, x1, y1, x2, y2);
        if (distToSegment <= threshold + Math.max(enemy.width, enemy.height) / 2 && distToSegment < bestDist) {
            bestDist = distToSegment;
            bestEnemy = enemy;
        }
    }
    return bestEnemy;
}

function applyDamageToInteriorEnemy(enemy, damage) {
    if (!enemy || enemy.isDying) return;
    enemy.health = Math.max(0, enemy.health - damage);
    enemy.flashTimer = 10;
    if (enemy.health <= 0) {
        enemy.isDying = true;
        enemy.deathTimer = enemy.deathMaxTimer;
        spawnMonsterDeathEffect(enemy);
    } else {
        maybeSpawnMansionGhostCopy(enemy, damage);
    }
}

function getNearestInteriorEnemy() {
    const enemies = getCurrentInteriorEnemies();
    if (!enemies.length) return null;
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;
    let nearest = null;
    let best = Infinity;
    for (const enemy of enemies) {
        if (enemy.isDying || enemy.isInvisible) continue;
        const ex = enemy.x + enemy.width / 2;
        const ey = enemy.y + enemy.height / 2;
        const dist = Math.hypot(px - ex, py - ey);
        if (dist < best) {
            best = dist;
            nearest = enemy;
        }
    }
    return nearest;
}

function clearCastleInterior() {
    castleInteriorEnemies = [];
    castleInteriorWaveIndex = 0;
    castleInteriorKills = 0;
    castleInteriorWaveDelay = 0;
    castleExitOpen = false;
}

function clearMansionInterior() {
    mansionInteriorEnemies = [];
    mansionInteriorEnemyIdCounter = 0;
    mansionInteriorSpawnTimer = getRandomMansionSpawnDelay();
    mansionInteriorSpawnIndex = 0;
    mansionInteriorKills = 0;
    mansionPeriodicWaveTimer = mansionPeriodicWaveIntervalFrames;
    mansionExitOpen = false;
    mansionGhostCountTier1 = 35;
    mansionGhostCountTier2 = 35;
    mansionGhostCountTier3 = 30;
}

function getMansionGhostTierToSpawn() {
    if (mansionGhostCountTier1 > 0) return 0;
    if (mansionGhostCountTier2 > 0) return 1;
    if (mansionGhostCountTier3 > 0) return 2;
    return -1;
}

function getMansionGhostTypeForTier(tierIndex) {
    const pool = mansionGhostTierPools[tierIndex] || [];
    if (!pool.length) {
        return mansionGhostTypes[Math.floor(Math.random() * mansionGhostTypes.length)];
    }
    const typeName = pool[Math.floor(Math.random() * pool.length)];
    return mansionGhostTypes.find(template => template.type === typeName) || mansionGhostTypes[0];
}

function spawnMansionGhostFromTemplate(typeTemplate, x, y) {
    const attackStartMultiplier = typeTemplate.attackStartMultiplier || (typeTemplate.ranged ? 2.8 : 2.2);
    mansionInteriorEnemies.push({
        id: mansionInteriorEnemyIdCounter++,
        type: typeTemplate.type,
        x,
        y,
        width: typeTemplate.width,
        height: typeTemplate.height,
        health: typeTemplate.health,
        maxHealth: typeTemplate.health,
        speed: typeTemplate.speed,
        damage: typeTemplate.damage,
        color: typeTemplate.color,
        accent: typeTemplate.accent,
        visuals: typeTemplate.visuals || ['👻'],
        ranged: !!typeTemplate.ranged,
        attackStyle: typeTemplate.attackStyle || 'melee',
        attackEmoji: typeTemplate.attackEmoji || '👻',
        windupFrames: typeTemplate.windupFrames || 18,
        attackState: 'idle',
        attackWindupTimer: 0,
        attackInterval: typeTemplate.attackInterval || 90,
        isAppearing: true,
        appearanceTimer: 18 + Math.floor(Math.random() * 12),
        attackCooldown: Math.round(Math.random() * 24),
        attackRange: Math.max(24, Math.round((typeTemplate.ranged ? 96 : 30) * attackStartMultiplier)),
        isDying: false,
        deathTimer: 0,
        deathMaxTimer: 16,
        stunTimer: 0,
        flashTimer: 0,
        isInvisible: false,
        invisibleTimer: 0,
        invisibilityCooldown: 30 + Math.floor(Math.random() * 80),
        dashCooldown: 20 + Math.floor(Math.random() * 80),
        teleportCooldown: typeTemplate.teleportEnabled ? 40 + Math.floor(Math.random() * 80) : 9999,
        dodgeChance: typeTemplate.dodgeChance || 0.28,
        stunOnHit: !!typeTemplate.stunOnHit,
        knockbackOnHit: !!typeTemplate.knockbackOnHit,
        confusionOnAttackChance: typeTemplate.confusionOnAttackChance || 0,
        confusionOnAttackGuaranteed: !!typeTemplate.confusionOnAttackGuaranteed,
        lastHitTime: 0,
        vx: 0,
        vy: 0
    });
}

function getRandomMansionSpawnDelay() {
    return mansionSpawnIntervalMinFrames + Math.floor(Math.random() * (mansionSpawnIntervalMaxFrames - mansionSpawnIntervalMinFrames + 1));
}

function spawnMansionGhost() {
    if (mansionInteriorSpawnIndex >= mansionTotalGhosts) return false;
    if (mansionInteriorEnemies.length >= mansionMaxActiveGhosts) return false;

    const tierIndex = getMansionGhostTierToSpawn();
    if (tierIndex < 0) return false;

    const typeTemplate = getMansionGhostTypeForTier(tierIndex);
    const margin = 40;
    const x = margin + Math.random() * Math.max(0, viewportWidth - margin * 2 - typeTemplate.width);
    const y = margin + Math.random() * Math.max(0, viewportHeight - margin * 2 - typeTemplate.height);

    spawnMansionGhostFromTemplate(typeTemplate, x, y);
    mansionInteriorSpawnIndex += 1;
    if (tierIndex === 0) {
        mansionGhostCountTier1 -= 1;
    } else if (tierIndex === 1) {
        mansionGhostCountTier2 -= 1;
    } else if (tierIndex === 2) {
        mansionGhostCountTier3 -= 1;
    }
    return true;
}

function getInteriorSpawnCenter() {
    return {
        x: viewportWidth / 2,
        y: viewportHeight / 2
    };
}

function updateMansionInteriorEnemies() {
    if (mansionInteriorSpawnIndex < mansionTotalGhosts) {
        mansionInteriorSpawnTimer -= 1;
        if (mansionInteriorSpawnTimer <= 0) {
            mansionInteriorSpawnTimer = getRandomMansionSpawnDelay();
            if (!spawnMansionGhost()) {
                mansionInteriorSpawnTimer = 10;
            }
        }
    }

    mansionPeriodicWaveTimer -= 1;
    if (mansionPeriodicWaveTimer <= 0) {
        mansionPeriodicWaveTimer = mansionPeriodicWaveIntervalFrames;
        let spawns = 0;
        for (let i = 0; i < 3; i += 1) {
            if (spawnMansionGhost()) {
                spawns += 1;
            } else {
                break;
            }
        }
        if (spawns === 0 && mansionInteriorSpawnIndex < mansionTotalGhosts && mansionInteriorEnemies.length >= mansionMaxActiveGhosts) {
            mansionPeriodicWaveTimer = 10;
        }
    }

    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    for (let i = mansionInteriorEnemies.length - 1; i >= 0; i -= 1) {
        const enemy = mansionInteriorEnemies[i];
        if (enemy.isDying) {
            enemy.deathTimer -= 1;
            if (enemy.deathTimer <= 0) {
                mansionInteriorEnemies.splice(i, 1);
                mansionInteriorKills += 1;
                if (mansionInteriorEnemies.length === 0 && mansionInteriorSpawnIndex >= mansionTotalGhosts) {
                    mansionExitOpen = true;
                }
            }
            continue;
        }

        if (enemy.isAppearing) {
            enemy.appearanceTimer -= 1;
            if (enemy.appearanceTimer <= 0) {
                enemy.isAppearing = false;
            }
            continue;
        }

        if (enemy.flashTimer > 0) {
            enemy.flashTimer -= 1;
        }
        if (enemy.stunTimer > 0) {
            enemy.stunTimer -= 1;
            continue;
        }

        if (enemy.isInvisible) {
            enemy.invisibleTimer -= 1;
            if (enemy.invisibleTimer <= 0) {
                enemy.isInvisible = false;
                enemy.invisibilityCooldown = 60 + Math.floor(Math.random() * 80);
            }
        } else {
            enemy.invisibilityCooldown -= 1;
            if (enemy.invisibilityCooldown <= 0 && Math.random() < 0.24) {
                enemy.isInvisible = true;
                enemy.invisibleTimer = 18 + Math.floor(Math.random() * 18);
                enemy.invisibilityCooldown = 90 + Math.floor(Math.random() * 90);
            }
        }

        if (enemy.attackState === 'windup') {
            enemy.attackWindupTimer -= 1;
            if (enemy.attackWindupTimer <= 0) {
                enemy.attackState = 'idle';
                enemy.attackCooldown = enemy.attackInterval;
                executeCastleEnemyAttack(enemy, playerCenterX, playerCenterY);
            }
            enemy.x = Math.max(16, Math.min(enemy.x, viewportWidth - enemy.width - 16));
            enemy.y = Math.max(16, Math.min(enemy.y, viewportHeight - enemy.height - 16));
            continue;
        }

        if (enemy.attackCooldown > 0) {
            enemy.attackCooldown -= 1;
        }

        const ex = enemy.x + enemy.width / 2;
        const ey = enemy.y + enemy.height / 2;
        const dx = playerCenterX - ex;
        const dy = playerCenterY - ey;
        const dist = Math.hypot(dx, dy) || 1;
        const normalizedX = dx / dist;
        const normalizedY = dy / dist;

        const threat = projectiles.some(proj => proj.owner === 'player' && Math.hypot(proj.x - ex, proj.y - ey) < 80);
        if (threat && Math.random() < enemy.dodgeChance) {
            enemy.x -= normalizedX * enemy.speed * 1.5;
            enemy.y -= normalizedY * enemy.speed * 1.5;
        } else if (enemy.teleportCooldown <= 0 && enemy.teleportEnabled && Math.random() < 0.016) {
            enemy.teleportCooldown = 80 + Math.floor(Math.random() * 60);
            enemy.x = Math.max(24, Math.min(viewportWidth - enemy.width - 24, playerCenterX + (Math.random() - 0.5) * 220));
            enemy.y = Math.max(24, Math.min(viewportHeight - enemy.height - 24, playerCenterY + (Math.random() - 0.5) * 220));
        } else if (enemy.dashCooldown <= 0 && enemy.dashEnabled && Math.random() < 0.04) {
            enemy.dashCooldown = 40 + Math.floor(Math.random() * 32);
            enemy.x += normalizedX * 96;
            enemy.y += normalizedY * 96;
        } else {
            const attackThreshold = enemy.attackRange || (enemy.ranged ? 96 : 30);
            if (enemy.ranged) {
                if (dist > attackThreshold * 0.75) {
                    enemy.x += normalizedX * enemy.speed;
                    enemy.y += normalizedY * enemy.speed;
                } else if (enemy.attackCooldown <= 0) {
                    enemy.attackState = 'windup';
                    enemy.attackWindupTimer = enemy.windupFrames;
                    enemy.attackCooldown = 1;
                }
            } else {
                if (dist > attackThreshold) {
                    enemy.x += normalizedX * enemy.speed;
                    enemy.y += normalizedY * enemy.speed;
                } else if (enemy.attackCooldown <= 0) {
                    enemy.attackState = 'windup';
                    enemy.attackWindupTimer = enemy.windupFrames;
                    enemy.attackCooldown = 1;
                }
            }
        }

        if (enemy.dashCooldown > 0) {
            enemy.dashCooldown -= 1;
        }
        if (enemy.teleportCooldown > 0) {
            enemy.teleportCooldown -= 1;
        }

        enemy.x = Math.max(16, Math.min(enemy.x, viewportWidth - enemy.width - 16));
        enemy.y = Math.max(16, Math.min(enemy.y, viewportHeight - enemy.height - 16));
    }

    if (mansionInteriorEnemies.length === 0 && mansionInteriorSpawnIndex >= mansionTotalGhosts) {
        mansionExitOpen = true;
        if (player) {
            player.mansionGhostCopyUnlocked = true;
            ghostArmyUnlocked = true;
        }
    }
}

function drawMansionInteriorEnemies() {
    for (const enemy of mansionInteriorEnemies) {
        if (enemy.isAppearing) continue;
        const alpha = enemy.isDying ? Math.max(0, enemy.deathTimer / enemy.deathMaxTimer) : enemy.isInvisible ? 0.25 : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = enemy.color;
        ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
        ctx.strokeStyle = enemy.accent;
        ctx.lineWidth = enemy.isInvisible ? 1 : 2;
        ctx.strokeRect(enemy.x, enemy.y, enemy.width, enemy.height);
        ctx.fillStyle = '#2d2d2d';
        ctx.font = `${Math.max(16, Math.round(enemy.width * 0.18))}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(enemy.visuals[0] || '👻', enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
        if (enemy.attackState === 'windup') {
            const progress = enemy.attackWindupTimer / (enemy.windupFrames || 18);
            ctx.save();
            ctx.globalAlpha = Math.max(0.2, progress);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.width * 0.75 + (1 - progress) * 18, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        if (enemy.isDying) {
            ctx.globalAlpha = alpha;
        }
        ctx.restore();

        const healthFrac = Math.max(0, Math.min(1, enemy.health / enemy.maxHealth));
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(enemy.x, enemy.y - 8, enemy.width, 5);
        ctx.fillStyle = '#a8d7ff';
        ctx.fillRect(enemy.x, enemy.y - 8, enemy.width * healthFrac, 5);
        ctx.restore();
    }
}

function updateInteriorEnemies() {
    const construction = constructions.find(c => c.id === currentConstructionId);
    if (!construction) return;
    if (construction.type === 'mansion') {
        updateMansionInteriorEnemies();
    } else {
        updateCastleInteriorEnemies();
    }
}

function drawCurrentInteriorEnemies() {
    const construction = constructions.find(c => c.id === currentConstructionId);
    if (!construction) return;
    if (construction.type === 'mansion') {
        drawMansionInteriorEnemies();
    } else {
        drawCastleInteriorEnemies();
    }
}

function isCastleExitLocked() {
    const construction = constructions.find(c => c.id === currentConstructionId);
    return construction && construction.type === 'castle' && !castleExitOpen;
}

function spawnAfterImage(entry) {
    entry.life = entry.life || 12;
    entry.maxLife = entry.maxLife || entry.life;
    entry.baseAlpha = typeof entry.baseAlpha === 'number' ? entry.baseAlpha : 0.5;
    entry.alpha = entry.baseAlpha;
    afterImages.push(entry);
}

function updateAfterImages() {
    for (let i = afterImages.length - 1; i >= 0; i--) {
        const effect = afterImages[i];
        effect.life -= 1;
        if (effect.life <= 0) {
            afterImages.splice(i, 1);
            continue;
        }
        effect.alpha = Math.max(0, effect.baseAlpha * (effect.life / effect.maxLife));
    }
}

function spawnMonsterDeathEffect(monster) {
    const centerX = monster.x + monster.width / 2;
    const centerY = monster.y + monster.height / 2;
    const count = 18 + Math.floor(Math.random() * 12);

    screenShakeTimer = Math.max(screenShakeTimer, 18);

    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.4;
        const speed = 1.2 + Math.random() * 5.4;
        monsterDeathEffects.push({
            x: centerX,
            y: centerY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed * 0.75,
            size: 3 + Math.random() * 7,
            life: 14 + Math.floor(Math.random() * 12),
            maxLife: 14 + Math.floor(Math.random() * 12),
            alpha: 1,
            rotation: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.18,
            kind: 'spark'
        });
    }

    const glassCount = 28 + Math.floor(Math.random() * 10);
    for (let i = 0; i < glassCount; i++) {
        const angle = (Math.PI * 2 / glassCount) * i + (Math.random() - 0.5) * 0.35;
        const speed = 2.8 + Math.random() * 7.2;
        monsterDeathEffects.push({
            x: centerX,
            y: centerY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed * 0.9,
            size: 3 + Math.random() * 8,
            life: 22 + Math.floor(Math.random() * 16),
            maxLife: 22 + Math.floor(Math.random() * 16),
            alpha: 1,
            rotation: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.24,
            kind: 'glass',
            wobble: Math.random() * 0.12,
            tint: ['#8fd6ff', '#ffffff', '#bde8ff', '#7fb4ff'][Math.floor(Math.random() * 4)]
        });
    }
}

function updateMonsterDeathEffects() {
    for (let i = monsterDeathEffects.length - 1; i >= 0; i--) {
        const effect = monsterDeathEffects[i];
        effect.life--;
        if (effect.life <= 0) {
            monsterDeathEffects.splice(i, 1);
            continue;
        }
        effect.x += effect.vx;
        effect.y += effect.vy;
        effect.vy += effect.kind === 'glass' ? 0.1 : 0.07;
        effect.vx *= effect.kind === 'glass' ? 0.965 : 0.97;
        effect.alpha = effect.life / effect.maxLife;
        effect.rotation += effect.spin;
        if (effect.kind === 'glass') {
            effect.vx += Math.sin(effect.life * 0.2 + effect.wobble * 100) * 0.02;
        }
    }
}

function drawMonsterDeathEffects() {
    if (!monsterDeathEffects.length) return;

    ctx.save();
    for (const effect of monsterDeathEffects) {
        ctx.save();
        ctx.globalAlpha = Math.max(0.1, effect.alpha);
        ctx.translate(effect.x, effect.y);
        ctx.rotate(effect.rotation);
        if (effect.kind === 'glass') {
            ctx.fillStyle = effect.tint || '#ffffff';
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-effect.size / 2, -effect.size / 3);
            ctx.lineTo(effect.size / 4, -effect.size / 2);
            ctx.lineTo(effect.size / 2, effect.size / 4);
            ctx.lineTo(effect.size / 6, effect.size / 2);
            ctx.lineTo(-effect.size / 3, effect.size / 5);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-effect.size / 2, -effect.size / 2, effect.size, effect.size);
        }
        ctx.restore();
    }
    ctx.restore();
}

function drawPlayerAfterImage(effect) {
    const centerX = effect.x + effect.width / 2;
    const centerY = effect.y + effect.height / 2;
    ctx.save();
    ctx.translate(centerX, centerY);
    if (effect.variant === 'swordDash') {
        ctx.rotate(effect.angle || 0);
        const col = effect.color || '#ffd880';
        // sleek energy streak trailing behind the dash
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.quadraticCurveTo(-14, -3.5, -22, 0);
        ctx.quadraticCurveTo(-14, 3.5, 0, 7);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.lineTo(14, 0);
        ctx.lineTo(0, 3);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
        return;
    }
    ctx.scale(1.7, 1.7);
    ctx.fillStyle = '#55ff7f';
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(10, 0);
    ctx.lineTo(4, 10);
    ctx.lineTo(-4, 10);
    ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20, 184, 74, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
}

function drawMonsterAfterImage(effect) {
    const monsterEffect = Object.assign({
        attackEffectTimer: 0,
        portalWarningTimer: 0,
        portalTimer: 0,
        portalX: effect.x + effect.width / 2,
        portalY: effect.y + effect.height / 2,
        hitscanWarningTimer: 0,
        hitscanTargetX: null,
        hitscanTargetY: null,
        orbitalAngle: effect.orbitalAngle || 0,
        shakeTimer: 0
    }, effect);
    Monster.prototype.draw.call(monsterEffect, 'rgba(255,255,255,0.95)', 'rgba(255,255,255,0.95)', effect.alpha, true);
}

function drawProjectileAfterImage(effect) {
    ctx.save();
    const size = effect.size || 8;
    const color = effect.color || '#ffffff';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, size * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, size * 0.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function updateAccelParticles() {
    for (let i = accelParticles.length - 1; i >= 0; i--) {
        const p = accelParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life--;
        if (p.life <= 0) accelParticles.splice(i, 1);
    }
}

function drawAccelParticles() {
    if (!accelParticles.length) return;
    ctx.save();
    for (const p of accelParticles) {
        const a = p.life / p.maxLife;
        ctx.globalAlpha = Math.max(0, a * 0.8);
        ctx.strokeStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.lineWidth = p.width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.cos(p.angle) * p.len, p.y - Math.sin(p.angle) * p.len);
        ctx.stroke();
    }
    ctx.restore();
}

function drawAfterImages() {
    for (let effect of afterImages) {
        ctx.save();
        ctx.globalAlpha = effect.alpha;
        if (effect.kind === 'player') {
            drawPlayerAfterImage(effect);
        } else if (effect.kind === 'monster') {
            drawMonsterAfterImage(effect);
        } else if (effect.kind === 'projectile') {
            drawProjectileAfterImage(effect);
        }
        ctx.restore();
    }
}

function getRandomAmbientAnimalSpecies() {
    const species = [
        { name: 'vaca', bodyColor: '#8b7b58', accentColor: '#d8c4a0' },
        { name: 'raposa', bodyColor: '#d66b3d', accentColor: '#f4c79f' },
        { name: 'coelho', bodyColor: '#dde1e8', accentColor: '#ffffff' },
        { name: 'gambá', bodyColor: '#6a6f7d', accentColor: '#b8bac5' },
        { name: 'veado', bodyColor: '#a57a4e', accentColor: '#e0c5a2' }
    ];
    return species[Math.floor(Math.random() * species.length)];
}

function spawnAmbientAnimal() {
    if (ambientAnimals.length >= ambientAnimalMaxCount) return;

    const type = getRandomAmbientAnimalSpecies();
    const size = player.width;
    const x = upgradeZoneEndX + 20 + Math.random() * Math.max(0, (wildZoneEndX - upgradeZoneEndX - 40 - size));
    const y = 20 + Math.random() * Math.max(0, gameHeight - 40 - size);

    ambientAnimals.push({
        x,
        y,
        width: size,
        height: size,
        bodyColor: type.bodyColor,
        accentColor: type.accentColor,
        idleOffset: Math.random() * Math.PI * 2,
        driftX: (Math.random() - 0.5) * 0.12,
        driftY: (Math.random() - 0.5) * 0.12,
        appearTimer: 18 + Math.floor(Math.random() * 18)
    });
}

function updateAmbientAnimals() {
    if (ambientAnimalSpawnTimer <= 0) {
        spawnAmbientAnimal();
        ambientAnimalSpawnTimer = ambientAnimalSpawnIntervalMin + Math.floor(Math.random() * (ambientAnimalSpawnIntervalMax - ambientAnimalSpawnIntervalMin + 1));
    } else {
        ambientAnimalSpawnTimer -= 1;
    }

    for (let animal of ambientAnimals) {
        animal.idleOffset += 0.01;
        animal.x += animal.driftX;
        animal.y += animal.driftY;
        animal.x = Math.max(upgradeZoneEndX + 10, Math.min(animal.x, wildZoneEndX - animal.width - 10));
        animal.y = Math.max(10, Math.min(animal.y, gameHeight - animal.height - 10));

        if (Math.random() < 0.002) {
            animal.driftX = (Math.random() - 0.5) * 0.12;
            animal.driftY = (Math.random() - 0.5) * 0.12;
        }
        if (animal.appearTimer > 0) {
            animal.appearTimer -= 1;
        }
    }
}

function drawAmbientAnimals() {
    for (let animal of ambientAnimals) {
        const alpha = animal.appearTimer > 0 ? 0.12 + 0.88 * (1 - animal.appearTimer / 18) : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        const centerX = animal.x + animal.width / 2;
        const centerY = animal.y + animal.height / 2;
        const pulse = 1 + 0.05 * Math.sin(animal.idleOffset * 4);
        ctx.translate(centerX, centerY);
        ctx.scale(pulse, pulse);

        ctx.fillStyle = animal.bodyColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, animal.width * 0.55, animal.height * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = animal.accentColor;
        ctx.beginPath();
        ctx.ellipse(-animal.width * 0.18, -animal.height * 0.12, animal.width * 0.16, animal.height * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#333333';
        ctx.beginPath();
        ctx.arc(animal.width * 0.18, -animal.height * 0.06, animal.width * 0.08, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

function getRandomAmbientCritterStyle() {
    const species = [
        { bodyColor: '#7b9f78', accentColor: '#c7d8b8', eyeColor: '#2a2a2a' },
        { bodyColor: '#8d7fb5', accentColor: '#d7c7f0', eyeColor: '#271c34' },
        { bodyColor: '#d88f59', accentColor: '#f1d3b0', eyeColor: '#2e1f0f' },
        { bodyColor: '#6e8ca2', accentColor: '#c2d6e6', eyeColor: '#1e2a34' }
    ];
    return species[Math.floor(Math.random() * species.length)];
}

function spawnAmbientCritter() {
    if (ambientCritters.length >= ambientCritterMaxCount) return;

    const style = getRandomAmbientCritterStyle();
    const size = player.width * 1.35;
    const x = upgradeZoneEndX + 20 + Math.random() * Math.max(0, (wildZoneEndX - upgradeZoneEndX - size - 40));
    const y = 20 + Math.random() * Math.max(0, gameHeight - size - 40);

    ambientCritters.push({
        x,
        y,
        width: size,
        height: size,
        bodyColor: style.bodyColor,
        accentColor: style.accentColor,
        eyeColor: style.eyeColor,
        idleOffset: Math.random() * Math.PI * 2,
        driftX: (Math.random() - 0.5) * 0.14,
        driftY: (Math.random() - 0.5) * 0.14,
        appearTimer: 24
    });
}

function updateAmbientCritters() {
    if (ambientCritterSpawnTimer <= 0) {
        spawnAmbientCritter();
        ambientCritterSpawnTimer = ambientCritterSpawnIntervalMin + Math.floor(Math.random() * (ambientCritterSpawnIntervalMax - ambientCritterSpawnIntervalMin + 1));
    } else {
        ambientCritterSpawnTimer -= 1;
    }

    for (let critter of ambientCritters) {
        critter.idleOffset += 0.015;
        critter.x += critter.driftX;
        critter.y += critter.driftY;

        if (critter.x < upgradeZoneEndX + 12) critter.x = upgradeZoneEndX + 12;
        if (critter.x > wildZoneEndX - critter.width - 12) critter.x = wildZoneEndX - critter.width - 12;
        if (critter.y < 12) critter.y = 12;
        if (critter.y > gameHeight - critter.height - 12) critter.y = gameHeight - critter.height - 12;

        if (Math.random() < 0.004) {
            critter.driftX = (Math.random() - 0.5) * 0.14;
            critter.driftY = (Math.random() - 0.5) * 0.14;
        }
        if (critter.appearTimer > 0) {
            critter.appearTimer -= 1;
        }
    }
}

function drawAmbientCritters() {
    for (let critter of ambientCritters) {
        const alpha = critter.appearTimer > 0 ? 0.08 + 0.92 * (1 - critter.appearTimer / 24) : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        const centerX = critter.x + critter.width / 2;
        const centerY = critter.y + critter.height / 2;
        const pulse = 1 + 0.05 * Math.sin(critter.idleOffset * 4);
        ctx.translate(centerX, centerY);
        ctx.scale(pulse, pulse);

        ctx.fillStyle = critter.bodyColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, critter.width * 0.6, critter.height * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = critter.accentColor;
        ctx.beginPath();
        ctx.moveTo(-critter.width * 0.32, -critter.height * 0.28);
        ctx.lineTo(-critter.width * 0.16, -critter.height * 0.48);
        ctx.lineTo(0, -critter.height * 0.30);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(critter.width * 0.32, -critter.height * 0.28);
        ctx.lineTo(critter.width * 0.16, -critter.height * 0.48);
        ctx.lineTo(0, -critter.height * 0.30);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#222222';
        ctx.beginPath();
        ctx.arc(-critter.width * 0.14, -critter.height * 0.04, critter.width * 0.08, 0, Math.PI * 2);
        ctx.arc(critter.width * 0.14, -critter.height * 0.04, critter.width * 0.08, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1d1d1d';
        ctx.beginPath();
        ctx.arc(0, critter.height * 0.08, critter.width * 0.08, 0, Math.PI);
        ctx.fill();

        ctx.restore();
    }
}

function generateSlowdownInsects() {
    slowdownInsectSprites = Array.from({ length: 80 }, () => {
        const edge = Math.floor(Math.random() * 4);
        let x, y;
        const edgeOffset = 50;
        if (edge === 0) {
            x = Math.random() * gameWidth;
            y = edgeOffset + Math.random() * edgeOffset;
        } else if (edge === 1) {
            x = Math.random() * gameWidth;
            y = gameHeight - edgeOffset - Math.random() * edgeOffset;
        } else if (edge === 2) {
            x = edgeOffset + Math.random() * edgeOffset;
            y = Math.random() * gameHeight;
        } else {
            x = gameWidth - edgeOffset - Math.random() * edgeOffset;
            y = Math.random() * gameHeight;
        }
        return {
            x,
            y,
            size: Math.random() * 18 + 26,
            rotation: Math.random() * Math.PI * 2,
            phase: Math.random() * Math.PI * 2
        };
    });
}

function drawSlowdownInsects() {
    if (timeScale >= 1 || slowdownInsectSprites.length === 0) return;

    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#ad5cff';
    ctx.strokeStyle = 'rgba(170, 90, 255, 0.12)';
    ctx.lineWidth = 1;

    const time = performance.now() * 0.002;
    for (const insect of slowdownInsectSprites) {
        ctx.save();
        ctx.translate(insect.x, insect.y);
        ctx.rotate(insect.rotation + Math.sin(time + insect.phase) * 0.14);

        const bodyW = insect.size * 0.5;
        const bodyH = insect.size * 0.24;
        ctx.beginPath();
        ctx.ellipse(0, 0, bodyW, bodyH, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(-bodyW * 0.55, 0, bodyW * 0.4, bodyH * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(bodyW * 0.55, 0, bodyW * 0.22, bodyH * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();

        const wingW = insect.size * 0.42;
        const wingH = insect.size * 0.18;
        ctx.beginPath();
        ctx.ellipse(-bodyW * 0.1, -wingH * 1.2, wingW, wingH, -0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(-bodyW * 0.1, wingH * 1.2, wingW, wingH, 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }
    ctx.restore();
}

const selectionBackgroundParticles = Array.from({ length: 24 }, () => ({
    x: Math.random() * (canvas.width || 800),
    y: Math.random() * (canvas.height || 600),
    size: Math.random() * 8 + 4,
    speed: Math.random() * 0.2 + 0.18,
    hue: 190 + Math.random() * 40,
    alpha: 0.03 + Math.random() * 0.06
}));
const baseMonsterTypes = ['shooter', 'swarm', 'caster', 'avianightmare', 'smart'];

function getAllowedMonsterTypes() {
    let allowed = [...baseMonsterTypes];
    if (phase <= 2) {
        allowed.push('simple');
    }
    allowed.push('croc');
    const allOtherTypesKilled = baseMonsterTypes.every(type => monsterTypeKills[type]);
    if (allOtherTypesKilled) {
        allowed.push('tank');
    }
    if (phase < 6) {
        allowed = allowed.filter(type => type !== 'avianightmare');
    }
    if (phase < 3) {
        allowed = allowed.filter(type => type !== 'smart');
    }
    if (phase < 4) {
        allowed = allowed.filter(type => type !== 'swarm');
    }
    if (phase < 8) {
        allowed = allowed.filter(type => type !== 'tank');
    }
    return allowed;
}

function chooseMonsterType() {
    // Simple é sempre o primeiro inimigo
    if (!simpleMonsterSpawnedInEarlyPhases && defeatedTotal === 0) {
        simpleMonsterSpawnedInEarlyPhases = true;
        return 'simple';
    }
    if (phase <= 2 && !simpleMonsterSpawnedInEarlyPhases) {
        const remainingEarlyEncounters = phase === 1 ? 4 - monstersDefeated : 2 - monstersDefeated;
        if (remainingEarlyEncounters <= 1) {
            simpleMonsterSpawnedInEarlyPhases = true;
            return 'simple';
        }
    }
    let allowedTypes = getAllowedMonsterTypes();
    if (allowedTypes.length === 0) return 'shooter';

    const excludedTypes = new Set([...phaseMonsterTypes, ...prevPhaseMonsterTypes]);
    let remainingTypes = allowedTypes.filter(type => !excludedTypes.has(type));
    if (remainingTypes.length === 0) {
        remainingTypes = allowedTypes;
    }

    let chosen;
    if (lastMonsterType && remainingTypes.includes(lastMonsterType) && remainingTypes.length > 1) {
        const sameTypeWeight = 0.2;
        let totalWeight = 0;
        const weights = remainingTypes.map(type => {
            const weight = type === lastMonsterType ? sameTypeWeight : 1;
            totalWeight += weight;
            return weight;
        });

        let roll = Math.random() * totalWeight;
        for (let i = 0; i < remainingTypes.length; i++) {
            roll -= weights[i];
            if (roll <= 0) {
                chosen = remainingTypes[i];
                break;
            }
        }
    }

    if (!chosen) {
        chosen = remainingTypes[Math.floor(Math.random() * remainingTypes.length)];
    }

    if (chosen === 'simple') {
        simpleMonsterSpawnedInEarlyPhases = true;
    }
    return chosen;
}

function getPredictedPlayerPosition(frames = 24) {
    let moveX = 0;
    let moveY = 0;
    if (keys['d'] || keys['arrowright']) moveX += 1;
    if (keys['a'] || keys['arrowleft']) moveX -= 1;
    if (keys['s'] || keys['arrowdown']) moveY += 1;
    if (keys['w'] || keys['arrowup']) moveY -= 1;

    const magnitude = Math.sqrt(moveX * moveX + moveY * moveY);
    if (magnitude > 0) {
        moveX /= magnitude;
        moveY /= magnitude;
    }

    const predictedX = player.x + player.width / 2 + moveX * player.speed * frames;
    const predictedY = player.y + player.height / 2 + moveY * player.speed * frames;

    return { x: predictedX, y: predictedY };
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
}

function spawnMonsterHitscan(startX, startY, targetX, targetY, damage, color, thickness = 42, duration = 60) {
    const beam = {
        x: startX,
        y: startY,
        targetX,
        targetY,
        damage,
        color,
        thickness,
        lifetime: duration,
        maxLifetime: duration,
        alpha: 1,
        hitChecked: false
    };

    monsterHitscans.push(beam);
    return beam;
}

const weapons = [
    { name: 'Revolver 🔫', type: 'gun', color: '#ffff00', cooldown: 12, range: 50, damage: 2, speed: 10 },
    { name: 'Arco 🏹', type: 'bow', color: '#00ff00', cooldown: 110, range: 37.5, damage: 18, speed: 15 },
    { name: 'Varinha 🔮', type: 'staff', color: '#ff00ff', cooldown: 35, range: 25, damage: 22, speed: 0.75 },
    { name: 'Espada ⚔️', type: 'sword', color: '#ffaa00', cooldown: 0, range: 90, damage: 14 },
    { name: 'Granada & Bomba 💣', type: 'grenade', color: '#ff8c1a', cooldown: 26, range: 80, damage: 10 },
    { name: 'Lança Tornado 🌪️', type: 'cone', color: '#83bfd3', cooldown: 35, range: 80, damage: 1, coneAngle: Math.PI / 3 }
];

const upgradeOptions = [
    { name: 'Vida Máxima +20', effect: 'maxHealth', value: 20, desc: 'Aumenta sua vida máxima em 20. Agora você pode absorver mais dano antes de ser derrotado.', exclusive: true },
    { name: 'Dano +1', effect: 'baseDamage', value: 1, desc: 'Aumenta seu dano base em 1. Seus ataques físicos e de arma causam mais dano.' },
    { name: 'Velocidade +1', effect: 'speed', value: 1, desc: 'Aumenta sua velocidade de movimento em 1. Você se desloca mais rápido pelo campo de batalha.' },
    { name: 'Regeneração +1', effect: 'healthRegen', value: 1, desc: 'Restaura 1 ponto de vida por segundo. Recupera saúde automaticamente entre combates.' },
    { name: 'Proteção +2', effect: 'damageReduction', value: 2, desc: 'Reduz o dano recebido em 2. Cada ataque inimigo causa menos ferimentos.' },
    { name: 'Recarga Rápida -2', effect: 'cooldownReduction', value: 2, desc: 'Reduz o cooldown dos seus ataques em 2. Você pode atacar com mais frequência.' },
    { name: 'Força de Arma +3', effect: 'weaponDamage', value: 3, desc: 'Aumenta o dano extra das armas em 3. Todas as armas causam mais dano adicional.' },
    { name: 'Crítico +8%', effect: 'critChance', value: 8, desc: 'Aumenta sua chance de crítico em 8%. Seus ataques têm mais chance de causar dano elevado.', exclusive: true },
    { name: 'Dano Crítico +20%', effect: 'critDamage', value: 0.2, desc: 'Aumenta o multiplicador de críticos em 20%. Quando acerta crítico, você causa ainda mais dano.', exclusive: true },
    { name: 'Projéteis +0.5', effect: 'extraProjectiles', value: 0.5, desc: 'Adiciona projéteis extras aos ataques à distância. Mais tiros significam maior cobertura.' },
    { name: 'Tiro em Cone +0.5', effect: 'spreadProjectiles', value: 0.5, desc: 'Aumenta a largura de dispersão dos seus projéteis. Cobre uma área maior com cada ataque.' },
    { name: 'Tiro Tardio +1', effect: 'lateShots', value: 1, desc: 'Adiciona um projétil tardio após cada ataque. O disparo extra aparece depois do ataque inicial.' },
    { name: 'Ataque Triplo', effect: 'spinAttack', value: 1, desc: 'Ativa o ataque triplo automático no começo do combate. Níveis extras adicionam projéteis adicionais.', exclusive: true },
    { name: 'Ataque Rápido +10%', effect: 'attackSpeed', value: 0.1, desc: 'Aumenta a velocidade de ataque em 10%. Seus cooldowns efetivos ficam menores.' },
    { name: 'Tiro Veloz +2', effect: 'projectileSpeedBonus', value: 2, desc: 'Aumenta a velocidade dos projéteis em 2. Seus tiros chegam mais rápido ao alvo.' }
];

// Chance de obter uma versão EXTREMA de um upgrade (3 níveis aplicados)
const EXTREME_CHANCE = 0.05;

const weaponUpgradeOptions = {
    gun: [
        { name: 'Câmara Extra +4', effect: 'gunAmmoMax', value: 4, desc: 'Aumenta a capacidade de munição do revólver. Mais tiros antes de precisar recarregar.' },
        { name: 'Rajada de Choque +1', effect: 'gunBurstFire', value: 1, desc: 'Cada disparo do revólver também solta um projétil adicional em ângulo levemente variado, transformando o tiro em rajada.' },
        { name: 'Munição Explosiva', effect: 'gunExplosiveAmmo', value: 1, desc: 'Os projéteis detonam ao atingir o inimigo, causando dano extra em uma pequena área.' }
    ],
    grenade: [
        { name: 'Atordoar Bombas +0.5s', effect: 'bombStunPerHitSeconds', value: 0.5, desc: 'A bomba padrão atordoa o alvo por 0.5s por nível ao acertar.' },
        { name: 'Fragmentos Confundem +0.05s', effect: 'bombFragmentConfusionSeconds', value: 0.05, desc: 'Cada fragmento causa confusão por 0.1s no primeiro nível e 0.05s a mais por nível seguinte.' },
        { name: 'Fragmentos +2', effect: 'bombFragmentCountBonus', value: 2, desc: 'Adiciona 2 fragmentos extras por explosão de bomba/granada.' },
        { name: 'Chama Persistente +1', effect: 'bombBurnDamagePerSecond', value: 1, desc: 'A zona de fogo causa 1 de dano por segundo por nível e dura 3s + 0.5s por nível.' },
        { name: 'Fragmentos Velozes +0.25', effect: 'bombFragmentSpeedBonus', value: 0.25, desc: 'Aumenta a velocidade dos fragmentos e concede 1 ponto de perfuração extra por nível.' },
        { name: 'Velocidade de Arremesso +0.2', effect: 'bombThrowSpeedBonus', value: 0.2, desc: 'Aumenta a velocidade das bombas e granadas, fazendo-as chegar mais rápido.' },
        { name: 'Fogo Mais Duradouro +0.5s', effect: 'bombFireZoneDurationBonusSeconds', value: 0.5, desc: 'Aumenta a duração do círculo de fogo em 0.5s por nível.' },
        { name: 'Passo de Fogo +15%', effect: 'bombFireZoneMoveSpeedBonus', value: 0.15, desc: 'Enquanto estiver dentro da zona de fogo, você se move 15% mais rápido.' },
        { name: 'Corrida de Reposição +20%', effect: 'bombCooldownMoveSpeedBonus', value: 0.2, desc: 'Enquanto a bomba estiver em cooldown, você se movimenta 20% mais rápido.' },
        { name: 'Raio de Fogo +12.5%', effect: 'bombFireZoneRadiusBonus', value: 0.125, desc: 'Aumenta o raio do círculo de fogo da bomba em 12.5% por nível.' },
        { name: 'Estilhaços +20%', effect: 'bombFragmentSizeBonus', value: 0.2, desc: 'Aumenta o tamanho dos fragmentos em 20% por nível.' }
    ],
    bow: [
        { name: 'Bota Leve +1', effect: 'bowDashMax', value: 1, desc: 'Concede 1 carga extra de dash ao usar o arco. Permite reposicionamento adicional durante o combate.' },
        { name: 'Ricochete de Flecha +1', effect: 'bowRicochet', value: 1, desc: 'Adiciona projéteis auxiliares ao disparo do arco que podem destruir tiros inimigos e seguir alvos próximos.' },
        { name: 'Postura Firme +15%', effect: 'bowReadyStance', value: 15, desc: 'Quando parado, suas flechas ganham mais chance de crítico e causam mais dano em viagens precisas.' }
    ],
    staff: [
        { name: 'Energia Arcanista +2', effect: 'staffChargeMax', value: 2, desc: 'Aumenta a carga máxima para o burst de orbes, permitindo cargas mais poderosas.' },
        { name: 'Rajada Extra +1', effect: 'staffBurstCount', value: 1, desc: 'Aumenta o número de orbes liberadas no burst, transformando o ataque em uma tempestade mágica.' },
        { name: 'Ressonância Arcana', effect: 'staffHomingBurst', value: 1, desc: 'As orbes do burst ganham força e rastreiam ferozmente o alvo, tornando o ataque mais difícil de evitar.' }
    ],
    sword: [
        { name: 'Investida Cortante +6', effect: 'attackMove', value: 6, desc: 'A cada nível, o dash da espada dispara um dash normal a mais mirando no monstro mais próximo. Com a melhoria ativa, o dash acontece sozinho ao encostar a espada em um monstro.' },
        { name: 'Parry Veloz -40', effect: 'parryMax', value: 40, desc: 'Reduz o cooldown do parry, permitindo contra-ataques muito mais frequentes.' },
        { name: 'Parry Confusão +12.5%', effect: 'parryConfusionChance', value: 12.5, desc: 'Parrys bem-sucedidos têm chance de confundir o inimigo, fazendo-o atacar na direção errada.' },
        { name: 'Vínculo Vital +4%', effect: 'parryHealOverTime', value: 1, desc: 'Ao causar um parry, cura 4% da vida máxima por segundo pelos próximos 3 segundos. Cada nível adiciona +4% de cura por segundo.' }
    ],
    cone: [
        { name: 'Fúria do Tornado +1', effect: 'tornadoCount', value: 1, desc: 'Adiciona uma lança extra à rajada do tornado, aumentando o volume de projéteis.' },
        { name: 'Tempo de Tornado +10', effect: 'tornadoDuration', value: 10, desc: 'Aumenta a duração do ataque tornado, prolongando o caos no campo de batalha.' },
        { name: 'Cone Mais Largo +0.1', effect: 'coneAngleBonus', value: 0.1, desc: 'Aumenta a abertura do cone tornado, permitindo cobrir uma área muito maior.' }
    ]
};

// ===== EVENT LISTENERS =====
document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    const transitionLocked = isMonsterTransitionActive();

    if (e.key.toLowerCase() === 'o' && !isSelectingWeapon && !gameOver) {
        e.preventDefault();
        toggleDebugMenu();
        return;
    }

    if (isDebugMenuOpen) {
        const choices = getDebugMenuChoices();
        if (e.key === 'Tab') {
            e.preventDefault();
            debugMenuTabIndex = (debugMenuTabIndex + 1) % debugMenuTabs.length;
            selectedDebugUpgradeIndex = 0;
            selectedDebugActionIndex = 0;
            return;
        }
        if (choices.length > 0) {
            const selectedIndexKey = debugMenuTabs[debugMenuTabIndex].id === 'invocar' ? 'selectedDebugActionIndex' : 'selectedDebugUpgradeIndex';
            if (e.key === 'ArrowUp' || e.key === 'w') {
                e.preventDefault();
                if (debugMenuTabs[debugMenuTabIndex].id === 'invocar') {
                    selectedDebugActionIndex = (selectedDebugActionIndex - 1 + choices.length) % choices.length;
                } else {
                    selectedDebugUpgradeIndex = (selectedDebugUpgradeIndex - 1 + choices.length) % choices.length;
                }
            } else if (e.key === 'ArrowDown' || e.key === 's') {
                e.preventDefault();
                if (debugMenuTabs[debugMenuTabIndex].id === 'invocar') {
                    selectedDebugActionIndex = (selectedDebugActionIndex + 1) % choices.length;
                } else {
                    selectedDebugUpgradeIndex = (selectedDebugUpgradeIndex + 1) % choices.length;
                }
            } else if (e.key === 'ArrowLeft' || e.key === 'a') {
                e.preventDefault();
                debugMenuQuantity = Math.max(1, debugMenuQuantity - 1);
            } else if (e.key === 'ArrowRight' || e.key === 'd') {
                e.preventDefault();
                debugMenuQuantity = Math.min(99, debugMenuQuantity + 1);
            } else if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                applyDebugUpgrade();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                isDebugMenuOpen = false;
            }
        }
        return;
    }
    
    if (isSelectingWeapon) {
        if (e.key === 'ArrowLeft' || e.key === 'a') {
            selectedWeaponIndex = (selectedWeaponIndex - 1 + weapons.length) % weapons.length;
        }
        if (e.key === 'ArrowRight' || e.key === 'd') {
            selectedWeaponIndex = (selectedWeaponIndex + 1) % weapons.length;
        }
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            selectWeapon(selectedWeaponIndex);
        }
    } else if (isUpgrading) {
        const layoutMap = [
            { col: 0, row: 0 },
            { col: 0, row: 1 },
            { col: 1, row: 0 },
            { col: 1, row: 1 },
            { col: 2, row: 0 },
            { col: 2, row: 1 }
        ];
        const current = layoutMap[selectedUpgradeIndex] || { col: 0, row: 0 };
        let nextIndex = selectedUpgradeIndex;

        if (e.key === 'ArrowLeft' || e.key === 'a') {
            const targetCol = Math.max(0, current.col - 1);
            nextIndex = layoutMap.findIndex(pos => pos.col === targetCol && pos.row === current.row);
        } else if (e.key === 'ArrowRight' || e.key === 'd') {
            const targetCol = Math.min(2, current.col + 1);
            nextIndex = layoutMap.findIndex(pos => pos.col === targetCol && pos.row === current.row);
        } else if (e.key === 'ArrowUp' || e.key === 'w') {
            nextIndex = layoutMap.findIndex(pos => pos.col === current.col && pos.row === 0);
        } else if (e.key === 'ArrowDown' || e.key === 's') {
            nextIndex = layoutMap.findIndex(pos => pos.col === current.col && pos.row === 1);
        }

        if (nextIndex >= 0 && nextIndex < upgradeChoices.length) {
            selectedUpgradeIndex = nextIndex;
        }

        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            applyUpgrade(selectedUpgradeIndex);
        }
    } else if (transitionLocked) {
        // Ignorar ações de movimento e ataque durante a animação de morte/upgrade.
    } else {
        if (e.key === 'i') {
            e.preventDefault();
            spawnWeaponPickupsAroundPlayer();
        } else if (e.key === 'c') {
            e.preventDefault();
            createConstructionEntrancePortalsAroundPlayer();
        } else if (e.key === ' ') {
            e.preventDefault();
            if (player && player.weapon && player.weapon.type === 'sword') {
                player.performSwordDash();
            } else {
                attemptAttack('space');
            }
        }
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener('click', (e) => {
    if (isDebugMenuOpen) {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        const choices = debugMenuUpgradeChoices.length ? debugMenuUpgradeChoices : getDebugUpgradeChoices();
        const geom = debugMenuListGeom;
        const listX = geom.x;
        const listY = geom.y;
        const listWidth = geom.width;
        const itemHeight = geom.itemHeight;
        const gap = geom.gap;
        const visibleCount = geom.visibleCount;
        const startIndex = geom.startIndex;
        for (let i = 0; i < visibleCount; i++) {
            const index = startIndex + i;
            const itemY = listY + i * (itemHeight + gap);
            if (clickX >= listX && clickX <= listX + listWidth && clickY >= itemY && clickY <= itemY + itemHeight) {
                selectedDebugUpgradeIndex = index;
                applyDebugUpgrade();
                break;
            }
        }
        return;
    } else if (isSelectingWeapon) {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        const layout = getWeaponSelectionLayout();
        const { buttonWidth, buttonHeight, spacing, startX, startY } = layout;
        
        for (let i = 0; i < weapons.length; i++) {
            const bx = startX + i * (buttonWidth + spacing);
            const by = startY;
            if (clickX >= bx && clickX <= bx + buttonWidth && clickY >= by && clickY <= by + buttonHeight) {
                selectWeapon(i);
                break;
            }
        }
    } else if (isUpgrading) {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const screenWidth = canvas.width;
        const screenHeight = canvas.height;
        const buttonWidth = 220;
        const buttonHeight = 86;
        const verticalSpacing = 20;
        const leftX = Math.max(72, screenWidth * 0.12);
        const centerX = (screenWidth - buttonWidth) / 2;
        const rightX = Math.min(screenWidth - buttonWidth - 72, screenWidth * 0.88 - buttonWidth);
        const topY = screenHeight / 2 - buttonHeight - verticalSpacing / 2;
        const bottomY = screenHeight / 2 + verticalSpacing / 2;
        const positions = [
            { x: leftX, y: topY },
            { x: leftX, y: bottomY },
            { x: centerX, y: topY },
            { x: centerX, y: bottomY },
            { x: rightX, y: topY },
            { x: rightX, y: bottomY }
        ];

        for (let i = 0; i < upgradeChoices.length; i++) {
            const { x: bx, y: by } = positions[i] || { x: 0, y: 0 };
            if (clickX >= bx && clickX <= bx + buttonWidth && clickY >= by && clickY <= by + buttonHeight) {
                applyUpgrade(i);
                break;
            }
        }
    } else if (isMonsterTransitionActive()) {
        // Ignorar cliques de ataque durante a animação de morte/upgrade.
    } else {
        if (player && player.weapon && player.weapon.type === 'sword') {
            player.performSwordDash();
        } else {
            attemptAttack('mouse');
        }
    }
});

function applyCooldownBarBaseBackground() {
    try {
        const bar = document.getElementById('cooldownBar');
        if (!bar) return;
        bar.style.backgroundImage = 'linear-gradient(to right, rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(to right, rgba(120, 220, 255, 0.75), rgba(120, 155, 255, 0.35))';
        bar.style.backgroundSize = 'calc(100% / 13) 100%';
        bar.style.backgroundRepeat = 'repeat-x';
    } catch (e) {}
}

function renderGunAmmoCooldownBar() {
    try {
        const fill = document.getElementById('cooldownBarFill');
        if (!fill) return;

        applyCooldownBarBaseBackground();

        if (!player) {
            fill.style.width = '0%';
            return;
        }

        const maxAmmo = Math.max(1, Number(player.gunMaxAmmo || player.gunAmmo || 1) || 1);
        const remainingAmmo = Math.max(0, Math.min(maxAmmo, Number(player.gunAmmo || 0) || 0));
        const segmentCount = Math.max(1, maxAmmo);
        const segmentWidth = 100 / segmentCount;
        const segments = [];
        const activeColor = 'rgba(255, 214, 102, 0.96)';
        const emptyColor = 'rgba(0, 0, 0, 0)';

        for (let index = 0; index < segmentCount; index++) {
            const start = index * segmentWidth;
            const end = (index + 1) * segmentWidth;
            const color = index < remainingAmmo ? activeColor : emptyColor;
            segments.push(`${color} ${start.toFixed(3)}%`, `${color} ${end.toFixed(3)}%`);
        }

        fill.style.width = '100%';
        fill.style.backgroundImage = `linear-gradient(90deg, ${segments.join(', ')})`;
        fill.style.backgroundSize = '100% 100%';
        fill.style.backgroundRepeat = 'no-repeat';
        fill.style.backgroundColor = 'transparent';
        fill.style.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,0.04)';
    } catch (e) {}
}

function selectWeapon(index) {
    player.weapon = weapons[index];
    if (player.weapon.type === 'gun') {
        player.gunAmmo = player.gunAmmo;
        player.gunReloadCooldown = 0;
        player.gunReloadHitCount = 0;
    }
    if (player.weapon.type === 'bow') {
        player.bowDashCharges = player.bowDashMaxCharges;
    }
    isSelectingWeapon = false;
    gameStarted = true;
    roundStartTimer = 60;
    initializeMapDecor();
}

function registerPlayerHit() {
    if (player.castleBoneUnlocked) {
        player.castleBoneHitCounter = (player.castleBoneHitCounter || 0) + 1;
        if (player.castleBoneHitCounter >= 4) {
            player.castleBoneHitCounter = 0;
            spawnCastleBoneOrbiters();
        }
    }

    if (currentMonster && currentMonster.type === 'croc') {
        currentMonster.hitsTakenThisLife = (currentMonster.hitsTakenThisLife || 0) + 1;
        currentMonster.lastHitFrame = gameFrameCount;
        if (currentMonster.hitsTakenThisLife >= 3 && currentMonster.stunTimer <= 0 && currentMonster.roarTimer <= 0 && currentMonster.sprintEscapeTimer <= 0) {
            currentMonster.stunTimer = Math.round(0.3 * 60);
            currentMonster.confusedTimer = Math.round(1 * 60);
            currentMonster.confusedLevel = Math.max(currentMonster.confusedLevel || 0, 3);
            currentMonster.postConfusionRoar = true;
            currentMonster.hitsTakenThisLife = 0;
        }
    }

    if (player.autoAttackEnabled) return;
    player.currentMonsterHitCount++;
    if (player.currentMonsterHitCount >= 3) {
        player.autoAttackEnabled = true;
        player.currentMonsterHitCount = 3;
    }
    if (player.parryChargePerHit > 0 && player.parryCooldown === 0) {
        player.parryChargeAccumulator += player.parryChargePerHit;
    }
}

function updateCooldownBar() {
    try {
        const fill = document.getElementById('cooldownBarFill');
        if (!fill) return;

        applyCooldownBarBaseBackground();

        if (player.weapon && player.weapon.type === 'staff') {
            const ratio = Math.max(0, Math.min(1, (player.staffCharge || 0) / (player.staffChargeMax || 15)));
            fill.style.width = `${ratio * 100}%`;
            return;
        }

        const isTornadoWeapon = player.weapon && player.weapon.type === 'cone' && player.weapon.name && player.weapon.name.toLowerCase().includes('lança tornado');
        const useTornadoCharge = isTornadoWeapon || (player.tornadoCharge || 0) > 0;
        if (useTornadoCharge) {
            const ratio = Math.max(0, Math.min(1, (player.tornadoCharge || 0) / (player.tornadoChargeMax || 20)));
            fill.style.width = `${ratio * 100}%`;
            return;
        }

        if (player.weapon && player.weapon.type === 'gun') {
            renderGunAmmoCooldownBar();
            return;
        }

        fill.style.width = `0%`;
    } catch (e) {}
}

function applyAreaDamageAt(x, y, radius, damage, options = {}) {
    if (!player) return 0;

    const onHit = typeof options.onHit === 'function' ? options.onHit : null;
    let applied = 0;
    if (playerInsideConstruction) {
        for (const enemy of castleInteriorEnemies) {
            if (!enemy || enemy.isDying || enemy.health <= 0) continue;
            const ex = enemy.x + enemy.width / 2;
            const ey = enemy.y + enemy.height / 2;
            if (Math.hypot(ex - x, ey - y) <= radius + Math.max(enemy.width, enemy.height) * 0.35) {
                applyDamageToInteriorEnemy(enemy, damage);
                if (onHit) onHit(enemy, { x, y, radius, damage });
                applied += 1;
            }
        }
        return applied;
    }

    if (currentMonster && currentMonster.health > 0 && !currentMonster.isDying) {
        const mx = currentMonster.x + currentMonster.width / 2;
        const my = currentMonster.y + currentMonster.height / 2;
        if (Math.hypot(mx - x, my - y) <= radius + Math.max(currentMonster.width, currentMonster.height) * 0.35) {
            currentMonster.takeDamage(damage);
            if (onHit) onHit(currentMonster, { x, y, radius, damage });
            applied += 1;
        }
    }
    return applied;
}

function applyBombHitStun(target) {
    if (!target || !player) return;
    const stunSeconds = Math.max(0, player.bombStunPerHitSeconds || 0);
    if (stunSeconds <= 0 || typeof target.stunTimer !== 'number') return;
    target.stunTimer = Math.max(target.stunTimer || 0, Math.round(stunSeconds * 60));
    if (stunSeconds > 0) {
        spawnBombStunEffect(target.x + target.width / 2, target.y + target.height / 2);
    }
}

function applyBurnToTarget(target, damagePerSecond, durationSeconds) {
    if (!target || !damagePerSecond || damagePerSecond <= 0) return;
    const durationFrames = Math.max(1, Math.round((durationSeconds || 3) * 60));
    const isFirstBurn = !target.burnTimer || target.burnTimer <= 0;
    target.burnTimer = Math.max(target.burnTimer || 0, durationFrames);
    target.burnDamagePerSecond = Math.max(target.burnDamagePerSecond || 0, damagePerSecond);
    target.burnTickTimer = Math.min(target.burnTickTimer || 60, 60);
    if (isFirstBurn && damagePerSecond > 0) {
        spawnBombBurnEffect(target.x + target.width / 2, target.y + target.height / 2);
    }
}

function applyBurnToTargetsInArea(x, y, radius, damagePerSecond, durationSeconds) {
    if (!damagePerSecond || damagePerSecond <= 0) return;

    if (playerInsideConstruction) {
        for (const enemy of castleInteriorEnemies) {
            if (!enemy || enemy.isDying || enemy.health <= 0) continue;
            const ex = enemy.x + enemy.width / 2;
            const ey = enemy.y + enemy.height / 2;
            if (Math.hypot(ex - x, ey - y) <= radius + Math.max(enemy.width, enemy.height) * 0.35) {
                applyBurnToTarget(enemy, damagePerSecond, durationSeconds);
            }
        }
        return;
    }

    if (currentMonster && currentMonster.health > 0 && !currentMonster.isDying) {
        const mx = currentMonster.x + currentMonster.width / 2;
        const my = currentMonster.y + currentMonster.height / 2;
        if (Math.hypot(mx - x, my - y) <= radius + Math.max(currentMonster.width, currentMonster.height) * 0.35) {
            applyBurnToTarget(currentMonster, damagePerSecond, durationSeconds);
        }
    }
}

function getBombFireZoneDurationFrames() {
    const baseSeconds = Math.max(3, player?.bombBurnDurationSeconds || 3);
    const extraSeconds = Math.max(0, player?.bombFireZoneDurationBonusSeconds || 0);
    return Math.round((baseSeconds + extraSeconds) * 60);
}

function getBombFireZoneRadiusMultiplier() {
    return 1 + Math.max(0, player?.bombFireZoneRadiusBonus || 0);
}

function spawnFireZone(x, y, options = {}) {
    const durationFrames = options.durationFrames || getBombFireZoneDurationFrames();
    const radiusMultiplier = options.radiusMultiplier || getBombFireZoneRadiusMultiplier();
    const zone = {
        x,
        y,
        damage: 40,
        tickDamage: 5,
        burnDamage: options.burnDamage ?? (player?.bombBurnDamagePerSecond || 0),
        burnDurationSeconds: options.burnDurationSeconds ?? (player?.bombBurnDurationSeconds || 3),
        maxRadius: 72 * radiusMultiplier,
        radius: 72 * radiusMultiplier,
        duration: durationFrames,
        life: durationFrames,
        tickTimer: 60,
        color: '#ff8c1a'
    };
    fireZones.push(zone);
    applyAreaDamageAt(x, y, zone.radius, zone.damage, {
        onHit: (target) => {
            if (options.applyStun) {
                applyBombHitStun(target);
                spawnBombStunEffect(target.x + target.width / 2, target.y + target.height / 2);
            }
        }
    });
    spawnEvaporationEffect(x, y, '#ff9e3c', 24, 18);
    spawnBombFireZoneEffect(x, y, radiusMultiplier);
    return zone;
}

function spawnSmokeBurst(x, y, count = 18) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.random() * Math.PI * 2);
        const speed = Math.random() * 0.8 + 0.3;
        const gray = 70 + Math.floor(Math.random() * 30);
        evaporationEffects.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.7 - Math.random() * 0.4,
            life: 48 + Math.floor(Math.random() * 14),
            alpha: 1,
            size: 8 + Math.random() * 8,
            color: `rgba(${gray}, ${gray}, ${gray}, 0.9)`
        });
    }
}

function spawnGrenadeFragments(x, y) {
    const extraFragments = Math.max(0, player?.bombFragmentCountBonus || 0) * 2;
    const count = 10 + extraFragments;
    const speedMultiplier = 1 + Math.max(0, player?.bombFragmentSpeedBonus || 0);
    const sizeMultiplier = 1 + Math.max(0, player?.bombFragmentSizeBonus || 0);
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
        grenadeFragments.push({
            x,
            y,
            vx: Math.cos(angle) * 20 * speedMultiplier,
            vy: Math.sin(angle) * 20 * speedMultiplier,
            size: 3.8 * sizeMultiplier,
            life: 28,
            damage: 3,
            color: '#ffb347',
            pierceRemaining: 1 + Math.max(0, player?.bombFragmentPierce || 0)
        });
    }
    if (extraFragments > 0) {
        spawnBombFragmentCountEffect(Math.max(0, player?.bombFragmentCountBonus || 0));
    }
}

function launchThrowingExplosive(attackType = 'bomb') {
    const startX = player.x + player.width / 2;
    const startY = player.y + player.height / 2;
    const targetX = mouseX + cameraX;
    const targetY = mouseY + cameraY;
    const baseTravelTime = attackType === 'bomb' ? 38 : 32;
    const travelSpeedMultiplier = 1 + Math.max(0, player?.bombThrowSpeedBonus || 0);
    const travelTime = Math.max(10, Math.round(baseTravelTime / travelSpeedMultiplier));
    const arcHeight = attackType === 'bomb' ? 180 : 150;
    
    spawnBombThrowEffect(startX, startY, targetX, targetY);

    thrownExplosives.push({
        x: startX,
        y: startY,
        startX,
        startY,
        targetX,
        targetY,
        travelTime,
        elapsed: 0,
        arcHeight,
        type: attackType
    });
}

function updateThrownExplosives() {
    for (let i = thrownExplosives.length - 1; i >= 0; i--) {
        const projectile = thrownExplosives[i];
        projectile.elapsed += 1;
        const progress = Math.min(1, projectile.elapsed / projectile.travelTime);
        const eased = 1 - Math.pow(1 - progress, 2);
        projectile.x = projectile.startX + (projectile.targetX - projectile.startX) * eased;
        projectile.y = projectile.startY + (projectile.targetY - projectile.startY) * eased - projectile.arcHeight * 4 * eased * (1 - eased);

        if (progress >= 1) {
            if (projectile.type === 'bomb') {
                spawnFireZone(projectile.targetX, projectile.targetY, { applyStun: true });
                spawnSmokeBurst(projectile.targetX, projectile.targetY, 20);
            } else {
                applyAreaDamageAt(projectile.targetX, projectile.targetY, 30, 10);
                spawnGrenadeFragments(projectile.targetX, projectile.targetY);
                spawnEvaporationEffect(projectile.targetX, projectile.targetY, '#ff7a00', 18, 12);
                spawnSmokeBurst(projectile.targetX, projectile.targetY, 20);
            }
            thrownExplosives.splice(i, 1);
        }
    }
}

function updateFireZones() {
    for (let i = fireZones.length - 1; i >= 0; i--) {
        const zone = fireZones[i];
        zone.life -= 1;
        zone.radius = zone.maxRadius * Math.max(0, zone.life / zone.duration);
        zone.tickTimer -= 1;
        if (zone.tickTimer <= 0) {
            applyAreaDamageAt(zone.x, zone.y, zone.radius, zone.tickDamage);
            if (zone.burnDamage > 0) {
                applyBurnToTargetsInArea(zone.x, zone.y, zone.radius, zone.burnDamage, zone.burnDurationSeconds);
            }
            zone.tickTimer = 60;
        }
        if (zone.life <= 0) {
            fireZones.splice(i, 1);
        }
    }
}

function updateBurningEffects() {
    const tickTargets = [];

    if (currentMonster && currentMonster.health > 0 && !currentMonster.isDying && (currentMonster.burnTimer || 0) > 0) {
        tickTargets.push(currentMonster);
    }

    for (const enemy of castleInteriorEnemies) {
        if (enemy && !enemy.isDying && enemy.health > 0 && (enemy.burnTimer || 0) > 0) {
            tickTargets.push(enemy);
        }
    }

    for (const target of tickTargets) {
        if (!target) continue;
        target.burnTimer = Math.max(0, (target.burnTimer || 0) - 1);
        target.burnTickTimer = Math.max(0, (target.burnTickTimer || 60) - 1);
        if ((target.burnTickTimer || 0) <= 0) {
            target.burnTickTimer = 60;
            const damage = Math.max(1, Math.round(target.burnDamagePerSecond || 0));
            if (playerInsideConstruction) {
                applyDamageToInteriorEnemy(target, damage);
            } else if (currentMonster && currentMonster === target) {
                target.takeDamage(damage);
            }
            if ((target.burnDamagePerSecond || 0) > 0) {
                spawnBombBurnEffect(target.x + target.width / 2, target.y + target.height / 2);
            }
        }
    }
}

function updateGrenadeFragments() {
    for (let i = grenadeFragments.length - 1; i >= 0; i--) {
        const fragment = grenadeFragments[i];
        fragment.x += fragment.vx;
        fragment.y += fragment.vy;
        fragment.life -= 1;

        let fragmentHit = false;
        if (playerInsideConstruction) {
            for (const enemy of castleInteriorEnemies) {
                if (!enemy || enemy.isDying || enemy.health <= 0) continue;
                if (fragment.x > enemy.x && fragment.x < enemy.x + enemy.width && fragment.y > enemy.y && fragment.y < enemy.y + enemy.height) {
                    applyDamageToInteriorEnemy(enemy, fragment.damage);
                    if (player?.bombFragmentConfusionSeconds > 0) {
                        enemy.confusedTimer = Math.max(enemy.confusedTimer || 0, Math.round(player.bombFragmentConfusionSeconds * 60));
                        spawnBombConfusionEffect(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
                    }
                    fragment.pierceRemaining = Math.max(0, (fragment.pierceRemaining || 1) - 1);
                    fragmentHit = true;
                    spawnBombFragmentHitEffect(fragment.x, fragment.y, fragment.size);
                    break;
                }
            }
        } else if (currentMonster && currentMonster.health > 0 && !currentMonster.isDying) {
            if (fragment.x > currentMonster.x && fragment.x < currentMonster.x + currentMonster.width && fragment.y > currentMonster.y && fragment.y < currentMonster.y + currentMonster.height) {
                currentMonster.takeDamage(fragment.damage);
                if (player?.bombFragmentConfusionSeconds > 0) {
                    currentMonster.confusedTimer = Math.max(currentMonster.confusedTimer || 0, Math.round(player.bombFragmentConfusionSeconds * 60));
                    spawnBombConfusionEffect(currentMonster.x + currentMonster.width / 2, currentMonster.y + currentMonster.height / 2);
                }
                fragment.pierceRemaining = Math.max(0, (fragment.pierceRemaining || 1) - 1);
                fragmentHit = true;
                spawnBombFragmentHitEffect(fragment.x, fragment.y, fragment.size);
            }
        }

        if (fragmentHit && fragment.pierceRemaining <= 0) {
            grenadeFragments.splice(i, 1);
        } else if (fragment.life <= 0) {
            grenadeFragments.splice(i, 1);
        }
    }
}

function drawThrownExplosives() {
    for (const projectile of thrownExplosives) {
        ctx.save();
        ctx.translate(projectile.x, projectile.y);
        const isBomb = projectile.type === 'bomb';
        const color = isBomb ? '#ff8c1a' : '#8b1e00';
        const glowColor = isBomb ? '#ffb347' : '#ff7a00';
        const size = isBomb ? 8 : 6;
        
        // Glow effect
        const throwBonus = player?.bombThrowSpeedBonus || 0;
        const glowSize = size + 4 + throwBonus * 2;
        ctx.fillStyle = isBomb ? 'rgba(255, 139, 26, 0.3)' : 'rgba(139, 30, 0, 0.2)';
        ctx.beginPath();
        ctx.arc(0, 0, glowSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Main projectile
        ctx.fillStyle = color;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 12 + throwBonus * 3;
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawFireZones() {
    for (const zone of fireZones) {
        const alpha = Math.max(0.15, zone.life / zone.duration);
        const radiusBonus = player?.bombFireZoneRadiusBonus || 0;
        const burnIntensity = Math.min(1, player?.bombBurnDamagePerSecond || 0) * 0.6;
        
        ctx.save();
        
        // Outer glow layer
        const glowAlpha = alpha * 0.3 * (0.8 + 0.2 * Math.sin(performance.now() * 0.008));
        ctx.globalAlpha = glowAlpha;
        ctx.fillStyle = '#ff6600';
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.radius * 1.3, 0, Math.PI * 2);
        ctx.fill();
        
        // Main zone fill
        ctx.globalAlpha = alpha * 0.65;
        ctx.fillStyle = '#ff8c1a';
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner bright core
        if (burnIntensity > 0) {
            ctx.globalAlpha = alpha * 0.4 * burnIntensity;
            ctx.fillStyle = '#ffaa00';
            ctx.beginPath();
            ctx.arc(zone.x, zone.y, zone.radius * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Border stroke with animation
        ctx.globalAlpha = alpha * 0.85;
        ctx.strokeStyle = `rgba(255, 220, 120, ${0.85 + 0.15 * Math.sin(performance.now() * 0.006)})`;
        ctx.lineWidth = 2 + radiusBonus;
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    }
}

function drawGrenadeFragments() {
    for (const fragment of grenadeFragments) {
        const sizeBonus = player?.bombFragmentSizeBonus || 0;
        const visualSize = fragment.size * (1 + sizeBonus * 0.1);
        
        ctx.save();
        ctx.translate(fragment.x, fragment.y);
        
        // Outer glow
        ctx.fillStyle = 'rgba(255, 179, 71, 0.25)';
        ctx.beginPath();
        ctx.arc(0, 0, visualSize * 1.8, 0, Math.PI * 2);
        ctx.fill();
        
        // Main fragment
        ctx.fillStyle = fragment.color;
        ctx.shadowColor = '#ffaa44';
        ctx.shadowBlur = 6 + visualSize * 0.4;
        ctx.beginPath();
        ctx.arc(0, 0, visualSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(-visualSize * 0.3, -visualSize * 0.3, visualSize * 0.35, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}

function attemptAttack(source = 'mouse') {
    if (!player.weapon) return;
    // Remover ataque ativo para espadas: não executar attemptAttack() quando a arma for espada
    if (player.weapon && player.weapon.type === 'sword') return;
    // Se a arma for staff e já houver 5 orbs, tentar atirar incrementa a carga em vez de spawnar
    if (player.weapon.type === 'staff') {
        const staffCountNow = projectiles.filter(p => p.owner === 'player' && p.style === 'staffOrb').length;
        if (staffCountNow >= 5) {
            if (player.staffBurstCooldown > 0) {
                return;
            }
            player.staffCharge = (player.staffCharge || 0) + 1;
            if (player.staffCharge > (player.staffChargeMax || 15)) player.staffCharge = player.staffChargeMax || 15;
            console.log('Staff attemptAttack: incremented staffCharge ->', player.staffCharge);
            updateCooldownBar();
            if (player.staffCharge >= (player.staffChargeMax || 15)) {
                // liberar burst e zerar a carga
                player.staffCharge = 0;
                player.staffBurstCooldown = player.staffBurstCooldownMax || 120;
                const staffMount = player.getWeaponMountPoint();
                const centerX = staffMount.tipX;
                const centerY = staffMount.tipY;
                const baseDamageVal = player.weapon ? (player.weapon.damage || 1) + player.weaponDamage + player.baseDamage : 1;
                const damage = Math.max(1, Math.round(baseDamageVal * (player.damageOutputMultiplier || 1)));
                const miniDamage = Math.max(1, Math.round(damage * 0.5));
                const miniSpeed = ((player.weapon && player.weapon.speed) || 12) * 3;
                const burstCount = player.staffChargeBurstCount || 5;
                spawnStaffBurst(centerX, centerY, player.weapon.color || '#ff00ff', miniDamage, miniSpeed, burstCount);
                // limpar barra imediata
                try { const fill = document.getElementById('cooldownBarFill'); if (fill) fill.style.width = `0%`; } catch (e) {}
            }
            return;
        }
    }

    const weapon = player.weapon;
    if (weapon.type === 'grenade') {
        const attackType = source === 'space' ? 'bomb' : 'grenade';
        const cooldownFrames = 5 * 60;
        if (attackType === 'bomb') {
            if (player.bombCooldown > 0) return;
            launchThrowingExplosive('bomb');
            player.bombCooldown = cooldownFrames;
        } else {
            if (player.grenadeCooldown > 0) return;
            launchThrowingExplosive('grenade');
            player.grenadeCooldown = cooldownFrames;
        }
        return;
    }

    if (weapon.type === 'bow' && player.attackCooldown > 0 && player.bowDashCharges > 0) {
        let moveX = 0;
        let moveY = 0;
        if (keys['d'] || keys['arrowright']) moveX += 1;
        if (keys['a'] || keys['arrowleft']) moveX -= 1;
        if (keys['s'] || keys['arrowdown']) moveY += 1;
        if (keys['w'] || keys['arrowup']) moveY -= 1;
        const magnitude = Math.sqrt(moveX * moveX + moveY * moveY);
        if (magnitude > 0) {
            player.dashVectorX = moveX / magnitude;
            player.dashVectorY = moveY / magnitude;
        } else {
            const dashAngle = typeof player.swordAimAngle === 'number' ? player.swordAimAngle : 0;
            player.dashVectorX = Math.cos(dashAngle);
            player.dashVectorY = Math.sin(dashAngle);
        }
        player.dashTimer = 12;
        player.dashHasHitMonster = false;
        player.bowDashCharges = Math.max(0, player.bowDashCharges - 1);
        return;
    }

    if (player.stunTimer > 0) return;
    if (player.attackCooldown === 0) {
        if (weapon.type === 'bow') {
            player.bowDashCharges = player.bowDashMaxCharges;
        }
        if (weapon.type === 'gun') {
            if (player.gunReloadCooldown > 0) return;
            if (player.gunAmmo <= 0) {
                player.gunReloadCooldown = player.gunReloadCooldownMax;
                return;
            }
        }
        const preferred = getPreferredTarget();
        const targetX = preferred.x;
        const targetY = preferred.y;
        
        const baseWeaponDamage = weapon.damage + player.weaponDamage + player.baseDamage;
        const totalCritChance = player.critChance + ((weapon.type === 'bow') ? (player.bowCritChance || 0) : 0);
        const critRoll = Math.random() * 100;
        const critMultiplier = critRoll < totalCritChance ? 1 + player.critDamage : 1;
        const critPercent = critMultiplier > 1 ? player.critDamage + player.coneCritPercent : 0;
        const attackDamage = Math.round(baseWeaponDamage * critMultiplier * (player.damageOutputMultiplier || 1));
        const cooldown = Math.max(1, weapon.cooldown - player.cooldownReduction);
        const baseAngle = Math.atan2(targetY - (player.y + player.height / 2), targetX - (player.x + player.width / 2));
        const specialAttackSpeed = Math.max(6, (weapon.speed || 12) + player.projectileSpeedBonus);
        const weaponInfo = player.getWeaponMountPoint(baseAngle);

        if (weapon.type === 'sword') {
            player.attacking = true;
            player.meleeAttacking = true;
            player.meleeTimer = 14;
            player.meleeHitRegistered = false;
            player.meleeDirection = (player.swordAimAngle !== undefined) ? player.swordAimAngle : baseAngle;
            player.meleeAngle = 160 * Math.PI / 180;
            player.slashTimer = 12;
            player.slashAlpha = 1;
            player.attackCooldown = Math.max(1, cooldown - Math.round(cooldown * player.attackSpeed));
        } else if (weapon.type === 'cone') {
            player.attacking = true;
            player.coneAttacking = true;
            player.coneHitRegistered = false;
            player.meleeTimer = 14;
            player.coneDirection = baseAngle;
            player.coneAngle = weapon.coneAngle || Math.PI / 3;
            player.coneRange = weapon.range * getPlayerInteriorScale();

            if (!player.tornadoBurst || !player.tornadoBurst.active) {
                const playerScale = getPlayerInteriorScale();
                const baseTornadoSpeed = ((weapon.speed || 12) + player.projectileSpeedBonus) * 0.25 * 0.5 / 3 * playerScale;
                const tornadoCount = Math.max(1, Math.round(5 + player.extraProjectiles + player.spreadProjectiles + (player.tornadoBurstExtraCount || 0)));
                player.tornadoBurst = {
                    active: true,
                    spawnIndex: 0,
                    nextSpawnDelay: 0,
                    duration: 10 + tornadoCount * 9 + (player.tornadoBurstExtraDuration || 0),
                    direction: baseAngle,
                    damage: attackDamage,
                    color: weapon.color,
                    speed: baseTornadoSpeed,
                    critPercent: critPercent,
                    coneAngle: (weapon.coneAngle || Math.PI / 3) * 1.45 * (1 + player.spreadProjectiles * 0.15) + (player.tornadoConeAngleBonus || 0),
                    count: tornadoCount,
                    maxDistance: weapon.range * 0.7 * playerScale
                };

                // If player has late shots, schedule tornado copy spawns to match those late shots
                if (player.lateShots > 0) {
                    const startX = player.x + player.width / 2;
                    const startY = player.y + player.height / 2;
                    const lanceSpeed = player.tornadoBurst.speed * 2;
                    const baseDistance = player.tornadoBurst.maxDistance || (weapon.range * 0.7);
                    for (let li = 0; li < player.lateShots; li++) {
                        const timer = 45 + li * 12; // same cadence as normal late shots
                        const finalTargetX = startX + Math.cos(baseAngle) * baseDistance;
                        const finalTargetY = startY + Math.sin(baseAngle) * baseDistance;
                        delayedProjectileSpawns.push({
                            timer,
                            srcX: startX,
                            srcY: startY,
                            targetX: finalTargetX,
                            targetY: finalTargetY,
                            damage: attackDamage,
                            color: weapon.color,
                            size: 4,
                            maxDistance: player.tornadoBurst.maxDistance || 800,
                            critPercent: critPercent,
                            baseActualSpeed: (lanceSpeed * 0.5)
                        });
                    }
                }
            }

            const tornadoActive = projectiles.some(proj => proj.style === 'tornadoHurricane');
            const baseConeCooldown = Math.round(cooldown * 2.5);
            const coneCooldown = tornadoActive ? Math.max(1, Math.round(baseConeCooldown * 0.67)) : baseConeCooldown;
            player.attackCooldown = Math.max(1, coneCooldown - Math.round(cooldown * player.attackSpeed));
        } else {
            const playerScale = getPlayerInteriorScale();
            // Ataque à distância (projétil)
            const shots = 1 + player.extraProjectiles + player.spreadProjectiles;
            const baseAngle = Math.atan2(targetY - (player.y + player.height / 2), targetX - (player.x + player.width / 2));
            const speed = (weapon.speed + player.projectileSpeedBonus) * playerScale;
            const effectiveRange = weapon.range * playerScale;

            let lastProjX = player.x + player.width / 2;
            let lastProjY = player.y + player.height / 2;

            for (let i = 0; i < shots; i++) {
                const spread = (Math.random() - 0.5) * 0.2 * shots;
                const angle = baseAngle + spread;
                const projTargetX = player.x + player.width / 2 + Math.cos(angle) * effectiveRange;
                const projTargetY = player.y + player.height / 2 + Math.sin(angle) * effectiveRange;
                const projOpts = {
                    critPercent,
                    isGunOriginal: weapon.type === 'gun' && i === 0,
                    explosive: weapon.type === 'gun' && player.gunExplosiveAmmo > 0,
                };
                spawnPlayerProjectile(weaponInfo.tipX, weaponInfo.tipY, projTargetX, projTargetY, attackDamage, weapon.color, speed, projOpts);

                if (weapon.type === 'gun' && player.gunBurstFire > 0) {
                    for (let burstIndex = 0; burstIndex < player.gunBurstFire; burstIndex++) {
                        const extraAngle = angle + ((burstIndex + 1) - (player.gunBurstFire + 1) / 2) * 0.14;
                        const burstTargetX = player.x + player.width / 2 + Math.cos(extraAngle) * weapon.range * 0.9;
                        const burstTargetY = player.y + player.height / 2 + Math.sin(extraAngle) * weapon.range * 0.9;
                        spawnPlayerProjectile(weaponInfo.tipX, weaponInfo.tipY, burstTargetX, burstTargetY, Math.max(1, Math.round(attackDamage * 0.75)), weapon.color, speed * 0.95, {
                            critPercent,
                            explosive: player.gunExplosiveAmmo > 0,
                            isGunOriginal: false
                        });
                    }
                }
            }

            player.attackCooldown = Math.max(1, cooldown - Math.round(cooldown * player.attackSpeed));
            if (weapon.type === 'bow') {
                player.bowDashCharges = player.bowDashMaxCharges;
            }
            if (weapon.type === 'gun') {
                player.gunAmmo -= 1;
                if (player.gunAmmo <= 0) {
                    player.gunReloadCooldown = player.gunReloadCooldownMax;
                }
            }

            if (player.spinAttackLevel > 1 && player.spinAttackCharges > 0) {
                spawnSpinAttackRoulette(targetX, targetY, attackDamage, weapon.color, specialAttackSpeed, critPercent);
                player.spinAttackCharges -= 1;
            }
        }
    }
}

function updateProjectiles() {
    // Verificar colisões entre projéteis do jogador e do monstro
    const projectilesToRemove = new Set();
    const hurricaneRemovals = new Set();
    // Remover projéteis que colidem com paredes
    for (let i = 0; i < projectiles.length; i++) {
        const proj = projectiles[i];
        if (proj.ignoreCollision || projectilesToRemove.has(i)) continue;
        const projRectSize = proj.size * 2;
        if (mapWalls.some(wall => isRectOverlap(proj.x - proj.size, proj.y - proj.size, projRectSize, projRectSize, wall.x, wall.y, wall.width, wall.height))) {
            projectilesToRemove.add(i);
        }
    }
    // Reset pulled flags and ensure projectiles can deal damage by default; hurricane will set pulled state per-frame
    for (let proj of projectiles) {
        proj.pulledByHurricane = false;
        if (typeof proj.canDealDamage === 'undefined') proj.canDealDamage = true;
        else proj.canDealDamage = true;
    }
    
    if (player.tornadoBurst && player.tornadoBurst.active) {
        const burst = player.tornadoBurst;
        burst.duration -= 1;
        if (burst.duration <= 0) {
            burst.active = false;
        } else if (burst.nextSpawnDelay <= 0) {
            if (burst.spawnIndex < burst.count) {
                const angleOffset = -burst.coneAngle / 2 + (burst.spawnIndex / (burst.count - 1)) * burst.coneAngle;
                const fireAngle = burst.direction + angleOffset;
                const startX = player.x + player.width / 2;
                const startY = player.y + player.height / 2;
                const lanceSpeed = burst.speed * 2;
                const lanceRange = burst.maxDistance * 0.5;
                const targetX = startX + Math.cos(fireAngle) * lanceRange;
                const targetY = startY + Math.sin(fireAngle) * lanceRange;
                // Spawn the original lance as a tornado copy that orbits the hurricane (or player's center if none)
                const hurricane = projectiles.find(p => p.style === 'tornadoHurricane');
                const hurricaneX = hurricane ? hurricane.x : startX;
                const hurricaneY = hurricane ? hurricane.y : startY;
                const orbitRadius = 70;
                spawnPlayerProjectile(startX, startY, targetX, targetY, burst.damage, burst.color, lanceSpeed, {
                    size: 4,
                    critPercent: burst.critPercent,
                    style: 'tornadoLanceCopy',
                    maxDistance: Math.max(lanceRange * 2, 1400),
                    hitTarget: false,
                    ignoreHurricanePull: true,
                    skipHurricaneRemoval: true,
                    orbitingHurricane: true,
                    orbitTimer: Math.round(0.6 * 60),
                    orbitMaxTimer: Math.round(0.6 * 60),
                    orbitCenterX: hurricaneX,
                    orbitCenterY: hurricaneY,
                    orbitRadius: orbitRadius,
                    orbitAngle: Math.random() * Math.PI * 2,
                    afterImageInterval: 3
                });
                burst.spawnIndex += 1;
                burst.nextSpawnDelay = 9; // 0.15 segundos a 60 fps
            } else {
                burst.active = false;
            }
        } else {
            burst.nextSpawnDelay -= 1;
        }
    }
    
    for (let i = 0; i < projectiles.length; i++) {
        if (projectilesToRemove.has(i) || projectiles[i].owner !== 'player' || projectiles[i].ignoreCollision) continue;
        
        for (let j = i + 1; j < projectiles.length; j++) {
            if (projectilesToRemove.has(j) || projectiles[j].owner !== 'monster' || projectiles[j].ignoreCollision || projectiles[j].pendingRicochetDestroy) continue;
            
            const p1 = projectiles[i];
            const p2 = projectiles[j];
            
            // Verificar colisão baseada em distância usando os raios reais dos projéteis
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const collisionRadius = p1.size + p2.size + 4;
            
            if (distance < collisionRadius) {
                if (p1.style === 'spinAttack' || p1.style === 'staffOrb') {
                    projectilesToRemove.add(j);
                    continue;
                }
                if (p1.style === 'bowArrow' && p1.ricochetActive && p1.ricochetCount > 0) {
                    // Destruir o projétil inimigo com atraso visível
                    const victim = projectiles[j];
                    victim.ignoreCollision = true;
                    victim.canDealDamage = false;
                    victim.delayTimer = 16;
                    victim.delayDuration = 0;
                    victim.vx = 0;
                    victim.vy = 0;
                    victim.pendingRicochetDestroy = true;
                    victim.shakeTimer = 14;
                    victim.shakeIntensity = 2.2;
                    p1.ricochetCount = Math.max(0, p1.ricochetCount - 1);
                    p1.afterImageTrail = true;
                    p1.afterImageInterval = 1;

                    const shardCount = 3 + Math.min(2, Math.floor((player.bowRicochet || 0) / 2));
                    const shardDamage = Math.max(1, Math.round((p1.damage || 8) * 0.28));
                    for (let shardIndex = 0; shardIndex < shardCount; shardIndex++) {
                        const shardAngle = Math.random() * Math.PI * 2;
                        const shardTargetX = projectiles[j].x + Math.cos(shardAngle) * 140;
                        const shardTargetY = projectiles[j].y + Math.sin(shardAngle) * 140;
                        spawnPlayerProjectile(projectiles[j].x, projectiles[j].y, shardTargetX, shardTargetY, shardDamage, p1.color, 11, {
                            style: 'bowArrow',
                            size: 4,
                            afterImageTrail: true,
                            afterImageInterval: 2,
                            ricochetActive: false
                        });
                    }
                    
                    // Procurar outro projétil inimigo para mirar — escolher o projétil
                    // mais próximo do jogador (priorizar proteção do jogador)
                    let nextTarget = null;
                    let closestDist = Infinity;
                    try {
                        const playerCenterX = (player.x || 0) + (player.width || 0) / 2;
                        const playerCenterY = (player.y || 0) + (player.height || 0) / 2;
                        for (let k = 0; k < projectiles.length; k++) {
                            if (k === j || projectilesToRemove.has(k) || projectiles[k].owner !== 'monster') continue;
                            const p3 = projectiles[k];
                            const dx2 = p3.x - playerCenterX;
                            const dy2 = p3.y - playerCenterY;
                            const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                            if (dist2 < closestDist) {
                                closestDist = dist2;
                                nextTarget = p3;
                            }
                        }
                    } catch (e) {}
                    
                    // Se encontrou outro alvo e ainda tem ricochetes, redirecionar a flecha para ele
                    if (nextTarget && p1.ricochetCount > 0) {
                        const ddx = nextTarget.x - p1.x;
                        const ddy = nextTarget.y - p1.y;
                        const ddist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
                        // Make ricocheted arrow move very fast when redirecting
                        const redirectSpeed = 28;
                        p1.vx = (ddx / ddist) * redirectSpeed;
                        p1.vy = (ddy / ddist) * redirectSpeed;
                    }
                    continue;
                }
                projectilesToRemove.add(i);
                projectilesToRemove.add(j);
                break;
            }
        }
    }
    
    // Remover projéteis que colidiram em ordem reversa para não afetar índices
    Array.from(projectilesToRemove).sort((a, b) => b - a).forEach(index => {
        const removed = projectiles[index];
        if (removed) {
            spawnEvaporationForProjectile(removed);
        }
        projectiles.splice(index, 1);
    });
    
    // Remover projéteis marcados para destruição atrasada pelo ricochete
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const proj = projectiles[i];
        if (proj.pendingRicochetDestroy && proj.delayTimer <= 0) {
            spawnEvaporationForProjectile(proj);
            projectiles.splice(i, 1);
        }
    }
    
    // Verificar colisões com marcas do swarm
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        for (let j = swarmMarks.length - 1; j >= 0; j--) {
            const mark = swarmMarks[j];
            const dx = p.x - mark.x;
            const dy = p.y - mark.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < mark.radius + p.size) {
                // Projectile atingiu a marca - liberar vespas de todos os lados
                const waspCount = Math.floor(Math.random() * 11) + 5;
                for (let k = 0; k < waspCount; k++) {
                    const modeRoll = Math.random();
                    const baseAngle = Math.random() * Math.PI * 2;
                    let targetX;
                    let targetY;
                    const speed = 10 + (currentMonster ? currentMonster.phase * 0.5 : 0);
                    let projectileOptions = {
                        monsterType: 'swarm',
                        style: 'swarmBug',
                        size: 8,
                        afterImageTrail: true,
                        afterImageInterval: 3,
                        homing: false
                    };

                    if (modeRoll < 0.25) {
                        // Direção baseada no jogador atual
                        targetX = player.x + player.width / 2;
                        targetY = player.y + player.height / 2;
                    } else if (modeRoll < 0.55) {
                        // Direção preditiva: onde o jogador vai
                        const predict = getPredictedPlayerPosition(12);
                        targetX = predict.x;
                        targetY = predict.y;
                    } else if (modeRoll < 0.75) {
                        // Homing parcial por pouco tempo
                        const offsetAngle = baseAngle;
                        targetX = mark.x + Math.cos(offsetAngle) * 320;
                        targetY = mark.y + Math.sin(offsetAngle) * 320;
                        projectileOptions.homing = true;
                        projectileOptions.homingDuration = 6; // ~0.1s
                        projectileOptions.homingStrength = 0.14;
                        projectileOptions.homingTarget = player;
                    } else {
                        // Direção aleatória pura
                        targetX = mark.x + Math.cos(baseAngle) * 320;
                        targetY = mark.y + Math.sin(baseAngle) * 320;
                    }

                    const waspDamage = Math.max(1, Math.round((currentMonster ? currentMonster.getAttackDamage() : 8) * 0.35));
                    spawnMonsterProjectile(mark.x, mark.y, targetX, targetY, waspDamage, '#9e4cff', speed, projectileOptions);
                }

                // Remover a marca e desacelerar o tempo por ~0.225s com rampas suaves
                if (slowdownTimer <= 0) {
                    generateSlowdownInsects();
                }
                slowdownTimer = Math.max(slowdownTimer, slowdownRampFrames * 2 + slowdownHoldFrames);
                swarmMarks.splice(j, 1);
                break;
            }
        }
    }
    
    // Only decrement hurricane cooldown when no active tornado hurricane projectiles exist
    const hurricaneActive = projectiles.some(proj => proj.style === 'tornadoHurricane');
    if (player.hurricaneCooldown > 0 && !hurricaneActive) {
        player.hurricaneCooldown -= 1;
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        projectiles[i].update();
        if (projectiles[i].pendingRicochetDestroy) continue;
        // If this projectile was parried and can destroy others on touch, check collisions
        if (player.dashTimer > 0 && projectiles[i].owner === 'monster') {
            const playerCenterX = player.x + player.width / 2;
            const playerCenterY = player.y + player.height / 2;
            const dx = projectiles[i].x - playerCenterX;
            const dy = projectiles[i].y - playerCenterY;
            if (dx * dx + dy * dy <= player.dashRadius * player.dashRadius) {
                spawnEvaporationForProjectile(projectiles[i]);
                projectiles.splice(i, 1);
                continue;
            }
        }

        if (projectiles[i].parried && projectiles[i].owner === 'player' && projectiles[i].canDestroyOnTouch) {
            const par = projectiles[i];
            for (let j = projectiles.length - 1; j >= 0; j--) {
                if (j === i) continue;
                const other = projectiles[j];
                if (!other) continue;
                // only destroy enemy projectiles
                if (other.owner === 'monster') {
                    const dx = par.x - other.x;
                    const dy = par.y - other.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist <= par.size + other.size + 4) {
                        spawnEvaporationForProjectile(other);
                        projectiles.splice(j, 1);
                        if (j < i) i--; // adjust outer index if needed
                    }
                }
            }
        }
        
        if (projectiles[i].style === 'tornadoHurricane') {
            const hurricane = projectiles[i];
            for (let j = projectiles.length - 1; j >= 0; j--) {
                if (j === i) continue;
                const q = projectiles[j];
                // Ignore the hurricane itself, other hurricanes, and any tornado-launched copies/orbiting pieces
                if (q === hurricane || q.style === 'tornadoHurricane' || q.style === 'tornadoLanceCopy' || q.orbitingHurricane) continue;
                const dx = hurricane.x - q.x;
                const dy = hurricane.y - q.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                if (dist <= hurricane.pullRadius) {
                    if (q.ignoreHurricanePull) {
                        continue;
                    }
                    // If this is an enemy projectile being pulled, mark it as pulled and disable its ability to deal damage
                    if (q.owner === 'monster') {
                        q.pulledByHurricane = true;
                        q.canDealDamage = false;
                    }
                    if (q.style === 'tornadoLance' && !q.hurricaneBoosted) {
                        // Random improvement between 10% and 300% (1.1x to 4.0x) for each property
                        // range boost is double the other boosts (twice as strong as before)
                        const maxDistanceBoost = (1.1 + Math.random() * 2.9) * 2;
                        const speedBoost = 1.1 + Math.random() * 2.9;
                        const velocityBoost = 1.1 + Math.random() * 2.9;
                        // Also boost crit chance and crit damage for this projectile
                        const critChanceBoost = 1.1 + Math.random() * 2.9;
                        const critDamageBoost = 1.1 + Math.random() * 2.9;

                        q.maxDistance *= maxDistanceBoost;
                        q.speed *= speedBoost;
                        q.vx *= velocityBoost;
                        q.vy *= velocityBoost;
                        // store multipliers to be applied at hit time
                        q.critChanceMultiplier = critChanceBoost;
                        q.critDamageMultiplier = critDamageBoost;
                        q.hurricaneBoosted = true;
                    }
                    const pull = hurricane.pullStrength * (1 + (hurricane.pullRadius - dist) / hurricane.pullRadius);
                    q.vx += (dx / dist) * pull;
                    q.vy += (dy / dist) * pull;
                    if (dist < hurricane.size + q.size + 6) {
                        // If a tornado lance touches the hurricane, schedule a delayed copy
                        if (q.style === 'tornadoLance' && !q._scheduledTornadoCopy) {
                            // schedule spawn in ~0.3s (18 frames at 60fps)
                            const srcSpeedActual = q.baseActualSpeed || Math.sqrt(q.vx * q.vx + q.vy * q.vy) || 0.0001;
                            let copyTarget = currentMonster ? { x: currentMonster.x + (currentMonster.width || 0) / 2, y: currentMonster.y + (currentMonster.height || 0) / 2 } : null;
                            if (playerInsideConstruction) {
                                const castleTarget = getNearestCastleEnemyCenter();
                                if (castleTarget) copyTarget = castleTarget;
                            }
                            const targetX = copyTarget ? copyTarget.x : q.x + 320;
                            const targetY = copyTarget ? copyTarget.y : q.y;
                            if (DEBUG_TORNADO_COPY) console.log('Scheduling tornado lance copy', {x: q.x, y: q.y, speed: srcSpeedActual, targetX, targetY});
                            delayedProjectileSpawns.push({
                                timer: Math.round(0.3 * 60),
                                srcX: q.x,
                                srcY: q.y,
                                targetX,
                                targetY,
                                damage: q.damage,
                                color: q.color,
                                size: q.size,
                                maxDistance: q.maxDistance || 800,
                                critPercent: q.critPercent || 0,
                                baseActualSpeed: srcSpeedActual
                            });
                            q._scheduledTornadoCopy = true;
                        }
                        if (!q.skipHurricaneRemoval) {
                            hurricaneRemovals.add(q);
                        }
                    }
                }
            }
            // If the hurricane's lifetime expired, remove it and set cooldown
            if (typeof hurricane.lifetime === 'number' && hurricane.lifetime <= 0) {
                // ensure cooldown is applied
                if (player) player.hurricaneCooldown = player.hurricaneCooldownMax || 360;
                spawnEvaporationForProjectile(hurricane);
                projectiles.splice(i, 1);
                continue;
            }

            continue;
        }

        if (!projectiles[i].isAlive()) {
            const p = projectiles[i];
            if (p.owner === 'monster' && (p.monsterType === 'caster' || p.style === 'casterFlameCircle' || p.style === 'casterFlameSpiral' || p.style === 'casterFlameRing' || p.style === 'casterFlameVolley' || p.style === 'casterBurst' || p.style === 'casterShard') && p.explodeOnExpire && !p._casterBurstTriggered) {
                spawnCasterProjectileBurst(p);
            }
            if (p.style === 'tornadoHurricane') {
                player.hurricaneCooldown = player.hurricaneCooldownMax || 360;
            }
            spawnEvaporationForProjectile(p);
            projectiles.splice(i, 1);
            continue;
        }

        const p = projectiles[i];
        if (p.owner === 'player' && p.style === 'bowArrow' && p.ricochetActive && p.destroyOnContact) {
            for (let j = projectiles.length - 1; j >= 0; j--) {
                if (j === i) continue;
                const other = projectiles[j];
                if (!other || other.owner !== 'monster' || other.pendingRicochetDestroy) continue;
                const dx = p.x - other.x;
                const dy = p.y - other.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const radius = (p.destroyRadius || 28) + other.size;
                if (dist <= radius) {
                    other.ignoreCollision = true;
                    other.canDealDamage = false;
                    other.delayTimer = 16;
                    other.delayDuration = 0;
                    other.vx = 0;
                    other.vy = 0;
                    other.pendingRicochetDestroy = true;
                    other.shakeTimer = 14;
                    other.shakeIntensity = 2.2;
                    if (j < i) i--;
                }
            }
        }

        if (projectiles[i].owner === 'monster' && projectiles[i].splitOnPlayerAttack && projectiles[i].traveled >= projectiles[i].splitDistance) {
            const splitProjectile = projectiles[i];
            const playerCenterX = player.x + player.width / 2;
            const playerCenterY = player.y + player.height / 2;
            const baseAngle = Math.atan2(playerCenterY - splitProjectile.y, playerCenterX - splitProjectile.x);
            const splitCount = 5;
            const splitSpeed = Math.max(4, Math.sqrt(splitProjectile.vx * splitProjectile.vx + splitProjectile.vy * splitProjectile.vy) * 1.2);
            const splitDamage = Math.max(1, Math.floor(splitProjectile.damage * 0.75));

            for (let j = 0; j < splitCount; j++) {
                const angle = baseAngle + (j - (splitCount - 1) / 2) * 0.12;
                const targetX = splitProjectile.x + Math.cos(angle) * 180;
                const targetY = splitProjectile.y + Math.sin(angle) * 180;
                projectiles.push(new Projectile(
                    splitProjectile.x,
                    splitProjectile.y,
                    targetX,
                    targetY,
                    splitDamage,
                    '#ffaa33',
                    splitSpeed,
                    'monster',
                    6
                ));
            }

            projectiles.splice(i, 1);
            continue;
        }
        
        if (p.owner === 'player' && !p.ignoreCollision) {
            if (playerInsideConstruction) {
                const enemy = findInteriorEnemyInRectangle(p.x - p.size - 4, p.y - p.size - 4, p.size * 2 + 8, p.size * 2 + 8);
                if (enemy) {
                    let baseDamage = (p.style === 'tornadoLance' || p.style === 'tornadoLanceCopy') ? p.damage * 1.5 : p.damage;
                    if (p.style === 'gunBullet' && player.gunExplosiveAmmo > 0 && p.explosive) {
                        baseDamage += Math.round(baseDamage * 0.25 * player.gunExplosiveAmmo);
                    }

                    const projCritChanceMul = p.critChanceMultiplier || 1;
                    const projCritDamageMul = p.critDamageMultiplier || 1;
                    const projCritChanceBonus = p.critChanceBonus || 0;
                    const effectiveCritChance = ((player.critChance || 0) + projCritChanceBonus) * projCritChanceMul;
                    const effectiveCritDamage = (player.critDamage || 0) * projCritDamageMul;

                    let finalDamage = baseDamage;
                    let didCrit = false;
                    if (Math.random() * 100 < effectiveCritChance) {
                        finalDamage = Math.round(finalDamage * (1 + effectiveCritDamage));
                        didCrit = true;
                    }

                    applyDamageToInteriorEnemy(enemy, finalDamage);
                    if (p.style === 'tornadoLance' || p.style === 'tornadoLanceCopy') {
                        const hitX = enemy.x + enemy.width / 2;
                        const hitY = enemy.y + enemy.height / 2;
                        spawnTornadoHitEffect(hitX, hitY, '#83e8ff');
                        if (player.hurricaneCooldown <= 0) {
                            player.tornadoCharge = (player.tornadoCharge || 0) + 1;
                            if (player.tornadoCharge >= (player.tornadoChargeMax || 20)) {
                                player.tornadoCharge = 0;
                                updateCooldownBar();
                                spawnTornadoHurricane();
                            } else {
                                updateCooldownBar();
                            }
                        }
                    }
                    registerPlayerHit();
                    if (didCrit) {
                        critEffects.push({
                            x: enemy.x + enemy.width / 2,
                            y: enemy.y - 20,
                            alpha: 1,
                            text: `⭐ +${Math.round(effectiveCritDamage * 100)}%`,
                            rise: 0
                        });
                    } else if (p.critPercent > 0) {
                        critEffects.push({
                            x: enemy.x + enemy.width / 2,
                            y: enemy.y - 20,
                            alpha: 1,
                            text: `⭐ +${Math.round(p.critPercent * 100)}%`,
                            rise: 0
                        });
                    }
                    projectiles.splice(i, 1);
                }
            } else {
                const isHit = 
                    p.x < currentMonster.x + currentMonster.width &&
                    p.x > currentMonster.x &&
                    p.y < currentMonster.y + currentMonster.height &&
                    p.y > currentMonster.y;
                
                if (isHit) {
                    // Calculate base damage (lances do 1.5x)
                    let baseDamage = (p.style === 'tornadoLance' || p.style === 'tornadoLanceCopy') ? p.damage * 1.5 : p.damage;
                    if (p.style === 'gunBullet' && player.gunExplosiveAmmo > 0 && p.explosive) {
                        baseDamage += Math.round(baseDamage * 0.25 * player.gunExplosiveAmmo);
                    }

                    // Apply projectile-specific crit multipliers and bonuses if present
                    const projCritChanceMul = p.critChanceMultiplier || 1;
                    const projCritDamageMul = p.critDamageMultiplier || 1;
                    const projCritChanceBonus = p.critChanceBonus || 0;
                    const effectiveCritChance = ((player.critChance || 0) + projCritChanceBonus) * projCritChanceMul;
                    const effectiveCritDamage = (player.critDamage || 0) * projCritDamageMul;

                    let finalDamage = baseDamage;
                    let didCrit = false;
                    if (Math.random() * 100 < effectiveCritChance) {
                        finalDamage = Math.round(finalDamage * (1 + effectiveCritDamage));
                        didCrit = true;
                    }

                    currentMonster.takeDamage(finalDamage);
                    
                    if (p.owner === 'monster' && (p.monsterType === 'caster' || p.style === 'casterFlameCircle' || p.style === 'casterFlameSpiral' || p.style === 'casterFlameRing' || p.style === 'casterFlameVolley' || p.style === 'casterBurst' || p.style === 'casterShard') && !p._casterBurstTriggered) {
                        spawnCasterProjectileBurst(p);
                    }
                    
                    // Apply special projectile effects
                    if (p.ricochet && p.ricochetCount > 0) {
                        p.ricochetCount--;
                        const wallOffsets = [{x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: 1}, {x: 0, y: -1}];
                        const randomWall = wallOffsets[Math.floor(Math.random() * wallOffsets.length)];
                        p.vx = randomWall.x * Math.abs(p.vx);
                        p.vy = randomWall.y * Math.abs(p.vy);
                        p.canDealDamage = false;
                    }
                    
                    if (p.explosive && p.explosiveRadius) {
                        const explosionX = currentMonster.x + currentMonster.width / 2;
                        const explosionY = currentMonster.y + currentMonster.height / 2;
                        spawnEvaporationEffect(explosionX, explosionY, '#ff6644', 24, 20);
                        explosionEffects.push({
                            x: explosionX,
                            y: explosionY,
                            radius: 0,
                            maxRadius: p.explosiveRadius,
                            life: 12,
                            maxLife: 12,
                            damage: Math.round(finalDamage * 0.6)
                        });
                    }
                    
                    if (p.freezer && p.freezeDuration) {
                        currentMonster.freezeTimer = (currentMonster.freezeTimer || 0) + p.freezeDuration;
                        spawnEvaporationEffect(currentMonster.x + currentMonster.width / 2, currentMonster.y + currentMonster.height / 2, '#55ddff', 18, 12);
                    }
                    
                    if (p.knockback && p.knockbackPower) {
                        const knockX = Math.cos(Math.atan2(currentMonster.y - p.y, currentMonster.x - p.x)) * p.knockbackPower;
                        const knockY = Math.sin(Math.atan2(currentMonster.y - p.y, currentMonster.x - p.x)) * p.knockbackPower;
                        currentMonster.vx = (currentMonster.vx || 0) + knockX;
                        currentMonster.vy = (currentMonster.vy || 0) + knockY;
                        spawnEvaporationEffect(currentMonster.x + currentMonster.width / 2, currentMonster.y + currentMonster.height / 2, '#ff3333', 22, 14);
                    }
                    
                    if (p.parried && player.parryHealOnUse > 0) {
                        const healAmount = player.maxHealth * (player.parryHealOnUse / 100);
                        player.health = Math.min(player.maxHealth, player.health + healAmount);
                    }
                    if (p.parried && player.parryConfusionChance > 0 && Math.random() * 100 < player.parryConfusionChance) {
                        const confusionFrames = Math.round((player.parryConfusionDuration || 0) * 60);
                        if (confusionFrames > 0) {
                            currentMonster.confusedTimer = Math.max(currentMonster.confusedTimer, confusionFrames);
                        }
                    }
                    if (p.style === 'tornadoLance' || p.style === 'tornadoLanceCopy') {
                        const hitX = currentMonster.x + currentMonster.width / 2;
                        const hitY = currentMonster.y + currentMonster.height / 2;
                        spawnTornadoHitEffect(hitX, hitY, '#83e8ff');
                    }
                    if (p.style === 'gunBullet' && player.gunExplosiveAmmo > 0 && p.explosive) {
                        spawnEvaporationEffect(currentMonster.x + currentMonster.width / 2, currentMonster.y + currentMonster.height / 2, '#ffbb22', 22, 18);
                    }
                    // Tornado lance hits build charge to summon the hurricane
                        if ((p.style === 'tornadoLance' || p.style === 'tornadoLanceCopy') && player.hurricaneCooldown <= 0) {
                        player.tornadoCharge = (player.tornadoCharge || 0) + 1;
                        if (player.tornadoCharge >= (player.tornadoChargeMax || 20)) {
                            player.tornadoCharge = 0;
                            updateCooldownBar();
                            spawnTornadoHurricane();
                        } else {
                            updateCooldownBar();
                        }
                    }

                    if (p.style === 'gunBullet' && player.gunReloadCooldown <= 0 && p.isGunOriginal) {
                        player.gunReloadHitCount = Math.min(player.gunReloadHitMax, (player.gunReloadHitCount || 0) + 1);
                        updateCooldownBar();
                        if (player.gunReloadHitCount >= player.gunReloadHitsToTrigger) {
                            player.gunReloadHitCount = 0;
                            player.gunReloadCooldown = player.gunReloadCooldownMax;
                            player.gunReloadInvulnCharges = 0;
                            player.gunReloadFlashTicker = 0;
                            updateCooldownBar();
                        }
                    }
                    // All monster-based gun passives
                    if (p.style === 'gunBullet' && player.weapon && player.weapon.type === 'gun' && !p._monsterPassiveTracked) {
                        p._monsterPassiveTracked = true;

                        if (player.shooterMachineGunUnlocked) {
                            player.shooterMachineGunCount = (player.shooterMachineGunCount || 0) + 1;
                            if (player.shooterMachineGunCount >= 4) {
                                player.shooterMachineGunCount = 0;
                                triggerShooterMachineGun();
                            }
                        }

                        if (player.swarmNubeUnlocked) {
                            player.swarmNubeCount = (player.swarmNubeCount || 0) + 1;
                            if (player.swarmNubeCount >= 3) {
                                player.swarmNubeCount = 0;
                                triggerSwarmNube();
                            }
                        }

                        if (player.casterPortalUnlocked) {
                            player.casterPortalCount = (player.casterPortalCount || 0) + 1;
                            if (player.casterPortalCount >= 5) {
                                player.casterPortalCount = 0;
                                triggerCasterPortalBurst();
                            }
                        }

                        if (player.avianTrackerUnlocked) {
                            player.avianTrackerCount = (player.avianTrackerCount || 0) + 1;
                            if (player.avianTrackerCount >= 5) {
                                player.avianTrackerCount = 0;
                                triggerAvianTracker();
                            }
                        }

                        if (player.smartRicochetUnlocked) {
                            player.smartRicochetCount = (player.smartRicochetCount || 0) + 1;
                            if (player.smartRicochetCount >= 4) {
                                player.smartRicochetCount = 0;
                                triggerSmartRicochet();
                            }
                        }

                        if (player.simpleExplosiveUnlocked) {
                            player.simpleExplosiveCount = (player.simpleExplosiveCount || 0) + 1;
                            if (player.simpleExplosiveCount >= 3) {
                                player.simpleExplosiveCount = 0;
                                triggerSimpleExplosive();
                            }
                        }

                        if (player.crocFreezerUnlocked) {
                            player.crocFreezerCount = (player.crocFreezerCount || 0) + 1;
                            if (player.crocFreezerCount >= 4) {
                                player.crocFreezerCount = 0;
                                triggerCrocFreezer();
                            }
                        }

                        if (player.tankImpulseUnlocked) {
                            player.tankImpulseCount = (player.tankImpulseCount || 0) + 1;
                            if (player.tankImpulseCount >= 5) {
                                player.tankImpulseCount = 0;
                                triggerTankImpulse();
                            }
                        }
                    }
                    // preserve lance hit flag
                    if (p.style === 'tornadoLance' || p.style === 'tornadoLanceCopy') p.hitTarget = true;
                    registerPlayerHit();
                    
                    // Rastrear acertos no tank
                    if (currentMonster.type === 'tank') {
                        player.tankHitCount++;
                        player.tankHitWindow = 45; // 0.75 segundos a 60 fps
                        
                        // Se atingiu 3 acertos, spawnar habilidade
                        if (player.tankHitCount >= 3) {
                            spawnTankCounterAttack();
                            player.tankHitCount = 0;
                            player.tankHitWindow = 0;
                        }
                    }
                    
                    projectiles.splice(i, 1);
                        if (didCrit) {
                            critEffects.push({
                                x: currentMonster.x + currentMonster.width / 2,
                                y: currentMonster.y - 20,
                                alpha: 1,
                                text: `⭐ +${Math.round(effectiveCritDamage * 100)}%`,
                                rise: 0
                            });
                        } else if (p.critPercent > 0) {
                            critEffects.push({
                                x: currentMonster.x + currentMonster.width / 2,
                                y: currentMonster.y - 20,
                                alpha: 1,
                                text: `⭐ +${Math.round(p.critPercent * 100)}%`,
                                rise: 0
                            });
                        }
                }
            }
        } else {
            const playerCenterX = player.x + player.width / 2;
            const playerCenterY = player.y + player.height / 2;
            const canParryWithoutCooldown = player.swordAimAnimationPhase !== null;
            if (player.weapon && player.weapon.type === 'sword' && (player.meleeAttacking || player.swordAlwaysActive) && (player.parryCooldown === 0 || canParryWithoutCooldown)) {
                const extraRange = Math.max(0, player.attackRange - 80);
                const swordLen = (player.weapon.range || 45) + extraRange;
                const aim = (typeof player.swordAimAngle === 'number') ? player.swordAimAngle : player.meleeDirection || 0;

                const bladeBase = 12; // distance from player center to where blade starts
                const x1 = playerCenterX + Math.cos(aim) * bladeBase;
                const y1 = playerCenterY + Math.sin(aim) * bladeBase;
                const x2 = playerCenterX + Math.cos(aim) * swordLen;
                const y2 = playerCenterY + Math.sin(aim) * swordLen;

                const distToSegment = pointToSegmentDistance(p.x, p.y, x1, y1, x2, y2);
                const threshold = p.size + player.swordThickness / 2;

                if (distToSegment <= threshold && (player.slashTimer > 0 || player.swordAlwaysActive)) {
                    handleParryProjectile(p);
                    if (currentMonster) currentMonster.stunTimer = 30;
                    if (!canParryWithoutCooldown) {
                        // Aplicar redução de cooldown baseado na carga acumulada
                        let cooldown = player.parryMax || 240;
                        if (player.parryChargeAccumulator > 0) {
                            const reductionAmount = (cooldown * player.parryChargeAccumulator / 100);
                            cooldown = Math.floor(Math.max(60, cooldown - reductionAmount)); // mínimo de 60 frames
                            player.parryChargeAccumulator = 0; // resetar após usar
                        }
                        player.parryCooldown = cooldown;
                    }
                    player.slashTimer = 12;
                    player.slashAlpha = 1;
                    // do not remove projectile; it was converted to player-owned by handleParryProjectile
                    continue;
                }
            }

            const isHit = 
                p.x < player.x + player.width &&
                p.x > player.x &&
                p.y < player.y + player.height &&
                p.y > player.y;
            
            if (isHit) {
                // If player is dashing with the bow, they are immune to projectile damage during the dash
                if (player.dashTimer > 0 || player.postDashInvulnTimer > 0 || player.slashDashInvulnTimer > 0) {
                    projectiles.splice(i, 1);
                } else if (p.pulledByHurricane || p.canDealDamage === false) {
                    projectiles.splice(i, 1);
                } else if (player.weapon && player.weapon.type === 'gun' && player.gunReloadCooldown > 0 && player.gunReloadInvulnCharges > 0) {
                    player.gunReloadInvulnCharges = 0;
                    spawnAfterImage({
                        kind: 'player',
                        x: player.x,
                        y: player.y,
                        width: player.width,
                        height: player.height,
                        life: 18,
                        maxLife: 18,
                        baseAlpha: 0.55
                    });
                    projectiles.splice(i, 1);
                } else {
                    let effectiveDamage = Math.max(0, p.damage - player.damageReduction);
                    if (player.parryCooldown > 0 && player.parryDefenseBonus > 0) {
                        effectiveDamage *= (1 - player.parryDefenseBonus / 100);
                    }
                    player.health -= effectiveDamage;
                    if (p.owner === 'monster') {
                        const projectileMonsterType = p.monsterType || currentMonster?.type || '';
                        if (projectileMonsterType === 'simple') {
                            tryApplyPlayerConfusionFromAttack(projectileMonsterType, { chance: 2 });
                        } else if (projectileMonsterType === 'shooter') {
                            tryApplyPlayerConfusionFromAttack(projectileMonsterType, { chance: 25 });
                        } else if (projectileMonsterType === 'specter') {
                            tryApplyPlayerConfusionFromAttack(projectileMonsterType, { chance: 32 });
                        } else if (projectileMonsterType === 'phantasm') {
                            tryApplyPlayerConfusionFromAttack(projectileMonsterType, { chance: 20 });
                        } else if (projectileMonsterType === 'poltergeist') {
                            tryApplyPlayerConfusionFromAttack(projectileMonsterType, { chance: 12 });
                        } else if (projectileMonsterType === 'tank' && p.style === 'tankCounter') {
                            tryApplyPlayerConfusionFromAttack(projectileMonsterType, { chance: 10 });
                        }
                    }
                    projectiles.splice(i, 1);
                }
            }
        }
    }

    if (hurricaneRemovals.size > 0) {
        projectiles = projectiles.filter(proj => !hurricaneRemovals.has(proj) || proj.skipHurricaneRemoval);
    }
    // Processar spawns atrasados (ex.: cópias de lanças geradas pelo tornado)
    for (let i = delayedProjectileSpawns.length - 1; i >= 0; i--) {
        const req = delayedProjectileSpawns[i];
        req.timer -= 1;
        if (req.timer <= 0) {
            // Special-handling for scheduled monster ring waves
            if (req.kind === 'monsterRing') {
                for (let pj = 0; pj < req.projectiles.length; pj++) {
                    const p = req.projectiles[pj];
                    spawnMonsterProjectile(
                        req.srcX,
                        req.srcY,
                        p.targetX,
                        p.targetY,
                        p.damage,
                        p.color,
                        p.speed,
                        { monsterType: currentMonster ? currentMonster.type : '', size: p.size || 8, style: p.style }
                    );
                }
                delayedProjectileSpawns.splice(i, 1);
                continue;
            }

            if (req.kind === 'monsterAimed') {
                spawnMonsterProjectile(
                    req.srcX,
                    req.srcY,
                    req.targetX,
                    req.targetY,
                    req.damage,
                    req.color,
                    req.speed,
                    { monsterType: req.monsterType || (currentMonster ? currentMonster.type : ''), size: req.size || 9, style: req.style }
                );
                delayedProjectileSpawns.splice(i, 1);
                continue;
            }

            // Calcular direção geral para o monstro com leve imprecisão
            let targetX, targetY;
            if (currentMonster) {
                targetX = currentMonster.x + (currentMonster.width || 0) / 2;
                targetY = currentMonster.y + (currentMonster.height || 0) / 2;
            } else {
                // Fallback: direção para a direita
                targetX = req.srcX + 300;
                targetY = req.srcY;
            }
            const dx = req.targetX - req.srcX;
            const dy = req.targetY - req.srcY;
            const baseAngle = Math.atan2(dy, dx);
            const imprecision = (Math.random() - 0.5) * 0.12; // +/- ~0.06 rad
            const finalAngle = baseAngle + imprecision;
            const baseDistance = Math.sqrt(dx * dx + dy * dy);
            const distance = Math.min(Math.max(baseDistance * 0.9, 120), req.maxDistance * 0.9);
            const offsetX = (Math.random() - 0.5) * 0.08 * (currentMonster ? currentMonster.width : 40);
            const offsetY = (Math.random() - 0.5) * 0.08 * (currentMonster ? currentMonster.height : 40);
            const finalTargetX = req.srcX + Math.cos(finalAngle) * distance + offsetX;
            const finalTargetY = req.srcY + Math.sin(finalAngle) * distance + offsetY;

            // Use the base actual speed before hurricane pull and make it much faster (8x)
            // (aumentado para que as cópias viajem muito mais distância)
            const desiredActual = req.baseActualSpeed * 8.0;
            const paramSpeed = desiredActual / 0.5;

            // Encontrar posição do tornado (hurricane)
            const hurricane = projectiles.find(p => p.style === 'tornadoHurricane');
            const hurricaneX = hurricane ? hurricane.x : req.srcX;
            const hurricaneY = hurricane ? hurricane.y : req.srcY;
            const orbitRadius = 70; // Raio da órbita ao redor do tornado (mais próximo do centro)
            const boostRadius = hurricane ? (hurricane.boostRadius || orbitRadius + 18) : orbitRadius + 18;
            const spawnDistance = Math.sqrt((req.srcX - hurricaneX) ** 2 + (req.srcY - hurricaneY) ** 2);
            const shouldBoost = spawnDistance <= boostRadius;

            if (DEBUG_TORNADO_COPY) console.log('Spawning tornado lance copy', {srcX: req.srcX, srcY: req.srcY, paramSpeed, targetX: finalTargetX, targetY: finalTargetY, shouldBoost, spawnDistance, boostRadius});
            const copyProj = spawnPlayerProjectile(req.srcX, req.srcY, finalTargetX, finalTargetY, req.damage, req.color, paramSpeed, {
                style: 'tornadoLanceCopy',
                size: req.size,
                hurricaneBoosted: shouldBoost,
                // Aumentar bastante a distância máxima para que as cópias viajem muito mais espaço
                maxDistance: Math.max((req.maxDistance || 800) * 4, 1600),
                critPercent: req.critPercent,
                ignoreHurricanePull: true,
                skipHurricaneRemoval: true,
                orbitingHurricane: true,
                orbitTimer: Math.round(0.6 * 60),
                orbitMaxTimer: Math.round(0.6 * 60),
                orbitCenterX: hurricaneX,
                orbitCenterY: hurricaneY,
                orbitRadius: orbitRadius,
                orbitAngle: Math.random() * Math.PI * 2,
                afterImageInterval: 3
            });
            if (copyProj && shouldBoost) {
                copyProj.maxDistance *= 1.35;
                copyProj.vx *= 1.25;
                copyProj.vy *= 1.25;
                copyProj.speed *= 1.25;
                copyProj.critChanceMultiplier = (copyProj.critChanceMultiplier || 1) * 1.3;
                copyProj.critDamageMultiplier = (copyProj.critDamageMultiplier || 1) * 1.3;
                copyProj.damage = Math.max(1, Math.round(copyProj.damage * 1.2));
            }

            delayedProjectileSpawns.splice(i, 1);
        }
    }
}

function updateMonsterHitscans() {
    for (let i = monsterHitscans.length - 1; i >= 0; i--) {
        const beam = monsterHitscans[i];
        beam.lifetime--;
        beam.alpha = Math.max(0, beam.lifetime / beam.maxLifetime);

        if (beam.lifetime <= 0) {
            if (!beam.hitChecked) {
                const playerCenterX = player.x + player.width / 2;
                const playerCenterY = player.y + player.height / 2;
                const distanceToBeam = pointToSegmentDistance(playerCenterX, playerCenterY, beam.x, beam.y, beam.targetX, beam.targetY);
                const hitRadius = beam.thickness * 0.75;
                if (distanceToBeam <= hitRadius && player.dashTimer <= 0 && player.postDashInvulnTimer <= 0 && player.slashDashInvulnTimer <= 0) {
                    let effectiveDamage = Math.max(0, beam.damage - player.damageReduction);
                    if (player.parryCooldown > 0 && player.parryDefenseBonus > 0) {
                        effectiveDamage *= (1 - player.parryDefenseBonus / 100);
                    }
                    player.health -= effectiveDamage;
                }
                beam.hitChecked = true;
            }
            monsterHitscans.splice(i, 1);
        }
    }
}

function drawMonsterHitscans() {
    for (let beam of monsterHitscans) {
        ctx.save();
        const flashFrames = 12;
        const isFlashing = beam.lifetime <= flashFrames;
        const baseAlpha = 0.55;
        const flashAlpha = isFlashing ? baseAlpha + Math.sin((beam.lifetime / flashFrames) * Math.PI * 8) * 0.35 : baseAlpha;
        const glowAlpha = isFlashing ? 1.0 : 0.65;
        ctx.globalAlpha = Math.max(0.3, flashAlpha);
        ctx.fillStyle = beam.color;
        ctx.strokeStyle = beam.color;
        ctx.lineWidth = beam.thickness;
        ctx.shadowColor = beam.color;
        ctx.shadowBlur = 36;
        const angle = Math.atan2(beam.targetY - beam.y, beam.targetX - beam.x);
        const perp = beam.thickness * 0.6;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const ox = -dy * perp;
        const oy = dx * perp;

        ctx.beginPath();
        ctx.moveTo(beam.x + ox, beam.y + oy);
        ctx.lineTo(beam.targetX + ox, beam.targetY + oy);
        ctx.lineTo(beam.targetX - ox, beam.targetY - oy);
        ctx.lineTo(beam.x - ox, beam.y - oy);
        ctx.closePath();
        ctx.fill();

        ctx.globalAlpha = Math.max(0.25, glowAlpha * 0.7);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(beam.x, beam.y);
        ctx.lineTo(beam.targetX, beam.targetY);
        ctx.stroke();

        ctx.globalAlpha = Math.max(0.15, glowAlpha * 0.35);
        ctx.lineWidth = Math.max(8, beam.thickness * 0.4);
        ctx.strokeStyle = beam.color;
        ctx.beginPath();
        ctx.moveTo(beam.x, beam.y);
        ctx.lineTo(beam.targetX, beam.targetY);
        ctx.stroke();
        ctx.restore();
    }
}

function updateDelayedShots() {
    for (let i = player.pendingLateShots.length - 1; i >= 0; i--) {
        const delayed = player.pendingLateShots[i];
        delayed.timer--;

        if (delayed.timer <= 0) {
            const targetX = currentMonster.x + currentMonster.width / 2;
            const targetY = currentMonster.y + currentMonster.height / 2;
            const angle = Math.atan2(targetY - delayed.y, targetX - delayed.x);
            const jitter = (Math.random() - 0.5) * 0.4;
            const finalAngle = angle + jitter;
            const playerScale = getPlayerInteriorScale();
            const range = (player.weapon ? player.weapon.range : 120) * playerScale;
            const projTargetX = delayed.x + Math.cos(finalAngle) * range;
            const projTargetY = delayed.y + Math.sin(finalAngle) * range;

            spawnPlayerProjectile(delayed.x, delayed.y, projTargetX, projTargetY, delayed.damage, delayed.color, delayed.speed, { critPercent: delayed.critPercent || 0 });

            player.pendingLateShots.splice(i, 1);
        }
    }
}

function processMeleeHit() {
    if (!player.weapon || player.weapon.type !== 'sword') return;

    const playerScale = getPlayerInteriorScale();
    const weapon = player.weapon;
    const extraRange = Math.max(0, player.attackRange - 80) * playerScale;
    const swordLen = ((weapon.range || 45) + extraRange) * playerScale;
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;
    const baseAim = (typeof player.swordAimAngle === 'number') ? player.swordAimAngle : player.meleeDirection || 0;
    const aim = baseAim + (player.swordAimOffsetAngle || 0);

    const bladeBase = 12; // where blade starts relative to player center
    const x1 = px + Math.cos(aim) * bladeBase;
    const y1 = py + Math.sin(aim) * bladeBase;
    const x2 = px + Math.cos(aim) * swordLen;
    const y2 = py + Math.sin(aim) * swordLen;

    if (playerInsideConstruction) {
        const enemy = findInteriorEnemyHitByMelee(x1, y1, x2, y2, player.swordThickness / 2);
        if (enemy && player.swordHitCooldown === 0) {
            const baseWeaponDamage = weapon.damage + player.weaponDamage + player.baseDamage;
            const critRoll = Math.random() * 100;
            const critMultiplier = critRoll < player.critChance ? 1 + player.critDamage : 1;
            const attackDamage = Math.round(baseWeaponDamage * critMultiplier * (player.damageOutputMultiplier || 1));

            applyDamageToInteriorEnemy(enemy, attackDamage);
            const ex = enemy.x + enemy.width / 2;
            const ey = enemy.y + enemy.height / 2;
            spawnEvaporationEffect(ex, ey, '#ffd060', 18, 10);
            
            if (player.swordComboTimer === 0) {
                player.swordComboCount = 1;
            } else {
                player.swordComboCount++;
            }
            player.swordComboTimer = 120;
            if (player.swordComboCount >= 3) {
                const sign = Math.random() < 0.5 ? 1 : -1;
                player.startSwordAimAnimation(sign * (240 * Math.PI / 180), 10);
                spawnEvaporationEffect(ex, ey, '#ffd060', 22, 18);
                spawnEvaporationEffect(px, py, '#ffffff', 14, 12);
                enemy.flashTimer = 16;
            }

            player.swordHitCooldown = 20;
            registerPlayerHit();

            if (player.attackMove > 0) {
                const dx = ex - px;
                const dy = ey - py;
                const dist = Math.hypot(dx, dy) || 1;
                const scaledAttackMove = player.attackMove * playerScale;
                player.x = Math.max(0, Math.min(player.x + (dx / dist) * scaledAttackMove, viewportWidth - player.width));
                player.y = Math.max(0, Math.min(player.y + (dy / dist) * scaledAttackMove, viewportHeight - player.height));
            }

            player.tryInvestidaDash();
        } else if (enemy) {
            player.swordComboCount = 0;
        }
        return;
    }

    const mx = currentMonster.x + currentMonster.width / 2;
    const my = currentMonster.y + currentMonster.height / 2;
    const monsterRadius = Math.max(currentMonster.width, currentMonster.height) / 2;

    const distToSegment = pointToSegmentDistance(mx, my, x1, y1, x2, y2);

    const inSwordRange = distToSegment <= monsterRadius + player.swordThickness / 2;
    if (inSwordRange && player.swordHitCooldown === 0) {
        const baseWeaponDamage = weapon.damage + player.weaponDamage + player.baseDamage;
        const critRoll = Math.random() * 100;
        const critMultiplier = critRoll < player.critChance ? 1 + player.critDamage : 1;
        const attackDamage = Math.round(baseWeaponDamage * critMultiplier * (player.damageOutputMultiplier || 1));

        currentMonster.takeDamage(attackDamage);
        spawnEvaporationEffect(mx, my, '#ffd060', 18, 10);
        if (player.swordComboTimer === 0) {
            player.swordComboCount = 1;
        } else {
            player.swordComboCount++;
        }
        player.swordComboTimer = 120;
        if (player.swordComboCount >= 3) {
            const sign = Math.random() < 0.5 ? 1 : -1;
            player.startSwordAimAnimation(sign * (240 * Math.PI / 180), 10);
            spawnEvaporationEffect(mx, my, '#ffd060', 22, 18);
            spawnEvaporationEffect(px, py, '#ffffff', 14, 12);
            currentMonster.flashTimer = 16;
            const impactShakeDuration = 20;
            currentMonster.impactShakeTimer = impactShakeDuration;
            player.impactShakeTimer = impactShakeDuration;

            const pushBack = 18;
            const dxp = player.x - mx;
            const dyp = player.y - my;
            const distp = Math.hypot(dxp, dyp) || 1;
            player.x = Math.max(0, Math.min(player.x + (dxp / distp) * pushBack, gameWidth - player.width));
            player.y = Math.max(0, Math.min(player.y + (dyp / distp) * pushBack, gameHeight - player.height));

            for (let j = 0; j < 6; j++) {
                spawnAfterImage({
                    kind: 'player',
                    x: player.x + (Math.random() - 0.5) * 10,
                    y: player.y + (Math.random() - 0.5) * 10,
                    width: player.width,
                    height: player.height,
                    life: 18,
                    maxLife: 18,
                    baseAlpha: 0.24
                });
            }
        }

        // Aplicar cooldown para evitar danos repetidos enquanto estiver encostando na lâmina
        player.swordHitCooldown = 20;
        registerPlayerHit();

        if (player.attackMove > 0) {
            const dx = mx - px;
            const dy = my - py;
            const dist = Math.hypot(dx, dy) || 1;
            const scaledAttackMove = player.attackMove * playerScale;
            player.x = Math.max(0, Math.min(player.x + (dx / dist) * scaledAttackMove, gameWidth - player.width));
            player.y = Math.max(0, Math.min(player.y + (dy / dist) * scaledAttackMove, gameHeight - player.height));
        }

        player.tryInvestidaDash();

        if (player.spinAttack) {
            const spinRadius = 18;
            if (distToSegment <= spinRadius + monsterRadius) {
                currentMonster.takeDamage(Math.round(attackDamage * 0.5));
                // também aplicar cooldown quando o spin causar dano reduzido
                player.swordHitCooldown = 20;
            }
        }
    } else if (!inSwordRange) {
        player.swordComboCount = 0;
    }
}

function processConeHit() {
    if (!player.coneAttacking || player.coneHitRegistered || !player.weapon || player.weapon.type !== 'cone') return;

    const weapon = player.weapon;
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;
    const playerScale = getPlayerInteriorScale();

    if (playerInsideConstruction) {
        const enemies = getCurrentInteriorEnemies();
        for (const enemy of enemies) {
            if (enemy.isDying || enemy.isInvisible) continue;
            const ex = enemy.x + enemy.width / 2;
            const ey = enemy.y + enemy.height / 2;
            const dist = Math.sqrt((ex - px) * (ex - px) + (ey - py) * (ey - py));
            const enemyAngle = Math.atan2(ey - py, ex - px);
            let delta = Math.abs(enemyAngle - player.coneDirection);
            while (delta > Math.PI) delta = Math.abs(delta - Math.PI * 2);

            if (dist <= weapon.range * playerScale + Math.max(enemy.width, enemy.height) / 2 && delta <= player.coneAngle / 2) {
                const baseWeaponDamage = weapon.damage + player.weaponDamage + player.baseDamage;
                const critRoll = Math.random() * 100;
                const critMultiplier = critRoll < player.critChance ? 1 + player.critDamage : 1;
                const attackDamage = Math.round(baseWeaponDamage * critMultiplier * (player.damageOutputMultiplier || 1));

                applyDamageToInteriorEnemy(enemy, attackDamage);
                registerPlayerHit();
                player.coneHitRegistered = true;
                return;
            }
        }
        return;
    }

    const mx = currentMonster.x + currentMonster.width / 2;
    const my = currentMonster.y + currentMonster.height / 2;
    const dist = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));
    const monsterAngle = Math.atan2(my - py, mx - px);
    let delta = Math.abs(monsterAngle - player.coneDirection);
    while (delta > Math.PI) delta = Math.abs(delta - Math.PI * 2);

    if (dist <= weapon.range * playerScale + Math.max(currentMonster.width, currentMonster.height) / 2 && delta <= player.coneAngle / 2) {
        const baseWeaponDamage = weapon.damage + player.weaponDamage + player.baseDamage;
        const critRoll = Math.random() * 100;
        const critMultiplier = critRoll < player.critChance ? 1 + player.critDamage : 1;
        const attackDamage = Math.round(baseWeaponDamage * critMultiplier * (player.damageOutputMultiplier || 1));

        currentMonster.takeDamage(attackDamage);
        registerPlayerHit();
        player.coneHitRegistered = true;
    }
}

function spawnSpinAttackStartProjectiles() {
    if (!player.spinAttack) return;

    const playerScale = getPlayerInteriorScale();
    const centerX = player.x + player.width / 2;
    const centerY = player.y + player.height / 2;
    const speed = 4;
    const rawDamage = player.baseDamage + player.weaponDamage + 2;
    const damage = Math.max(1, Math.round(rawDamage * (player.damageOutputMultiplier || 1)));
    const size = 14;
    const angles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
    const range = 140 * playerScale;
    const maxDistance = 1400 * playerScale;

    angles.forEach((angle) => {
        const targetX = centerX + Math.cos(angle) * range;
        const targetY = centerY + Math.sin(angle) * range;
        spawnPlayerProjectile(centerX, centerY, targetX, targetY, damage, '#ffcc00', speed, {
            size,
            style: 'spinAttack',
            homing: true,
            maxDistance
        });
    });
}

function spawnSpinAttackRoulette(targetX, targetY, damage, color, speed, critPercent) {
    const centerX = player.x + player.width / 2;
    const centerY = player.y + player.height / 2;
    const roll = Math.floor(Math.random() * 3);

    if (roll === 0) {
        spawnSpinAttackFollowProjectiles(centerX, centerY, targetX, targetY, damage, color, speed, critPercent);
    } else if (roll === 1) {
        spawnSpinAttackDestroyAll(centerX, centerY, targetX, targetY, damage, color, speed, critPercent);
    } else {
        spawnSpinAttackLateBursts(centerX, centerY, targetX, targetY, damage, color, speed, critPercent);
    }
}

function spawnSpinAttackFollowProjectiles(centerX, centerY, targetX, targetY, damage, color, speed, critPercent) {
    const playerScale = getPlayerInteriorScale();
    const angle = Math.atan2(targetY - centerY, targetX - centerX);
    const distance = 200 * playerScale;
    const maxDistance = 1400 * playerScale;
    const mainTargetX = centerX + Math.cos(angle) * distance;
    const mainTargetY = centerY + Math.sin(angle) * distance;
    const main = spawnPlayerProjectile(centerX, centerY, mainTargetX, mainTargetY, damage, color, speed, {
        style: 'spinAttack',
        size: 16,
        maxDistance,
        critPercent
    });

    for (let i = 0; i < 2; i++) {
        const offsetAngle = angle + (i === 0 ? 0.18 : -0.18);
        const followerTargetX = centerX + Math.cos(offsetAngle) * distance;
        const followerTargetY = centerY + Math.sin(offsetAngle) * distance;
        spawnPlayerProjectile(centerX, centerY, followerTargetX, followerTargetY, Math.max(1, Math.round(damage * 0.85)), color, speed, {
            style: 'spinAttack',
            size: 10,
            homing: true,
            homingTarget: main,
            homingStrength: 0.16,
            maxDistance,
            critPercent
        });
    }
}

function spawnSpinAttackDestroyAll(centerX, centerY, targetX, targetY, damage, color, speed, critPercent) {
    const baseAngle = Math.atan2(targetY - centerY, targetX - centerX);
    const blastDamage = Math.max(1, Math.round(damage * 1.1));
    const blastSpeed = Math.max(speed, 7);

    for (let i = -1; i <= 1; i++) {
        const angle = baseAngle + i * 0.18;
        const projTargetX = centerX + Math.cos(angle) * 220;
        const projTargetY = centerY + Math.sin(angle) * 220;
        spawnPlayerProjectile(centerX, centerY, projTargetX, projTargetY, blastDamage, '#ffea66', blastSpeed, {
            style: 'spinAttack',
            size: 18,
            maxDistance: 1400,
            critPercent
        });
    }
}

function spawnSpinAttackLateBursts(centerX, centerY, targetX, targetY, damage, color, speed, critPercent) {
    const baseAngle = Math.atan2(targetY - centerY, targetX - centerX);
    const delay = 30;

    for (let i = -1; i <= 1; i++) {
        const angle = baseAngle + i * 0.12;
        const projTargetX = centerX + Math.cos(angle) * 220;
        const projTargetY = centerY + Math.sin(angle) * 220;
        spawnPlayerProjectile(centerX, centerY, projTargetX, projTargetY, damage, color, speed, {
            style: 'spinAttack',
            size: 14,
            maxDistance: 1400,
            delayTimer: delay,
            delayDuration: delay,
            critPercent
        });
    }
}

function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, gameHeight);
    gradient.addColorStop(0, '#07101d');
    gradient.addColorStop(0.5, '#081a2d');
    gradient.addColorStop(1, '#050814');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, gameWidth, gameHeight);

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const step = 60;
    for (let x = 0; x <= gameWidth; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, gameHeight);
        ctx.stroke();
    }
    for (let y = 0; y <= gameHeight; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(gameWidth, y);
        ctx.stroke();
    }
    ctx.restore();

    drawMapWalls();

    const { centerX, centerY, radius, spawnRadius, upgradeRadius } = getMapCircle();

    ctx.save();
    ctx.globalCompositeOperation = 'overlay';

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220, 80, 70, 0.16)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(centerX, centerY, upgradeRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(245, 205, 65, 0.18)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(centerX, centerY, spawnRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(70, 150, 245, 0.22)';
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 14]);
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centerX, centerY, upgradeRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centerX, centerY, spawnRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, gameWidth, gameHeight);
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(3, 6, 12, 0.72)';
    ctx.fill('evenodd');
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('zona de spawn', centerX, centerY);
    ctx.font = '20px sans-serif';
    ctx.fillText('zona de melhorias', centerX, centerY - upgradeRadius * 0.62);
    ctx.fillText('zona selvagem', centerX, centerY - radius * 0.82);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 25; i++) {
        const size = Math.random() * 2 + 1;
        ctx.fillRect(Math.random() * gameWidth, Math.random() * gameHeight, size, size);
    }
    ctx.restore();
}

function drawMapWalls() {
    if (!mapWalls.length) return;
    ctx.save();
    ctx.fillStyle = 'rgba(48, 58, 72, 0.95)';
    ctx.strokeStyle = 'rgba(180, 200, 255, 0.28)';
    ctx.lineWidth = 2;
    for (let wall of mapWalls) {
        ctx.beginPath();
        ctx.rect(wall.x, wall.y, wall.width, wall.height);
        ctx.fill();
        ctx.stroke();
    }
    ctx.restore();
}

function generateMapWalls() {
    mapWalls = [];
}

function resolveEntityWallCollision(entity, prevX, prevY) {
    let collided = false;

    const targetX = entity.x;
    const targetY = entity.y;
    let resolvedX = targetX;
    let resolvedY = targetY;

    // Primeiro resolver movimento em X mantendo o Y antigo, para permitir deslizamento.
    entity.x = targetX;
    entity.y = prevY;
    if (mapWalls.some(wall => isRectOverlap(entity.x, entity.y, entity.width, entity.height, wall.x, wall.y, wall.width, wall.height))) {
        resolvedX = prevX;
        collided = true;
    }

    // Depois resolver movimento em Y usando a posição X já ajustada.
    entity.x = resolvedX;
    entity.y = targetY;
    if (mapWalls.some(wall => isRectOverlap(entity.x, entity.y, entity.width, entity.height, wall.x, wall.y, wall.width, wall.height))) {
        resolvedY = prevY;
        collided = true;
    }

    entity.x = resolvedX;
    entity.y = resolvedY;

    return collided;
}

function drawProjectiles() {
    for (let proj of projectiles) {
        proj.draw();
    }
}

function spawnEvaporationEffect(x, y, color, size, count = 8) {
    const baseSize = Math.max(2, size * 0.5);
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 1.8 + 0.8;
        evaporationEffects.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 30 + Math.floor(Math.random() * 10),
            alpha: 1,
            size: baseSize * (0.6 + Math.random() * 0.8),
            color: color || '#ffffff'
        });
    }
}

function spawnBombStunEffect(x, y) {
    if (!player || player.bombStunPerHitSeconds <= 0) return;
    for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        evaporationEffects.push({
            x,
            y,
            vx: Math.cos(angle) * 3.2,
            vy: Math.sin(angle) * 3.2,
            life: 18,
            alpha: 0.95,
            size: 5 + Math.random() * 3,
            color: '#ffff88'
        });
    }
}

function spawnBombConfusionEffect(x, y) {
    if (!player || player.bombFragmentConfusionSeconds <= 0) return;
    for (let i = 0; i < 12; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 1.2;
        evaporationEffects.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 24,
            alpha: 0.9,
            size: 3 + Math.random() * 2.5,
            color: '#ff88ff'
        });
    }
}

function spawnBombBurnEffect(x, y) {
    if (!player || player.bombBurnDamagePerSecond <= 0) return;
    for (let i = 0; i < 6; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.8 + Math.random() * 1.5;
        evaporationEffects.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.6,
            life: 20,
            alpha: 0.85,
            size: 6 + Math.random() * 4,
            color: i % 2 === 0 ? '#ff6600' : '#ffaa00'
        });
    }
}

function spawnBombFragmentHitEffect(x, y, size = 3.8) {
    const particleCount = Math.max(2, Math.round(size / 2));
    for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 2;
        evaporationEffects.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 12,
            alpha: 0.9,
            size: 2 + Math.random() * 1.5,
            color: '#ffb347'
        });
    }
}

function spawnBombThrowEffect(x, y, targetX, targetY) {
    if (!player || player.bombThrowSpeedBonus <= 0) return;
    const speedCount = Math.min(4, Math.ceil(player.bombThrowSpeedBonus * 2));
    for (let i = 0; i < speedCount; i++) {
        const t = i / speedCount;
        const px = x + (targetX - x) * t * 0.3;
        const py = y + (targetY - y) * t * 0.3;
        evaporationEffects.push({
            x: px,
            y: py,
            vx: (Math.random() - 0.5) * 1.2,
            vy: (Math.random() - 0.5) * 1.2 - 0.3,
            life: 8 + Math.floor(Math.random() * 8),
            alpha: 0.7,
            size: 3 + Math.random() * 2,
            color: '#ffee99'
        });
    }
}

function spawnBombFireZoneEffect(x, y, radiusMultiplier = 1) {
    if (!player || (player.bombFireZoneRadiusBonus <= 0 && player.bombBurnDamagePerSecond <= 0)) return;
    const effectCount = 8 + Math.floor(radiusMultiplier * 4);
    for (let i = 0; i < effectCount; i++) {
        const angle = (Math.PI * 2 * i) / effectCount + (Math.random() - 0.5) * 0.3;
        const radius = 60 * radiusMultiplier + Math.random() * 20 * radiusMultiplier;
        evaporationEffects.push({
            x: x + Math.cos(angle) * radius,
            y: y + Math.sin(angle) * radius,
            vx: Math.cos(angle) * 0.3,
            vy: Math.sin(angle) * 0.3,
            life: 16,
            alpha: 0.8,
            size: 4 + Math.random() * 3,
            color: '#ff9900'
        });
    }
}

function spawnBombFragmentCountEffect(count = 2) {
    if (!player || player.bombFragmentCountBonus <= 0) return;
    spawnEvaporationEffect(player.x + player.width / 2, player.y + player.height / 2, '#ffdd66', 18, Math.min(12, 4 + count * 2));
}

function spawnCasterPortalEffect(x, y, color = '#6ef2ff') {
    portalEffects.push({
        x,
        y,
        radius: 2,
        maxRadius: 24 + Math.random() * 10,
        life: 26,
        maxLife: 26,
        alpha: 1,
        pulse: Math.random() * Math.PI * 2,
        color
    });
}

function triggerShooterMachineGun() {
    if (!player || !currentMonster || !player.shooterMachineGunUnlocked) return;
    const gunX = player.x + player.width / 2;
    const gunY = player.y + player.height / 2;
    const preferred = getPreferredTarget();
    const targetX = preferred.x || (currentMonster ? currentMonster.x + currentMonster.width / 2 : gunX + 200);
    const targetY = preferred.y || (currentMonster ? currentMonster.y + currentMonster.height / 2 : gunY);
    const gunDamage = Math.max(1, Math.round((player.weapon && player.weapon.damage ? player.weapon.damage : 2) + player.baseDamage + player.weaponDamage));

    for (let i = 0; i < 4; i++) {
        const spread = (Math.random() - 0.5) * 0.25;
        const angle = Math.atan2(targetY - gunY, targetX - gunX) + spread;
        const projectileTargetX = gunX + Math.cos(angle) * 280;
        const projectileTargetY = gunY + Math.sin(angle) * 280;
        spawnPlayerProjectile(gunX, gunY, projectileTargetX, projectileTargetY, gunDamage, '#ffaa33', 8.5, {
            style: 'gunBullet',
            size: 8,
            maxDistance: 900
        });
    }
    machineGunEffects.push({ x: gunX, y: gunY, life: 10, alpha: 0.8, color: '#ffaa33' });
}

function triggerSwarmNube() {
    if (!player || !currentMonster || !player.swarmNubeUnlocked) return;
    const nubeX = player.x + player.width / 2;
    const nubeY = player.y + player.height / 2;
    const preferred = getPreferredTarget();
    const targetX = preferred.x || (currentMonster ? currentMonster.x + currentMonster.width / 2 : nubeX + 200);
    const targetY = preferred.y || (currentMonster ? currentMonster.y + currentMonster.height / 2 : nubeY);
    const nubeDamage = Math.max(1, Math.round((player.weapon && player.weapon.damage ? player.weapon.damage : 2) + player.baseDamage + player.weaponDamage));

    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 * i) / 6 + Math.atan2(targetY - nubeY, targetX - nubeX);
        const projectileTargetX = nubeX + Math.cos(angle) * 220;
        const projectileTargetY = nubeY + Math.sin(angle) * 220;
        spawnPlayerProjectile(nubeX, nubeY, projectileTargetX, projectileTargetY, nubeDamage, '#9c4fff', 7, {
            style: 'swarmPod',
            size: 7,
            maxDistance: 800,
            noBounce: true
        });
    }
}

function triggerCasterPortalBurst() {
    if (!player || !currentMonster || !player.casterPortalUnlocked) return;
    const portalX = player.x + player.width / 2;
    const portalY = player.y + player.height / 2 - 16;
    spawnCasterPortalEffect(portalX, portalY, '#70e7ff');
    spawnEvaporationEffect(portalX, portalY, '#70e7ff', 24, 14);
    const preferred = getPreferredTarget();
    const targetX = preferred.x || (currentMonster ? currentMonster.x + currentMonster.width / 2 : portalX + 200);
    const targetY = preferred.y || (currentMonster ? currentMonster.y + currentMonster.height / 2 : portalY);
    const portalDamage = Math.max(2, Math.round((player.weapon && player.weapon.damage ? player.weapon.damage : 2) + player.baseDamage + player.weaponDamage));

    for (let i = 0; i < 3; i++) {
        const spread = (i - 1) * 0.18;
        const angle = Math.atan2(targetY - portalY, targetX - portalX) + spread;
        const projectileTargetX = portalX + Math.cos(angle) * 220;
        const projectileTargetY = portalY + Math.sin(angle) * 220;
        spawnPlayerProjectile(portalX, portalY, projectileTargetX, projectileTargetY, portalDamage, '#70e7ff', 9.2, {
            style: 'casterBurst',
            size: 12,
            maxDistance: 900,
            afterImageTrail: true,
            afterImageInterval: 2,
            ignoreHurricanePull: true,
            skipHurricaneRemoval: true
        });
    }
}

function triggerAvianTracker() {
    if (!player || !currentMonster || !player.avianTrackerUnlocked) return;
    const trackerX = player.x + player.width / 2;
    const trackerY = player.y + player.height / 2;
    const trackerDamage = Math.max(2, Math.round((player.weapon && player.weapon.damage ? player.weapon.damage : 2) + player.baseDamage + player.weaponDamage));

    for (let i = 0; i < 2; i++) {
        const angle = (Math.PI * i);
        const projectileTargetX = trackerX + Math.cos(angle) * 300;
        const projectileTargetY = trackerY + Math.sin(angle) * 300;
        trackerProjectiles.push({
            x: trackerX,
            y: trackerY,
            targetX: currentMonster.x + currentMonster.width / 2,
            targetY: currentMonster.y + currentMonster.height / 2,
            vx: Math.cos(angle) * 5.5,
            vy: Math.sin(angle) * 5.5,
            damage: trackerDamage,
            color: '#ff88cc',
            size: 10,
            maxDistance: 1000,
            distanceTraveled: 0,
            life: 200
        });
    }
}

function triggerSmartRicochet() {
    if (!player || !currentMonster || !player.smartRicochetUnlocked) return;
    const ricochetX = player.x + player.width / 2;
    const ricochetY = player.y + player.height / 2;
    const targetX = currentMonster.x + currentMonster.width / 2;
    const targetY = currentMonster.y + currentMonster.height / 2;
    const ricochetDamage = Math.max(2, Math.round((player.weapon && player.weapon.damage ? player.weapon.damage : 2) + player.baseDamage + player.weaponDamage));

    const angle = Math.atan2(targetY - ricochetY, targetX - ricochetX);
    const projectileTargetX = ricochetX + Math.cos(angle) * 300;
    const projectileTargetY = ricochetY + Math.sin(angle) * 300;
    spawnPlayerProjectile(ricochetX, ricochetY, projectileTargetX, projectileTargetY, ricochetDamage, '#88ff88', 9, {
        style: 'gunBullet',
        size: 11,
        maxDistance: 1200,
        ricochet: true,
        ricochetCount: 2
    });
}

function triggerSimpleExplosive() {
    if (!player || !currentMonster || !player.simpleExplosiveUnlocked) return;
    const explosiveX = player.x + player.width / 2;
    const explosiveY = player.y + player.height / 2;
    const targetX = currentMonster.x + currentMonster.width / 2;
    const targetY = currentMonster.y + currentMonster.height / 2;
    const explosiveDamage = Math.max(3, Math.round((player.weapon && player.weapon.damage ? player.weapon.damage : 2) + player.baseDamage + player.weaponDamage + 1));

    const angle = Math.atan2(targetY - explosiveY, targetX - explosiveX);
    const projectileTargetX = explosiveX + Math.cos(angle) * 300;
    const projectileTargetY = explosiveY + Math.sin(angle) * 300;
    spawnPlayerProjectile(explosiveX, explosiveY, projectileTargetX, projectileTargetY, explosiveDamage, '#ff6644', 10, {
        style: 'gunBullet',
        size: 13,
        maxDistance: 900,
        explosive: true,
        explosiveRadius: 60
    });
}

function triggerCrocFreezer() {
    if (!player || !currentMonster || !player.crocFreezerUnlocked) return;
    const freezerX = player.x + player.width / 2;
    const freezerY = player.y + player.height / 2;
    const targetX = currentMonster.x + currentMonster.width / 2;
    const targetY = currentMonster.y + currentMonster.height / 2;
    const freezerDamage = Math.max(1, Math.round((player.weapon && player.weapon.damage ? player.weapon.damage : 2) + player.baseDamage + player.weaponDamage));

    const angle = Math.atan2(targetY - freezerY, targetX - freezerX);
    const projectileTargetX = freezerX + Math.cos(angle) * 280;
    const projectileTargetY = freezerY + Math.sin(angle) * 280;
    spawnPlayerProjectile(freezerX, freezerY, projectileTargetX, projectileTargetY, freezerDamage, '#55ddff', 9, {
        style: 'gunBullet',
        size: 10,
        maxDistance: 800,
        freezer: true,
        freezeDuration: 45
    });
}

function triggerTankImpulse() {
    if (!player || !currentMonster || !player.tankImpulseUnlocked) return;
    const impulseX = player.x + player.width / 2;
    const impulseY = player.y + player.height / 2;
    const targetX = currentMonster.x + currentMonster.width / 2;
    const targetY = currentMonster.y + currentMonster.height / 2;
    const impulseDamage = Math.max(3, Math.round((player.weapon && player.weapon.damage ? player.weapon.damage : 2) + player.baseDamage + player.weaponDamage + 1));

    const angle = Math.atan2(targetY - impulseY, targetX - impulseX);
    const projectileTargetX = impulseX + Math.cos(angle) * 250;
    const projectileTargetY = impulseY + Math.sin(angle) * 250;
    spawnPlayerProjectile(impulseX, impulseY, projectileTargetX, projectileTargetY, impulseDamage, '#ff3333', 11, {
        style: 'gunBullet',
        size: 14,
        maxDistance: 850,
        knockback: true,
        knockbackPower: 8
    });
}

function updatePortalEffects() {
    for (let i = portalEffects.length - 1; i >= 0; i--) {
        const effect = portalEffects[i];
        effect.life -= 1;
        effect.pulse += 0.18;
        effect.radius = Math.max(0, (effect.maxRadius * (1 - effect.life / effect.maxLife)) + Math.sin(effect.pulse) * 1.2);
        effect.alpha = Math.max(0, effect.life / effect.maxLife);
        if (effect.life <= 0 || effect.alpha <= 0) {
            portalEffects.splice(i, 1);
        }
    }
}

function drawPortalEffects() {
    for (const effect of portalEffects) {
        ctx.save();
        ctx.globalAlpha = effect.alpha * 0.95;
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 2.8;
        ctx.shadowColor = effect.color;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = effect.alpha * 0.35;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

function spawnEvaporationForProjectile(proj) {
    spawnEvaporationEffect(proj.x, proj.y, proj.color, proj.size, 10);
}

function updateTrackerProjectiles() {
    for (let i = trackerProjectiles.length - 1; i >= 0; i--) {
        const tracker = trackerProjectiles[i];
        tracker.life--;
        tracker.distanceTraveled += Math.hypot(tracker.vx, tracker.vy);
        if (currentMonster) {
            tracker.targetX = currentMonster.x + currentMonster.width / 2;
            tracker.targetY = currentMonster.y + currentMonster.height / 2;
        }
        const dx = tracker.targetX - tracker.x;
        const dy = tracker.targetY - tracker.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0) {
            const turnSpeed = 0.08;
            const targetAngle = Math.atan2(dy, dx);
            const currentAngle = Math.atan2(tracker.vy, tracker.vx);
            let angleDiff = targetAngle - currentAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            const newAngle = currentAngle + angleDiff * turnSpeed;
            const speed = Math.hypot(tracker.vx, tracker.vy);
            tracker.vx = Math.cos(newAngle) * speed;
            tracker.vy = Math.sin(newAngle) * speed;
        }
        tracker.x += tracker.vx;
        tracker.y += tracker.vy;

        if (currentMonster && Math.hypot(tracker.x - currentMonster.x - currentMonster.width / 2, tracker.y - currentMonster.y - currentMonster.height / 2) < currentMonster.width / 2 + tracker.size) {
            currentMonster.health -= tracker.damage;
            spawnEvaporationEffect(tracker.x, tracker.y, tracker.color, tracker.size, 8);
            trackerProjectiles.splice(i, 1);
            continue;
        }

        if (tracker.life <= 0 || tracker.distanceTraveled > tracker.maxDistance) {
            trackerProjectiles.splice(i, 1);
        }
    }
}

function drawTrackerProjectiles() {
    for (const tracker of trackerProjectiles) {
        ctx.save();
        ctx.fillStyle = tracker.color;
        ctx.globalAlpha = Math.max(0, tracker.life / 200 * 0.9);
        ctx.shadowColor = tracker.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(tracker.x, tracker.y, tracker.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }
}

function spawnTornadoHitEffect(x, y, color) {
    spawnEvaporationEffect(x, y, color, 22, 16);
    for (let i = 0; i < 4; i++) {
        spawnAfterImage({
            kind: 'player',
            x: x + (Math.random() - 0.5) * 18,
            y: y + (Math.random() - 0.5) * 18,
            width: 10,
            height: 10,
            life: 14,
            maxLife: 14,
            baseAlpha: 0.2
        });
    }
}

function handleParryProjectile(proj) {
    if (!proj || proj.parried) return;
    proj.parried = true;
        if (player.parryHealOnUse > 0) {
            const healAmount = player.health * (player.parryHealOnUse / 100);
            player.health = Math.min(player.maxHealth, player.health + healAmount);
        }
        if (player.parryHealOverTime > 0) {
            player.parryHealOverTimeTimer = 180;
        }
    proj.owner = 'player';
    const currentSpeed = Math.hypot(proj.vx || 0, proj.vy || 0) || 3;
    const speed = currentSpeed * 5.0; // increased parry speed
    let targetX, targetY;
    if (currentMonster) {
        targetX = currentMonster.x + currentMonster.width / 2;
        targetY = currentMonster.y + currentMonster.height / 2;
    } else {
        // reflect roughly in opposite direction
        targetX = proj.x - (proj.vx || 0) * 6;
        targetY = proj.y - (proj.vy || 0) * 6;
    }
    const dx = targetX - proj.x;
    const dy = targetY - proj.y;
    const dist = Math.hypot(dx, dy) || 1;
    proj.vx = (dx / dist) * speed;
    proj.vy = (dy / dist) * speed;
    proj.color = '#ffffff';
    proj.size = Math.max(proj.size, 8);
    proj.damage = Math.max(1, Math.round((proj.damage || 1) * 2.2)); // increased parry damage
    proj.style = proj.style || 'gunBullet';
    proj.hitTarget = false;
    proj.immortal = false;
    proj.afterImageTrail = true;
    proj.afterImageInterval = 1;
    proj.afterImageTimer = 1;
    spawnAfterImage({
        kind: 'projectile',
        x: proj.x,
        y: proj.y,
        size: proj.size,
        color: proj.color,
        style: proj.style,
        life: 10,
        maxLife: 10,
        baseAlpha: 0.4
    });
    spawnEvaporationForProjectile(proj);
    // allow this parried projectile to destroy other enemy projectiles on touch
    proj.canDestroyOnTouch = true;
    // Freeze everything visually for 1 frame to emphasize parry, but avoid the white flash inside constructions
    if (!playerInsideConstruction) {
        frameFreeze = 2;
    }
}

function drawEvaporationEffects() {
    for (let effect of evaporationEffects) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, effect.alpha);
        ctx.fillStyle = effect.color;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function updateEvaporationEffects() {
    for (let i = evaporationEffects.length - 1; i >= 0; i--) {
        const effect = evaporationEffects[i];
        effect.x += effect.vx;
        effect.y += effect.vy;
        effect.life -= 1;
        effect.alpha = Math.max(0, effect.life / 40);
        effect.size *= 0.96;
        if (effect.life <= 0 || effect.alpha <= 0) {
            evaporationEffects.splice(i, 1);
        }
    }
}

function updateAndDrawSwarmMarks() {
    for (let i = swarmMarks.length - 1; i >= 0; i--) {
        const mark = swarmMarks[i];
        
        // Desenhar a marca
        const mouthWidth = mark.radius * 2.6;
        const mouthHeight = mark.radius * 1.25;
        const leftX = mark.x - mouthWidth / 2;
        const rightX = mark.x + mouthWidth / 2;
        const lipHeight = mouthHeight * 0.55;

        ctx.save();
        ctx.translate(mark.x, mark.y);
        ctx.rotate(Math.sin(performance.now() * 0.008) * 0.1);
        ctx.translate(-mark.x, -mark.y);

        // Colmeia de vespa maior e cinza
        ctx.fillStyle = 'rgba(140, 140, 140, 0.96)';
        ctx.beginPath();
        ctx.ellipse(mark.x, mark.y, mouthWidth / 2, mouthHeight / 2, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(55, 55, 55, 0.92)';
        ctx.beginPath();
        ctx.ellipse(mark.x, mark.y + mouthHeight * 0.1, mouthWidth / 2.4, mouthHeight / 2.6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Células de colmeia internas em cinza escuro
        const hexR = mouthWidth * 0.12;
        const hexH = Math.sqrt(3) * hexR;
        const startX = mark.x - hexR * 2.8;
        const startY = mark.y - hexH * 0.5;
        ctx.fillStyle = 'rgba(120, 120, 120, 0.95)';
        ctx.strokeStyle = 'rgba(180, 180, 180, 0.45)';
        ctx.lineWidth = 1.5;
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 6; col++) {
                const x = startX + col * hexR * 1.75 + (row % 2 ? hexR * 0.88 : 0);
                const y = startY + row * hexH * 0.95;
                const dx = x - mark.x;
                const dy = y - mark.y * 0.1;
                if (Math.hypot(dx, dy) < mouthWidth * 0.66) {
                    ctx.beginPath();
                    for (let side = 0; side < 6; side++) {
                        const angle = Math.PI / 3 * side + Math.PI / 6;
                        const px = x + Math.cos(angle) * hexR;
                        const py = y + Math.sin(angle) * hexR;
                        if (side === 0) ctx.moveTo(px, py);
                        else ctx.lineTo(px, py);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                }
            }
        }

        // Superfície circular da colmeia com detalhes sutis
        const circleGrad = ctx.createRadialGradient(mark.x, mark.y, mouthWidth * 0.18, mark.x, mark.y, mouthWidth * 0.55);
        circleGrad.addColorStop(0, 'rgba(170, 170, 170, 0.96)');
        circleGrad.addColorStop(1, 'rgba(100, 100, 100, 0.92)');
        ctx.fillStyle = circleGrad;
        ctx.beginPath();
        ctx.arc(mark.x, mark.y, mouthWidth * 0.45, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(85, 85, 85, 0.9)';
        ctx.beginPath();
        ctx.arc(mark.x, mark.y, mouthWidth * 0.33, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(220, 220, 220, 0.3)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(mark.x, mark.y, mouthWidth * 0.48, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(160, 160, 160, 0.25)';
        ctx.lineWidth = 2;
        for (let t = 0; t < 6; t++) {
            const theta = Math.PI * 2 * t / 6;
            ctx.beginPath();
            ctx.moveTo(mark.x, mark.y);
            ctx.lineTo(mark.x + Math.cos(theta) * mouthWidth * 0.45, mark.y + Math.sin(theta) * mouthWidth * 0.45);
            ctx.stroke();
        }
        ctx.restore();
    }
}

function getPlayerProjectileStyle(weaponType) {
    switch (weaponType) {
        case 'bow':
            return 'bowArrow';
        case 'gun':
            return 'gunBullet';
        case 'staff':
            return 'staffOrb';
        case 'cone':
            return 'coneShard';
        default:
            return 'basicFire';
    }
}

function getProjectileDefaultSize(style) {
    switch (style) {
        case 'bowArrow':
            return 8;
        case 'gunBullet':
            return 7;
        case 'yarnBall':
            return 12;
        case 'staffOrb':
            return 14;
        case 'coneShard':
            return 18;
        case 'spinAttack':
            return 16;
        case 'shooterBolt':
            return 10;
        case 'tankShell':
            return 14;
        case 'swarmPod':
            return 10;
        case 'casterShard':
            return 12;
        case 'casterBurst':
            return 14;
        case 'casterFlameCircle':
            return 16;
        case 'casterFlameSpiral':
            return 16;
        case 'casterFlameRing':
            return 16;
        case 'casterFlameVolley':
            return 16;
        case 'basicFire':
            return 11;
        case 'crowBolt':
            return 16;
        case 'smartBolt':
            return 14;
        case 'toothBolt':
            return 18;
        default:
            return 10;
    }
}

function getMonsterProjectileStyle(monsterType) {
    switch (monsterType) {
        case 'shooter':
            return 'shooterBolt';
        case 'tank':
            return 'tankShell';
        case 'swarm':
            return 'swarmBug';
        case 'caster':
            return 'casterBurst';
        case 'avianightmare':
            return 'crowBolt';
        case 'smart':
            return 'smartBolt';
        default:
            return 'basicFire';
    }
}

function spawnPlayerProjectile(x, y, targetX, targetY, damage, color, speed, opts = {}) {
    const playerScale = getPlayerInteriorScale();
    opts.style = opts.style || getPlayerProjectileStyle(player.weapon ? player.weapon.type : '');
    if (opts.style === 'staffOrb') {
        opts.afterImageTrail = true;
        opts.afterImageInterval = opts.afterImageInterval || 3;
        if (typeof opts.homing !== 'boolean') {
            opts.homing = true;
        }
        if (typeof opts.homingStrength !== 'number') {
            opts.homingStrength = 0.16;
        }
        if (typeof opts.homingDuration !== 'number') {
            opts.homingDuration = 220;
        }
    }
    // Escalar a distância máxima de jogador dentro do castelo para manter projéteis menores
    if (typeof opts.maxDistance === 'number') {
        opts.maxDistance *= playerScale;
    }
    // Se for orb da staff e não vier com bypass, converte em carga quando já existem 5
    if (opts.style === 'staffOrb' && !opts.bypassStaffCap) {
        const staffCount = projectiles.filter(p => p.owner === 'player' && p.style === 'staffOrb').length;
        if (staffCount >= 5) {
            // garantir player inicializado
            if (typeof player !== 'undefined' && player) {
                if (player.staffBurstCooldown > 0) {
                    return null;
                }
                player.staffCharge = (player.staffCharge || 0) + 1;
                if (player.staffCharge > (player.staffChargeMax || 15)) player.staffCharge = player.staffChargeMax || 15;
                console.log('spawnPlayerProjectile: incremented staffCharge ->', player.staffCharge);
                // atualizar barra imediata
                try {
                    const fill = document.getElementById('cooldownBarFill');
                    if (fill) fill.style.width = `${Math.max(0, Math.min(1, (player.staffCharge || 0) / (player.staffChargeMax || 15))) * 100}%`;
                } catch (e) {}

                // quando a barra encher, soltar pequenos projéteis rápidos
                if (player.staffCharge >= (player.staffChargeMax || 15)) {
                    player.staffCharge = 0;
                    player.staffBurstCooldown = player.staffBurstCooldownMax || 120;
                    console.log('spawnPlayerProjectile: staffCharge full, releasing burst');
                    const staffMount = player.getWeaponMountPoint();
                    const centerX = staffMount.tipX;
                    const centerY = staffMount.tipY;
                    const miniDamage = Math.max(1, Math.round(damage * 0.5));
                    const miniSpeed = (speed || 12) * 3;
                    const burstCount = player.staffChargeBurstCount || 5;
                    spawnStaffBurst(centerX, centerY, color, miniDamage, miniSpeed, burstCount);
                }
            }
            // não spawnar o orb original (foi convertido em carga)
            return null;
        }
    }
    const size = (opts.size || getProjectileDefaultSize(opts.style)) * playerScale;
    // Allow callers to force an override speed via `opts._overrideSpeed` (used by bow ricochet companion)
    const spawnSpeed = (typeof opts._overrideSpeed === 'number' ? opts._overrideSpeed : speed) * playerScale;
    const proj = new Projectile(x, y, targetX, targetY, damage, color, spawnSpeed, 'player', size, opts);
    proj.critPercent = opts.critPercent || 0;
    if (opts.ricochetActive) {
        proj.destroyRadius = opts.destroyRadius || 28;
        proj.destroyOnContact = true;
    }
    if (proj.style === 'bowArrow') {
        if (!opts.ricochetCompanion) {
            const shouldRicochet = (player.bowRicochet || 0) > 0;
            if (shouldRicochet) {
                proj.ricochetActive = true;
                proj.ricochetCount = player.bowRicochet || 0;
                proj.afterImageTrail = true;
                proj.afterImageInterval = 1;

                const fireAngle = Math.atan2(targetY - y, targetX - x);
                const baseDistance = Math.max(5, (opts.size || getProjectileDefaultSize('bowArrow')) * 1.8);
                const companionCount = player.bowRicochet || 0;
                const extraSpeed = (speed || 12) * 6.0;

                for (let companionIndex = 0; companionIndex < companionCount; companionIndex++) {
                    const angleOffset = (companionIndex - (companionCount - 1) / 2) * 0.18;
                    const companionX = x + Math.cos(fireAngle + angleOffset) * baseDistance;
                    const companionY = y + Math.sin(fireAngle + angleOffset) * baseDistance;

                    const companionOpts = {
                        ...opts,
                        ricochetCompanion: true,
                        style: 'bowArrow'
                    };
                    companionOpts.critPercent = opts.critPercent || 0;
                    companionOpts.size = opts.size || getProjectileDefaultSize('bowArrow');
                    companionOpts.ricochetActive = true;
                    companionOpts.ricochetCount = player.bowRicochet || 0;
                    companionOpts.homing = true;
                    companionOpts.homingStrength = 0.96;
                    companionOpts.homingDuration = 360;
                    companionOpts.afterImageTrail = true;
                    companionOpts.afterImageInterval = 1;
                    try {
                        const playerCenterX = (player.x || 0) + (player.width || 0) / 2;
                        const playerCenterY = (player.y || 0) + (player.height || 0) / 2;
                        let best = null;
                        let bestDist = Infinity;
                        for (let i = 0; i < projectiles.length; i++) {
                            const q = projectiles[i];
                            if (!q || q.owner !== 'monster') continue;
                            const dxq = q.x - playerCenterX;
                            const dyq = q.y - playerCenterY;
                            const d = Math.hypot(dxq, dyq);
                            if (d < bestDist) {
                                bestDist = d;
                                best = q;
                            }
                        }
                        if (best) companionOpts.homingTarget = best;
                    } catch (e) {}
                    companionOpts._overrideSpeed = extraSpeed;
                    spawnPlayerProjectile(companionX, companionY, targetX, targetY, damage, color, speed, companionOpts);
                }
            } else {
                proj.ricochetActive = false;
                proj.ricochetCount = 0;
            }
        } else {
            // If this is a companion, respect any ricochet flags passed in opts
            proj.ricochetActive = typeof opts.ricochetActive === 'boolean' ? opts.ricochetActive : false;
            proj.ricochetCount = opts.ricochetCount || 0;
            if (proj.ricochetActive) {
                proj.afterImageTrail = true;
                proj.afterImageInterval = typeof opts.afterImageInterval === 'number' ? opts.afterImageInterval : 1;
            }
        }
        
        // Tiro Certeiro: primeiro tiro contra o monstro tem bonus de crit
        if (player.bowFirstShot > 0 && !player.bowFirstShotUsed) {
            proj.critChanceBonus = (proj.critChanceBonus || 0) + player.bowFirstShot;
            player.bowFirstShotUsed = true;
        }
        
        // Postura Firme: quando parado, bonus de crit chance e dano
        const isMoving = (keys['d'] || keys['arrowright'] || keys['a'] || keys['arrowleft'] || 
                          keys['s'] || keys['arrowdown'] || keys['w'] || keys['arrowup']);
        if (player.bowReadyStance > 0 && !isMoving) {
            proj.critChanceBonus = (proj.critChanceBonus || 0) + player.bowReadyStance;
            proj.critDamageMultiplier = (proj.critDamageMultiplier || 1) * 1.25;
        }
    }
    if (opts.hurricaneBoosted) {
        proj.hurricaneBoosted = true;
        proj.maxDistance *= 1.25;
        proj.vx *= 1.18;
        proj.vy *= 1.18;
        proj.speed *= 1.18;
        proj.critChanceMultiplier = (proj.critChanceMultiplier || 1) * 1.25;
        proj.critDamageMultiplier = (proj.critDamageMultiplier || 1) * 1.25;
        proj.damage = Math.max(1, Math.round(proj.damage * 1.15));
    }
    if (opts.homing) {
        proj.homing = true;
        if (opts.homingTarget) {
            proj.homingTarget = opts.homingTarget;
        } else if (playerInsideConstruction) {
            proj.homingTarget = getCastleOrCurrentHomingTarget();
        } else {
            proj.homingTarget = currentMonster;
        }
        proj.homingStrength = typeof opts.homingStrength === 'number' ? opts.homingStrength : 0.06;
    }
    if (opts.ignoreHurricanePull) {
        proj.ignoreHurricanePull = true;
    }
    if (opts.skipHurricaneRemoval) {
        proj.skipHurricaneRemoval = true;
    }
    projectiles.push(proj);
    return proj;
}

function spawnCasterProjectileBurst(proj) {
    if (!proj || proj._casterBurstTriggered) return;
    proj._casterBurstTriggered = true;

    const burstCount = Math.max(3, Math.min(6, Math.round((proj.size || 12) / 3)));
    const burstRadius = Math.max(16, (proj.size || 12) * 0.85);
    spawnEvaporationEffect(proj.x, proj.y, '#ffb14a', burstRadius, 8);

    for (let i = 0; i < burstCount; i++) {
        const angle = (Math.PI * 2 * i) / burstCount + Math.random() * 0.2;
        const targetX = proj.x + Math.cos(angle) * (80 + Math.random() * 60);
        const targetY = proj.y + Math.sin(angle) * (80 + Math.random() * 60);
        const shardDamage = Math.max(1, Math.round((proj.damage || 2) * 0.35));
        spawnMonsterProjectile(
            proj.x,
            proj.y,
            targetX,
            targetY,
            shardDamage,
            '#ff9e3c',
            2.2 + Math.random() * 1.2,
            {
                monsterType: proj.monsterType || 'caster',
                size: Math.max(5, Math.round((proj.size || 12) * 0.45)),
                style: 'casterShard',
                homing: true,
                homingTarget: player,
                homingStrength: 0.18,
                homingDuration: 48,
                maxDistance: 220,
                afterImageTrail: false
            }
        );
    }
}

function spawnMonsterProjectile(x, y, targetX, targetY, damage, color, speed, opts = {}) {
    opts.monsterType = opts.monsterType || currentMonster?.type || '';
    opts.style = opts.style || getMonsterProjectileStyle(opts.monsterType);
    const isCasterProjectile = opts.monsterType === 'caster' || opts.style === 'casterFlameCircle' || opts.style === 'casterFlameSpiral' || opts.style === 'casterFlameRing' || opts.style === 'casterFlameVolley' || opts.style === 'casterBurst' || opts.style === 'casterShard';
    const isCircleCasterAttack = opts.style === 'casterFlameCircle' || opts.style === 'casterFlameSpiral' || opts.style === 'casterFlameRing';
    if (isCasterProjectile) {
        opts.afterImageTrail = typeof opts.afterImageTrail === 'boolean' ? opts.afterImageTrail : true;
        opts.afterImageInterval = typeof opts.afterImageInterval === 'number' ? opts.afterImageInterval : (isCircleCasterAttack ? 5 : 2);
        opts.homing = typeof opts.homing === 'boolean' ? opts.homing : (isCircleCasterAttack ? false : true);
        opts.homingStrength = typeof opts.homingStrength === 'number' ? opts.homingStrength : 0.035;
        opts.homingDuration = typeof opts.homingDuration === 'number' ? opts.homingDuration : 90;
        opts.maxDistance = typeof opts.maxDistance === 'number' ? opts.maxDistance : 980;
    }
    // Garantir que projéteis de monstros usem o timer offscreen (padrão 60 frames)
    if (typeof opts.offscreenLimit !== 'number') opts.offscreenLimit = 60;
    const size = opts.size || getProjectileDefaultSize(opts.style);
    const proj = new Projectile(x, y, targetX, targetY, damage, color, speed, 'monster', size, opts);
    if (opts.homing) {
        proj.homing = true;
        proj.homingTarget = opts.homingTarget || player;
        proj.homingStrength = typeof opts.homingStrength === 'number' ? opts.homingStrength : 0.06;
    }
    projectiles.push(proj);
    return proj;
}

function spawnStaffBurst(centerX, centerY, color, miniDamage, miniSpeed, burstCount) {
    // Visuals: big evaporation + player afterimage + small frame freeze
    try { spawnEvaporationEffect(centerX, centerY, color, 28, Math.max(12, burstCount * 3)); } catch (e) {}
    try { spawnAfterImage({ kind: 'player', x: player.x, y: player.y, width: player.width, height: player.height, life: 22, maxLife: 22, baseAlpha: 0.6 }); } catch (e) {}
    frameFreeze = Math.max(frameFreeze || 0, 3);

    const playerScale = getPlayerInteriorScale();
    const baseDefault = getProjectileDefaultSize('staffOrb');
    const burstColors = ['#ff4cff', '#ff95ff', '#ff2fd4', '#ff7bff', '#d95bff', '#ff66d9'];
    for (let b = 0; b < burstCount; b++) {
        const angle = Math.random() * Math.PI * 2;
        const range = (420 + Math.random() * 280) * playerScale;
        const tx = centerX + Math.cos(angle) * range;
        const ty = centerY + Math.sin(angle) * range;
        const projColor = burstColors[b % burstColors.length];
        const opts = {
            bypassStaffCap: true,
            size: Math.max(8, Math.floor(baseDefault * (0.9 + Math.random() * 0.6))),
            rotationSpeed: (Math.random() - 0.5) * 0.6,
            homing: true,
            homingStrength: 0.62 + 0.18 * (player.staffHomingBurst || 0),
            homingDuration: 120 + 30 * (player.staffHomingBurst || 0),
            maxDistance: 1100 * playerScale
        };
        const castleTarget = getCastleOrCurrentHomingTarget();
        if (castleTarget) {
            opts.homingTarget = castleTarget;
        }
        const proj = spawnPlayerProjectile(centerX, centerY, tx, ty, miniDamage, projColor, miniSpeed * (1.2 + Math.random() * 0.6), opts);
        if (proj) {
            proj.vx *= 1.3 + Math.random() * 0.4;
            proj.vy *= 1.3 + Math.random() * 0.4;
            proj.rotationSpeed = opts.rotationSpeed || proj.rotationSpeed;
            try { spawnEvaporationEffect(proj.x, proj.y, proj.color, proj.size * 0.6, 6); } catch (e) {}
        }
    }
}


function spawnTornadoHurricane() {
    projectiles = projectiles.filter(proj => proj.style !== 'tornadoHurricane');
    const x = player.x + player.width / 2;
    const y = player.y + player.height / 2;
    // Escolher alvo apropriado dependendo se o jogador está no interior do castelo
    const preferred = getPreferredTarget();
    const targetX = preferred.x || (x + 120);
    const targetY = preferred.y || y;
    const hurricaneTarget = getCastleOrCurrentHomingTarget();
    const proj = new Projectile(x, y, targetX, targetY, 0, '#76d7ff', 3, 'player', 42, {
        style: 'tornadoHurricane',
        ignoreCollision: true,
        homing: true,
        homingTarget: hurricaneTarget,
        homingStrength: 0.38,
        homingDuration: 300,
            lifetime: 550,
        immortal: false,
        rotationSpeed: 0.15,
        pullStrength: 0.2,
        pullRadius: 280,
        boostRadius: 88,
        maxDistance: 10000
    });
    if (proj.vx === 0 && proj.vy === 0) {
        proj.vx = 3;
        proj.vy = 0;
        proj.savedVx = proj.vx;
        proj.savedVy = proj.vy;
    }
    projectiles.push(proj);
    // Activate hurricane cooldown immediately when spawned
    if (player) {
        player.hurricaneCooldown = player.hurricaneCooldownMax || 360;
        updateCooldownBar();
    }
    return proj;
}

function spawnTankCounterAttack() {
    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    const distance = 240;
    const speed = 4.5;
    const delayFrames = 66; // 0.6 segundos a 60 fps
    
    // Direções dos 4 projéteis (cima, direita, baixo, esquerda) com variação diagonal
    const baseDirections = [
        { x: 0, y: -1 },    // Cima
        { x: 1, y: 0 },     // Direita
        { x: 0, y: 1 },     // Baixo
        { x: -1, y: 0 }     // Esquerda
    ];
    
    for (let dir of baseDirections) {
        // Adicionar variação diagonal aleatória (-0.4 a 0.4 em cada eixo)
        const diagonalX = dir.x + (Math.random() - 0.5) * 0.8;
        const diagonalY = dir.y + (Math.random() - 0.5) * 0.8;
        
        const spawnX = playerCenterX + diagonalX * distance;
        const spawnY = playerCenterY + diagonalY * distance;
        
        // Inverter direção: projéteis vêm em direção ao jogador (negativo)
        const targetX = spawnX - diagonalX * 200;
        const targetY = spawnY - diagonalY * 200;
        
        const proj = new Projectile(spawnX, spawnY, targetX, targetY, 8, '#ffdc66', speed, 'tankCounter', 10, {
            delayTimer: delayFrames,
            delayDuration: delayFrames,
            style: 'tankCounter',
            maxDistance: 520
        });
        projectiles.push(proj);
    }
}

function drawCritEffects() {
    for (let i = critEffects.length - 1; i >= 0; i--) {
        const effect = critEffects[i];
        effect.y -= 0.75;
        effect.rise += 0.75;
        effect.alpha -= 0.015;
        if (effect.alpha <= 0) {
            critEffects.splice(i, 1);
            continue;
        }

        ctx.globalAlpha = effect.alpha;
        ctx.fillStyle = '#ffff66';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(effect.text, effect.x, effect.y);
        ctx.globalAlpha = 1;
    }
}

function spawnSweatEffect(x, y) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
    const speed = 0.8 + Math.random() * 1.4;
    const lifeFrames = 12; // ~0.2 segundos em 60fps
    sweatEffects.push({
        x,
        y,
        vx: Math.cos(angle) * speed * 0.35,
        vy: Math.sin(angle) * speed * 0.55 - 0.2,
        life: lifeFrames,
        maxLife: lifeFrames,
        alpha: 1,
        size: 22 + Math.random() * 10,
        text: '💦',
        wobble: Math.random() * 0.08
    });
}

function updateSweatEffects() {
    for (let i = sweatEffects.length - 1; i >= 0; i--) {
        const effect = sweatEffects[i];
        effect.x += effect.vx;
        effect.y += effect.vy;
        effect.vy += 0.02;
        effect.life -= 1;
        effect.alpha = Math.max(0, effect.life / effect.maxLife);
        effect.size *= 0.995;
        effect.wobble += 0.04;
        if (effect.life <= 0 || effect.alpha <= 0) {
            sweatEffects.splice(i, 1);
        }
    }
}

function drawSweatEffects() {
    for (let effect of sweatEffects) {
        ctx.save();
        ctx.globalAlpha = effect.alpha;
        ctx.fillStyle = '#82d2ff';
        ctx.font = `bold ${Math.round(effect.size)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const x = effect.x + Math.sin(effect.wobble) * 2;
        const y = effect.y + Math.cos(effect.wobble) * 2;
        ctx.fillText(effect.text, x, y);
        ctx.restore();
    }
}

function drawSelectionBackground() {
    const pulse = 0.9 + Math.sin(selectionBackgroundTick * 0.045) * 0.18;
    const depth = 0.16 + Math.sin(selectionBackgroundTick * 0.035) * 0.06;
    const glow = 0.5 + Math.sin(selectionBackgroundTick * 0.08) * 0.08;
    const screenWidth = canvas.width;
    const screenHeight = canvas.height;

    const gradient = ctx.createRadialGradient(screenWidth * 0.5, screenHeight * 0.36, 20, screenWidth * 0.5, screenHeight * 0.36, screenWidth);
    gradient.addColorStop(0, `rgba(${12 * pulse}, ${28 * pulse}, ${44 * pulse}, ${0.98 * glow})`);
    gradient.addColorStop(0.4, `rgba(${8 * pulse}, ${20 * pulse}, ${34 * pulse}, 0.8)`);
    gradient.addColorStop(1, `rgba(${2 * pulse}, ${6 * pulse}, ${12 * pulse}, 0.95)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    ctx.save();
    for (let i = 0; i < selectionBackgroundParticles.length; i++) {
        const p = selectionBackgroundParticles[i];
        p.y += p.speed * (0.95 + Math.sin(selectionBackgroundTick * 0.026 + i) * 0.04);
        p.x += Math.sin((selectionBackgroundTick + i * 20) * 0.02) * 0.4;
        if (p.y > screenHeight + 30) p.y = -20;
        if (p.x < -20) p.x = screenWidth + 20;
        if (p.x > screenWidth + 20) p.x = -20;

        const bloom = 0.35 + Math.sin((selectionBackgroundTick * 0.08 + i) * 1.5) * 0.1;
        ctx.fillStyle = `hsla(${p.hue}, 78%, 72%, ${Math.max(0.02, p.alpha * bloom)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = `rgba(96, 170, 255, ${0.06 + depth})`;
    ctx.lineWidth = 1;
    const spacing = 100;
    for (let x = -spacing; x <= screenWidth + spacing; x += spacing) {
        const offset = Math.sin((selectionBackgroundTick + x) * 0.018) * 10;
        ctx.beginPath();
        ctx.moveTo(x + offset, 0);
        ctx.lineTo(x - offset, screenHeight);
        ctx.stroke();
    }
    for (let y = -spacing; y <= screenHeight + spacing; y += spacing) {
        const offset = Math.cos((selectionBackgroundTick + y) * 0.018) * 10;
        ctx.beginPath();
        ctx.moveTo(0, y + offset);
        ctx.lineTo(screenWidth, y - offset);
        ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${depth * 1.1})`;
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    ctx.restore();

    selectionBackgroundTick += 1;
}

function getWeaponSelectionLayout() {
    const screenWidth = canvas.width;
    const screenHeight = canvas.height;
    const buttonWidth = 200;
    const buttonHeight = 120;
    const spacing = 22;
    const totalWidth = weapons.length * buttonWidth + (weapons.length - 1) * spacing;
    const startX = (screenWidth - totalWidth) / 2;
    const startY = screenHeight / 2 - buttonHeight / 2 + 40;
    const radius = 20;
    return { buttonWidth, buttonHeight, spacing, startX, startY, radius };
}

function drawWeaponSelection() {
    drawSelectionBackground();
    ctx.globalAlpha = 1;
    const screenWidth = canvas.width;
    const screenHeight = canvas.height;
    ctx.fillStyle = 'rgba(4, 8, 16, 0.96)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    ctx.save();
    const centerX = screenWidth / 2;
    const centerY = screenHeight / 2;
    const ring = ctx.createRadialGradient(centerX, centerY, 100, centerX, centerY, 580);
    ring.addColorStop(0, 'rgba(0, 220, 255, 0.12)');
    ring.addColorStop(0.4, 'rgba(0, 200, 255, 0.04)');
    ring.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = ring;
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    ctx.restore();

    // Painel decorativo do título
    ctx.save();
    ctx.fillStyle = 'rgba(0, 150, 200, 0.08)';
    ctx.fillRect(screenWidth / 2 - 220, 32, 440, 70);
    ctx.strokeStyle = 'rgba(0, 220, 255, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(screenWidth / 2 - 220.5, 32.5, 439, 69);
    ctx.restore();

    ctx.fillStyle = '#8ffbff';
    ctx.font = 'bold 42px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 242, 255, 0.7)';
    ctx.shadowBlur = 24;
    ctx.fillText('Escolha sua Arma', screenWidth / 2, 67);
    ctx.shadowBlur = 0;

    const layout = getWeaponSelectionLayout();
    const { buttonWidth, buttonHeight, spacing, startX, startY } = layout;

    for (let i = 0; i < weapons.length; i++) {
        const bx = startX + i * (buttonWidth + spacing);
        const by = startY;
        const weapon = weapons[i];
        const isSelected = i === selectedWeaponIndex;
        const radius = 14;

        ctx.save();

        // Sombra profunda do botão
        ctx.shadowColor = isSelected ? 'rgba(0, 220, 255, 0.5)' : 'rgba(0, 100, 150, 0.25)';
        ctx.shadowBlur = isSelected ? 32 : 16;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = isSelected ? 8 : 4;

        // Fundo com gradiente vibrante
        const gradient = ctx.createLinearGradient(bx, by, bx, by + buttonHeight);
        if (isSelected) {
            gradient.addColorStop(0, 'rgba(0, 200, 255, 0.28)');
            gradient.addColorStop(0.5, 'rgba(0, 160, 220, 0.18)');
            gradient.addColorStop(1, 'rgba(0, 120, 180, 0.12)');
        } else {
            gradient.addColorStop(0, 'rgba(10, 35, 70, 0.95)');
            gradient.addColorStop(0.5, 'rgba(8, 25, 55, 0.9)');
            gradient.addColorStop(1, 'rgba(6, 15, 40, 0.85)');
        }
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(bx + radius, by);
        ctx.lineTo(bx + buttonWidth - radius, by);
        ctx.quadraticCurveTo(bx + buttonWidth, by, bx + buttonWidth, by + radius);
        ctx.lineTo(bx + buttonWidth, by + buttonHeight - radius);
        ctx.quadraticCurveTo(bx + buttonWidth, by + buttonHeight, bx + buttonWidth - radius, by + buttonHeight);
        ctx.lineTo(bx + radius, by + buttonHeight);
        ctx.quadraticCurveTo(bx, by + buttonHeight, bx, by + buttonHeight - radius);
        ctx.lineTo(bx, by + radius);
        ctx.quadraticCurveTo(bx, by, bx + radius, by);
        ctx.closePath();
        ctx.fill();

        // Borda com cor dinâmica
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = isSelected ? '#5ffbff' : 'rgba(100, 180, 255, 0.35)';
        ctx.lineWidth = isSelected ? 3.5 : 2.0;
        ctx.beginPath();
        ctx.moveTo(bx + radius, by);
        ctx.lineTo(bx + buttonWidth - radius, by);
        ctx.quadraticCurveTo(bx + buttonWidth, by, bx + buttonWidth, by + radius);
        ctx.lineTo(bx + buttonWidth, by + buttonHeight - radius);
        ctx.quadraticCurveTo(bx + buttonWidth, by + buttonHeight, bx + buttonWidth - radius, by + buttonHeight);
        ctx.lineTo(bx + radius, by + buttonHeight);
        ctx.quadraticCurveTo(bx, by + buttonHeight, bx, by + buttonHeight - radius);
        ctx.lineTo(bx, by + radius);
        ctx.quadraticCurveTo(bx, by, bx + radius, by);
        ctx.closePath();
        ctx.stroke();

        // Efeito de brilho no topo
        if (isSelected) {
            const gloss = ctx.createLinearGradient(bx, by, bx, by + 30);
            gloss.addColorStop(0, 'rgba(200, 255, 255, 0.15)');
            gloss.addColorStop(1, 'rgba(200, 255, 255, 0)');
            ctx.fillStyle = gloss;
            ctx.beginPath();
            ctx.moveTo(bx + radius, by + 2);
            ctx.lineTo(bx + buttonWidth - radius, by + 2);
            ctx.quadraticCurveTo(bx + buttonWidth - 2, by + 2, bx + buttonWidth - 2, by + radius);
            ctx.lineTo(bx + buttonWidth - 2, by + 28);
            ctx.lineTo(bx + 2, by + 28);
            ctx.lineTo(bx + 2, by + radius);
            ctx.quadraticCurveTo(bx + 2, by + 2, bx + radius, by + 2);
            ctx.closePath();
            ctx.fill();
        }

        // Indicador de seleção (triângulo no canto superior direito)
        if (isSelected) {
            const pulse = 0.7 + Math.sin(selectionBackgroundTick * 0.12) * 0.3;
            ctx.fillStyle = `rgba(0, 255, 200, ${pulse * 0.9})`;
            const triSize = 12;
            ctx.beginPath();
            ctx.moveTo(bx + buttonWidth - 8, by + 8);
            ctx.lineTo(bx + buttonWidth - 8 - triSize, by + 8);
            ctx.lineTo(bx + buttonWidth - 8, by + 8 + triSize);
            ctx.closePath();
            ctx.fill();

            // Pulsação de aura
            ctx.strokeStyle = `rgba(0, 255, 200, ${pulse * 0.4})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(bx + buttonWidth / 2, by + buttonHeight / 2, Math.min(75, 45 + pulse * 12), 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();

        // Nome da arma
        ctx.save();
        ctx.fillStyle = isSelected ? '#ffffff' : '#d4e8ff';
        ctx.font = isSelected ? 'bold 21px Arial' : 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (isSelected) {
            ctx.shadowColor = 'rgba(0, 220, 255, 0.5)';
            ctx.shadowBlur = 12;
        }
        ctx.fillText(weapon.name, bx + buttonWidth / 2, by + 28);
        ctx.restore();

        // Descrição
        ctx.fillStyle = isSelected ? 'rgba(220, 255, 255, 0.92)' : 'rgba(200, 235, 255, 0.8)';
        ctx.font = isSelected ? 'bold 13px Arial' : '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        wrapText(weapon.desc || '', bx + buttonWidth / 2, by + 54, buttonWidth - 18, 16);
    }

    // Painel de informações e instruções
    ctx.save();
    ctx.fillStyle = 'rgba(8, 22, 50, 0.92)';
    ctx.fillRect(52, screenHeight - 108, screenWidth - 104, 88);
    ctx.strokeStyle = 'rgba(56, 200, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(52.5, screenHeight - 108.5, screenWidth - 105, 87);
    ctx.restore();

    // Informações do arma selecionada
    if (weapons[selectedWeaponIndex]) {
        const selectedWeapon = weapons[selectedWeaponIndex];
        ctx.fillStyle = '#e0ffff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${selectedWeapon.name} - Dano: ${selectedWeapon.damage || 10}`, screenWidth / 2, screenHeight - 88);
    }

    // Instruções
    ctx.fillStyle = '#a8f0ff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Use as Setas ou Clique para Escolher', screenWidth / 2, screenHeight - 62);
    
    ctx.fillStyle = '#b6f5d4';
    ctx.font = '13px Arial';
    ctx.fillText('Pressione Espaço ou Enter para Confirmar', screenWidth / 2, screenHeight - 38);
}

function wrapText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
            ctx.fillText(line.trim(), x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    if (line.length > 0) {
        ctx.fillText(line.trim(), x, y);
    }
}

function updateHealthBars() {
    const playerBar = document.getElementById('playerHealth');
    const monsterBar = document.getElementById('monsterHealth');
    
    playerBar.style.width = (player.health / player.maxHealth) * 100 + '%';
    monsterBar.style.width = (currentMonster.health / currentMonster.maxHealth) * 100 + '%';
}

function updateUI() {
    document.getElementById('phaseDisplay').textContent = `Fase: ${phase}`;
    const weaponName = player.weapon ? player.weapon.name : 'Nenhuma';
    let spinAttackInfo = '';
    if (player.spinAttackLevel > 0) {
        spinAttackInfo = ` | Ataque Triplo Nível: ${player.spinAttackLevel}`;
    }
    let ammoInfo = '';
    if (player.weapon && player.weapon.type === 'gun') {
        ammoInfo = ` | Balas: ${player.gunAmmo}/${player.gunMaxAmmo}`;
        if (player.gunReloadCooldown > 0) ammoInfo += ' (recarregando)';
    } else if (player.weapon && player.weapon.type === 'bow') {
        ammoInfo = ` | Dashes: ${player.bowDashCharges}/${player.bowDashMaxCharges}`;
    }
    let passivesInfo = '';
    const passives = [];
    if (player.shooterMachineGunUnlocked) passives.push(`MG:${player.shooterMachineGunCount || 0}/4`);
    if (player.swarmNubeUnlocked) passives.push(`Nube:${player.swarmNubeCount || 0}/3`);
    if (player.casterPortalUnlocked) passives.push(`Portal:${player.casterPortalCount || 0}/5`);
    if (player.avianTrackerUnlocked) passives.push(`Rastreador:${player.avianTrackerCount || 0}/5`);
    if (player.smartRicochetUnlocked) passives.push(`Ricochete:${player.smartRicochetCount || 0}/4`);
    if (player.simpleExplosiveUnlocked) passives.push(`Explosivo:${player.simpleExplosiveCount || 0}/3`);
    if (player.crocFreezerUnlocked) passives.push(`Congelador:${player.crocFreezerCount || 0}/4`);
    if (player.tankImpulseUnlocked) passives.push(`Impulso:${player.tankImpulseCount || 0}/5`);
    if (passives.length > 0) passivesInfo = ` | ${passives.join(' | ')}`;
    document.getElementById('statsDisplay').innerHTML = 
        `Arma: <span id="weaponName">${weaponName}</span> | Monstros: ${upgradesAcquired} | Vida: ${Math.max(0, Math.round(player.health))}/${player.maxHealth}${ammoInfo}${spinAttackInfo}${passivesInfo}`;

    // Cooldown bar logic: show gun reload cooldown, parry cooldown for sword, hurricane cooldown for cone
    const cooldownFill = document.getElementById('cooldownBarFill');
    const cooldownBar = document.getElementById('cooldownBar');
    if (cooldownFill) {
        applyCooldownBarBaseBackground();
        if (player.weapon && player.weapon.type === 'bow') {
            const frac = Math.max(0, Math.min(1, player.bowDashCharges / player.bowDashMaxCharges));
            cooldownFill.style.width = `${frac * 100}%`;
        } else if (player.weapon && player.weapon.type === 'staff') {
            let frac = 0;
            if (player.staffBurstCooldown > 0) {
                frac = Math.max(0, Math.min(1, player.staffBurstCooldown / player.staffBurstCooldownMax));
            } else {
                frac = Math.max(0, Math.min(1, (player.staffCharge || 0) / (player.staffChargeMax || 15)));
            }
            cooldownFill.style.width = `${frac * 100}%`;
        } else {
            const isTornadoWeapon = player.weapon && player.weapon.type === 'cone' && player.weapon.name && player.weapon.name.toLowerCase().includes('lança tornado');
            if (isTornadoWeapon) {
                const frac = Math.max(0, Math.min(1, (player.tornadoCharge || 0) / (player.tornadoChargeMax || 20)));
                cooldownFill.style.width = `${frac * 100}%`;
            } else if (player.weapon && player.weapon.type === 'gun') {
                renderGunAmmoCooldownBar();
            } else {
                let cooldown = 0;
                let max = 1;
                if (player.weapon && player.weapon.type === 'cone') {
                    cooldown = player.hurricaneCooldown || 0;
                    max = player.hurricaneCooldownMax || 1;
                } else {
                    cooldown = player.parryCooldown || 0;
                    max = player.parryMax || 1;
                }
                const frac = Math.max(0, Math.min(1, cooldown / max));
                cooldownFill.style.width = `${frac * 100}%`;
            }
        }
    }
    }

    // Glow indicator when weapon is ready (no attack cooldown)
    const weaponNameEl = document.getElementById('weaponName');
    if (weaponNameEl) {
        if (player.attackCooldown === 0) weaponNameEl.classList.add('glow');
        else weaponNameEl.classList.remove('glow');
    }


function isRectOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x1 < x2 + w2 &&
           x1 + w1 > x2 &&
           y1 < y2 + h2 &&
           y1 + h1 > y2;
}

function getRandomCrocIndicatorTarget() {
    return {
        x: Math.random() * Math.max(1, gameWidth - 40) + 20,
        y: Math.random() * Math.max(1, gameHeight - 40) + 20
    };
}

function createWeaponPickup(x, y, weapon) {
    const pickup = {
        x,
        y,
        width: 36,
        height: 36,
        weapon,
        pulse: Math.random() * Math.PI * 2,
        markerPhase: Math.random() * Math.PI * 2,
        collected: false
    };
    weaponPickups.push(pickup);
    return pickup;
}

function spawnWeaponPickup() {
    if (!player || !gameStarted) return;
    if (weaponPickups.some(pickup => pickup && !pickup.collected)) return;

    const { centerX, centerY, spawnRadius } = getMapCircle();
    let spawnX = centerX;
    let spawnY = centerY;
    let attempt = 0;

    while (attempt < 60) {
        const pos = getRandomPointInRing(centerX, centerY, 0, spawnRadius * 0.92);
        spawnX = pos.x;
        spawnY = pos.y;

        const pickupRect = { x: spawnX - 18, y: spawnY - 18, width: 36, height: 36 };
        const overlapsWall = mapWalls.some(wall => isRectOverlap(pickupRect.x, pickupRect.y, pickupRect.width, pickupRect.height, wall.x, wall.y, wall.width, wall.height));
        const overlapsPlayer = isRectOverlap(pickupRect.x, pickupRect.y, pickupRect.width, pickupRect.height, player.x, player.y, player.width, player.height);

        if (!overlapsWall && !overlapsPlayer) {
            break;
        }
        attempt++;
    }

    const availableWeapons = weapons.filter(weapon => !(player.weapon && weapon.type === player.weapon.type));
    const selectedWeapon = availableWeapons.length > 0
        ? availableWeapons[Math.floor(Math.random() * availableWeapons.length)]
        : weapons[Math.floor(Math.random() * weapons.length)];

    return createWeaponPickup(spawnX - 18, spawnY - 18, selectedWeapon);
}

function spawnWeaponPickupsAroundPlayer() {
    if (!player || !gameStarted) return [];

    const centerX = player.x + player.width / 2;
    const centerY = player.y + player.height / 2;
    const availableWeapons = weapons.filter(weapon => !(player.weapon && weapon.type === player.weapon.type));
    if (!availableWeapons.length) return [];

    const total = Math.min(availableWeapons.length, 6);
    const spawned = [];

    for (let i = 0; i < total; i++) {
        const weapon = availableWeapons[i];
        const angle = (i / Math.max(1, total)) * Math.PI * 2;
        const radius = 60 + (i % 3) * 24;
        let x = centerX + Math.cos(angle) * radius - 18;
        let y = centerY + Math.sin(angle) * radius - 18;

        const pickupRect = { x, y, width: 36, height: 36 };
        const overlapsWall = mapWalls.some(wall => isRectOverlap(pickupRect.x, pickupRect.y, pickupRect.width, pickupRect.height, wall.x, wall.y, wall.width, wall.height));
        const overlapsPlayer = isRectOverlap(pickupRect.x, pickupRect.y, pickupRect.width, pickupRect.height, player.x, player.y, player.width, player.height);

        if (overlapsWall || overlapsPlayer) {
            x = centerX + Math.cos(angle + Math.PI / 4) * (radius + 28) - 18;
            y = centerY + Math.sin(angle + Math.PI / 4) * (radius + 28) - 18;
        }

        const pickup = createWeaponPickup(x, y, weapon);
        spawned.push(pickup);
    }

    return spawned;
}

function clearUncollectedWeaponPickups() {
    for (let i = weaponPickups.length - 1; i >= 0; i--) {
        const pickup = weaponPickups[i];
        if (pickup && !pickup.collected) {
            weaponPickups.splice(i, 1);
        }
    }
}

function updateWeaponPickups() {
    for (let i = weaponPickups.length - 1; i >= 0; i--) {
        const pickup = weaponPickups[i];
        if (!pickup || pickup.collected) {
            weaponPickups.splice(i, 1);
            continue;
        }

        pickup.pulse += 0.08;
        pickup.markerPhase += 0.03;

        if (isRectOverlap(player.x, player.y, player.width, player.height, pickup.x, pickup.y, pickup.width, pickup.height)) {
            pickup.collected = true;
            player.weapon = pickup.weapon;
            if (player.weapon.type === 'gun') {
                player.gunAmmo = player.gunMaxAmmo;
                player.gunReloadCooldown = 0;
                player.gunReloadHitCount = 0;
            }
            if (player.weapon.type === 'bow') {
                player.bowDashCharges = player.bowDashMaxCharges;
            }
            player.attackCooldown = 0;
            player.attacking = false;
            player.meleeAttacking = false;
            player.coneAttacking = false;
            player.tornadoBurst = null;
            weaponPickups.splice(i, 1);
        }
    }
}

function drawWeaponPickups() {
    for (const pickup of weaponPickups) {
        if (!pickup || pickup.collected) continue;

        const bob = Math.sin(pickup.pulse) * 3;
        const centerX = pickup.x + pickup.width / 2;
        const centerY = pickup.y + pickup.height / 2 + bob;
        const isVisible = centerX + 24 >= cameraX && centerX - 24 <= cameraX + viewportWidth && centerY + 24 >= cameraY && centerY - 24 <= cameraY + viewportHeight;

        ctx.save();
        ctx.translate(centerX, centerY);

        const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 24);
        glow.addColorStop(0, `${pickup.weapon.color || '#ffffff'}66`);
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, 24, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = pickup.weapon.color || '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(8, 16, 30, 0.95)';
        ctx.beginPath();
        ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = pickup.weapon.type === 'gun' ? 'G' : pickup.weapon.type === 'bow' ? 'B' : pickup.weapon.type === 'staff' ? 'S' : pickup.weapon.type === 'sword' ? 'W' : 'T';
        ctx.fillText(label, 0, 0);
        ctx.restore();

        if (isVisible) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(centerX, centerY, 16 + Math.sin(pickup.markerPhase) * 1.4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }
}

function drawWeaponPickupIndicators() {
    for (const pickup of weaponPickups) {
        if (!pickup || pickup.collected) continue;

        const centerX = pickup.x + pickup.width / 2;
        const centerY = pickup.y + pickup.height / 2;
        const viewLeft = cameraX;
        const viewTop = cameraY;
        const viewRight = cameraX + viewportWidth;
        const viewBottom = cameraY + viewportHeight;
        const isVisible = centerX + 24 >= viewLeft && centerX - 24 <= viewRight && centerY + 24 >= viewTop && centerY - 24 <= viewBottom;
        if (isVisible) continue;

        const screenCenterX = viewportWidth / 2;
        const screenCenterY = viewportHeight / 2;
        const dx = centerX - (viewLeft + viewportWidth / 2);
        const dy = centerY - (viewTop + viewportHeight / 2);
        const angle = Math.atan2(dy, dx);

        const edgeMargin = 30;
        let indicatorX = screenCenterX + Math.cos(angle) * (viewportWidth / 2 - edgeMargin);
        let indicatorY = screenCenterY + Math.sin(angle) * (viewportHeight / 2 - edgeMargin);
        indicatorX = Math.max(edgeMargin, Math.min(viewportWidth - edgeMargin, indicatorX));
        indicatorY = Math.max(edgeMargin, Math.min(viewportHeight - edgeMargin, indicatorY));

        ctx.save();
        ctx.translate(indicatorX, indicatorY);
        ctx.rotate(angle);
        ctx.fillStyle = 'rgba(255, 216, 96, 0.95)';
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(-8, -7);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-8, 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('ARMA', indicatorX, indicatorY - 12);
        ctx.restore();
    }
}

function ensureCrocFakeIndicatorTarget(monster) {
    if (!monster.fakeIndicatorTarget) {
        monster.fakeIndicatorTarget = getRandomCrocIndicatorTarget();
    }

    const target = monster.fakeIndicatorTarget;
    const isTargetVisible = target.x >= cameraX && target.x <= cameraX + viewportWidth &&
                            target.y >= cameraY && target.y <= cameraY + viewportHeight;
    if (isTargetVisible) {
        monster.fakeIndicatorTarget = getRandomCrocIndicatorTarget();
    }
    return monster.fakeIndicatorTarget;
}

function drawOffscreenMonsterIndicator() {
    if (!currentMonster || !ctx) return;

    const monsterLeft = currentMonster.x;
    const monsterTop = currentMonster.y;
    const monsterRight = currentMonster.x + currentMonster.width;
    const monsterBottom = currentMonster.y + currentMonster.height;
    const viewLeft = cameraX;
    const viewTop = cameraY;
    const viewRight = cameraX + viewportWidth;
    const viewBottom = cameraY + viewportHeight;

    const isVisible = monsterRight >= viewLeft && monsterLeft <= viewRight && monsterBottom >= viewTop && monsterTop <= viewBottom;
    if (isVisible) return;

    const monsterCenterX = currentMonster.x + currentMonster.width / 2;
    const monsterCenterY = currentMonster.y + currentMonster.height / 2;
    let targetX = monsterCenterX;
    let targetY = monsterCenterY;
    if (currentMonster.type === 'croc') {
        targetX = currentMonster.fakeMarkerX || monsterCenterX;
        targetY = currentMonster.fakeMarkerY || monsterCenterY;
    }

    const screenCenterX = viewportWidth / 2;
    const screenCenterY = viewportHeight / 2;
    const dx = targetX - (viewLeft + viewportWidth / 2);
    const dy = targetY - (viewTop + viewportHeight / 2);
    const angle = Math.atan2(dy, dx);

    const edgeMargin = 32;
    let indicatorX = screenCenterX + Math.cos(angle) * (viewportWidth / 2 - edgeMargin);
    let indicatorY = screenCenterY + Math.sin(angle) * (viewportHeight / 2 - edgeMargin);
    indicatorX = Math.max(edgeMargin, Math.min(viewportWidth - edgeMargin, indicatorX));
    indicatorY = Math.max(edgeMargin, Math.min(viewportHeight - edgeMargin, indicatorY));

    ctx.save();
    ctx.translate(indicatorX, indicatorY);
    ctx.rotate(angle);

    ctx.fillStyle = 'rgba(255, 100, 100, 0.95)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-10, -8);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('MONSTRO', indicatorX, indicatorY - 14);
    ctx.restore();
}

function getConstructionIndicatorTargets() {
    if (!Array.isArray(constructions)) return [];

    return constructions.filter((construction) => {
        return construction &&
            typeof construction.x === 'number' &&
            typeof construction.y === 'number' &&
            typeof construction.width === 'number' &&
            typeof construction.height === 'number';
    });
}

function drawOffscreenTransitionIndicator() {
    if (!ctx || !player || playerInsideConstruction) return;

    const viewLeft = cameraX;
    const viewTop = cameraY;
    const viewRight = cameraX + viewportWidth;
    const viewBottom = cameraY + viewportHeight;
    const targets = getConstructionIndicatorTargets();

    if (!targets.length) return;

    for (const construction of targets) {
        const buildingLeft = construction.x;
        const buildingTop = construction.y;
        const buildingRight = construction.x + construction.width;
        const buildingBottom = construction.y + construction.height;
        const isVisible = buildingRight >= viewLeft && buildingLeft <= viewRight && buildingBottom >= viewTop && buildingTop <= viewBottom;
        if (isVisible) continue;

        const buildingCenterX = construction.x + construction.width / 2;
        const buildingCenterY = construction.y + construction.height / 2;
        const screenCenterX = viewportWidth / 2;
        const screenCenterY = viewportHeight / 2;
        const dx = buildingCenterX - (viewLeft + viewportWidth / 2);
        const dy = buildingCenterY - (viewTop + viewportHeight / 2);
        const angle = Math.atan2(dy, dx);

        const edgeMargin = 32;
        let indicatorX = screenCenterX + Math.cos(angle) * (viewportWidth / 2 - edgeMargin);
        let indicatorY = screenCenterY + Math.sin(angle) * (viewportHeight / 2 - edgeMargin);
        indicatorX = Math.max(edgeMargin, Math.min(viewportWidth - edgeMargin, indicatorX));
        indicatorY = Math.max(edgeMargin, Math.min(viewportHeight - edgeMargin, indicatorY));

        const label = construction.type === 'mine'
            ? 'MINA'
            : construction.type === 'mansion'
                ? 'MANSÃO'
                : 'CASTELO';

        const color = construction.type === 'mine'
            ? 'rgba(255, 176, 64, 0.95)'
            : construction.type === 'mansion'
                ? 'rgba(180, 118, 255, 0.95)'
                : 'rgba(122, 232, 255, 0.95)';

        ctx.save();
        ctx.translate(indicatorX, indicatorY);
        ctx.rotate(angle);

        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-10, -8);
        ctx.lineTo(-4, 0);
        ctx.lineTo(-10, 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, indicatorX, indicatorY - 14);
        ctx.restore();
    }
}

function spawnGhostArmyAroundMonster(monster) {
    if (!monster || !ghostArmyUnlocked) {
        ghostArmyEntities = [];
        return;
    }
    if (Math.random() * 100 >= 10) {
        ghostArmyEntities = [];
        return;
    }

    ghostArmyEntities = [];
    const centerX = monster.x + monster.width / 2;
    const centerY = monster.y + monster.height / 2;
    const baseRadius = Math.max(monster.width * 1.35, monster.height * 1.35, 180);

    for (let i = 0; i < 50; i += 1) {
        const angle = (Math.PI * 2 / 50) * i + (Math.random() - 0.5) * 0.35;
        const orbitRadius = baseRadius + Math.random() * 70;
        const drift = Math.random() * 0.03;
        const size = 8 + Math.random() * 10;
        ghostArmyEntities.push({
            angle,
            orbitRadius,
            drift,
            size,
            alpha: 0.2 + Math.random() * 0.8,
            wobble: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.015,
            x: centerX + Math.cos(angle) * orbitRadius,
            y: centerY + Math.sin(angle) * orbitRadius,
            life: 90 + Math.floor(Math.random() * 40),
            maxLife: 90 + Math.floor(Math.random() * 40)
        });
    }
}

function updateGhostArmy() {
    if (!ghostArmyEntities.length) return;

    const monster = currentMonster;
    if (!monster || monster.isDying) {
        ghostArmyEntities = ghostArmyEntities.filter((ghost) => {
            ghost.life -= 1;
            ghost.alpha = Math.max(0, ghost.alpha - 0.02);
            return ghost.life > 0 && ghost.alpha > 0.02;
        });
        return;
    }

    const centerX = monster.x + monster.width / 2;
    const centerY = monster.y + monster.height / 2;
    const pulse = 0.5 + Math.sin(gameFrameCount * 0.06) * 0.15;

    for (const ghost of ghostArmyEntities) {
        ghost.angle += ghost.spin + ghost.drift * pulse;
        ghost.orbitRadius = Math.max(140, ghost.orbitRadius + Math.sin(ghost.wobble + gameFrameCount * 0.04) * 0.1);
        ghost.x = centerX + Math.cos(ghost.angle) * ghost.orbitRadius;
        ghost.y = centerY + Math.sin(ghost.angle) * ghost.orbitRadius;
        ghost.alpha = Math.min(1, 0.2 + (0.6 * (ghost.life / ghost.maxLife)) + pulse * 0.15);
        ghost.wobble += 0.03;
    }
}

function drawGhostArmy() {
    if (!ghostArmyEntities.length) return;

    ctx.save();
    for (const ghost of ghostArmyEntities) {
        ctx.save();
        ctx.globalAlpha = Math.max(0.1, ghost.alpha);
        ctx.translate(ghost.x, ghost.y);
        ctx.fillStyle = '#d6d6ff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, ghost.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-ghost.size * 0.2, -ghost.size * 0.2, ghost.size * 0.4, ghost.size * 0.4);
        ctx.restore();
    }
    ctx.restore();
}

function positionMonsterAwayFromPlayer(monster) {
    const margin = 20;
    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    const spawnBounds = getZoneBounds('spawn');
    const minX = Math.max(spawnBounds.minX + margin, 0);
    const maxX = Math.max(minX, Math.min(spawnBounds.maxX - monster.width - margin, gameWidth - monster.width));
    const minY = Math.max(spawnBounds.minY + margin, 0);
    const maxY = Math.max(minY, Math.min(spawnBounds.maxY - monster.height - margin, gameHeight - monster.height));

    let attempt = 0;
    while (attempt < 200) {
        const pos = getRandomPointInZone('spawn', Math.max(monster.width, monster.height));
        monster.x = Math.max(minX, Math.min(pos.x, maxX));
        monster.y = Math.max(minY, Math.min(pos.y, maxY));

        const monsterCenterX = monster.x + monster.width / 2;
        const monsterCenterY = monster.y + monster.height / 2;
        const dist = Math.hypot(monsterCenterX - playerCenterX, monsterCenterY - playerCenterY);
        if (dist >= 80 && !isRectOverlap(monster.x, monster.y, monster.width, monster.height, player.x, player.y, player.width, player.height)) {
            break;
        }
        attempt++;
    }

    if (attempt >= 200) {
        monster.x = Math.max(minX, Math.min(playerCenterX - monster.width / 2, maxX));
        monster.y = Math.max(minY, Math.min(playerCenterY - monster.height / 2, maxY));
    }

    monster.portalX = monster.x + monster.width / 2;
    monster.portalY = monster.y + monster.height / 2;
    monster.patrolTarget = { x: monster.x + monster.width / 2, y: monster.y + monster.height / 2 };
}

function spawnNewMonster() {
    if (currentMonster && currentMonster.type && currentMonster.type !== 'tank') {
        monsterTypeKills[currentMonster.type] = true;
    }

    if (currentMonster && currentMonster.type) {
        phaseMonsterTypes.add(currentMonster.type);
    }
    lastMonsterType = currentMonster ? currentMonster.type : null;

    projectiles = [];
    monsterHitscans = [];
    if (castleBossQueued && !playerInsideConstruction) {
        currentMonster = new Monster(phase, 'castle_bone_sphere');
        castleBossQueued = false;
        castleBossAlertText = 'um novo inimigo aparece.';
        castleBossAlertTimer = 120;
    } else {
        currentMonster = new Monster(phase, chooseMonsterType());
    }

    if (currentMonster.type === 'castle_bone_sphere') {
        spawnCastleBossSkeletons(1 + Math.floor(Math.random() * 3));
    }
    if (currentMonster.type === 'croc') {
        currentMonster.fakeMarkerX = currentMonster.crocDecoyX;
        currentMonster.fakeMarkerY = currentMonster.crocDecoyY;
    }
    player.spinAttack = player.spinAttackLevel > 0;
    player.spinAttackCharges = Math.max(0, player.spinAttackLevel - 1);
    player.bowFirstShotUsed = false;
    player.currentMonsterHitCount = 0;
    player.autoAttackEnabled = false;
    spawnSpinAttackStartProjectiles();
    spawnGhostArmyAroundMonster(currentMonster);
    upgradeChoices = getRandomUpgrades(6);
    selectedUpgradeIndex = 0;
    isUpgrading = false;
    pendingUpgrade = true;
    upgradeDelayTimer = 30;
    upgradeOverlayY = viewportHeight / 2;
    upgradeOverlayAlpha = 1;
    upgradeOverlayAnimating = false;
}

function getRandomUpgrades(count) {
    // Build choices in a 3x2 grid order: left-top, left-bottom, center-top, center-bottom, right-top, right-bottom
    const weaponSpecific = (getWeaponUpgrades() || []).map(u => ({ ...u, exclusive: true }));
    const exclusivePool = upgradeOptions.filter(up => up.exclusive && !weaponSpecific.find(ws => ws.name === up.name)).map(u => ({ ...u }));
    const available = upgradeOptions.filter(up => !up.exclusive).map(u => ({ ...u }));

    const choices = [];

    // Helper to possibly convert a pick into an EXTREMO version
    function maybeMakeExtreme(item) {
        const pick = { ...item };
        // Increase chance by 0.025% (0.00025) per every 5 phases completed
        const extraBlocks = Math.floor((phase || 0) / 5);
        const additionalChance = extraBlocks * 0.00025; // 0.025% per 5 phases
        const effectiveChance = Math.min(1, EXTREME_CHANCE + additionalChance);

        if (Math.random() < effectiveChance) {
            pick.extreme = true;
            pick.extremeColor = `hsl(${Math.floor(Math.random() * 360)}, 90%, 60%)`;
            if (typeof pick.value === 'number') pick.value = pick.value * 3;
            pick.name = (pick.name || '') + ' — EXTREMO!';
            pick.desc = (pick.desc || '') + ' (Versão EXTREMA: 3 níveis aplicados)';
        }
        return pick;
    }

    // Left column (indexes 0,1) must be exclusive weapon upgrades when possible
    for (let i = 0; i < 2; i++) {
        let pick = null;
        if (weaponSpecific.length > 0) {
            const idx = Math.floor(Math.random() * weaponSpecific.length);
            pick = maybeMakeExtreme(weaponSpecific.splice(idx, 1)[0]);
        } else if (exclusivePool.length > 0) {
            const idx = Math.floor(Math.random() * exclusivePool.length);
            pick = maybeMakeExtreme(exclusivePool.splice(idx, 1)[0]);
        }

        // Fallback to a generic available upgrade if none exclusive found
        if (!pick && available.length > 0) {
            const idx = Math.floor(Math.random() * available.length);
            pick = maybeMakeExtreme(available.splice(idx, 1)[0]);
        }

        if (pick) {
            pick.exclusive = !!pick.exclusive; // ensure flag exists
            choices.push(pick);
        }
    }

    // Middle + Right columns (4 slots) should be non-exclusive upgrades (global)
    const nonExclusivePool = [...available];
    while (choices.length < Math.min(count, 6) && nonExclusivePool.length > 0) {
        const idx = Math.floor(Math.random() * nonExclusivePool.length);
        const p = maybeMakeExtreme(nonExclusivePool.splice(idx, 1)[0]);
        p.exclusive = !!p.exclusive;
        choices.push(p);
    }

    // If still short, fill from remaining exclusivePool or leftover weaponSpecific
    const fallbackPool = [...exclusivePool, ...weaponSpecific];
    while (choices.length < Math.min(count, 6) && fallbackPool.length > 0) {
        const idx = Math.floor(Math.random() * fallbackPool.length);
        const p = maybeMakeExtreme(fallbackPool.splice(idx, 1)[0]);
        p.exclusive = !!p.exclusive;
        choices.push(p);
    }

    // Guarantee at least one extreme on phases that are multiples of 5
    if ((phase || 0) % 5 === 0 && (phase || 0) > 0) {
        const hasExtreme = choices.some(c => c.extreme);
        if (!hasExtreme && choices.length > 0) {
            // Prefer to make an exclusive left-column slot extreme if present
            const leftIndexes = [0, 1];
            let forced = -1;
            for (const li of leftIndexes) {
                if (choices[li] && choices[li].exclusive) { forced = li; break; }
            }
            if (forced === -1) {
                // otherwise pick first available
                forced = 0;
            }
            const target = choices[forced];
            if (target) {
                target.extreme = true;
                target.extremeColor = target.extremeColor || `hsl(${Math.floor(Math.random() * 360)}, 90%, 60%)`;
                if (typeof target.value === 'number') target.value = target.value * 3;
                target.name = (target.name || '') + ' — EXTREMO!';
                target.desc = (target.desc || '') + ' (Versão EXTREMA: 3 níveis aplicados)';
            }
        }
    }

    return choices.slice(0, Math.min(count, 6));
}

function getWeaponUpgrades() {
    if (!player || !player.weapon) return [];
    return weaponUpgradeOptions[player.weapon.type] ? [...weaponUpgradeOptions[player.weapon.type]] : [];
}

function getDebugUpgradeChoices() {
    const weaponSpecific = (getWeaponUpgrades() || []).map((upgrade) => ({ ...upgrade, exclusive: true }));
    const generic = upgradeOptions.map((upgrade) => ({ ...upgrade }));
    const combined = [...weaponSpecific, ...generic];
    return combined.filter((choice, index, list) => index === list.findIndex((candidate) => candidate.name === choice.name && candidate.effect === choice.effect));
}

function applyUpgradeChoice(pick, quantity = 1) {
    if (!pick) return;

    const safeQuantity = Math.max(1, Math.floor(quantity || 1));
    for (let i = 0; i < safeQuantity; i++) {
        switch (pick.effect) {
            case 'maxHealth':
                player.maxHealth += pick.value;
                player.health += pick.value;
                break;
            case 'critDamage':
                player.critDamage += pick.value;
                break;
            case 'spinAttack':
                player.spinAttackLevel = (player.spinAttackLevel || 0) + 1;
                player.spinAttack = true;
                player.spinAttackCharges = Math.max(0, player.spinAttackLevel - 1);
                break;
            case 'gunAmmoMax':
                player.gunMaxAmmo += pick.value;
                player.gunAmmo += pick.value;
                break;
            case 'gunReloadHitMax':
                player.gunReloadHitMax = Math.max(1, player.gunReloadHitMax - pick.value);
                break;
            case 'gunReloadCooldownMax':
                player.gunReloadCooldownMax = Math.max(4, player.gunReloadCooldownMax - pick.value);
                break;
            case 'gunBurstFire':
                player.gunBurstFire = (player.gunBurstFire || 0) + pick.value;
                break;
            case 'gunExplosiveAmmo':
                player.gunExplosiveAmmo = (player.gunExplosiveAmmo || 0) + pick.value;
                break;
            case 'bowDashMax':
                player.bowDashMaxCharges += pick.value;
                player.bowDashCharges += pick.value;
                break;
            case 'bowRicochet':
                player.bowRicochet = (player.bowRicochet || 0) + pick.value;
                break;
            case 'bowFirstShot':
                player.bowFirstShot = (player.bowFirstShot || 0) + pick.value;
                player.bowFirstShotUsed = false;
                break;
            case 'bowReadyStance':
                player.bowReadyStance = (player.bowReadyStance || 0) + pick.value;
                break;
            case 'staffChargeMax':
                player.staffChargeMax += pick.value;
                break;
            case 'staffBurstCount':
                player.staffBurstCount += pick.value;
                break;
            case 'staffBurstCooldownMax':
                player.staffBurstCooldownMax = Math.max(40, player.staffBurstCooldownMax - pick.value);
                break;
            case 'staffHomingBurst':
                player.staffHomingBurst = (player.staffHomingBurst || 0) + pick.value;
                break;
            case 'bombStunPerHitSeconds':
                player.bombStunPerHitSeconds = (player.bombStunPerHitSeconds || 0) + pick.value;
                break;
            case 'bombFragmentConfusionSeconds':
                if ((player.bombFragmentConfusionLevels || 0) <= 0) {
                    player.bombFragmentConfusionSeconds = 0.1;
                } else {
                    player.bombFragmentConfusionSeconds = (player.bombFragmentConfusionSeconds || 0.1) + 0.05;
                }
                player.bombFragmentConfusionLevels = (player.bombFragmentConfusionLevels || 0) + 1;
                break;
            case 'bombFragmentCountBonus':
                player.bombFragmentCountBonus = (player.bombFragmentCountBonus || 0) + Math.round(pick.value || 0);
                break;
            case 'bombBurnDamagePerSecond':
                player.bombBurnDamagePerSecond = (player.bombBurnDamagePerSecond || 0) + pick.value;
                player.bombBurnDurationSeconds = Math.max(3, (player.bombBurnDurationSeconds || 3) + 0.5);
                break;
            case 'bombFragmentSpeedBonus':
                player.bombFragmentSpeedBonus = (player.bombFragmentSpeedBonus || 0) + pick.value;
                player.bombFragmentPierce = (player.bombFragmentPierce || 0) + 1;
                break;
            case 'bombThrowSpeedBonus':
                player.bombThrowSpeedBonus = (player.bombThrowSpeedBonus || 0) + pick.value;
                break;
            case 'bombFireZoneDurationBonusSeconds':
                player.bombFireZoneDurationBonusSeconds = (player.bombFireZoneDurationBonusSeconds || 0) + pick.value;
                break;
            case 'bombFireZoneMoveSpeedBonus':
                player.bombFireZoneMoveSpeedBonus = (player.bombFireZoneMoveSpeedBonus || 0) + pick.value;
                break;
            case 'bombCooldownMoveSpeedBonus':
                player.bombCooldownMoveSpeedBonus = (player.bombCooldownMoveSpeedBonus || 0) + pick.value;
                break;
            case 'bombFireZoneRadiusBonus':
                player.bombFireZoneRadiusBonus = (player.bombFireZoneRadiusBonus || 0) + pick.value;
                break;
            case 'bombFragmentSizeBonus':
                player.bombFragmentSizeBonus = (player.bombFragmentSizeBonus || 0) + pick.value;
                break;
            case 'swordRange':
                if (player.weapon && player.weapon.type === 'sword') {
                    player.weapon.range += pick.value;
                }
                break;
            case 'parryMax':
                player.parryMax = Math.max(60, player.parryMax - pick.value);
                break;
            case 'parryChargePerHit':
                player.parryChargePerHit = (player.parryChargePerHit || 0) + pick.value;
                break;
            case 'parryDefenseBonus':
                player.parryDefenseBonus = (player.parryDefenseBonus || 0) + pick.value;
                break;
            case 'parryHealOnUse':
                player.parryHealOnUse = (player.parryHealOnUse || 0) + pick.value;
                break;
            case 'parryHealOverTime':
                player.parryHealOverTime = (player.parryHealOverTime || 0) + pick.value;
                break;
            case 'parryConfusionChance':
                player.parryConfusionChance = (player.parryConfusionChance || 0) + pick.value;
                player.parryConfusionDuration = (player.parryConfusionDuration || 0) + 3 * Math.round((pick.value || 0) / 12.5);
                break;
            case 'tornadoCount':
                player.tornadoBurstExtraCount = (player.tornadoBurstExtraCount || 0) + pick.value;
                break;
            case 'coneAngleBonus':
                player.tornadoConeAngleBonus = (player.tornadoConeAngleBonus || 0) + pick.value;
                break;
            case 'tornadoDuration':
                player.tornadoBurstExtraDuration = (player.tornadoBurstExtraDuration || 0) + pick.value;
                break;
            default:
                player[pick.effect] = (player[pick.effect] || 0) + pick.value;
                break;
        }
    }

    healPlayer(2 * safeQuantity);
    upgradesAcquired += safeQuantity;
}

function healPlayer(amount) {
    player.health = Math.min(player.maxHealth, player.health + amount);
}

function toggleDebugMenu() {
    if (isSelectingWeapon || gameOver) return;

    if (!isDebugMenuOpen) {
        debugMenuUpgradeChoices = getDebugUpgradeChoices();
        debugMenuActionChoices = getDebugActionChoices();
        selectedDebugUpgradeIndex = 0;
        selectedDebugActionIndex = 0;
        debugMenuQuantity = 1;
        debugMenuFlashTimer = 0;
    }

    isDebugMenuOpen = !isDebugMenuOpen;
    if (overlayCanvas) {
        overlayCanvas.style.display = isDebugMenuOpen ? 'block' : 'none';
        overlayCanvas.style.pointerEvents = isDebugMenuOpen ? 'auto' : 'none';
        if (isDebugMenuOpen) resizeDebugOverlay();
        if (!isDebugMenuOpen && overlayCtx) {
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }
    }
}

function applyDebugUpgrade() {
    if (debugMenuTabs[debugMenuTabIndex].id === 'invocar') {
        const action = debugMenuActionChoices[selectedDebugActionIndex] || getDebugMenuChoices()[selectedDebugActionIndex];
        if (!action) return;
        if (!action.enabled) {
            debugMenuFlashTimer = 50;
            debugMenuFlashText = `Ação indisponível: ${action.name}`;
            return;
        }
        applyDebugAction(action, debugMenuQuantity);
        debugMenuFlashTimer = 50;
        debugMenuFlashText = `Invocado: ${action.name}`;
        return;
    }

    const pick = debugMenuUpgradeChoices[selectedDebugUpgradeIndex];
    if (!pick) return;

    applyUpgradeChoice(pick, debugMenuQuantity);
    debugMenuUpgradeChoices = getDebugUpgradeChoices();
    if (selectedDebugUpgradeIndex >= debugMenuUpgradeChoices.length) {
        selectedDebugUpgradeIndex = Math.max(0, debugMenuUpgradeChoices.length - 1);
    }

    debugMenuFlashTimer = 50;
    debugMenuFlashText = `Aplicado: ${pick.name}`;
}

function applyUpgrade(index) {
    const pick = upgradeChoices[index];
    if (!pick) return;

    applyUpgradeChoice(pick, 1);
    isUpgrading = false;
    upgradeChoices = [];
    roundStartTimer = 60;
}

function drawPlayerConfusionOverlay() {
    if (!player || player.confusedTimer <= 0) return;

    const intensity = Math.min(1, player.confusedTimer / 180);
    const pulse = 0.18 + 0.08 * Math.sin(gameFrameCount * 0.12 + player.confusedTimer * 0.04);
    const alpha = 0.12 + intensity * 0.2 + pulse * 0.05;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(255, 200, 90, 0.16)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 + intensity * 0.22})`;
    ctx.lineWidth = 2;
    const ringCount = 7;
    for (let i = 0; i < ringCount; i++) {
        const radius = 90 + i * 28 + Math.sin(gameFrameCount * 0.06 + i) * 8;
        const offset = gameFrameCount * 0.03 + i * 0.5;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, offset, offset + Math.PI * 1.2);
        ctx.stroke();
    }

    ctx.restore();
}

function drawCountdownOverlay(text, subtitle = '', y = canvas.height / 2, alpha = 1) {
    const screenWidth = canvas.width;
    const screenHeight = canvas.height;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    const glow = ctx.createRadialGradient(screenWidth / 2, y - 20, 0, screenWidth / 2, y - 20, 170);
    glow.addColorStop(0, 'rgba(0, 255, 220, 0.36)');
    glow.addColorStop(0.4, 'rgba(0, 255, 220, 0.08)');
    glow.addColorStop(1, 'rgba(0, 255, 220, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    ctx.fillStyle = '#f9fcff';
    ctx.font = 'bold 88px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 242, 255, 0.85)';
    ctx.shadowBlur = 26;
    ctx.fillText(text, screenWidth / 2, y);

    if (subtitle) {
        ctx.font = '18px Arial';
        ctx.fillStyle = '#b7eeff';
        ctx.shadowColor = 'rgba(0, 220, 255, 0.4)';
        ctx.shadowBlur = 14;
        ctx.fillText(subtitle, screenWidth / 2, y + 62);
    }
    ctx.restore();
}

function getDebugMenuChoices() {
    if (debugMenuTabs[debugMenuTabIndex].id === 'invocar') {
        debugMenuActionChoices = getDebugActionChoices();
        if (selectedDebugActionIndex >= debugMenuActionChoices.length) {
            selectedDebugActionIndex = Math.max(0, debugMenuActionChoices.length - 1);
        }
        return debugMenuActionChoices;
    }

    if (!debugMenuUpgradeChoices.length) {
        debugMenuUpgradeChoices = getDebugUpgradeChoices();
    }
    if (selectedDebugUpgradeIndex >= debugMenuUpgradeChoices.length) {
        selectedDebugUpgradeIndex = Math.max(0, debugMenuUpgradeChoices.length - 1);
    }
    return debugMenuUpgradeChoices;
}

function getDebugChoiceRarity(choice) {
    if (choice.exclusive) return { label: 'EXCLUSIVO', color: '#ffe28a' };
    return null;
}

function formatDebugValue(value) {
    if (typeof value !== 'number') return String(value);
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2);
}

function getDebugChoiceCurrentValue(choice) {
    const e = choice.effect || '';
    let v;
    if (e === 'swordRange') v = (player.weapon && player.weapon.range) || 0;
    else if (e === 'maxHealth') v = player.maxHealth;
    else if (typeof player[e] !== 'undefined' && player[e] !== null) v = player[e];

    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (typeof v === 'undefined' || v === null) return '—';
    if (typeof v === 'number') {
        if (Number.isInteger(v)) return String(v);
        return v.toFixed(2);
    }
    return String(v);
}

function getDebugActionChoices() {
    const actions = [];
    const monsterTypes = ['simple', 'croc', 'shooter', 'swarm', 'caster', 'avianightmare', 'smart', 'tank'];
    for (const type of monsterTypes) {
        actions.push({
            name: `Invocar ${type === 'simple' ? 'Monstro Simples' : type === 'croc' ? 'Croc' : type === 'tank' ? 'Tanque' : type.charAt(0).toUpperCase() + type.slice(1)}`,
            category: 'MONSTRO',
            desc: `Substitui o monstro atual por um ${type}. Use este comando para forçar o próximo combate.`,
            effect: 'spawnMonster',
            monsterType: type,
            enabled: true
        });
    }

    actions.push({
        name: 'Invocar Esquadrão Fantasma',
        category: 'AÇÃO',
        desc: 'Cria um exército de fantasmas ao redor do monstro atual, usando a mesma lógica de fantasma do jogo.',
        effect: 'ghostArmy',
        enabled: !!currentMonster && !currentMonster.isDying
    });
    actions.push({
        name: 'Spawn Onda de Castelo',
        category: 'CASTELO',
        desc: 'Inicia a próxima onda do interior do castelo se você estiver dentro de um castelo.',
        effect: 'castleWave',
        enabled: playerInsideConstruction && constructions.find(c => c.id === currentConstructionId && c.type === 'castle')
    });
    actions.push({
        name: 'Spawn Onda de Mansão',
        category: 'MANSÃO',
        desc: 'Gera até 3 fantasmas adicionais na mansão imediatamente.',
        effect: 'mansionWave',
        enabled: playerInsideConstruction && constructions.find(c => c.id === currentConstructionId && c.type === 'mansion')
    });
    actions.push({
        name: 'Reiniciar Castelo',
        category: 'CASTELO',
        desc: 'Limpa o interior do castelo e reseta seu estado de ondas.',
        effect: 'resetCastle',
        enabled: true
    });
    actions.push({
        name: 'Reiniciar Mansão',
        category: 'MANSÃO',
        desc: 'Limpa o interior da mansão e reseta seu estado de spawn.',
        effect: 'resetMansion',
        enabled: true
    });
    actions.push({
        name: 'Abrir Saída do Castelo',
        category: 'AÇÃO',
        desc: 'Força a abertura do portão do castelo, se houver um castelo ativo.',
        effect: 'openCastleExit',
        enabled: playerInsideConstruction && constructions.find(c => c.id === currentConstructionId && c.type === 'castle')
    });
    return actions;
}

function applyDebugAction(action, quantity = 1) {
    if (!action) return;
    const safeQuantity = Math.max(1, Math.floor(quantity || 1));
    switch (action.effect) {
        case 'spawnMonster':
            for (let i = 0; i < safeQuantity; i += 1) {
                currentMonster = new Monster(phase, action.monsterType);
                if (currentMonster.type === 'castle_bone_sphere') {
                    spawnCastleBossSkeletons(1 + Math.floor(Math.random() * 3));
                }
                spawnGhostArmyAroundMonster(currentMonster);
            }
            break;
        case 'ghostArmy':
            for (let i = 0; i < safeQuantity; i += 1) {
                spawnGhostArmyAroundMonster(currentMonster);
            }
            break;
        case 'castleWave':
            for (let i = 0; i < safeQuantity; i += 1) {
                spawnCastleInteriorWave();
            }
            break;
        case 'mansionWave':
            for (let i = 0; i < safeQuantity; i += 1) {
                for (let j = 0; j < 3; j += 1) {
                    if (!spawnMansionGhost()) break;
                }
            }
            break;
        case 'resetCastle':
            clearCastleInterior();
            break;
        case 'resetMansion':
            clearMansionInterior();
            break;
        case 'openCastleExit':
            openCastleExitIfReady();
            break;
        default:
            break;
    }
}

function getDebugChoiceCategory(choice) {
    if (choice && choice.category) {
        switch (choice.category) {
            case 'MONSTRO': return { label: 'MONSTRO', color: '#ff9a72' };
            case 'CASTELO': return { label: 'CASTELO', color: '#b88cff' };
            case 'MANSÃO': return { label: 'MANSÃO', color: '#a2ff70' };
            case 'AÇÃO': return { label: 'AÇÃO', color: '#5ad1ff' };
        }
    }
    const e = choice.effect || '';
    if (e.startsWith('gun') || e.startsWith('bow') || e.startsWith('staff') ||
        e.startsWith('bomb') || e.startsWith('tornado') || e.startsWith('hurricane') ||
        e.startsWith('sword') || e.startsWith('parry')) {
        return { label: 'ARMA', color: '#5ad1ff' };
    }
    if (['maxHealth', 'healthRegen', 'damageReduction'].includes(e)) {
        return { label: 'DEFESA', color: '#5be08a' };
    }
    if (e === 'speed') {
        return { label: 'MOBILIDADE', color: '#ffd24a' };
    }
    return { label: 'DANO', color: '#ff7a6b' };
}

function drawDebugMenu(drawCtx = null) {
    const ctx = drawCtx || window.ctx;
    const screenWidth = (drawCtx ? overlayCanvas.width : canvas.width);
    const screenHeight = (drawCtx ? overlayCanvas.height : canvas.height);
    const choices = getDebugMenuChoices();
    const selectedIndex = debugMenuTabs[debugMenuTabIndex].id === 'invocar' ? selectedDebugActionIndex : selectedDebugUpgradeIndex;
    const pulse = 0.5 + 0.5 * Math.sin(gameFrameCount * 0.07);

    ctx.fillStyle = 'rgba(5, 10, 20, 0.96)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    // Animated background accent
    ctx.save();
    const centerX = screenWidth / 2;
    const centerY = screenHeight / 2;
    const ring = ctx.createRadialGradient(centerX, centerY, 120, centerX, centerY, 620);
    ring.addColorStop(0, `rgba(0, 220, 255, ${0.06 + 0.04 * pulse})`);
    ring.addColorStop(0.55, 'rgba(0, 190, 255, 0.02)');
    ring.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = ring;
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    ctx.restore();

    // ===== Header =====
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9ff6ff';
    ctx.shadowColor = 'rgba(0, 220, 255, 0.7)';
    ctx.shadowBlur = 14 + 10 * pulse;
    const headerFontSize = Math.max(20, Math.min(34, screenWidth > 1200 ? 34 : screenWidth > 900 ? 28 : 22));
    ctx.font = `bold ${headerFontSize}px Arial`;
    ctx.fillText('DEBUG · CONSOLE DE MELHORIAS', centerX, 52);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(150, 230, 255, 0.75)';
    const subtitleFontSize = headerFontSize > 28 ? 13 : 12;
    ctx.font = `${subtitleFontSize}px Arial`;
    const subtitle = 'Pressione O para abrir/fechar  •  Tab: alternar abas  •  I: itens  •  C: construções';
    const subtitleLines = wrapDebugText(subtitle, Math.max(260, screenWidth * 0.72), subtitleFontSize);
    subtitleLines.forEach((line, index) => {
        ctx.fillText(line, centerX, 74 + index * 16);
    });

    // Animated underline
    const lineWidth = 280 + 120 * pulse;
    const underlineY = 86 + Math.max(0, subtitleLines.length - 1) * 16;
    const grad = ctx.createLinearGradient(centerX - lineWidth / 2, 0, centerX + lineWidth / 2, 0);
    grad.addColorStop(0, 'rgba(0, 225, 255, 0)');
    grad.addColorStop(0.5, 'rgba(120, 240, 255, 0.9)');
    grad.addColorStop(1, 'rgba(0, 225, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(centerX - lineWidth / 2, underlineY, lineWidth, 2);
    ctx.restore();

    // Tabs
    const tabHeight = 36;
    const tabGap = 14;
    const tabRects = [];
    let tabX = centerX;
    const tabWidths = debugMenuTabs.map((tab) => Math.max(110, ctx.measureText(tab.label).width + 32));
    const totalTabWidth = tabWidths.reduce((sum, w) => sum + w, 0) + tabGap * (debugMenuTabs.length - 1);
    tabX -= totalTabWidth / 2;
    const tabY = underlineY + 18;
    for (let i = 0; i < debugMenuTabs.length; i += 1) {
        const tab = debugMenuTabs[i];
        const tabW = tabWidths[i];
        const isActive = i === debugMenuTabIndex;
        ctx.save();
        ctx.fillStyle = isActive ? 'rgba(0, 190, 255, 0.22)' : 'rgba(255, 255, 255, 0.06)';
        ctx.strokeStyle = isActive ? 'rgba(86, 236, 255, 0.7)' : 'rgba(120, 200, 255, 0.12)';
        ctx.lineWidth = 1.5;
        ctx.fillRect(tabX, tabY, tabW, tabHeight);
        ctx.strokeRect(tabX + 0.5, tabY + 0.5, tabW - 1, tabHeight - 1);
        ctx.restore();

        ctx.save();
        ctx.fillStyle = isActive ? '#eafcff' : 'rgba(220, 240, 255, 0.75)';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tab.label, tabX + tabW / 2, tabY + tabHeight / 2);
        ctx.restore();

        tabRects.push({ id: tab.id, x: tabX, y: tabY, w: tabW, h: tabHeight });
        tabX += tabW + tabGap;
    }
    debugMenuTabGeom.tabRects = tabRects;

    // ===== Stats strip =====
    const stats = [
        { label: 'VIDA', value: `${Math.round(player.health)}/${Math.round(player.maxHealth)}`, color: '#5be08a' },
        { label: 'DANO', value: formatDebugValue(player.baseDamage), color: '#ff7a6b' },
        { label: 'VELOCIDADE', value: formatDebugValue(player.speed), color: '#ffd24a' },
        { label: 'CRÍTICO', value: `${Math.round((player.critChance || 0) * 100)}%`, color: '#ff9ad2' },
        { label: 'FASE', value: String(phase), color: '#9ad6ff' },
        { label: 'ARMA', value: player.weapon ? (player.weapon.name || player.weapon.type) : '—', color: '#5ad1ff' }
    ];
    const stripY = 104 + Math.max(0, subtitleLines.length - 1) * 16;
    const stripH = 42;
    const chipPad = 14;
    const chipW = (screenWidth - chipPad * (stats.length + 1)) / stats.length;
    ctx.save();
    for (let i = 0; i < stats.length; i++) {
        const cx = chipPad + i * (chipW + chipPad);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.strokeStyle = 'rgba(120, 200, 255, 0.18)';
        ctx.lineWidth = 1;
        ctx.fillRect(cx, stripY, chipW, stripH);
        ctx.strokeRect(cx, stripY, chipW, stripH);

        ctx.fillStyle = stats[i].color;
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(stats[i].label, cx + 10, stripY + 15);

        // Truncate value if too wide for the chip
        let val = stats[i].value;
        ctx.font = 'bold 16px Arial';
        if (ctx.measureText(val).width > chipW - 20) {
            while (val.length > 1 && ctx.measureText(val + '…').width > chipW - 20) {
                val = val.slice(0, -1);
            }
            val += '…';
        }
        ctx.fillStyle = '#eaf7ff';
        ctx.fillText(val, cx + 10, stripY + 33);
    }
    ctx.restore();

    // ===== Layout =====
    const panelX = Math.max(16, screenWidth * 0.02);
    const panelY = stripY + stripH + 12;
    const panelW = Math.min(screenWidth - panelX * 2, screenWidth * 0.96);
    const panelH = Math.max(360, screenHeight - panelY - 42);

    ctx.save();
    ctx.fillStyle = 'rgba(8, 20, 44, 0.92)';
    ctx.strokeStyle = 'rgba(56, 196, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeRect(panelX, panelY, panelW, panelH);
    ctx.restore();

    const listPanelX = panelX + 14;
    const listPanelY = panelY + 12;
    const listPanelW = Math.min(panelW * 0.58, 560);
    const listPanelH = panelH - 24;

    const itemH = 50;
    const gap = 8;
    const maxVisible = Math.max(1, Math.floor((listPanelH - 4) / (itemH + gap)));
    const visibleCount = Math.min(maxVisible, choices.length);
    const startIndex = Math.min(Math.max(selectedIndex - Math.floor(visibleCount / 2), 0), Math.max(0, choices.length - visibleCount));

    // List panel header
    ctx.save();
    ctx.fillStyle = '#8fd9ff';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`${debugMenuTabs[debugMenuTabIndex].label} (${choices.length})`, listPanelX + 4, listPanelY + 12);
    ctx.restore();

    const headerOffset = 18;
    const listTop = listPanelY + headerOffset;
    const listBottom = listPanelY + listPanelH;

    // store geometry for click handling (uses clickable top = listTop)
    debugMenuListGeom = { x: listPanelX, y: listTop, width: listPanelW, itemHeight: itemH, gap, visibleCount, startIndex, listPanelH, headerOffset };

    // Clip list area
    ctx.save();
    ctx.beginPath();
    ctx.rect(listPanelX, listTop, listPanelW, listBottom - listTop);
    ctx.clip();

    for (let i = 0; i < visibleCount; i++) {
        const index = startIndex + i;
        const choice = choices[index];
        const itemY = listTop + i * (itemH + gap);
        const isSelected = index === selectedIndex;
        const category = getDebugChoiceCategory(choice);
        const rarity = getDebugChoiceRarity(choice);

        ctx.save();
        if (isSelected) {
            ctx.fillStyle = `rgba(0, 225, 255, ${0.14 + 0.08 * pulse})`;
            ctx.strokeStyle = `rgba(123, 242, 255, ${0.6 + 0.4 * pulse})`;
            ctx.lineWidth = 2;
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
            ctx.strokeStyle = 'rgba(80, 180, 255, 0.16)';
            ctx.lineWidth = 1;
        }
        ctx.fillRect(listPanelX, itemY, listPanelW, itemH);
        ctx.strokeRect(listPanelX, itemY, listPanelW, itemH);
        ctx.restore();

        // Left category accent bar
        ctx.save();
        ctx.fillStyle = category.color;
        ctx.fillRect(listPanelX, itemY, 5, itemH);
        ctx.restore();

        // Category pill (vertically centered)
        const pillX = listPanelX + 12;
        const pillW = 72;
        const pillH = 20;
        const pillCY = itemY + itemH / 2;
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.strokeStyle = category.color;
        ctx.lineWidth = 1;
        ctx.fillRect(pillX, pillCY - pillH / 2, pillW, pillH);
        ctx.strokeRect(pillX, pillCY - pillH / 2, pillW, pillH);
        ctx.fillStyle = category.color;
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(category.label, pillX + pillW / 2, pillCY);
        ctx.restore();

        // Name (after pill, truncated if needed)
        const nameX = pillX + pillW + 12;
        const rarityW = rarity ? 84 : 0;
        const valueW = 74;
        const maxNameW = Math.max(90, (listPanelX + listPanelW - 12) - nameX - valueW - rarityW - 10);
        ctx.save();
        ctx.fillStyle = isSelected ? '#ffffff' : '#cfeaff';
        ctx.font = isSelected ? 'bold 14px Arial' : '13px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        let dispName = choice.name || '';
        if (maxNameW > 10 && ctx.measureText(dispName).width > maxNameW) {
            while (dispName.length > 1 && ctx.measureText(dispName + '…').width > maxNameW) {
                dispName = dispName.slice(0, -1);
            }
            dispName += '…';
        }
        ctx.fillText(dispName, nameX, pillCY);
        ctx.restore();

        // Value or status label (right side)
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const valueX = listPanelX + listPanelW - (rarity ? rarityW + 16 : 12);
        const statusText = debugMenuTabs[debugMenuTabIndex].id === 'invocar'
            ? (choice.enabled ? 'DISPONÍVEL' : 'BLOQUEADO')
            : `+${formatDebugValue(choice.value)}`;
        ctx.fillText(statusText, valueX, pillCY);
        ctx.restore();

        // Rarity pill (far right)
        if (rarity) {
            const rX = listPanelX + listPanelW - 12 - rarityW;
            ctx.save();
            ctx.fillStyle = 'rgba(255, 226, 138, 0.16)';
            ctx.strokeStyle = rarity.color;
            ctx.lineWidth = 1;
            ctx.fillRect(rX, pillCY - 10, rarityW, 20);
            ctx.strokeRect(rX, pillCY - 10, rarityW, 20);
            ctx.fillStyle = rarity.color;
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(rarity.label, rX + rarityW / 2, pillCY);
            ctx.restore();
        }
    }
    ctx.restore();

    // Scrollbar
    if (choices.length > visibleCount) {
        const trackX = listPanelX + listPanelW - 4;
        const trackY = listTop;
        const trackH = listBottom - listTop;
        const thumbH = Math.max(20, trackH * (visibleCount / choices.length));
        const thumbY = trackY + (trackH - thumbH) * (startIndex / Math.max(1, choices.length - visibleCount));
        ctx.save();
        ctx.fillStyle = 'rgba(120, 200, 255, 0.12)';
        ctx.fillRect(trackX, trackY, 4, trackH);
        ctx.fillStyle = 'rgba(120, 240, 255, 0.55)';
        ctx.fillRect(trackX, thumbY, 4, thumbH);
        ctx.restore();
    }

    // ===== Detail panel =====
    const detailX = listPanelX + listPanelW + 16;
    const detailW = Math.max(280, panelX + panelW - 14 - detailX);
    const detailY = listPanelY;
    const detailH = listPanelH;

    const selected = choices[selectedIndex];
    ctx.save();
    ctx.fillStyle = 'rgba(10, 26, 52, 0.6)';
    ctx.strokeStyle = 'rgba(56, 196, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.fillRect(detailX, detailY, detailW, detailH);
    ctx.strokeRect(detailX, detailY, detailW, detailH);
    ctx.restore();

    if (selected) {
        const cat = getDebugChoiceCategory(selected);
        const rar = getDebugChoiceRarity(selected);
        let dy = detailY + 26;

        // Name
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 19px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(selected.name || '', detailX + 16, dy);
        ctx.restore();
        dy += 22;

        // Badges
        const badgeW = 84;
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.strokeStyle = cat.color;
        ctx.lineWidth = 1;
        ctx.fillRect(detailX + 16, dy, badgeW, 22);
        ctx.strokeRect(detailX + 16, dy, badgeW, 22);
        ctx.fillStyle = cat.color;
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(cat.label, detailX + 16 + badgeW / 2, dy + 15);
        if (rar) {
            ctx.fillStyle = 'rgba(255, 226, 138, 0.14)';
            ctx.strokeStyle = rar.color;
            ctx.fillRect(detailX + 16 + badgeW + 10, dy, badgeW, 22);
            ctx.strokeRect(detailX + 16 + badgeW + 10, dy, badgeW, 22);
            ctx.fillStyle = rar.color;
            ctx.fillText(rar.label, detailX + 16 + badgeW + 10 + badgeW / 2, dy + 15);
        }
        ctx.restore();
        dy += 40;

        // Description (wrapped, capped to avoid overflow)
        ctx.save();
        ctx.fillStyle = 'rgba(200, 235, 255, 0.85)';
        ctx.font = '13px Arial';
        ctx.textAlign = 'left';
        let descLines = wrapDebugText(selected.desc || '', Math.max(180, detailW - 32), 13);
        const maxDescLines = 5;
        if (descLines.length > maxDescLines) {
            descLines = descLines.slice(0, maxDescLines);
            descLines[maxDescLines - 1] = descLines[maxDescLines - 1].replace(/.$/, '…');
        }
        for (const line of descLines) {
            ctx.fillText(line, detailX + 16, dy);
            dy += 18;
        }
        ctx.restore();
        dy += 10;

        // Stat rows
        let rows;
        if (debugMenuTabs[debugMenuTabIndex].id === 'invocar') {
            rows = [
                { label: 'Ação', value: selected.effect || '—', color: '#7bf2ff' },
                { label: 'Disponível', value: selected.enabled ? 'Sim' : 'Não', color: selected.enabled ? '#5be08a' : '#ff7a6b' },
                { label: 'Quantidade', value: String(debugMenuQuantity), color: '#5ad1ff' }
            ];
        } else {
            rows = [
                { label: 'Valor ao aplicar', value: `+${formatDebugValue(selected.value)}`, color: '#7bf2ff' },
                { label: 'Atual', value: getDebugChoiceCurrentValue(selected), color: '#eaf7ff' },
                { label: 'Total (xQTD)', value: `+${formatDebugValue(selected.value * debugMenuQuantity)}`, color: '#5be08a' }
            ];
        }
        const rowBoxW = Math.max(220, detailW - 32);
        for (const row of rows) {
            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(detailX + 16, dy, rowBoxW, 28);
            ctx.fillStyle = 'rgba(180, 225, 255, 0.8)';
            ctx.font = '12px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(row.label, detailX + 26, dy + 18);
            ctx.fillStyle = row.color;
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(row.value, detailX + 16 + rowBoxW - 12, dy + 18);
            ctx.restore();
            dy += 34;
        }

        // Quantity stepper
        dy += 6;
        const stepY = dy;
        const stepH = 40;
        const minusW = 44;
        const plusW = 44;
        const qtyW = Math.max(96, detailW - 32 - minusW - plusW - 12);
        const baseX = detailX + 16;

        ctx.save();
        // minus
        ctx.fillStyle = 'rgba(255, 120, 120, 0.14)';
        ctx.strokeStyle = 'rgba(255, 150, 150, 0.5)';
        ctx.lineWidth = 1;
        ctx.fillRect(baseX, stepY, minusW, stepH);
        ctx.strokeRect(baseX, stepY, minusW, stepH);
        ctx.fillStyle = '#ffd0d0';
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('−', baseX + minusW / 2, stepY + 28);
        // qty
        ctx.fillStyle = 'rgba(0, 225, 255, 0.12)';
        ctx.strokeStyle = 'rgba(123, 242, 255, 0.5)';
        ctx.fillRect(baseX + minusW + 6, stepY, qtyW, stepH);
        ctx.strokeRect(baseX + minusW + 6, stepY, qtyW, stepH);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(String(debugMenuQuantity), baseX + minusW + 6 + qtyW / 2, stepY + 28);
        // plus
        ctx.fillStyle = 'rgba(120, 255, 180, 0.14)';
        ctx.strokeStyle = 'rgba(150, 255, 200, 0.5)';
        ctx.fillRect(baseX + minusW + 6 + qtyW + 6, stepY, plusW, stepH);
        ctx.strokeRect(baseX + minusW + 6 + qtyW + 6, stepY, plusW, stepH);
        ctx.fillStyle = '#cfffd9';
        ctx.fillText('+', baseX + minusW + 6 + qtyW + 6 + plusW / 2, stepY + 28);
        // label
        ctx.fillStyle = 'rgba(150, 230, 255, 0.7)';
        ctx.font = '11px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('QUANTIDADE  (←/→)', baseX, stepY - 6);
        ctx.restore();
    } else {
        ctx.save();
        ctx.fillStyle = 'rgba(180, 225, 255, 0.6)';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        const emptyText = debugMenuTabs[debugMenuTabIndex].id === 'invocar'
            ? 'Nenhuma ação disponível'
            : 'Nenhuma melhoria disponível';
        ctx.fillText(emptyText, detailX + detailW / 2, detailY + detailH / 2);
        ctx.restore();
    }

    // ===== Footer =====
    ctx.save();
    ctx.fillStyle = '#a6eeff';
    ctx.font = '13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('↑/↓ ou W/S: navegar   •   ←/→ ou A/D: quantidade   •   Enter/Espaço: aplicar   •   Esc: fechar', centerX, screenHeight - 26);
    ctx.restore();

    // ===== Apply flash toast =====
    if (debugMenuFlashTimer > 0) {
        debugMenuFlashTimer -= 1;
        const a = Math.min(1, debugMenuFlashTimer / 20);
        ctx.save();
        ctx.globalAlpha = a;
        const tw = 260;
        const th = 46;
        const tx = centerX - tw / 2;
        const ty = screenHeight - 86;
        ctx.fillStyle = 'rgba(20, 60, 40, 0.92)';
        ctx.strokeStyle = 'rgba(120, 255, 180, 0.8)';
        ctx.lineWidth = 2;
        ctx.fillRect(tx, ty, tw, th);
        ctx.strokeRect(tx, ty, tw, th);
        ctx.fillStyle = '#b6ffd0';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(debugMenuFlashText, centerX, ty + 29);
        ctx.restore();
    }
}

function wrapDebugText(text, maxWidth, fontSize) {
    if (!text) return [];
    ctx.save();
    ctx.font = `${fontSize}px Arial`;
    const words = String(text).split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
        const test = current ? current + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && current) {
            lines.push(current);
            current = word;
        } else {
            current = test;
        }
    }
    if (current) lines.push(current);
    ctx.restore();
    return lines;
}

function drawUpgradeMenu() {
    const screenWidth = canvas.width;
    const screenHeight = canvas.height;
    ctx.fillStyle = 'rgba(5, 10, 20, 0.95)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    ctx.save();
    const centerX = screenWidth / 2;
    const centerY = screenHeight / 2;
    const ring = ctx.createRadialGradient(centerX, centerY, 120, centerX, centerY, 460);
    ring.addColorStop(0, 'rgba(0, 190, 255, 0.08)');
    ring.addColorStop(0.55, 'rgba(0, 190, 255, 0.02)');
    ring.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = ring;
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(8, 20, 44, 0.94)';
    ctx.strokeStyle = 'rgba(56, 196, 255, 0.16)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(48, 36, screenWidth - 96, screenHeight - 80);
    ctx.strokeRect(48, 36, screenWidth - 96, screenHeight - 80);
    ctx.restore();

    ctx.fillStyle = '#8ff4ff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 210, 255, 0.55)';
    ctx.shadowBlur = 10;
    ctx.fillText('Escolha um Upgrade', screenWidth / 2, 82);
    ctx.shadowBlur = 0;

    const buttonWidth = 220;
    const buttonHeight = 86;
    const verticalSpacing = 20;
    const leftX = Math.max(72, screenWidth * 0.12);
    const centerXPos = (screenWidth - buttonWidth) / 2;
    const rightX = Math.min(screenWidth - buttonWidth - 72, screenWidth * 0.88 - buttonWidth);
    const topY = screenHeight / 2 - buttonHeight - verticalSpacing / 2;
    const bottomY = screenHeight / 2 + verticalSpacing / 2;
    const positions = [
        { x: leftX, y: topY },
        { x: leftX, y: bottomY },
        { x: centerXPos, y: topY },
        { x: centerXPos, y: bottomY },
        { x: rightX, y: topY },
        { x: rightX, y: bottomY }
    ];

    for (let i = 0; i < upgradeChoices.length; i++) {
        const { x: bx, y: by } = positions[i] || { x: 0, y: 0 };
        const isSelected = i === selectedUpgradeIndex;
        const upgrade = upgradeChoices[i] || {};
        const isExclusive = !!upgrade.exclusive;
        const isExtreme = !!upgrade.extreme;

        // Draw glow/background depending on rarity
        if (isExtreme) {
            ctx.save();
            const glow = ctx.createLinearGradient(bx - 8, by - 8, bx + buttonWidth + 8, by + buttonHeight + 8);
            glow.addColorStop(0, upgrade.extremeColor || '#ff88cc');
            glow.addColorStop(0.5, '#ffffff');
            glow.addColorStop(1, upgrade.extremeColor || '#88ffcc');
            ctx.globalAlpha = 0.14;
            ctx.fillStyle = glow;
            ctx.fillRect(bx - 6, by - 6, buttonWidth + 12, buttonHeight + 12);
            ctx.globalAlpha = 1;
            ctx.restore();
        }

        ctx.save();
        if (isExclusive) {
            ctx.fillStyle = isSelected ? 'rgba(232, 200, 110, 0.32)' : 'rgba(172, 132, 32, 0.16)';
            ctx.strokeStyle = isSelected ? '#ffe28a' : '#f1d17d';
        } else {
            ctx.fillStyle = isSelected ? 'rgba(6, 180, 255, 0.18)' : 'rgba(15, 28, 58, 0.96)';
            ctx.strokeStyle = isSelected ? '#7bf2ff' : 'rgba(80, 180, 255, 0.25)';
        }
        ctx.lineWidth = isSelected ? 3.0 : 2.0;
        ctx.fillRect(bx, by, buttonWidth, buttonHeight);
        ctx.strokeRect(bx + 0.5, by + 0.5, buttonWidth - 1, buttonHeight - 1);

        if (isSelected) {
            ctx.shadowColor = isExclusive ? 'rgba(255, 220, 140, 0.45)' : 'rgba(0, 220, 255, 0.35)';
            ctx.shadowBlur = 24;
            ctx.fillStyle = isExclusive ? 'rgba(255, 220, 120, 0.08)' : 'rgba(0, 200, 255, 0.08)';
            ctx.fillRect(bx, by, buttonWidth, buttonHeight);
        }
        ctx.restore();

        if (isExclusive) {
            ctx.save();
            ctx.fillStyle = '#ffefb5';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('EXCLUSIVO', bx + 12, by + 16);
            ctx.restore();
        }

        if (isExtreme) {
            ctx.save();
            ctx.fillStyle = upgrade.extremeColor || '#ff88cc';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'right';
            ctx.fillText('EXTREMO', bx + buttonWidth - 12, by + 18);
            ctx.restore();
        }

        ctx.save();
        ctx.fillStyle = isSelected ? '#fff8dd' : '#e7f7ff';
        ctx.font = isSelected ? 'bold 16px Arial' : '15px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        wrapText(upgrade.name || '', bx + buttonWidth / 2, by + buttonHeight / 2 - 10, buttonWidth - 18, 18);
        ctx.restore();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.fillRect(bx + 12, by + buttonHeight - 26, buttonWidth - 24, 20);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textBaseline = 'top';
        ctx.fillText(`+${upgrade.value} ${upgrade.effect ? upgrade.effect.replace(/([A-Z])/g, ' $1') : ''}`.trim(), bx + buttonWidth / 2, by + buttonHeight - 24);
    }

    if (upgradeChoices[selectedUpgradeIndex]) {
        const desc = upgradeChoices[selectedUpgradeIndex].desc || '';
        const infoY = bottomY + buttonHeight + 42;
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.fillRect(84, infoY - 32, screenWidth - 168, 94);
        ctx.strokeStyle = 'rgba(120, 230, 255, 0.16)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(84.5, infoY - 32.5, screenWidth - 169, 94);
        ctx.restore();

        ctx.fillStyle = '#dcf7ff';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        wrapText(desc, screenWidth / 2, infoY - 8, screenWidth - 220, 20);
    }

    ctx.fillStyle = '#a6eeff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Use as Setas ou Clique para Selecionar', screenWidth / 2, screenHeight - 58);
    ctx.fillText('Pressione Espaço ou Enter para Confirmar', screenWidth / 2, screenHeight - 34);
}

function getUpgradeDescription(upgrade) {
    const ply = player || {};
    const effect = upgrade.effect;
    const value = upgrade.value;
    const percent = (num) => `${Math.round(num * 100) / 100}`;

    switch (effect) {
        case 'maxHealth':
            return `Vida máxima: ${ply.maxHealth || 0} → ${Math.max(0, (ply.maxHealth || 0) + value)}. Aumenta sua reserva total de vida e permite aguentar mais dano.`;
        case 'baseDamage':
            return `Dano base: ${ply.baseDamage || 0} → ${Math.max(0, (ply.baseDamage || 0) + value)}. Todos os seus ataques físicos e à distância ficam mais fortes.`;
        case 'speed':
            return `Velocidade: ${ply.speed || 0} → ${Math.max(0, (ply.speed || 0) + value)}. Você se move mais rápido pelo mapa.`;
        case 'healthRegen':
            return `Regeneração: ${ply.healthRegen || 0} → ${Math.max(0, (ply.healthRegen || 0) + value)} HP/s. Você recupera vida automaticamente entre confrontos.`;
        case 'damageReduction':
            return `Proteção: ${ply.damageReduction || 0} → ${Math.max(0, (ply.damageReduction || 0) + value)}. Reduz o dano recebido por ataques inimigos.`;
        case 'cooldownReduction':
            return `Redução de cooldown: ${ply.cooldownReduction || 0} → ${Math.max(0, (ply.cooldownReduction || 0) + value)}. Seus ataques recarregam mais rápido.`;
        case 'weaponDamage':
            return `Força de arma: ${ply.weaponDamage || 0} → ${Math.max(0, (ply.weaponDamage || 0) + value)}. Aumenta o dano extra aplicado às armas.`;
        case 'critChance':
            return `Chance de crítico: ${percent(ply.critChance || 0)}% → ${percent((ply.critChance || 0) + value)}%. Aumenta a probabilidade de causar dano aumentado.`;
        case 'critDamage':
            return `Dano crítico: ${percent(ply.critDamage || 0)}% → ${percent((ply.critDamage || 0) + value)}%. Críticos passam a causar ainda mais dano.`;
        case 'extraProjectiles':
            return `Projéteis extras: ${ply.extraProjectiles || 0} → ${Math.max(0, (ply.extraProjectiles || 0) + value)}. Seus ataques à distância disparam mais projéteis.`;
        case 'spreadProjectiles':
            return `Largura do ataque: ${ply.spreadProjectiles || 0} → ${Math.max(0, (ply.spreadProjectiles || 0) + value)}. Aumenta a cobertura dos seus projéteis.`;
        case 'lateShots':
            return `Tiros tardios: ${ply.lateShots || 0} → ${Math.max(0, (ply.lateShots || 0) + value)}. Projéteis extras aparecem após o ataque inicial.`;
        case 'spinAttack':
            return `Nível de Ataque Triplo: ${ply.spinAttackLevel || 0} → ${Math.max(0, (ply.spinAttackLevel || 0) + value)}. Adiciona ataques automáticos extras.`;
        case 'attackSpeed':
            return `Velocidade de ataque: ${percent(ply.attackSpeed || 0)}% → ${percent((ply.attackSpeed || 0) + value)}%. Seus cooldowns são reduzidos.`;
        case 'projectileSpeedBonus':
            return `Velocidade de projéteis: ${ply.projectileSpeedBonus || 0} → ${Math.max(0, (ply.projectileSpeedBonus || 0) + value)}. Seus tiros atingem os inimigos mais rápido.`;
        case 'bowDashMax':
            return `Carga de dash do arco: ${ply.bowDashMaxCharges || 0} → ${Math.max(0, (ply.bowDashMaxCharges || 0) + value)}. Mais dashes para escapar ou atacar.`;
        case 'bowRicochet':
            const ricochetLevel = ply.bowRicochet || 0;
            const newRicochetLevel = Math.max(0, (ply.bowRicochet || 0) + value);
            return `Ricochete de flechas: ${ricochetLevel} → ${newRicochetLevel}. Cada melhoria adiciona um projétil extra ao arco e concede aos projéteis a capacidade de destruir tiros inimigos, saltando para outro alvo.`;
        case 'bowFirstShot':
            return `Tiro Certeiro: ${ply.bowFirstShot || 0} → ${Math.max(0, (ply.bowFirstShot || 0) + value)}. O primeiro tiro contra cada monstro tem ${value}% de chance de crítico adicional.`;
        case 'bowReadyStance':
            return `Postura Firme: ${ply.bowReadyStance || 0} → ${Math.max(0, (ply.bowReadyStance || 0) + value)}. Quando parado, tiros têm ${value}% de chance de crítico e críticos causam 25% mais dano.`;
        case 'staffChargeMax':
            return `Carga de staff: ${ply.staffChargeMax || 0} → ${Math.max(0, (ply.staffChargeMax || 0) + value)}. Aumenta o número de cargas antes do burst.`;
        case 'staffBurstCount':
            return `Orbes do burst: ${ply.staffBurstCount || 0} → ${Math.max(0, (ply.staffBurstCount || 0) + value)}. Solta mais orbes quando o burst dispara.`;
        case 'staffBurstCooldownMax':
            return `Cooldown do burst: ${ply.staffBurstCooldownMax || 0} → ${Math.max(0, (ply.staffBurstCooldownMax || 0) - value)}. Reduz o tempo entre bursts de staff.`;
        case 'staffHomingBurst':
            return `Ressonância Arcana: ${ply.staffHomingBurst || 0} → ${Math.max(0, (ply.staffHomingBurst || 0) + value)}. As orbes do burst ganham maior rastreamento e range, tornando o ataque muito mais preciso.`;
        case 'swordRange':
            return `Alcance da espada: ${(ply.weapon && ply.weapon.type === 'sword' ? ply.weapon.range : 0)} → ${Math.max(0, (ply.weapon && ply.weapon.type === 'sword' ? ply.weapon.range : 0) + value)}. Aumenta o alcance dos seus golpes.`;
        case 'parryMax':
            return `Cooldown do parry: ${ply.parryMax || 0} → ${Math.max(0, (ply.parryMax || 0) - value)}. Você consegue parryar com mais frequência.`;
        case 'parryChargePerHit':
            return `Carga por golpe: ${ply.parryChargePerHit || 0}% -> ${Math.max(0, (ply.parryChargePerHit || 0) + value)}%. Cada ataque reduz uma parte do cooldown do parry.`;
        case 'parryDefenseBonus':
            return `Defesa de Parry: ${ply.parryDefenseBonus || 0}% -> ${Math.max(0, (ply.parryDefenseBonus || 0) + value)}%. Quando nao pode parryar, reduz dano recebido e ganha escudos visuais.`;
        case 'parryHealOnUse':
            return `Cura de Parry: ${ply.parryHealOnUse || 0}% -> ${Math.max(0, (ply.parryHealOnUse || 0) + value)}%. Cura ao fazer parry com sucesso.`;
        case 'parryConfusionChance':
            return `Parry Confusão: ${ply.parryConfusionChance || 0}% -> ${Math.max(0, (ply.parryConfusionChance || 0) + value)}%. Chance de confundir o inimigo ao executar um parry.`;
        case 'attackMove':
            return `Investida Cortante: ${Math.floor((ply.attackMove || 0) / 6)} nível(is) -> ${Math.floor(((ply.attackMove || 0) + value) / 6)}. Cada nível faz o dash da espada disparar 1 dash normal a mais.`;
        case 'parryConfusionChance':
            return `Parry Confusao: ${ply.parryConfusionChance || 0}% -> ${Math.max(0, (ply.parryConfusionChance || 0) + value)}%. Chance de monstro atacar na direcao oposta.`;
        case 'parryHealOverTime':
            return `Vínculo Vital: ${ply.parryHealOverTime || 0} nível(is) -> ${Math.max(0, (ply.parryHealOverTime || 0) + value)}. Cura ${(4 * (ply.parryHealOverTime || 0))}% -> ${(4 * (ply.parryHealOverTime || 0) + value)}% da vida máxima por segundo por 3s após cada parry.`;
        case 'tornadoCount':
            return `Lanças do tornado: ${ply.tornadoBurstExtraCount || 0} → ${Math.max(0, (ply.tornadoBurstExtraCount || 0) + value)}. Gera mais lanças no ataque tornado.`;
        case 'tornadoDuration':
            return `Duração do tornado: ${ply.tornadoBurstExtraDuration || 0} → ${Math.max(0, (ply.tornadoBurstExtraDuration || 0) + value)}. O tornado permanece ativo por mais tempo.`;
        case 'coneAngleBonus':
            return `Abertura do cone: ${ply.tornadoConeAngleBonus || 0} → ${Math.max(0, (ply.tornadoConeAngleBonus || 0) + value)}. O ataque do tornado cobre área maior.`;
        default:
            return upgrade.desc || '';
    }
}

function gameLoop() {
    gameFrameCount += 1;
    if (typeof cameraLockTarget === 'object' && cameraLockTarget !== null) {
        cameraLockTarget.timer--;
        if (cameraLockTarget.timer <= 0) cameraLockTarget = null;
    }
    let screenShakeActive = false;
    if (screenShakeTimer > 0) {
        screenShakeActive = true;
        const shakeAmount = 3;
        const shakeX = (Math.random() - 0.5) * shakeAmount;
        const shakeY = (Math.random() - 0.5) * shakeAmount;
        ctx.save();
        ctx.translate(shakeX, shakeY);
        screenShakeTimer--;
    }

    if (isSelectingWeapon) {
        drawWeaponSelection();
    } else if (isDebugMenuOpen) {
        beginCamera();
        drawBackground();
        player.draw();
        currentMonster.draw();
        drawMonsterDeathEffects();
        drawWeaponPickups();
        drawProjectiles();
        drawCritEffects();
        drawMapDecor();
        endCamera();

        updateHealthBars();
        updateUI();

        if (overlayCtx) {
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            drawDebugMenu(overlayCtx);
        } else {
            drawDebugMenu();
        }
    } else if (upgradeDelayTimer > 0) {
        beginCamera();
        drawBackground();
        player.draw();
        currentMonster.draw();
        drawMonsterDeathEffects();
        drawWeaponPickups();
        drawProjectiles();
        drawCritEffects();
        drawMapDecor();
        endCamera();

        updateHealthBars();
        updateUI();

        upgradeDelayTimer--;
        if (upgradeDelayTimer <= 0) {
            upgradeDelayTimer = 0;
            upgradeOverlayAnimating = true;
        }

        drawCountdownOverlay('Melhorias!', 'Pense bem...', upgradeOverlayY, upgradeOverlayAlpha);
    } else if (upgradeOverlayAnimating) {
        beginCamera();
        drawBackground();
        player.draw();
        currentMonster.draw();
        drawMonsterDeathEffects();
        drawWeaponPickups();
        drawProjectiles();
        drawCritEffects();
        drawMapDecor();
        endCamera();

        updateHealthBars();
        updateUI();
        drawUpgradeMenu();

        upgradeOverlayY -= 3;
        upgradeOverlayAlpha -= 0.04;
        if (upgradeOverlayAlpha < 0) upgradeOverlayAlpha = 0;
        if (upgradeOverlayY < -60 || upgradeOverlayAlpha <= 0) {
            isUpgrading = true;
            pendingUpgrade = false;
            upgradeOverlayAnimating = false;
        }
        drawCountdownOverlay('Melhorias em breve...', '', upgradeOverlayY, upgradeOverlayAlpha);
    } else if (isUpgrading) {
        beginCamera();
        drawBackground();
        player.draw();
        currentMonster.draw();
        drawMonsterDeathEffects();
        drawWeaponPickups();
        drawProjectiles();
        drawCritEffects();
        drawMapDecor();
        endCamera();

        updateHealthBars();
        updateUI();
        drawUpgradeMenu();
    } else if (!gameOver) {
        if (roundStartTimer > 0) {
            beginCamera();
            drawBackground();
            drawAmbientAnimals();
            drawAmbientCritters();
            player.draw();
            currentMonster.draw();
            drawGhostArmy();
            drawMonsterDeathEffects();
            drawWeaponPickups();
            drawProjectiles();
            drawCritEffects();
            drawMapDecor();
            endCamera();

            updateHealthBars();
            updateUI();
            const countdownNumber = Math.max(1, Math.ceil(roundStartTimer / 20));
            const subtitle = countdownNumber === 1 ? 'Vai!' : '';
            drawCountdownOverlay(countdownNumber.toString(), subtitle);
            roundStartTimer--;
            if (screenShakeActive) ctx.restore();
            requestAnimationFrame(gameLoop);
            return;
        }

        // Se frameFreeze ativo, pular atualizações por 1 frame (apenas desenhar)
        if (frameFreeze > 0) {
            frameFreeze--;
            beginCamera();
            drawBackground();
            drawAmbientAnimals();
            drawAmbientCritters();
            player.draw();
            currentMonster.draw();
            drawGhostArmy();
            drawMonsterDeathEffects();
            drawWeaponPickups();
            drawProjectiles();
            drawMonsterHitscans();
            drawCritEffects();
            drawAfterImages();
            drawAccelParticles();
            drawMapDecor();
            endCamera();

            updateHealthBars();
            updateUI();
            // overlay esbranquiçado durante o freeze (20% branco)
            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.20)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
            if (screenShakeActive) ctx.restore();
            requestAnimationFrame(gameLoop);
            return;
        }

        if (slowdownTimer > 0) {
            const totalSlowdownFrames = slowdownRampFrames * 2 + slowdownHoldFrames;
            const elapsed = totalSlowdownFrames - slowdownTimer;
            if (elapsed < slowdownRampFrames) {
                const progress = elapsed / slowdownRampFrames;
                const eased = 0.5 - Math.cos(Math.PI * Math.max(0, Math.min(1, progress))) / 2;
                timeScale = 1 - (1 - slowdownTarget) * eased;
            } else if (elapsed < slowdownRampFrames + slowdownHoldFrames) {
                timeScale = slowdownTarget;
            } else {
                const progress = (elapsed - slowdownRampFrames - slowdownHoldFrames) / slowdownRampFrames;
                const eased = 0.5 - Math.cos(Math.PI * Math.max(0, Math.min(1, progress))) / 2;
                timeScale = slowdownTarget + (1 - slowdownTarget) * eased;
            }
            slowdownTimer--;
        } else {
            timeScale = 1;
        }

        if (roarFreezeTimer > 0) {
            timeScale = 0.05;
            roarFreezeTimer--;
        }

        // Atualizar
        const transitionFrozen = isMonsterTransitionActive();
        let canInteractWithMonster = false;

        if (!transitionFrozen) {
            player.update(keys);
            
            // Verificar colisão, entradas e saída de construções
            checkConstructionCollision();
            checkConstructionEntranceCollision();
            checkConstructionExit();
            
            // Atualizar inimigos interiores
            if (playerInsideConstruction) {
                updateInteriorEnemies();
            }

            if (currentMonster && currentMonster.health <= 0) {
                if (!currentMonster.isDying) {
                    currentMonster.startDeathAnimation();
                } else {
                    currentMonster.updateDeathAnimation();
                }
            } else if (currentMonster) {
                const monsterPrevX = currentMonster.x;
                const monsterPrevY = currentMonster.y;
                currentMonster.update(player.x + player.width / 2, player.y + player.height / 2);
                resolveEntityWallCollision(currentMonster, monsterPrevX, monsterPrevY);
                clampEntityToMapCircle(currentMonster);
            }

            updateAmbientAnimals();
            updateAmbientCritters();
            updateCastleBoneOrbiters();
            updateGhostArmy();
            updateProjectiles();
            updateThrownExplosives();
            updateFireZones();
            updateGrenadeFragments();
            updateBurningEffects();
            updateWeaponPickups();
            updateMonsterHitscans();
            updateAndDrawSwarmMarks();
            updateDelayedShots();
            updateSweatEffects();
            updateAfterImages();
            updateAccelParticles();
            updateMonsterDeathEffects();
            updatePortalEffects();
            updateEvaporationEffects();
            updateTrackerProjectiles();
            updateCastleBossSpawnTimer();
            updateCastleBossAlert();

            // Verificar colisão de contato com o monstro (AABB - Axis-Aligned Bounding Box)
            canInteractWithMonster = currentMonster && currentMonster.health > 0 && !currentMonster.isDying;
            if (canInteractWithMonster) {
                const isColliding = 
                    player.x < currentMonster.x + currentMonster.width &&
                    player.x + player.width > currentMonster.x &&
                    player.y < currentMonster.y + currentMonster.height &&
                    player.y + player.height > currentMonster.y;

                if (isColliding && currentMonster.attackCooldown === 0) {
                    if (player.dashTimer > 0 || player.postDashInvulnTimer > 0 || player.slashDashInvulnTimer > 0) {
                        currentMonster.attackCooldown = currentMonster.type === 'croc' ? 180 : 60;
                    } else if (player.weapon && player.weapon.type === 'gun' && player.gunReloadCooldown > 0 && player.gunReloadInvulnCharges > 0) {
                        player.gunReloadInvulnCharges = 0;
                        spawnAfterImage({
                            kind: 'player',
                            x: player.x,
                            y: player.y,
                            width: player.width,
                            height: player.height,
                            life: 18,
                            maxLife: 18,
                            baseAlpha: 0.55
                        });
                        currentMonster.attackCooldown = currentMonster.type === 'croc' ? 180 : 60;
                    } else {
                        let effectiveDamage = Math.max(0, currentMonster.getAttackDamage() - player.damageReduction);
                        if (player.parryCooldown > 0 && player.parryDefenseBonus > 0) {
                            effectiveDamage *= (1 - player.parryDefenseBonus / 100);
                        }
                        player.health -= effectiveDamage;
                        if (currentMonster.type === 'simple') {
                            tryApplyPlayerConfusionFromAttack(currentMonster.type, { chance: 2 });
                        } else if (currentMonster.type === 'croc') {
                            player.stunTimer = Math.max(player.stunTimer || 0, 12);
                            tryApplyPlayerConfusionFromAttack('croc', {
                                chance: 100,
                                durationFrames: Math.round(0.75 * 60)
                            });
                            player.poisonTimer = Math.max(player.poisonTimer || 0, 5 * 60);
                            player.poisonTickTimer = 60;
                            player.poisonDamagePerTick = 2;
                            currentMonster.consecutiveHitsOnPlayer = (currentMonster.consecutiveHitsOnPlayer || 0) + 1;
                            if (currentMonster.consecutiveHitsOnPlayer >= 2) {
                                const monsterCenterX = currentMonster.x + currentMonster.width / 2;
                                const monsterCenterY = currentMonster.y + currentMonster.height / 2;
                                const escapeDir = Math.atan2(
                                    monsterCenterY - (player.y + player.height / 2),
                                    monsterCenterX - (player.x + player.width / 2)
                                );
                                currentMonster.sprintEscapeDir = escapeDir;
                                currentMonster.sprintEscapeTimer = 40;
                                currentMonster.consecutiveHitsOnPlayer = 0;
                            }
                        }
                        currentMonster.attackCooldown = currentMonster.type === 'croc' ? 180 : 60;
                    }
                }
            } else if (currentMonster && currentMonster.type === 'croc') {
                currentMonster.consecutiveHitsOnPlayer = 0;
            }

            processMeleeHit();
            processConeHit();

            if (player.autoAttackEnabled && player.attackCooldown === 0 && canInteractWithMonster) {
                attemptAttack();
            }
        } else {
            if (currentMonster && currentMonster.health <= 0) {
                if (!currentMonster.isDying) {
                    currentMonster.startDeathAnimation();
                } else {
                    currentMonster.updateDeathAnimation();
                }
            }
            updateMonsterDeathEffects();
        }

        // Verificar morte do monstro
        if (currentMonster && currentMonster.health <= 0) {
            if (!currentMonster.isDying) {
                currentMonster.startDeathAnimation();
            } else if (currentMonster.deathTimer <= 0) {
                monstersDefeated++;
                defeatedTotal++;
                clearUncollectedWeaponPickups();
                weaponPickupSpawnCounter++;
                if (weaponPickupSpawnCounter >= 5) {
                    weaponPickupSpawnCounter = 0;
                    spawnWeaponPickup();
                }
                // Unlock passives based on monster type
                if (currentMonster.type === 'shooter' && !player.shooterMachineGunUnlocked) {
                    player.shooterMachineGunUnlocked = true;
                    player.shooterMachineGunCount = 0;
                    spawnCasterPortalEffect(player.x + player.width / 2, player.y + player.height / 2 - 10, '#ffaa33');
                    spawnEvaporationEffect(player.x + player.width / 2, player.y + player.height / 2, '#ffaa33', 20, 12);
                }
                if (currentMonster.type === 'swarm' && !player.swarmNubeUnlocked) {
                    player.swarmNubeUnlocked = true;
                    player.swarmNubeCount = 0;
                    spawnCasterPortalEffect(player.x + player.width / 2, player.y + player.height / 2 - 10, '#9c4fff');
                    spawnEvaporationEffect(player.x + player.width / 2, player.y + player.height / 2, '#9c4fff', 20, 12);
                }
                if (currentMonster.type === 'caster' && !player.casterPortalUnlocked) {
                    player.casterPortalUnlocked = true;
                    player.casterPortalCount = 0;
                    spawnCasterPortalEffect(player.x + player.width / 2, player.y + player.height / 2 - 10, '#70e7ff');
                    spawnEvaporationEffect(player.x + player.width / 2, player.y + player.height / 2, '#70e7ff', 20, 12);
                }
                if (currentMonster.type === 'avianightmare' && !player.avianTrackerUnlocked) {
                    player.avianTrackerUnlocked = true;
                    player.avianTrackerCount = 0;
                    spawnCasterPortalEffect(player.x + player.width / 2, player.y + player.height / 2 - 10, '#ff88cc');
                    spawnEvaporationEffect(player.x + player.width / 2, player.y + player.height / 2, '#ff88cc', 20, 12);
                }
                if (currentMonster.type === 'smart' && !player.smartRicochetUnlocked) {
                    player.smartRicochetUnlocked = true;
                    player.smartRicochetCount = 0;
                    spawnCasterPortalEffect(player.x + player.width / 2, player.y + player.height / 2 - 10, '#88ff88');
                    spawnEvaporationEffect(player.x + player.width / 2, player.y + player.height / 2, '#88ff88', 20, 12);
                }
                if (currentMonster.type === 'simple' && !player.simpleExplosiveUnlocked) {
                    player.simpleExplosiveUnlocked = true;
                    player.simpleExplosiveCount = 0;
                    spawnCasterPortalEffect(player.x + player.width / 2, player.y + player.height / 2 - 10, '#ff6644');
                    spawnEvaporationEffect(player.x + player.width / 2, player.y + player.height / 2, '#ff6644', 20, 12);
                }
                if (currentMonster.type === 'croc' && !player.crocFreezerUnlocked) {
                    player.crocFreezerUnlocked = true;
                    player.crocFreezerCount = 0;
                    spawnCasterPortalEffect(player.x + player.width / 2, player.y + player.height / 2 - 10, '#55ddff');
                    spawnEvaporationEffect(player.x + player.width / 2, player.y + player.height / 2, '#55ddff', 20, 12);
                }
                if (currentMonster.type === 'tank' && !player.tankImpulseUnlocked) {
                    player.tankImpulseUnlocked = true;
                    player.tankImpulseCount = 0;
                    spawnCasterPortalEffect(player.x + player.width / 2, player.y + player.height / 2 - 10, '#ff3333');
                    spawnEvaporationEffect(player.x + player.width / 2, player.y + player.height / 2, '#ff3333', 20, 12);
                }
                if (currentMonster.type === 'castle_bone_sphere') {
                    spawnCastleBossDeathWaves();
                    spawnCastleBossDeathSkeletons();
                }
                if (monstersDefeated >= 2) {
                    phase++;
                    monstersDefeated = 0;
                    prevPhaseMonsterTypes = new Set(phaseMonsterTypes);
                    phaseMonsterTypes.clear();
                    simpleMonsterSpawnedInEarlyPhases = false;
                    healPlayer(15);
                }
                spawnNewMonster();
            }
        }

        // Verificar morte do jogador
        if (player.health <= 0) {
            gameOver = true;
        }

        // Desenhar
        if (playerInsideConstruction) {
            // Renderizar interior da construção
            drawConstructionInterior();
            beginCamera();
            player.draw();
            drawConstructionExitZone();
            drawCurrentInteriorEnemies();
            drawProjectiles();
            drawThrownExplosives();
            drawFireZones();
            drawGrenadeFragments();
            drawEvaporationEffects();
            drawCastleBoneOrbiters();
            drawMonsterHitscans();
            drawAfterImages();
            drawCritEffects();
            endCamera();
        } else {
            // Renderizar mapa normal
            beginCamera();
            drawBackground();
            drawAmbientAnimals();
            drawAmbientCritters();
            player.draw();
            currentMonster.draw();
            drawGhostArmy();
            drawMonsterDeathEffects();
            drawWeaponPickups();
            drawPortalEffects();
            drawTrackerProjectiles();
            drawProjectiles();
            drawThrownExplosives();
            drawFireZones();
            drawGrenadeFragments();
            drawEvaporationEffects();
            drawThrownExplosives();
            drawFireZones();
            drawGrenadeFragments();
            drawCastleBoneOrbiters();
            drawMonsterHitscans();
            drawSlowdownInsects();
            drawCritEffects();
            drawSweatEffects();
            drawAfterImages();
            drawMapDecor();
            drawConstructionEntrancePortals();
            endCamera();
        }

        drawPlayerConfusionOverlay();
        drawWeaponPickupIndicators();
        drawOffscreenMonsterIndicator();
        drawOffscreenTransitionIndicator();
        updateHealthBars();
        updateUI();
        drawCastleBossAlertOverlay();

        if (timeScale < 1 && roarFreezeTimer <= 0) {
            const totalSlowdownFrames = slowdownRampFrames * 2 + slowdownHoldFrames;
            const elapsed = totalSlowdownFrames - slowdownTimer;
            let flashAlpha = 0;
            if (elapsed < slowdownFlashFrames) {
                flashAlpha = (1 - elapsed / slowdownFlashFrames) * 0.35;
            } else if (slowdownTimer <= slowdownFlashFrames) {
                flashAlpha = (1 - slowdownTimer / slowdownFlashFrames) * 0.35;
            }
            if (flashAlpha > 0) {
                ctx.save();
                ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.restore();
            }
            ctx.save();
            ctx.fillStyle = 'rgba(96, 96, 96, 0.225)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
        }
    }

    // Game Over
    if (gameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('DERROTA!', canvas.width / 2, canvas.height / 2);
        ctx.font = '20px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Recarregue a página para tentar novamente', canvas.width / 2, canvas.height / 2 + 50);
    }

    if (screenShakeActive) ctx.restore();

    requestAnimationFrame(gameLoop);
}

// Iniciar com seleção de arma
currentMonster = new Monster(phase, chooseMonsterType());
isSelectingWeapon = true;
gameLoop();