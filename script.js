const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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
let spawnZoneEndX;
let upgradeZoneEndX;
let wildZoneEndX;
let cameraX = 0;
let cameraY = 0;
let gameFrameCount = 0;

// fila de spawns atrasados (timer em frames)
const delayedProjectileSpawns = [];
const DEBUG_TORNADO_COPY = true;

function resizeGameCanvas() {
    const maxViewportWidth = 1600;
    const maxViewportHeight = 1000;
    const availableWidth = Math.min(window.innerWidth - 40, maxViewportWidth);
    const availableHeight = Math.min(window.innerHeight - 220, maxViewportHeight);

    const width = Math.max(320, availableWidth);
    const height = Math.max(240, availableHeight);

    viewportWidth = width;
    viewportHeight = height;
    gameWidth = viewportWidth * 10;
    gameHeight = viewportHeight * 4;

    spawnZoneEndX = viewportWidth * 6;
    upgradeZoneEndX = spawnZoneEndX + viewportWidth * 3;
    wildZoneEndX = gameWidth;

    generateMapWalls();

    canvas.width = viewportWidth;
    canvas.height = viewportHeight;
    canvas.style.width = `${viewportWidth}px`;
    canvas.style.height = `${viewportHeight}px`;
}

function updateCamera() {
    if (!player) return;
    const targetX = player.x + player.width / 2 - viewportWidth / 2;
    const targetY = player.y + player.height / 2 - viewportHeight / 2;
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
        player.x = Math.max(0, Math.min(player.x, gameWidth - player.width));
        player.y = Math.max(0, Math.min(player.y, gameHeight - player.height));
    }
    if (typeof currentMonster !== 'undefined') {
        currentMonster.x = Math.max(0, Math.min(currentMonster.x, gameWidth - currentMonster.width));
        currentMonster.y = Math.max(0, Math.min(currentMonster.y, gameHeight - currentMonster.height));
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
                const targetX = currentMonster ? currentMonster.x + currentMonster.width / 2 : this.x + 300;
                const targetY = currentMonster ? currentMonster.y + currentMonster.height / 2 : this.y;
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
                const targetX = currentMonster ? currentMonster.x + currentMonster.width / 2 : this.preLaunchTargetX || this.x + 300;
                const targetY = currentMonster ? currentMonster.y + currentMonster.height / 2 : this.preLaunchTargetY || this.y;
                const dx = targetX - this.x;
                const dy = targetY - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const launchSpeed = 12;
                this.vx = (dx / dist) * launchSpeed;
                this.vy = (dy / dist) * launchSpeed;
                this.homing = true;
                this.homingTarget = currentMonster || null;
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
            ctx.shadowBlur = 16;
            ctx.beginPath();
            ctx.moveTo(-this.size * 1.4, -this.size * 0.6);
            ctx.lineTo(this.size * 1.4, 0);
            ctx.lineTo(-this.size * 1.4, this.size * 0.6);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
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
            grad.addColorStop(0.25, this.color);
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 22;
            ctx.beginPath();
            ctx.arc(0, 0, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 4; i++) {
                const a = i * Math.PI / 2;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * this.size * 0.4, Math.sin(a) * this.size * 0.4);
                ctx.lineTo(Math.cos(a) * this.size * 1.3, Math.sin(a) * this.size * 1.3);
                ctx.stroke();
            }
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

        if (style === 'casterFlameCircle') {
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 26;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 1.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.arc(this.x, this.y - this.size * 0.25, this.size * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,220,140,0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 1.45, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            return;
        }

        if (style === 'casterFlameSpiral') {
            ctx.translate(this.x, this.y);
            ctx.rotate(angle * 0.8);
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.moveTo(0, -this.size * 0.9);
            ctx.bezierCurveTo(this.size * 0.4, -this.size * 0.85, this.size * 0.55, -this.size * 0.1, this.size * 0.3, this.size * 0.3);
            ctx.bezierCurveTo(this.size * 0.05, this.size * 0.55, -this.size * 0.25, this.size * 0.45, -this.size * 0.35, this.size * 0.18);
            ctx.bezierCurveTo(-this.size * 0.55, -this.size * 0.1, -this.size * 0.35, -this.size * 0.75, 0, -this.size * 0.9);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,230,180,0.85)';
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.restore();
            return;
        }

        if (style === 'casterFlameRing') {
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 24;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 0.92, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,220,180,0.9)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,190,130,0.75)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 1.25, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            return;
        }

        if (style === 'casterFlameVolley') {
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 28;
            ctx.beginPath();
            ctx.moveTo(-this.size * 0.6, -this.size * 0.25);
            ctx.lineTo(this.size * 1.2, 0);
            ctx.lineTo(-this.size * 0.6, this.size * 0.25);
            ctx.quadraticCurveTo(-this.size * 0.75, 0, -this.size * 0.6, -this.size * 0.25);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.beginPath();
            ctx.arc(this.size * 0.1, 0, this.size * 0.5, 0, Math.PI * 2);
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
        this.x = gameWidth / 2;
        this.y = gameHeight - 150;
        this.width = 12.5;
        this.height = 12.5;
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
        this.parryConfusionChance = 0;
        this.parryConfusionDuration = 0;
        this.spinAttackLevel = 0;
        this.spinAttack = false;
        this.spinAttackCharges = 0;
        this.attackSpeed = 0;
        this.projectileSpeedBonus = 0;
        this.gunAmmo = 12;
        this.gunMaxAmmo = 12;
        this.gunReloadCooldown = 0;
        this.gunReloadCooldownMax = 120;
        this.gunReloadHitCount = 0;
        this.gunReloadHitMax = 13;
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

        this.swordAimOffsetTimer = 0;
        this.swordHitCooldown = 0;
        this.swordComboCount = 0;
        this.swordComboTimer = 0;
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

    update(keys) {
        const ts = timeScale || 1;
        const prevX = this.x;
        const prevY = this.y;
        if (this.dashTimer > 0) {
            this.x += this.dashVectorX * this.dashSpeed * ts;
            this.y += this.dashVectorY * this.dashSpeed * ts;
            this.dashTimer--;

            if (this.dashTimer % 2 === 0) {
                spawnAfterImage({
                    kind: 'player',
                    x: this.x,
                    y: this.y,
                    width: this.width,
                    height: this.height,
                    life: 14,
                    maxLife: 14,
                    baseAlpha: 0.4
                });
            }

            if (this.dashTimer === 0) {
                this.postDashInvulnTimer = 19;
            }

            if (!this.dashHasHitMonster && currentMonster && isRectOverlap(this.x, this.y, this.width, this.height, currentMonster.x, currentMonster.y, currentMonster.width, currentMonster.height)) {
                this.dashHasHitMonster = true;
                currentMonster.takeDamage(25);

                frameFreeze = 2;
                currentMonster.flashTimer = 20;
                spawnEvaporationEffect(currentMonster.x + currentMonster.width / 2, currentMonster.y + currentMonster.height / 2, '#ffffff', 18, 18);

                const startX = currentMonster.x;
                const startY = currentMonster.y;
                const pushDistance = 250;
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
            const isMoving = moveX !== 0 || moveY !== 0;

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

            const movementSpeed = (this.speed + (isReloadingGun ? this.speed * 0.25 : 0) + this.gunReloadMoveBonus) * ts;
            if (moveY < 0) this.y -= movementSpeed;
            if (moveY > 0) this.y += movementSpeed;
            if (moveX < 0) this.x -= movementSpeed;
            if (moveX > 0) this.x += movementSpeed;
        }

        this.x = Math.max(0, Math.min(this.x, gameWidth - this.width));
        this.y = Math.max(0, Math.min(this.y, gameHeight - this.height));

        if (resolveEntityWallCollision(this, prevX, prevY) && this.dashTimer > 0) {
            this.dashTimer = 0;
        }

        this.x = Math.max(0, Math.min(this.x, gameWidth - this.width));
        this.y = Math.max(0, Math.min(this.y, gameHeight - this.height));

        if (this.postDashInvulnTimer > 0) {
            this.postDashInvulnTimer--;
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

        // Aura visual quando envenenado (player)
        if (this.poisonTimer > 0) {
            const pulse = 0.9 + 0.2 * Math.sin(performance.now() * 0.02);
            ctx.save();
            ctx.translate(centerX, centerY);
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

        // Desenhar escudos visuais quando em cooldown de parry
        if (this.parryCooldown > 0 && this.parryDefenseBonus > 0) {
            ctx.save();
            ctx.translate(centerX, centerY);
            
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

        ctx.translate(centerX, centerY);
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

        ctx.restore();

        if (this.attacking) {
            if (this.weapon && this.weapon.type === 'sword') {
                const px = this.x + this.width / 2;
                const py = this.y + this.height / 2;
                const extraRange = Math.max(0, this.attackRange - 80);
                const swordLen = (this.weapon.range || 45) + extraRange;
                const baseAim = (typeof this.swordAimAngle === 'number') ? this.swordAimAngle : this.meleeDirection || 0;
                const aim = baseAim + (this.swordAimOffsetAngle || 0);

                // faint arc showing sword reach
                ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
                ctx.strokeStyle = '#ffd880';
                ctx.lineWidth = 3;
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

                // handle
                ctx.fillStyle = '#6b4b2a';
                ctx.fillRect(-6, -6, 12, 12);

                // blade
                ctx.beginPath();
                ctx.moveTo(12, -4);
                ctx.lineTo(swordLen, 0);
                ctx.lineTo(12, 4);
                ctx.closePath();
                ctx.fillStyle = this.weapon.color || '#ffd880';
                ctx.shadowColor = this.weapon.color || '#ffd880';
                ctx.shadowBlur = 14;
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // small fuller/edge highlight
                ctx.beginPath();
                ctx.moveTo(12, -1.5);
                ctx.lineTo(swordLen * 0.9, 0);
                ctx.lineTo(12, 1.5);
                ctx.strokeStyle = 'rgba(255,255,255,0.25)';
                ctx.lineWidth = 1;
                ctx.stroke();

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
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 3;
                const meleeRadius = this.weapon && this.weapon.type === 'sword'
                    ? this.weapon.range + Math.max(0, this.attackRange - 80)
                    : this.attackRange;
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
            const px = this.x + this.width / 2;
            const py = this.y + this.height / 2;
            const extraRange = Math.max(0, this.attackRange - 80);
            const swordLen = (this.weapon.range || 45) + extraRange;
            const baseAim = (typeof this.swordAimAngle === 'number') ? this.swordAimAngle : this.meleeDirection || 0;
            const aim = baseAim + (this.swordAimOffsetAngle || 0);

            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(aim);

            ctx.fillStyle = '#6b4b2a';
            ctx.fillRect(-5, -5, 10, 10);

            ctx.beginPath();
            ctx.moveTo(10, -3);
            ctx.lineTo(swordLen, 0);
            ctx.lineTo(10, 3);
            ctx.closePath();
            ctx.fillStyle = this.weapon.color || '#ffd880';
            ctx.shadowColor = this.weapon.color || '#ffd880';
            ctx.shadowBlur = 12;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.restore();
        }
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
            // State for being thrown / transparent / confused / stunned
            this.thrown = false;
            this.thrownTimer = 0;
            this.thrownTotalTime = 0;
            this.thrownVx = 0;
            this.thrownVy = 0;
            this.thrownTargetX = null;
            this.thrownTargetY = null;
            this.thrownArcHeight = 0;
            this.fallStarsTimer = 0;
            this.alpha = 1;
            this.confusedLevel = 0;
            this.confusedTimer = 0;
            this.stunnedTimer = 0;
            this.attacksDealtToPlayer = 0; // contador de acertos ao jogador
        } else {
            this.health = 56.25 + phase * 22.5;
            this.speed = 1.0875 + phase * 0.3625;
            this.maxHealth = this.health;
        }
    }

    chooseType() {
        return chooseMonsterType();
    }

    update(playerX, playerY) {
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
                const portalModes = ['circular', 'spiral', 'ring', 'aim16'];
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
                                { monsterType: this.type, size: 16, style: 'casterFlameCircle' }
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
                                { monsterType: this.type, size: 16, style: 'casterFlameSpiral' }
                            );
                        }
                        this.spiralProjectileCount++; // Incrementa para próxima rodada
                    } else if (this.portalAttackMode === 'ring' && this.portalTimer === portalActiveDuration) {
                        this.casterRingWaveAttack();
                    } else if (this.portalAttackMode === 'aim16' && this.portalTimer === portalActiveDuration) {
                        this.casterAimedVolley(screenCenterX, screenCenterY);
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
                            const meleeDamage = Math.max(1, this.getAttackDamage() + 1);
                            const effectiveDamage = Math.max(0, meleeDamage - (player.damageReduction || 0));
                            player.health -= effectiveDamage;
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
        } else if (this.type === 'croc') {
            // If thrown, travel away while transparent
            if (this.thrown && this.thrownTimer > 0) {
                this.x += this.thrownVx * ts;
                this.y += this.thrownVy * ts;
                this.thrownTimer--;
                this.alpha = 0.35;
                const progress = 1 - this.thrownTimer / Math.max(1, this.thrownTotalTime);
                this.thrownArcHeight = Math.sin(Math.min(1, Math.max(0, progress)) * Math.PI) * 24;
                if (this.thrownTimer <= 0) {
                    this.thrown = false;
                    this.alpha = 1;
                    this.thrownArcHeight = 0;
                    this.confusedLevel = 3;
                    this.confusedTimer = 6 * 60; // 6 seconds
                    this.stunnedTimer = 60; // 1 second stopped
                    this.fallStarsTimer = 40;
                    this.impactShakeTimer = 24;
                    screenShakeTimer = Math.max(screenShakeTimer, 28);
                    spawnEvaporationEffect(this.x + this.width / 2, this.y + this.height / 2, '#ffd860', 22, 14);
                    const baseHitX = this.x + this.width / 2;
                    const baseHitY = this.y + this.height / 2;
                    const projectileCount = 12;
                    const launchRadius = Math.max(this.width, this.height) * 0.55;
                    for (let i = 0; i < projectileCount; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const startX = baseHitX + Math.cos(angle) * launchRadius;
                        const startY = baseHitY + Math.sin(angle) * launchRadius;
                        const travelDistance = 260 + Math.random() * 120;
                        const targetX = startX + Math.cos(angle) * travelDistance;
                        const targetY = startY + Math.sin(angle) * travelDistance;
                        const speed = 16 + Math.random() * 4;
                        spawnMonsterProjectile(
                            startX,
                            startY,
                            targetX,
                            targetY,
                            Math.max(1, Math.round(this.getAttackDamage() * 0.2)),
                            '#ffd860',
                            speed,
                            { monsterType: 'croc', size: 10, maxDistance: 1400 }
                        );
                    }
                    // ensure it doesn't move immediately
                    this.simpleDashVx = 0;
                    this.simpleDashVy = 0;
                    this.simpleDashTimer = 0;
                }
                this.x = Math.max(0, Math.min(this.x, gameWidth - this.width));
                this.y = Math.max(0, Math.min(this.y, gameHeight - this.height));
            } else {
                // If stunned due to recent throw end, remain stopped for stunnedTimer
                if (this.stunnedTimer > 0) {
                    this.stunnedTimer--;
                    this.attackCooldown = 1;
                } else {
                    if (this.simpleDashPauseTimer > 0) {
                        this.simpleDashPauseTimer--;
                        this.attackCooldown = 1;
                    } else if (this.simpleDashWarningTimer > 0) {
                        this.simpleDashWarningTimer--;
                        if (this.simpleDashWarningTimer <= 0) {
                            this.simpleDashTimer = 20;
                            this.attackCooldown = 0;
                        } else {
                            this.attackCooldown = 1;
                        }
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
                        this.simpleDashWarningTimer = this.simpleDashWarningDuration;
                        this.attackCooldown = 1;
                    }
                }
            }
            const targetOpen = this.simpleDashTimer > 0 ? 1 : 0;
            this.simpleDashOpen += (targetOpen - this.simpleDashOpen) * 0.18;
            this.x = Math.max(0, Math.min(this.x, gameWidth - this.width));
            this.y = Math.max(0, Math.min(this.y, gameHeight - this.height));
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
        const framesBetweenWaves = Math.round(0.35 * 60); // ~21 frames

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
                style: 'casterFlameVolley'
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
        const modes = ['circular', 'spiral', 'ring', 'aim16'];
        const mode = modes[Math.floor(Math.random() * modes.length)];

        if (mode === 'circular') {
            const rayCount = 5 + this.phase;
            const speed = 4.0 + this.phase * 0.2;
            for (let i = 0; i < rayCount; i++) {
                const angle = (Math.PI * 2 / rayCount) * i;
                const targetX = srcX + Math.cos(angle) * 1200;
                const targetY = srcY + Math.sin(angle) * 1200;
                spawnMonsterProjectile(srcX, srcY, targetX, targetY, Math.max(2, Math.round(this.getAttackDamage() * 0.7 * fireBoost)), '#ff9c46', speed, { monsterType: this.type, size: 16, style: 'casterFlameCircle' });
            }
        } else if (mode === 'spiral') {
            const spiralCount = 5 + this.phase;
            const spiralSpacing = 0.25;
            const speed = 4.0 + this.phase * 0.2;
            for (let i = 0; i < spiralCount; i++) {
                const angle = (Math.PI * 2 * i) / spiralCount + Math.random() * spiralSpacing;
                const targetX = srcX + Math.cos(angle) * 1200;
                const targetY = srcY + Math.sin(angle) * 1200;
                spawnMonsterProjectile(srcX, srcY, targetX, targetY, Math.max(2, Math.round(this.getAttackDamage() * 0.7 * fireBoost)), '#ff7430', speed, { monsterType: this.type, size: 16, style: 'casterFlameSpiral' });
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
                    projectilesForWave.push({ targetX, targetY, damage, color, speed, size: 16, style: 'casterFlameRing' });
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
                delayedProjectileSpawns.push({ timer: delay, kind: 'monsterAimed', srcX, srcY, targetX, targetY, damage: Math.max(2, Math.round(this.getAttackDamage() * 0.64 * fireBoost)), color: this.confusedTimer > 0 ? '#ffd880' : '#ffb14a', speed, monsterType: this.type, size: 16, style: 'casterFlameVolley' });
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
        return finalDamage;
    }
}

// ===== VARIÁVEIS GLOBAIS =====
let player = new Player();
let currentMonster;
let crocConsecutiveHits = 0;
let phase = 1;
let monstersDefeated = 0;
let defeatedTotal = 0;
let upgradesAcquired = 0;
let keys = {};
let gameOver = false;
let isUpgrading = false;
let selectedUpgradeIndex = 0;
let upgradeChoices = [];
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
let afterImages = [];

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

function drawPlayerAfterImage(effect) {
    const centerX = effect.x + effect.width / 2;
    const centerY = effect.y + effect.height / 2;
    ctx.save();
    ctx.translate(centerX, centerY);
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
        { name: 'Mira Ajustada', effect: 'gunReloadHitMax', value: 2, desc: 'Melhora a recarga da arma reduzindo os tiros necessários para recarregar.' },
        { name: 'Câmara Extra +2', effect: 'gunAmmoMax', value: 2, desc: 'Aumenta a capacidade de munição do revólver.' },
        { name: 'Recarga Ágil -8', effect: 'gunReloadCooldownMax', value: 8, desc: 'Reduz o tempo necessário para recarregar o revólver.' }
    ],
    bow: [
        { name: 'Bota Leve +1', effect: 'bowDashMax', value: 1, desc: 'Concede 1 carga extra de dash ao usar o arco. Permite reposicionamento adicional durante o combate.' },
        { name: 'Ricochete de Flecha +1', effect: 'bowRicochet', value: 1, desc: 'Cada melhoria adiciona um projétil extra ao ataque do arco. Esses projéteis têm a capacidade de destruir tiros inimigos e saltar para outro alvo.' },
        { name: 'Tiro Certeiro +20%', effect: 'bowFirstShot', value: 20, desc: 'O primeiro tiro contra um novo monstro tem 20% de chance de crítico adicional, garantindo um início vantajoso.' },
        { name: 'Postura Firme +15%', effect: 'bowReadyStance', value: 15, desc: 'Quando parado, sua chance de crítico aumenta em 15%. Críticos nesta postura causam 25% de dano adicional.' }
    ],
    staff: [
        { name: 'Energia Arcanista +2', effect: 'staffChargeMax', value: 2, desc: 'Aumenta a carga máxima para o burst de orbes.' },
        { name: 'Rajada Extra +1', effect: 'staffBurstCount', value: 1, desc: 'Aumenta o número de orbes liberadas no burst.' },
        { name: 'Fluxo Mais Rápido -12', effect: 'staffBurstCooldownMax', value: 12, desc: 'Reduz o cooldown entre bursts de orbes.' }
    ],
    sword: [
        { name: 'Alcance +15', effect: 'swordRange', value: 15, desc: 'Aumenta o alcance da espada.' },
        { name: 'Parry Veloz -40', effect: 'parryMax', value: 40, desc: 'Reduz o tempo de cooldown do parry.' },
        { name: 'Carga por Golpe +1.5%', effect: 'parryChargePerHit', value: 1.5, desc: 'Cada ataque bem-sucedido carrega 1.5% do cooldown do parry. Cada nivel adiciona mais 1.5% de carga.' },
        { name: 'Defesa de Parry +12.5%', effect: 'parryDefenseBonus', value: 12.5, desc: 'Quando voce nao pode fazer um parry, recebe 12.5% menos dano e ganha escudos visuais de proteção. Cada nivel adiciona mais proteção e mais um escudo.' },
        { name: 'Cura de Parry +2.5%', effect: 'parryHealOnUse', value: 2.5, desc: 'Cura 2.5% da vida ao fazer um parry. Cura 2.5% da vida maxima ao acertar um parry no monstro.' },
        { name: 'Parry Confusao +12.5%', effect: 'parryConfusionChance', value: 12.5, desc: 'Quando o monstro e acertado por um parry, 12.5% de chance de atacar na direcao oposta do jogador. Cada nivel faz a confusao durar 3 segundos.' }
    ],
    cone: [
        { name: 'Fúria do Tornado +1', effect: 'tornadoCount', value: 1, desc: 'Adiciona uma lança extra à rajada do tornado.' },
        { name: 'Tempo de Tornado +10', effect: 'tornadoDuration', value: 10, desc: 'Aumenta a duração do ataque tornado.' },
        { name: 'Cone Mais Largo +0.1', effect: 'coneAngleBonus', value: 0.1, desc: 'Aumenta levemente a abertura do cone tornado.' }
    ]
};

// ===== EVENT LISTENERS =====
document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    
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
    } else {
        if (e.key === ' ') {
            e.preventDefault();
            attemptAttack();
        }
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener('click', (e) => {
    if (isSelectingWeapon) {
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
    } else {
        attemptAttack();
    }
});

// ===== FUNÇÕES DE JOGO =====
function selectWeapon(index) {
    player.weapon = weapons[index];
    if (player.weapon.type === 'gun') {
        player.gunAmmo = player.gunMaxAmmo;
        player.gunReloadCooldown = 0;
        player.gunReloadHitCount = 0;
    }
    if (player.weapon.type === 'bow') {
        player.bowDashCharges = player.bowDashMaxCharges;
    }
    isSelectingWeapon = false;
    gameStarted = true;
    roundStartTimer = 60;
}

function registerPlayerHit() {
    if (player.autoAttackEnabled) return;
    player.currentMonsterHitCount++;
    if (player.currentMonsterHitCount >= 3) {
        player.autoAttackEnabled = true;
        player.currentMonsterHitCount = 3;
    }
    // Acumular carga para reduzir o próximo cooldown de parry
    if (player.parryChargePerHit > 0 && player.parryCooldown === 0) {
        player.parryChargeAccumulator += player.parryChargePerHit;
    }
}

function updateCooldownBar() {
    try {
        const fill = document.getElementById('cooldownBarFill');
        if (!fill) return;

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
            if (player.gunReloadCooldown > 0) {
                const ratio = Math.max(0, Math.min(1, player.gunReloadCooldown / player.gunReloadCooldownMax));
                fill.style.width = `${ratio * 100}%`;
            } else {
                const ratio = Math.max(0, Math.min(1, (player.gunReloadHitCount || 0) / player.gunReloadHitMax));
                fill.style.width = `${ratio * 100}%`;
            }
            return;
        }

        fill.style.width = `0%`;
    } catch (e) {}
}

function attemptAttack() {
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
                const centerX = player.x + player.width / 2;
                const centerY = player.y + player.height / 2;
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
        const worldMouseX = mouseX + cameraX;
        const worldMouseY = mouseY + cameraY;
        const monsterVisible = currentMonster.x + currentMonster.width >= cameraX &&
                       currentMonster.x <= cameraX + viewportWidth &&
                       currentMonster.y + currentMonster.height >= cameraY &&
                       currentMonster.y <= cameraY + viewportHeight;
        const targetX = monsterVisible ? currentMonster.x + currentMonster.width / 2 : worldMouseX;
        const targetY = monsterVisible ? currentMonster.y + currentMonster.height / 2 : worldMouseY;
        
        const baseWeaponDamage = weapon.damage + player.weaponDamage + player.baseDamage;
        const totalCritChance = player.critChance + ((weapon.type === 'bow') ? (player.bowCritChance || 0) : 0);
        const critRoll = Math.random() * 100;
        const critMultiplier = critRoll < totalCritChance ? 1 + player.critDamage : 1;
        const critPercent = critMultiplier > 1 ? player.critDamage + player.coneCritPercent : 0;
        const attackDamage = Math.round(baseWeaponDamage * critMultiplier * (player.damageOutputMultiplier || 1));
        const cooldown = Math.max(1, weapon.cooldown - player.cooldownReduction);
        const baseAngle = Math.atan2(targetY - (player.y + player.height / 2), targetX - (player.x + player.width / 2));
        const specialAttackSpeed = Math.max(6, (weapon.speed || 12) + player.projectileSpeedBonus);

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
            player.coneRange = weapon.range;

            if (!player.tornadoBurst || !player.tornadoBurst.active) {
                const baseTornadoSpeed = ((weapon.speed || 12) + player.projectileSpeedBonus) * 0.25 * 0.5 / 3;
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
                    maxDistance: weapon.range * 0.7
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
            // Ataque à distância (projétil)
            const shots = 1 + player.extraProjectiles + player.spreadProjectiles;
            const baseAngle = Math.atan2(targetY - (player.y + player.height / 2), targetX - (player.x + player.width / 2));
            const speed = weapon.speed + player.projectileSpeedBonus;

            let lastProjX = player.x + player.width / 2;
            let lastProjY = player.y + player.height / 2;

            for (let i = 0; i < shots; i++) {
                const spread = (Math.random() - 0.5) * 0.2 * shots;
                const angle = baseAngle + spread;
                const projTargetX = player.x + player.width / 2 + Math.cos(angle) * weapon.range;
                const projTargetY = player.y + player.height / 2 + Math.sin(angle) * weapon.range;
                const projOpts = {
                    critPercent,
                    isGunOriginal: weapon.type === 'gun' && i === 0
                };
                spawnPlayerProjectile(player.x + player.width / 2, player.y + player.height / 2, projTargetX, projTargetY, attackDamage, weapon.color, speed, projOpts);
                lastProjX = projTargetX;
                lastProjY = projTargetY;
            }

            if (player.lateShots > 0) {
                const originX = player.x + player.width / 2 + (lastProjX - (player.x + player.width / 2)) * 0.5;
                const originY = player.y + player.height / 2 + (lastProjY - (player.y + player.height / 2)) * 0.5;
                for (let i = 0; i < player.lateShots; i++) {
                    player.pendingLateShots.push({
                        x: originX,
                        y: originY,
                        damage: attackDamage,
                        color: weapon.color,
                        speed: speed,
                        critPercent: critPercent,
                        timer: 45 + i * 12
                    });
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
                            const targetX = currentMonster ? currentMonster.x + (currentMonster.width || 0) / 2 : q.x + 320;
                            const targetY = currentMonster ? currentMonster.y + (currentMonster.height || 0) / 2 : q.y;
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
            const isHit = 
                p.x < currentMonster.x + currentMonster.width &&
                p.x > currentMonster.x &&
                p.y < currentMonster.y + currentMonster.height &&
                p.y > currentMonster.y;
            
            if (isHit) {
                // Calculate base damage (lances do 1.5x)
                let baseDamage = (p.style === 'tornadoLance' || p.style === 'tornadoLanceCopy') ? p.damage * 1.5 : p.damage;

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
                if (player.dashTimer > 0 || player.postDashInvulnTimer > 0) {
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
                if (distanceToBeam <= hitRadius && player.dashTimer <= 0 && player.postDashInvulnTimer <= 0) {
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
            const range = player.weapon ? player.weapon.range : 120;
            const projTargetX = delayed.x + Math.cos(finalAngle) * range;
            const projTargetY = delayed.y + Math.sin(finalAngle) * range;

            spawnPlayerProjectile(delayed.x, delayed.y, projTargetX, projTargetY, delayed.damage, delayed.color, delayed.speed, { critPercent: delayed.critPercent || 0 });

            player.pendingLateShots.splice(i, 1);
        }
    }
}

function processMeleeHit() {
    if (!player.weapon || player.weapon.type !== 'sword') return;

    const weapon = player.weapon;
    const extraRange = Math.max(0, player.attackRange - 80);
    const swordLen = (weapon.range || 45) + extraRange;
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;
    const baseAim = (typeof player.swordAimAngle === 'number') ? player.swordAimAngle : player.meleeDirection || 0;
    const aim = baseAim + (player.swordAimOffsetAngle || 0);

    const bladeBase = 12; // where blade starts relative to player center
    const x1 = px + Math.cos(aim) * bladeBase;
    const y1 = py + Math.sin(aim) * bladeBase;
    const x2 = px + Math.cos(aim) * swordLen;
    const y2 = py + Math.sin(aim) * swordLen;

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
            player.x = Math.max(0, Math.min(player.x + (dx / dist) * player.attackMove, gameWidth - player.width));
            player.y = Math.max(0, Math.min(player.y + (dy / dist) * player.attackMove, gameHeight - player.height));
        }

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
    const mx = currentMonster.x + currentMonster.width / 2;
    const my = currentMonster.y + currentMonster.height / 2;
    const dist = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));
    const monsterAngle = Math.atan2(my - py, mx - px);
    let delta = Math.abs(monsterAngle - player.coneDirection);
    while (delta > Math.PI) delta = Math.abs(delta - Math.PI * 2);

    if (dist <= weapon.range + Math.max(currentMonster.width, currentMonster.height) / 2 && delta <= player.coneAngle / 2) {
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

    const centerX = player.x + player.width / 2;
    const centerY = player.y + player.height / 2;
    const speed = 4;
    const rawDamage = player.baseDamage + player.weaponDamage + 2;
    const damage = Math.max(1, Math.round(rawDamage * (player.damageOutputMultiplier || 1)));
    const size = 14;
    const angles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];

    angles.forEach((angle) => {
        const targetX = centerX + Math.cos(angle) * 140;
        const targetY = centerY + Math.sin(angle) * 140;
        spawnPlayerProjectile(centerX, centerY, targetX, targetY, damage, '#ffcc00', speed, {
            size,
            style: 'spinAttack',
            homing: true,
            maxDistance: 1400
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
    const angle = Math.atan2(targetY - centerY, targetX - centerX);
    const mainTargetX = centerX + Math.cos(angle) * 200;
    const mainTargetY = centerY + Math.sin(angle) * 200;
    const main = spawnPlayerProjectile(centerX, centerY, mainTargetX, mainTargetY, damage, color, speed, {
        style: 'spinAttack',
        size: 16,
        maxDistance: 1400,
        critPercent
    });

    for (let i = 0; i < 2; i++) {
        const offsetAngle = angle + (i === 0 ? 0.18 : -0.18);
        const followerTargetX = centerX + Math.cos(offsetAngle) * 200;
        const followerTargetY = centerY + Math.sin(offsetAngle) * 200;
        spawnPlayerProjectile(centerX, centerY, followerTargetX, followerTargetY, Math.max(1, Math.round(damage * 0.85)), color, speed, {
            style: 'spinAttack',
            size: 10,
            homing: true,
            homingTarget: main,
            homingStrength: 0.16,
            maxDistance: 1400,
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

    const spawnZoneEndX = viewportWidth * 6;
    const upgradeZoneEndX = spawnZoneEndX + viewportWidth * 3;
    const wildZoneEndX = gameWidth;

    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(65, 130, 255, 0.10)';
    ctx.fillRect(0, 0, spawnZoneEndX, gameHeight);
    ctx.fillStyle = 'rgba(255, 195, 35, 0.10)';
    ctx.fillRect(spawnZoneEndX, 0, upgradeZoneEndX - spawnZoneEndX, gameHeight);
    ctx.fillStyle = 'rgba(220, 60, 60, 0.10)';
    ctx.fillRect(upgradeZoneEndX, 0, wildZoneEndX - upgradeZoneEndX, gameHeight);
    ctx.globalCompositeOperation = 'source-over';

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 14]);
    ctx.beginPath();
    ctx.moveTo(spawnZoneEndX, 0);
    ctx.lineTo(spawnZoneEndX, gameHeight);
    ctx.moveTo(upgradeZoneEndX, 0);
    ctx.lineTo(upgradeZoneEndX, gameHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SPAWN', spawnZoneEndX / 2, 40);
    ctx.fillText('MELHORIAS', (spawnZoneEndX + upgradeZoneEndX) / 2, 40);
    ctx.fillText('SELVAGEM', (upgradeZoneEndX + wildZoneEndX) / 2, 40);
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
    const spawnWidth = spawnZoneEndX;
    const upgradeWidth = upgradeZoneEndX - spawnZoneEndX;
    const wildWidth = wildZoneEndX - upgradeZoneEndX;

    mapWalls = [
        { x: spawnWidth * 0.10, y: gameHeight * 0.10, width: spawnWidth * 0.14, height: gameHeight * 0.12 },
        { x: spawnWidth * 0.40, y: gameHeight * 0.16, width: spawnWidth * 0.12, height: gameHeight * 0.10 },
        { x: spawnWidth * 0.65, y: gameHeight * 0.24, width: spawnWidth * 0.10, height: gameHeight * 0.14 },
        { x: spawnWidth * 0.18, y: gameHeight * 0.58, width: spawnWidth * 0.12, height: gameHeight * 0.10 },
        { x: spawnWidth * 0.48, y: gameHeight * 0.60, width: spawnWidth * 0.10, height: gameHeight * 0.08 },
        { x: spawnZoneEndX + upgradeWidth * 0.08, y: gameHeight * 0.14, width: upgradeWidth * 0.12, height: gameHeight * 0.10 },
        { x: spawnZoneEndX + upgradeWidth * 0.32, y: gameHeight * 0.22, width: upgradeWidth * 0.10, height: gameHeight * 0.12 },
        { x: spawnZoneEndX + upgradeWidth * 0.62, y: gameHeight * 0.40, width: upgradeWidth * 0.14, height: gameHeight * 0.10 },
        { x: upgradeZoneEndX + wildWidth * 0.10, y: gameHeight * 0.18, width: wildWidth * 0.12, height: gameHeight * 0.12 },
        { x: upgradeZoneEndX + wildWidth * 0.38, y: gameHeight * 0.28, width: wildWidth * 0.10, height: gameHeight * 0.08 },
        { x: upgradeZoneEndX + wildWidth * 0.66, y: gameHeight * 0.50, width: wildWidth * 0.14, height: gameHeight * 0.14 }
    ];
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

function spawnEvaporationForProjectile(proj) {
    spawnEvaporationEffect(proj.x, proj.y, proj.color, proj.size, 10);
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
    // Freeze everything visually for 1 frame to emphasize parry
    frameFreeze = 2;
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
    opts.style = opts.style || getPlayerProjectileStyle(player.weapon ? player.weapon.type : '');
    if (opts.style === 'staffOrb') {
        opts.afterImageTrail = true;
        opts.afterImageInterval = opts.afterImageInterval || 3;
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
                    const centerX = player.x + player.width / 2;
                    const centerY = player.y + player.height / 2;
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
    const size = opts.size || getProjectileDefaultSize(opts.style);
    // Allow callers to force an override speed via `opts._overrideSpeed` (used by bow ricochet companion)
    const spawnSpeed = typeof opts._overrideSpeed === 'number' ? opts._overrideSpeed : speed;
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
        proj.homingTarget = opts.homingTarget || currentMonster;
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

function spawnMonsterProjectile(x, y, targetX, targetY, damage, color, speed, opts = {}) {
    opts.monsterType = opts.monsterType || currentMonster?.type || '';
    opts.style = opts.style || getMonsterProjectileStyle(opts.monsterType);
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

    const baseDefault = getProjectileDefaultSize('staffOrb');
    const burstColors = ['#ff4cff', '#ff95ff', '#ff2fd4', '#ff7bff', '#d95bff', '#ff66d9'];
    for (let b = 0; b < burstCount; b++) {
        const angle = Math.random() * Math.PI * 2;
        const range = 420 + Math.random() * 280;
        const tx = centerX + Math.cos(angle) * range;
        const ty = centerY + Math.sin(angle) * range;
        const projColor = burstColors[b % burstColors.length];
        const opts = {
            bypassStaffCap: true,
            size: Math.max(8, Math.floor(baseDefault * (0.9 + Math.random() * 0.6))),
            rotationSpeed: (Math.random() - 0.5) * 0.6,
            homing: true,
            homingStrength: 0.62,
            homingDuration: 120,
            maxDistance: 1100
        };
        if (currentMonster) {
            opts.homingTarget = currentMonster;
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
    const targetX = currentMonster ? currentMonster.x + currentMonster.width / 2 : x + 120;
    const targetY = currentMonster ? currentMonster.y + currentMonster.height / 2 : y;
    const proj = new Projectile(x, y, targetX, targetY, 0, '#76d7ff', 3, 'player', 42, {
        style: 'tornadoHurricane',
        ignoreCollision: true,
        homing: true,
        homingTarget: currentMonster,
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
    document.getElementById('statsDisplay').innerHTML = 
        `Arma: <span id="weaponName">${weaponName}</span> | Monstros: ${upgradesAcquired} | Vida: ${Math.max(0, Math.round(player.health))}/${player.maxHealth}${ammoInfo}${spinAttackInfo}`;

    // Cooldown bar logic: show gun reload cooldown, parry cooldown for sword, hurricane cooldown for cone
    const cooldownFill = document.getElementById('cooldownBarFill');
    const cooldownBar = document.getElementById('cooldownBar');
    if (cooldownFill) {
        if (player.weapon && player.weapon.type === 'bow') {
            const frac = Math.max(0, Math.min(1, player.bowDashCharges / player.bowDashMaxCharges));
            cooldownFill.style.width = `${frac * 100}%`;
            if (cooldownBar) {
                cooldownBar.style.backgroundImage = 'linear-gradient(to right, transparent 49.9%, rgba(255,255,255,0.22) 50%, transparent 50.1%)';
            }
        } else if (player.weapon && player.weapon.type === 'staff') {
            let frac = 0;
            if (player.staffBurstCooldown > 0) {
                // mostrar recarga de burst da staff indo de cheio para vazio
                frac = Math.max(0, Math.min(1, player.staffBurstCooldown / player.staffBurstCooldownMax));
                if (cooldownBar) {
                    cooldownBar.style.backgroundImage = 'linear-gradient(to right, rgba(255, 120, 190, 0.85), rgba(220, 60, 180, 0.45))';
                }
            } else {
                frac = Math.max(0, Math.min(1, (player.staffCharge || 0) / (player.staffChargeMax || 15)));
                if (cooldownBar) {
                    cooldownBar.style.backgroundImage = 'linear-gradient(to right, rgba(180, 120, 255, 0.45), rgba(120, 80, 255, 0.25))';
                }
            }
            cooldownFill.style.width = `${frac * 100}%`;
        } else {
            const isTornadoWeapon = player.weapon && player.weapon.type === 'cone' && player.weapon.name && player.weapon.name.toLowerCase().includes('lança tornado');
            if (isTornadoWeapon) {
                const frac = Math.max(0, Math.min(1, (player.tornadoCharge || 0) / (player.tornadoChargeMax || 20)));
                cooldownFill.style.width = `${frac * 100}%`;
                if (cooldownBar) {
                    cooldownBar.style.backgroundImage = 'linear-gradient(to right, rgba(180, 120, 255, 0.45), rgba(120, 80, 255, 0.25))';
                }
            } else if (player.weapon && player.weapon.type === 'gun') {
                if (player.gunReloadCooldown > 0) {
                    const frac = Math.max(0, Math.min(1, player.gunReloadCooldown / player.gunReloadCooldownMax));
                    cooldownFill.style.width = `${frac * 100}%`;
                    if (cooldownBar) {
                        cooldownBar.style.backgroundImage = 'linear-gradient(to right, rgba(255, 190, 90, 0.95), rgba(255, 110, 70, 0.45))';
                        cooldownBar.style.backgroundSize = '';
                        cooldownBar.style.backgroundRepeat = '';
                    }
                } else {
                    const frac = Math.max(0, Math.min(1, (player.gunReloadHitCount || 0) / player.gunReloadHitMax));
                    cooldownFill.style.width = `${frac * 100}%`;
                    if (cooldownBar) {
                        cooldownBar.style.backgroundImage = 'linear-gradient(to right, rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(to right, rgba(120, 220, 255, 0.75), rgba(120, 155, 255, 0.35))';
                        cooldownBar.style.backgroundSize = 'calc(100% / 13) 100%';
                        cooldownBar.style.backgroundRepeat = 'repeat-x';
                    }
                }
            } else {
                if (cooldownBar) {
                    cooldownBar.style.backgroundImage = '';
                }
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
        const fakeTarget = ensureCrocFakeIndicatorTarget(currentMonster);
        targetX = fakeTarget.x;
        targetY = fakeTarget.y;
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

function positionMonsterAwayFromPlayer(monster) {
    const margin = 20;
    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    // Special-case: simple monsters should spawn o mais perto possível do jogador
    if (monster.type === 'simple') {
        const minDist = 8; // muito próximo ao jogador, evitando sobreposição
        const maxDist = 80; // pequeno raio ao redor do jogador
        let attempt = 0;
        while (attempt < 100) {
            const angle = Math.random() * Math.PI * 2;
            const r = minDist + Math.random() * (maxDist - minDist);
            const centerX = playerCenterX + Math.cos(angle) * r;
            const centerY = playerCenterY + Math.sin(angle) * r;
            monster.x = Math.max(0, Math.min(gameWidth - monster.width, centerX - monster.width / 2));
            monster.y = Math.max(0, Math.min(gameHeight - monster.height, centerY - monster.height / 2));

            // ensure not overlapping player
            if (!isRectOverlap(monster.x, monster.y, monster.width, monster.height, player.x, player.y, player.width, player.height)) {
                break;
            }
            attempt++;
        }
        // fallback: place just offset from player
        if (attempt >= 100) {
            monster.x = Math.max(0, Math.min(gameWidth - monster.width, player.x + player.width + minDist));
            monster.y = Math.max(0, Math.min(gameHeight - monster.height, player.y));
        }
    } else {
        // Handle caster and croc specially: spawn VERY far across the whole map
        if (monster.type === 'caster' || monster.type === 'croc') {
            const minDistanceFar = Math.max(gameWidth, gameHeight) * 0.9; // muito longe
            let attempt = 0;
            while (attempt < 300) {
                monster.x = Math.random() * (gameWidth - monster.width);
                monster.y = Math.random() * (gameHeight - monster.height);
                const monsterCenterX = monster.x + monster.width / 2;
                const monsterCenterY = monster.y + monster.height / 2;
                const dist = Math.hypot(monsterCenterX - playerCenterX, monsterCenterY - playerCenterY);
                if (dist >= minDistanceFar) break;
                attempt++;
            }
            if (attempt >= 300) {
                if (playerCenterX < gameWidth / 2) monster.x = Math.min(gameWidth - monster.width, playerCenterX + minDistanceFar);
                else monster.x = Math.max(0, playerCenterX - minDistanceFar - monster.width);
                if (playerCenterY < gameHeight / 2) monster.y = Math.min(gameHeight - monster.height, playerCenterY + minDistanceFar);
                else monster.y = Math.max(0, playerCenterY - minDistanceFar - monster.height);
            }
            monster.portalX = monster.x + monster.width / 2;
            monster.portalY = monster.y + monster.height / 2;

            // Ensure patrol target is outside current viewport and reasonably far from spawn
            let tx, ty, tries = 0;
            do {
                tx = Math.random() * Math.max(1, gameWidth - 40) + 20;
                ty = Math.random() * Math.max(1, gameHeight - 40) + 20;
                tries++;
                if (tries > 500) break;
                const dx = tx - (monster.x + monster.width / 2);
                const dy = ty - (monster.y + monster.height / 2);
                if (Math.hypot(dx, dy) < 1200) continue; // patrol should be extremely far from spawn
            } while (tx >= cameraX && tx <= cameraX + viewportWidth && ty >= cameraY && ty <= cameraY + viewportHeight);
            monster.patrolTarget = { x: tx, y: ty };
            return;
        }

        // Croc spawns far; other monsters follow previous behaviour (spawn within viewport but away)
        let minDistance;
        if (monster.type === 'croc') {
            minDistance = Math.max(gameWidth, gameHeight) * 0.85;
        } else {
            minDistance = Math.min(700, Math.max(300, Math.min(gameWidth, gameHeight) * 0.45));
        }

        const spawnMinX = cameraX;
        const spawnMaxX = cameraX + viewportWidth;
        const spawnMinY = cameraY;
        const spawnMaxY = cameraY + viewportHeight;

        let attempt = 0;
        while (attempt < 100) {
            monster.x = spawnMinX + Math.random() * (spawnMaxX - spawnMinX - monster.width);
            monster.y = spawnMinY + Math.random() * (spawnMaxY - spawnMinY - monster.height);
            const monsterCenterX = monster.x + monster.width / 2;
            const monsterCenterY = monster.y + monster.height / 2;
            const dist = Math.hypot(monsterCenterX - playerCenterX, monsterCenterY - playerCenterY);
            if (dist >= minDistance) {
                break;
            }
            attempt++;
        }

        if (attempt >= 100) {
            if (playerCenterX < gameWidth / 2) {
                monster.x = Math.min(spawnMaxX - monster.width, playerCenterX + minDistance);
            } else {
                monster.x = Math.max(spawnMinX, playerCenterX - minDistance - monster.width);
            }
            if (playerCenterY < gameHeight / 2) {
                monster.y = Math.min(spawnMaxY - monster.height, playerCenterY + minDistance);
            } else {
                monster.y = Math.max(spawnMinY, playerCenterY - minDistance - monster.height);
            }
        }
    }
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
    currentMonster = new Monster(phase, chooseMonsterType());
    crocConsecutiveHits = 0;
    positionMonsterAwayFromPlayer(currentMonster);
    if (currentMonster.type === 'croc') {
        currentMonster.fakeIndicatorTarget = getRandomCrocIndicatorTarget();
    }
    player.spinAttack = player.spinAttackLevel > 0;
    player.spinAttackCharges = Math.max(0, player.spinAttackLevel - 1);
    player.bowFirstShotUsed = false;
    player.currentMonsterHitCount = 0;
    player.autoAttackEnabled = false;
    spawnSpinAttackStartProjectiles();
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

function healPlayer(amount) {
    player.health = Math.min(player.maxHealth, player.health + amount);
}

function applyUpgrade(index) {
    const pick = upgradeChoices[index];
    if (!pick) return;

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
        case 'parryConfusionChance':
            player.parryConfusionChance = (player.parryConfusionChance || 0) + pick.value;
            player.parryConfusionDuration = (player.parryConfusionDuration || 0) + 3 * Math.round((pick.value || 0) / 12.5);
            break;
        case 'tornadoCount':
            player.tornadoBurstExtraCount = (player.tornadoBurstExtraCount || 0) + pick.value;
            break;
        case 'tornadoDuration':
            player.tornadoBurstExtraDuration = (player.tornadoBurstExtraDuration || 0) + pick.value;
            break;
        case 'coneAngleBonus':
            player.tornadoConeAngleBonus = (player.tornadoConeAngleBonus || 0) + pick.value;
            break;
        default:
            player[pick.effect] = (player[pick.effect] || 0) + pick.value;
            break;
    }

    healPlayer(2);
    upgradesAcquired++;
    isUpgrading = false;
    upgradeChoices = [];
    roundStartTimer = 60;
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
            return `Parry Confusao: ${ply.parryConfusionChance || 0}% -> ${Math.max(0, (ply.parryConfusionChance || 0) + value)}%. Chance de monstro atacar na direcao oposta.`;
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
    } else if (upgradeDelayTimer > 0) {
        beginCamera();
        drawBackground();
        player.draw();
        currentMonster.draw();
        drawProjectiles();
        drawCritEffects();
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
        drawProjectiles();
        drawCritEffects();
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
        drawProjectiles();
        drawCritEffects();
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
            drawProjectiles();
            drawCritEffects();
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
            drawProjectiles();
            drawMonsterHitscans();
            drawCritEffects();
            drawAfterImages();
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

        // Atualizar
        player.update(keys);
        const monsterPrevX = currentMonster.x;
        const monsterPrevY = currentMonster.y;
        currentMonster.update(player.x + player.width / 2, player.y + player.height / 2);
        resolveEntityWallCollision(currentMonster, monsterPrevX, monsterPrevY);
        currentMonster.x = Math.max(0, Math.min(currentMonster.x, gameWidth - currentMonster.width));
        currentMonster.y = Math.max(0, Math.min(currentMonster.y, gameHeight - currentMonster.height));
        updateAmbientAnimals();
        updateAmbientCritters();
        updateProjectiles();
        updateProjectiles();
        updateMonsterHitscans();
        updateAndDrawSwarmMarks();
        updateDelayedShots();
        updateSweatEffects();
        updateAfterImages();

        // Verificar colisão de contato com o monstro (AABB - Axis-Aligned Bounding Box)
        const isColliding = 
            player.x < currentMonster.x + currentMonster.width &&
            player.x + player.width > currentMonster.x &&
            player.y < currentMonster.y + currentMonster.height &&
            player.y + player.height > currentMonster.y;

        if (isColliding && currentMonster.attackCooldown === 0) {
            if (player.dashTimer > 0 || player.postDashInvulnTimer > 0) {
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
                currentMonster.attackCooldown = currentMonster.type === 'croc' ? 180 : 60;

                // Aplicar efeito negativo do croc: veneno ao ser atingido
                if (currentMonster.type === 'croc') {
                    // veneno por 5 segundos, 2 de dano por segundo
                    player.poisonTimer = Math.max(player.poisonTimer || 0, 5 * 60);
                    player.poisonTickTimer = 60;
                    player.poisonDamagePerTick = 2;
                }

                // Count attacks dealt by croc to the player and trigger throw after 2 hits
                if (currentMonster.type === 'croc') {
                    currentMonster.attacksDealtToPlayer = (currentMonster.attacksDealtToPlayer || 0) + 1;
                    if (currentMonster.attacksDealtToPlayer >= 2 && !currentMonster.thrown) {
                        const targetX = Math.random() * Math.max(0, gameWidth - currentMonster.width);
                        const targetY = Math.random() * Math.max(0, gameHeight - currentMonster.height);
                        const travelFrames = 50; // travel duration (~0.8s)
                        currentMonster.thrown = true;
                        currentMonster.thrownTimer = travelFrames;
                        currentMonster.thrownTotalTime = travelFrames;
                        currentMonster.thrownTargetX = targetX;
                        currentMonster.thrownTargetY = targetY;
                        currentMonster.thrownVx = (targetX - currentMonster.x) / travelFrames;
                        currentMonster.thrownVy = (targetY - currentMonster.y) / travelFrames;
                        currentMonster.thrownArcHeight = 0;
                        currentMonster.alpha = 0.35;
                        currentMonster.attackCooldown = 180;
                        currentMonster.attacksDealtToPlayer = 0;
                        crocConsecutiveHits = 0;
                    } else if (!currentMonster.thrown) {
                        // Contador de ataques consecutivos do croc (se não foi lançado)
                        crocConsecutiveHits++;
                        if (crocConsecutiveHits >= 4) {
                            const monsterCenterX = currentMonster.x + currentMonster.width / 2;
                            const monsterCenterY = currentMonster.y + currentMonster.height / 2;
                            const playerCenterX = player.x + player.width / 2;
                            const playerCenterY = player.y + player.height / 2;
                            const knockbackDir = Math.atan2(monsterCenterY - playerCenterY, monsterCenterX - playerCenterX);
                            const knockbackForce = 8;
                            currentMonster.x += Math.cos(knockbackDir) * knockbackForce;
                            currentMonster.y += Math.sin(knockbackDir) * knockbackForce;
                            crocConsecutiveHits = 0;
                        }
                    }
                }
            }
        } else if (currentMonster.type === 'croc') {
            // Resetar contador quando não há colisão
            crocConsecutiveHits = 0;
        }

        processMeleeHit();
        processConeHit();

        if (player.autoAttackEnabled && player.attackCooldown === 0 && currentMonster.health > 0) {
            attemptAttack();
        }

        // Verificar morte do monstro
        if (currentMonster.health <= 0) {
            monstersDefeated++;
            defeatedTotal++;
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

        // Verificar morte do jogador
        if (player.health <= 0) {
            gameOver = true;
        }

        // Desenhar
        beginCamera();
        drawBackground();
        drawAmbientAnimals();
        drawAmbientCritters();
        player.draw();
        currentMonster.draw();
        drawProjectiles();
        drawMonsterHitscans();
        drawSlowdownInsects();
        drawCritEffects();
        drawSweatEffects();
        drawAfterImages();
        endCamera();

        drawOffscreenMonsterIndicator();
        updateHealthBars();
        updateUI();

        if (timeScale < 1) {
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
crocConsecutiveHits = 0;
currentMonster = new Monster(phase, chooseMonsterType());
isSelectingWeapon = true;
gameLoop();