const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameWidth;
let gameHeight;

function resizeGameCanvas() {
    const maxGameWidth = 1600;
    const maxGameHeight = 600;
    const availableWidth = Math.min(window.innerWidth - 40, maxGameWidth);
    const availableHeight = Math.min(window.innerHeight - 220, maxGameHeight);

    const width = Math.max(320, availableWidth);
    const height = Math.max(240, availableHeight);

    gameWidth = width;
    gameHeight = height;
    canvas.width = gameWidth;
    canvas.height = gameHeight;
    canvas.style.width = `${gameWidth}px`;
    canvas.style.height = `${gameHeight}px`;
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
        // Aplicar redução global de velocidade: reduzir em 50%
        const actualSpeed = (typeof speed === 'number') ? speed * 0.5 : 0;
        this.speed = actualSpeed;
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
        this.homingDuration = typeof opts.homingDuration === 'number' ? opts.homingDuration : 0;
        this.splitOnPlayerAttack = opts.splitOnPlayerAttack || false;
        this.splitDistance = opts.splitDistance || 90;
        this.splitTriggered = false;
        this.delayTimer = opts.delayTimer || 0;
        this.delayDuration = opts.delayDuration || 0;
        this.monsterType = opts.monsterType || null;
        this.style = opts.style || (owner === 'monster' ? getMonsterProjectileStyle(this.monsterType) : '');
        this.hitTarget = opts.hitTarget || false;
        this.ignoreCollision = opts.ignoreCollision || false;
        this.pullStrength = opts.pullStrength || 0;
        this.pullRadius = opts.pullRadius || 0;
        this.lifetime = opts.lifetime || null;
        this.immortal = opts.immortal || false;
        this.savedVx = this.vx;
        this.savedVy = this.vy;
    }

    update() {
        // Se está em delay, não se move ainda
        if (this.delayTimer > 0) {
            this.delayTimer--;
            this.vx = 0;
            this.vy = 0;
            return;
        }
        
        // Restaurar velocidade após o delay
        if (this.delayTimer === 0 && this.delayDuration > 0) {
            this.vx = this.savedVx;
            this.vy = this.savedVy;
            this.delayDuration = 0;
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

        this.x += this.vx;
        this.y += this.vy;
        this.traveled += Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    }

    draw() {
        ctx.save();
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
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 14;
            const shaftLength = Math.max(18, this.size * 8);
            const shaftWidth = Math.max(2, this.size * 0.4);

            ctx.beginPath();
            ctx.moveTo(-shaftLength * 0.15, -shaftWidth);
            ctx.lineTo(shaftLength, -shaftWidth);
            ctx.lineTo(shaftLength + this.size * 1.6, 0);
            ctx.lineTo(shaftLength, shaftWidth);
            ctx.lineTo(-shaftLength * 0.15, shaftWidth);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#c8d9ff';
            ctx.beginPath();
            ctx.moveTo(shaftLength * 0.6, -shaftWidth);
            ctx.lineTo(shaftLength * 0.6, shaftWidth);
            ctx.lineTo(shaftLength * 0.45, shaftWidth * 1.8);
            ctx.lineTo(shaftLength * 0.2, 0);
            ctx.lineTo(shaftLength * 0.45, -shaftWidth * 1.8);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(-shaftLength * 0.15, -shaftWidth);
            ctx.lineTo(shaftLength, -shaftWidth);
            ctx.lineTo(shaftLength + this.size * 1.6, 0);
            ctx.lineTo(shaftLength, shaftWidth);
            ctx.lineTo(-shaftLength * 0.15, shaftWidth);
            ctx.closePath();
            ctx.stroke();

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
            const grad = ctx.createRadialGradient(0, 0, this.size * 0.3, 0, 0, this.size * 1.4);
            grad.addColorStop(0, 'rgba(255,255,255,0.95)');
            grad.addColorStop(0.2, 'rgba(145, 230, 255, 0.95)');
            grad.addColorStop(0.45, 'rgba(95, 190, 255, 0.75)');
            grad.addColorStop(1, 'rgba(20, 80, 170, 0.15)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, this.size * 1.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.95)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, this.size * 0.85, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, this.size * 1.15, 0, Math.PI * 2);
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
        return this.traveled < this.maxDistance && this.x > 0 && this.x < gameWidth && this.y > 0 && this.y < gameHeight;
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
        this.baseDamage = 3.5;
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
        this.spinAttack = false;
        this.attackSpeed = 0;
        this.projectileSpeedBonus = 0;
        this.weapon = null;
        this.meleeCritPercent = 0;
        this.coneCritPercent = 0;
        this.tornadoMissCount = 0;
        this.tornadoBurst = null;
        this.hurricaneCooldown = 0;
        this.tankHitCount = 0;
        this.tankHitWindow = 0;
    }

    update(keys) {
        if (keys['w'] || keys['arrowup']) this.y -= this.speed;
        if (keys['s'] || keys['arrowdown']) this.y += this.speed;
        if (keys['a'] || keys['arrowleft']) this.x -= this.speed;
        if (keys['d'] || keys['arrowright']) this.x += this.speed;

        this.x = Math.max(0, Math.min(this.x, gameWidth - this.width));
        this.y = Math.max(0, Math.min(this.y, gameHeight - this.height));

        if (this.healthRegen > 0) {
            this.regenTimer++;
            if (this.regenTimer >= 60) {
                this.health = Math.min(this.maxHealth, this.health + this.healthRegen);
                this.regenTimer = 0;
            }
        }

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
            }
        }

        if (this.attackCooldown > 0) this.attackCooldown--;
        
        // Decrementar janela de acertos no tank (0.75 segundos = 45 frames)
        if (this.tankHitWindow > 0) {
            this.tankHitWindow--;
        } else {
            this.tankHitCount = 0;
        }
    }

    draw() {
        ctx.save();
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;

        ctx.translate(centerX, centerY);
        ctx.scale(1.7, 1.7);
        ctx.fillStyle = '#55ff7f';
        ctx.shadowColor = '#3af287';
        ctx.shadowBlur = 24;
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

        ctx.restore();

        if (this.attacking) {
            if (this.weapon && this.weapon.type === 'cone') {
                ctx.fillStyle = 'rgba(255, 255, 0, 0.18)';
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 2;
                const px = this.x + this.width / 2;
                const py = this.y + this.height / 2;
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.arc(px, py, this.coneRange, this.coneDirection - this.coneAngle / 2, this.coneDirection + this.coneAngle / 2);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            } else {
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 3;
                const meleeRadius = this.weapon && this.weapon.type === 'sword'
                    ? this.weapon.range + Math.max(0, this.attackRange - 80)
                    : this.attackRange;
                ctx.beginPath();
                ctx.arc(this.x + this.width / 2, this.y + this.height / 2, meleeRadius, 0, Math.PI * 2);
                ctx.stroke();
            }
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
        this.dashTimer = 0;
        this.splitAttackCooldown = 0;
        this.tookDamage = false;
        this.direction = Math.random() > 0.5 ? 1 : -1;

        if (this.type === 'shooter') {
            this.health = 50 + phase * 22;
            this.speed = 1 + phase * 0.15;
            this.maxHealth = this.health;
            this.desiredDistance = 250;
            this.projectileSpeed = 6 + phase * 0.5;
        } else if (this.type === 'tank') {
            this.health = 135 + phase * 60;
            this.speed = 1.16 + phase * 0.29;
            this.maxHealth = this.health;
            this.dashCooldown = 100;
            this.dashTimer = 0;
            this.dashSpeed = 7.25 + phase * 1.16;
            this.triggered75 = false;
            this.triggered50 = false;
            this.triggered25 = false;
        } else if (this.type === 'swarm') {
            this.health = 55 + phase * 20;
            this.speed = 1.8 + phase * 0.35;
            this.maxHealth = this.health;
            this.swarmCooldown = 0;
            this.orbitalAngle = 0;
            this.markSpawnCooldown = 0;
        } else if (this.type === 'caster') {
            this.health = 70 + phase * 25;
            this.speed = 0.5 + phase * 0.1;
            this.maxHealth = this.health;
            this.portalCooldown = 0;
            this.portalTimer = 0;
            this.portalX = this.x + this.width / 2;
            this.portalY = this.y + this.height / 2;
        } else if (this.type === 'smart') {
            this.health = 72 + phase * 28;
            this.speed = 1.65 + phase * 0.22;
            this.maxHealth = this.health;
            this.hitscanCooldown = 0;
            this.predictiveCooldown = 0;
            this.circleAngle = 0;
            this.smartRange = 180 + phase * 6;
        } else {
            this.health = 75 + phase * 45;
            this.speed = 1.45 + phase * 0.725;
            this.maxHealth = this.health;
        }
    }

    chooseType() {
        return chooseMonsterType();
    }

    update(playerX, playerY) {
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (this.type === 'shooter') {
            if (dist < this.desiredDistance * 0.8) {
                const awayX = (this.x - playerX) / dist;
                const awayY = (this.y - playerY) / dist;
                this.x += awayX * this.speed;
                this.y += awayY * this.speed;
            } else if (dist > this.desiredDistance + 40) {
                this.x += (dx / dist) * this.speed * 0.6;
                this.y += (dy / dist) * this.speed * 0.6;
            } else {
                this.x += this.speed * (Math.random() > 0.5 ? 1 : -1);
            }

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
                this.x += (dx / dist) * this.dashSpeed;
                this.y += (dy / dist) * this.dashSpeed;
                this.dashTimer--;
            } else {
                if (dist > this.attackRange) {
                    this.x += (dx / dist) * this.speed;
                    this.y += (dy / dist) * this.speed;
                }

                if (this.projectileAttackCooldown <= 0 && dist < 400) {
                    const attackChoice = Math.random();
                    if (attackChoice < 0.33) {
                        this.rangedAttack(playerX, playerY);
                        this.projectileAttackCooldown = Math.max(70, 100 - this.phase * 8);
                    } else if (attackChoice < 0.7) {
                        this.armorBarrage(playerX, playerY);
                        this.projectileAttackCooldown = Math.max(90, 110 - this.phase * 8);
                    } else {
                        this.chargeMissiles(playerX, playerY);
                        this.projectileAttackCooldown = Math.max(100, 120 - this.phase * 8);
                    }
                } else if (this.projectileAttackCooldown > 0) {
                    this.projectileAttackCooldown--;
                }

                if (this.areaAttackCooldown <= 0 && dist < this.attackRange + 30) {
                    if (Math.random() < 0.5) {
                        this.burstAttack();
                    } else {
                        this.shockwaveAttack();
                    }
                    this.areaAttackCooldown = Math.max(160, 200 - this.phase * 12);
                } else if (this.areaAttackCooldown > 0) {
                    this.areaAttackCooldown--;
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
            this.x += (dx / dist) * this.speed * 0.8;
            this.y += (dy / dist) * this.speed * 0.8;
            
            this.orbitalAngle += 0.15;
            
            if (this.swarmCooldown <= 0) {
                // Spawna 3 projéteis em formação giratória
                for (let i = 0; i < 3; i++) {
                    const angle = this.orbitalAngle + (i * Math.PI * 2 / 3);
                    const spawnX = this.x + this.width / 2 + Math.cos(angle) * 60;
                    const spawnY = this.y + this.height / 2 + Math.sin(angle) * 60;
                    
                    // 20% de chance de preferir mirar uma marca existente ao invés do jogador
                    let targetX = playerX;
                    let targetY = playerY;
                    let homingOpt = { homing: true, homingTarget: player, homingStrength: 0.08 };
                    if (Math.random() < 0.2 && swarmMarks.length > 0) {
                        const mk = swarmMarks[Math.floor(Math.random() * swarmMarks.length)];
                        targetX = mk.x;
                        targetY = mk.y;
                        homingOpt = {}; // ir reto para a marca
                    }
                    spawnMonsterProjectile(
                        spawnX, spawnY,
                        targetX, targetY,
                        this.getAttackDamage() * 0.6,
                        '#ff00ff',
                        3.5 + this.phase * 0.2,
                        Object.assign({ monsterType: this.type, size: 6 }, homingOpt)
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
            // Caster: se move lentamente e spawna portais que disparam projéteis
            if (dist > 180) {
                this.x += (dx / dist) * this.speed;
                this.y += (dy / dist) * this.speed;
            }
            
            if (this.portalCooldown <= 0) {
                // Spawna portal em locação aleatória próxima ao jogador
                this.portalX = playerX + (Math.random() - 0.5) * 300;
                this.portalY = playerY + (Math.random() - 0.5) * 300;
                this.portalTimer = 45; // Portal ativo por 45 frames
                this.portalCooldown = 140 - this.phase * 8;
            } else {
                this.portalCooldown--;
            }
            
            // Portal atira em padrão estrela do centro
            if (this.portalTimer > 0) {
                this.portalTimer--;
                if (this.portalTimer % 12 === 0) {
                    const rayCount = 5 + this.phase;
                    for (let i = 0; i < rayCount; i++) {
                        const angle = (Math.PI * 2 * i) / rayCount;
                        const targetX = this.portalX + Math.cos(angle) * 200;
                        const targetY = this.portalY + Math.sin(angle) * 200;
                        spawnMonsterProjectile(
                            this.portalX, this.portalY,
                            targetX, targetY,
                            this.getAttackDamage() * 0.7,
                            '#00ffff',
                            4.5 + this.phase * 0.2,
                            { monsterType: this.type, size: 7 }
                        );
                    }
                }
            }
        } else if (this.type === 'smart') {
            const predicted = getPredictedPlayerPosition(24);
            this.circleAngle += 0.04 + this.phase * 0.005;
            const targetOrbitX = playerX + Math.cos(this.circleAngle) * this.smartRange;
            const targetOrbitY = playerY + Math.sin(this.circleAngle) * this.smartRange;
            const angleToOrbit = Math.atan2(targetOrbitY - this.y, targetOrbitX - this.x);

            this.x += Math.cos(angleToOrbit) * this.speed * 0.96;
            this.y += Math.sin(angleToOrbit) * this.speed * 0.96;

            if (this.projectileAttackCooldown <= 0) {
                this.smartVolley(predicted.x, predicted.y);
                if (Math.random() < 0.45) {
                    this.smartHitscan(predicted.x, predicted.y);
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
        } else {
            // Basic: fallback
            if (dist > this.attackRange) {
                if (dx > 0) this.x += this.speed;
                else this.x -= this.speed;
                if (dy > 0) this.y += this.speed;
                else this.y -= this.speed;
            }

            if (this.tookDamage && this.splitAttackCooldown <= 0) {
                this.splitAwareAttack(playerX, playerY);
                this.splitAttackCooldown = 120;
                this.tookDamage = false;
            }

            if (this.projectileAttackCooldown <= 0 && dist > this.attackRange + 30) {
                this.guidedAttack(playerX, playerY);
                this.projectileAttackCooldown = Math.max(80, 110 - this.phase * 8);
            } else if (this.projectileAttackCooldown > 0) {
                this.projectileAttackCooldown--;
            }

            if (this.areaAttackCooldown <= 0 && dist < this.attackRange + 25) {
                this.burstAttack();
                this.areaAttackCooldown = Math.max(170, 210 - this.phase * 12);
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

    smartVolley(targetX, targetY) {
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
        const particles = 8;
        const speed = 5.5 + this.phase * 0.2;
        const baseAngle = Math.atan2(targetY - (this.y + this.height / 2), targetX - (this.x + this.width / 2));
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
                '#66ddff',
                speed,
                { monsterType: this.type, size: 11 }
            );
        }
        this.attackEffectTimer = 14;
    }

    smartHitscan(targetX, targetY) {
        const startX = this.x + this.width / 2;
        const startY = this.y + this.height / 2;
        const angle = Math.atan2(targetY - startY, targetX - startX);
        const distance = 480;
        const hitX = startX + Math.cos(angle) * distance;
        const hitY = startY + Math.sin(angle) * distance;
        spawnMonsterHitscan(startX, startY, hitX, hitY, Math.max(8, this.getAttackDamage()), 'rgba(120,220,255,0.9)', 20, 30);
    }

    sprayAttack(playerX, playerY) {
        const shots = 6 + this.phase;
        const speed = (this.projectileSpeed || 6) * 0.25;

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
                '#66bbff',
                speed,
                { monsterType: this.type }
            );
        }

        this.attackEffectTimer = 8;
    }

    spiralWaveAttack(playerX, playerY) {
        const shots = 10 + this.phase * 2;
        const speed = 4.5 * 0.67;
        const baseAngle = Math.atan2(playerY - (this.y + this.height / 2), playerX - (this.x + this.width / 2));

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
                '#44aaff',
                speed,
                { monsterType: this.type }
            );
        }

        this.attackEffectTimer = 10;
    }

    burstArc(playerX, playerY) {
        const shots = 7;
        const speed = 5.5;
        const baseAngle = Math.atan2(playerY - (this.y + this.height / 2), playerX - (this.x + this.width / 2));

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
                '#88eeff',
                speed,
                { monsterType: this.type }
            );
        }

        this.attackEffectTimer = 10;
    }

    splitAwareAttack(playerX, playerY) {
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
            '#ff6633',
            speed,
            { monsterType: this.type, size: 10, splitOnPlayerAttack: true, splitDistance: 160, maxDistance: 1400 }
        );
    }

    armorBarrage(playerX, playerY) {
        const shots = 4 + Math.min(3, this.phase);
        const speed = 7;
        const baseAngle = Math.atan2(playerY - (this.y + this.height / 2), playerX - (this.x + this.width / 2));

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
                '#cc4444',
                speed,
                { monsterType: this.type, size: 12 }
            );
        }

        this.attackEffectTimer = 14;
    }

    chargeMissiles(playerX, playerY) {
        const missiles = 3;
        const speed = 6.75;
        const baseAngle = Math.atan2(playerY - (this.y + this.height / 2), playerX - (this.x + this.width / 2));
        const damage = Math.max(6, this.getAttackDamage() + 1);

        for (let i = 0; i < missiles; i++) {
            const orbitAngle = baseAngle + (i - 1) * (Math.PI / 4);
            const spawnX = this.x + this.width / 2 + Math.cos(orbitAngle) * 38;
            const spawnY = this.y + this.height / 2 + Math.sin(orbitAngle) * 38;
            const targetX = spawnX + Math.cos(baseAngle) * 220;
            const targetY = spawnY + Math.sin(baseAngle) * 220;

            spawnMonsterProjectile(
                spawnX,
                spawnY,
                targetX,
                targetY,
                damage,
                '#ff8844',
                speed,
                {
                    monsterType: this.type,
                    size: 11,
                    homing: true,
                    homingTarget: player,
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
        const missiles = 3;
        const speed = 8;
        const damage = Math.max(4, this.getAttackDamage() - 1);

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
                '#ff3333',
                speed,
                { monsterType: this.type, homing: true, homingTarget: player, critPercent: 100, size: 10 }
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

    draw() {
        ctx.save();
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

        ctx.fillStyle = gradient;
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
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius * 0.95, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius * (0.45 + i * 0.16), 0, Math.PI * 2);
                ctx.stroke();
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
        } else {
            ctx.fillStyle = '#ffff88';
            ctx.fillRect(this.x + 14, this.y + 18, 12, 12);
            ctx.fillRect(this.x + this.width - 26, this.y + 18, 12, 12);
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
            if (this.portalTimer > 0) {
                ctx.fillStyle = 'rgba(0, 255, 255, 0.25)';
                ctx.beginPath();
                ctx.arc(this.portalX, this.portalY, 42, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }

        if (this.attackEffectTimer > 0) {
            ctx.strokeStyle = '#ffff88';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(centerX, centerY, this.attackRange + 15, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    getAttackDamage() {
        if (this.type === 'shooter') return 8 + this.phase * 2;
        if (this.type === 'tank') return 12 + this.phase * 4;
        if (this.type === 'swarm') return 6 + this.phase * 2.5;
        if (this.type === 'caster') return 7 + this.phase * 3;
        return 5 + this.phase * 3;
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
let phase = 1;
let monstersDefeated = 0;
let defeatedTotal = 0;
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
let swarmMarks = [];
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
let selectionBackgroundTick = 0;
const selectionBackgroundParticles = Array.from({ length: 24 }, () => ({
    x: Math.random() * (gameWidth || 800),
    y: Math.random() * (gameHeight || 600),
    size: Math.random() * 8 + 4,
    speed: Math.random() * 0.2 + 0.18,
    hue: 190 + Math.random() * 40,
    alpha: 0.03 + Math.random() * 0.06
}));
const baseMonsterTypes = ['shooter', 'swarm', 'caster', 'avianightmare', 'smart'];

function getAllowedMonsterTypes() {
    let allowed = [...baseMonsterTypes];
    const allOtherTypesKilled = baseMonsterTypes.every(type => monsterTypeKills[type]);
    if (allOtherTypesKilled) {
        allowed.push('tank');
    }
    if (phase < 4) {
        allowed = allowed.filter(type => type !== 'avianightmare');
    }
    return allowed;
}

function chooseMonsterType() {
    let allowedTypes = getAllowedMonsterTypes();
    if (allowedTypes.length === 0) return 'shooter';

    const excludedTypes = new Set([...phaseMonsterTypes, ...prevPhaseMonsterTypes]);
    let remainingTypes = allowedTypes.filter(type => !excludedTypes.has(type));
    if (remainingTypes.length === 0) {
        remainingTypes = allowedTypes;
    }

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
            if (roll <= 0) return remainingTypes[i];
        }
    }

    return remainingTypes[Math.floor(Math.random() * remainingTypes.length)];
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
    { name: 'Arco 🏹', type: 'bow', color: '#00ff00', cooldown: 90, range: 37.5, damage: 12, speed: 15 },
    { name: 'Varinha 🔮', type: 'staff', color: '#ff00ff', cooldown: 35, range: 25, damage: 22, speed: 0.75 },
    { name: 'Espada ⚔️', type: 'sword', color: '#ffaa00', cooldown: 0, range: 45, damage: 14 },
    { name: 'Lança Tornado 🌪️', type: 'cone', color: '#83bfd3', cooldown: 35, range: 80, damage: 3, coneAngle: Math.PI / 3 }
];

const upgradeOptions = [
    { name: 'Vida Máxima +20', effect: 'maxHealth', value: 20, desc: 'Aumenta sua vida máxima em 20.' },
    { name: 'Dano +1', effect: 'baseDamage', value: 1, desc: 'Aumenta seu dano base em 1.' },
    { name: 'Velocidade +1', effect: 'speed', value: 1, desc: 'Aumenta sua velocidade de movimento.' },
    { name: 'Alcance +15', effect: 'attackRange', value: 45, desc: 'Aumenta o alcance de seus ataques corpo a corpo.' },
    { name: 'Regeneração +1', effect: 'healthRegen', value: 1, desc: 'Restaura 1 ponto de vida a cada segundo.' },
    { name: 'Proteção +2', effect: 'damageReduction', value: 2, desc: 'Reduz o dano recebido em 2.' },
    { name: 'Recarga Rápida -2', effect: 'cooldownReduction', value: 2, desc: 'Reduz o cooldown dos seus ataques.' },
    { name: 'Força de Arma +3', effect: 'weaponDamage', value: 3, desc: 'Aumenta o dano extra das armas.' },
    { name: 'Crítico +8%', effect: 'critChance', value: 8, desc: 'Aumenta a chance de acerto crítico em 8%.' },
    { name: 'Dano Crítico +20%', effect: 'critDamage', value: 0.2, desc: 'Aumenta o multiplicador de dano crítico em 20%.' },
    { name: 'Projéteis +0.5', effect: 'extraProjectiles', value: 0.5, desc: 'Dispara 2 projéteis extras em ataques à distância.' },
    { name: 'Tiro em Cone +0.5', effect: 'spreadProjectiles', value: 0.5, desc: 'Dispara projéteis em um cone mais amplo.' },
    { name: 'Tiro Tardio +1', effect: 'lateShots', value: 1, desc: 'Após atirar, um novo projétil aparece no ponto do último tiro. Cada nível concede um projétil tardio adicional.' },
    { name: 'Ataque Triplo', effect: 'spinAttack', value: 1, desc: 'Ataque automático no início do combate.' },
    { name: 'Ataque Rápido +10%', effect: 'attackSpeed', value: 0.1, desc: 'Aumenta a velocidade de ataque em 10%.' },
    { name: 'Tiro Veloz +2', effect: 'projectileSpeedBonus', value: 2, desc: 'Aumenta a velocidade dos projéteis.' }
];

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
        const combined = upgradeChoices;
        if (e.key === 'ArrowLeft' || e.key === 'a') {
            selectedUpgradeIndex = (selectedUpgradeIndex - 1 + combined.length) % combined.length;
        }
        if (e.key === 'ArrowRight' || e.key === 'd') {
            selectedUpgradeIndex = (selectedUpgradeIndex + 1) % combined.length;
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
        
        const buttonWidth = 180;
        const buttonHeight = 70;
        const spacing = 20;
        const totalWidth = upgradeChoices.length * buttonWidth + (upgradeChoices.length - 1) * spacing;
        const startX = (gameWidth - totalWidth) / 2;
        const startY = gameHeight / 2 - 45;
        
        for (let i = 0; i < upgradeChoices.length; i++) {
            const bx = startX + i * (buttonWidth + spacing);
            const by = startY;
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
    isSelectingWeapon = false;
    gameStarted = true;
    roundStartTimer = 60;
}

function attemptAttack() {
    if (!player.weapon) return;
    
    if (player.attackCooldown === 0) {
        const weapon = player.weapon;
        const targetX = currentMonster.x + currentMonster.width / 2;
        const targetY = currentMonster.y + currentMonster.height / 2;
        
        const baseWeaponDamage = weapon.damage + player.weaponDamage + player.baseDamage;
        const critRoll = Math.random() * 100;
        const critMultiplier = critRoll < player.critChance ? 1 + player.critDamage : 1;
        const critPercent = critMultiplier > 1 ? player.critDamage : 0;
        const attackDamage = Math.round(baseWeaponDamage * critMultiplier);
        const cooldown = Math.max(1, weapon.cooldown - player.cooldownReduction);
        const baseAngle = Math.atan2(targetY - (player.y + player.height / 2), targetX - (player.x + player.width / 2));

        if (weapon.type === 'sword') {
            player.attacking = true;
            player.meleeAttacking = true;
            player.meleeTimer = 14;
            player.meleeHitRegistered = false;
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
                const baseTornadoSpeed = ((weapon.speed || 12) + player.projectileSpeedBonus) * 0.25;
                player.tornadoBurst = {
                    active: true,
                    spawnIndex: 0,
                    nextSpawnDelay: 0,
                    direction: baseAngle,
                    damage: attackDamage,
                    color: weapon.color,
                    speed: baseTornadoSpeed,
                    critPercent: critPercent,
                    coneAngle: (weapon.coneAngle || Math.PI / 3) * 1.45,
                    count: 6,
                    maxDistance: weapon.range * 1.45
                };
            }

            player.attackCooldown = Math.max(1, cooldown - Math.round(cooldown * player.attackSpeed));
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
                spawnPlayerProjectile(player.x + player.width / 2, player.y + player.height / 2, projTargetX, projTargetY, attackDamage, weapon.color, speed, { critPercent });
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
        }
    }
}

function updateProjectiles() {
    // Verificar colisões entre projéteis do jogador e do monstro
    const projectilesToRemove = new Set();
    const hurricaneRemovals = new Set();
    
    if (player.tornadoBurst && player.tornadoBurst.active) {
        if (player.tornadoBurst.nextSpawnDelay <= 0) {
            const burst = player.tornadoBurst;
            if (burst.spawnIndex < burst.count) {
                const angleOffset = -burst.coneAngle / 2 + (burst.spawnIndex / (burst.count - 1)) * burst.coneAngle;
                const fireAngle = burst.direction + angleOffset;
                const startX = player.x + player.width / 2;
                const startY = player.y + player.height / 2;
                const targetX = startX + Math.cos(fireAngle) * burst.maxDistance;
                const targetY = startY + Math.sin(fireAngle) * burst.maxDistance;
                spawnPlayerProjectile(startX, startY, targetX, targetY, burst.damage, burst.color, burst.speed, {
                    size: 4,
                    critPercent: burst.critPercent,
                    style: 'tornadoLance',
                    maxDistance: burst.maxDistance,
                    hitTarget: false
                });
                burst.spawnIndex += 1;
                burst.nextSpawnDelay = 10;
            } else {
                burst.active = false;
            }
        } else {
            player.tornadoBurst.nextSpawnDelay -= 1;
        }
    }
    
    for (let i = 0; i < projectiles.length; i++) {
        if (projectilesToRemove.has(i) || projectiles[i].owner !== 'player' || projectiles[i].ignoreCollision) continue;
        
        for (let j = i + 1; j < projectiles.length; j++) {
            if (projectilesToRemove.has(j) || projectiles[j].owner !== 'monster') continue;
            
            const p1 = projectiles[i];
            const p2 = projectiles[j];
            
            // Verificar colisão baseada em distância (raio de ~8 pixels para cada projétil)
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 16) {
                projectilesToRemove.add(i);
                projectilesToRemove.add(j);
                break;
            }
        }
    }
    
    // Remover projéteis que colidiram em ordem reversa para não afetar índices
    Array.from(projectilesToRemove).sort((a, b) => b - a).forEach(index => {
        projectiles.splice(index, 1);
    });
    
    // Verificar colisões com marcas do swarm
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        for (let j = swarmMarks.length - 1; j >= 0; j--) {
            const mark = swarmMarks[j];
            const dx = p.x - mark.x;
            const dy = p.y - mark.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < mark.radius + p.size) {
                // Projectile atingiu a marca - gerar 3 dentes grandes saindo da boca
                for (let k = 0; k < 3; k++) {
                    const angle = Math.random() * Math.PI * 2;
                    const targetX = mark.x + Math.cos(angle) * 260;
                    const targetY = mark.y + Math.sin(angle) * 260;
                    spawnPlayerProjectile(mark.x, mark.y, targetX, targetY, 8, '#ffffff', 7, {
                        style: 'toothBolt',
                        size: 16
                    });
                }
                
                // Remover a marca
                swarmMarks.splice(j, 1);
                break;
            }
        }
    }
    
    if (player.hurricaneCooldown > 0) {
        player.hurricaneCooldown -= 1;
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        projectiles[i].update();
        
        if (projectiles[i].style === 'tornadoHurricane') {
            const hurricane = projectiles[i];
            for (let j = projectiles.length - 1; j >= 0; j--) {
                if (j === i) continue;
                const q = projectiles[j];
                if (q === hurricane || q.style === 'tornadoHurricane') continue;
                const dx = hurricane.x - q.x;
                const dy = hurricane.y - q.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                if (dist <= hurricane.pullRadius) {
                    const pull = hurricane.pullStrength * (1 + (hurricane.pullRadius - dist) / hurricane.pullRadius);
                    q.vx += (dx / dist) * pull;
                    q.vy += (dy / dist) * pull;
                    if (dist < hurricane.size + q.size + 6) {
                        hurricaneRemovals.add(q);
                    }
                }
            }
            continue;
        }

        if (!projectiles[i].isAlive()) {
            if (projectiles[i].style === 'tornadoHurricane') {
                player.hurricaneCooldown = 180;
            }
            projectiles.splice(i, 1);
            continue;
        }

        if (projectiles[i].owner === 'monster' && projectiles[i].splitOnPlayerAttack && projectiles[i].traveled >= projectiles[i].splitDistance) {
            const p = projectiles[i];
            const playerCenterX = player.x + player.width / 2;
            const playerCenterY = player.y + player.height / 2;
            const baseAngle = Math.atan2(playerCenterY - p.y, playerCenterX - p.x);
            const splitCount = 5;
            const splitSpeed = Math.max(4, Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 1.2);
            const splitDamage = Math.max(1, Math.floor(p.damage * 0.75));

            for (let j = 0; j < splitCount; j++) {
                const angle = baseAngle + (j - (splitCount - 1) / 2) * 0.12;
                const targetX = p.x + Math.cos(angle) * 180;
                const targetY = p.y + Math.sin(angle) * 180;
                projectiles.push(new Projectile(
                    p.x,
                    p.y,
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
        
        if (!projectiles[i].isAlive()) {
            const p = projectiles[i];
            if (p.style === 'tornadoLance' && !p.hitTarget) {
                player.tornadoMissCount = (player.tornadoMissCount || 0) + 1;
                if (player.tornadoMissCount >= 6 && player.hurricaneCooldown <= 0) {
                    player.tornadoMissCount = 0;
                    spawnTornadoHurricane();
                }
            }
            if (p.style === 'tornadoHurricane') {
                player.hurricaneCooldown = 180;
            }
            projectiles.splice(i, 1);
            continue;
        }
        
        const p = projectiles[i];

        if (p.owner === 'player' && !p.ignoreCollision) {
            const isHit = 
                p.x < currentMonster.x + currentMonster.width &&
                p.x > currentMonster.x &&
                p.y < currentMonster.y + currentMonster.height &&
                p.y > currentMonster.y;
            
            if (isHit) {
                if (p.style === 'tornadoLance') {
                    p.hitTarget = true;
                }
                currentMonster.takeDamage(p.damage);
                
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
                    if (p.critPercent > 0) {
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
            const isHit = 
                p.x < player.x + player.width &&
                p.x > player.x &&
                p.y < player.y + player.height &&
                p.y > player.y;
            
            if (isHit) {
                const effectiveDamage = Math.max(0, p.damage - player.damageReduction);
                player.health -= effectiveDamage;
                projectiles.splice(i, 1);
            }
        }
    }

    if (hurricaneRemovals.size > 0) {
        projectiles = projectiles.filter(proj => !hurricaneRemovals.has(proj));
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
                if (distanceToBeam <= hitRadius) {
                    const effectiveDamage = Math.max(0, beam.damage - player.damageReduction);
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
    if (!player.meleeAttacking || player.meleeHitRegistered || !player.weapon || player.weapon.type !== 'sword') return;

    const weapon = player.weapon;
    const extraRange = Math.max(0, player.attackRange - 80);
    const meleeRadius = weapon.range + extraRange;
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;
    const mx = currentMonster.x + currentMonster.width / 2;
    const my = currentMonster.y + currentMonster.height / 2;
    const dist = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));
    const targetRadius = Math.max(currentMonster.width, currentMonster.height) / 2;

    if (dist <= meleeRadius + targetRadius) {
        const baseWeaponDamage = weapon.damage + player.weaponDamage + player.baseDamage;
        const critRoll = Math.random() * 100;
        const critMultiplier = critRoll < player.critChance ? 1 + player.critDamage : 1;
        const attackDamage = Math.round(baseWeaponDamage * critMultiplier);

        currentMonster.takeDamage(attackDamage);
        player.meleeHitRegistered = true;

        if (player.attackMove > 0 && dist > 0) {
            player.x = Math.max(0, Math.min(player.x + ((mx - px) / dist) * player.attackMove, gameWidth - player.width));
            player.y = Math.max(0, Math.min(player.y + ((my - py) / dist) * player.attackMove, gameHeight - player.height));
        }

        if (player.spinAttack) {
            const spinRadius = 18;
            if (dist <= spinRadius + targetRadius) {
                currentMonster.takeDamage(Math.round(attackDamage * 0.5));
            }
        }
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
        const attackDamage = Math.round(baseWeaponDamage * critMultiplier);

        currentMonster.takeDamage(attackDamage);
        player.coneHitRegistered = true;
    }
}

function spawnSpinAttackStartProjectiles() {
    if (!player.spinAttack) return;

    const centerX = player.x + player.width / 2;
    const centerY = player.y + player.height / 2;
    const speed = 4;
    const damage = Math.max(1, Math.round(player.baseDamage + player.weaponDamage + 2));
    const size = 14;
    const angles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];

    angles.forEach((angle) => {
        const targetX = centerX + Math.cos(angle) * 140;
        const targetY = centerY + Math.sin(angle) * 140;
        spawnPlayerProjectile(centerX, centerY, targetX, targetY, damage, '#ffcc00', speed, { size, homing: true, homingStrength: 0.05, style: 'spinAttack' });
    });
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

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 25; i++) {
        const size = Math.random() * 2 + 1;
        ctx.fillRect(Math.random() * gameWidth, Math.random() * gameHeight, size, size);
    }
    ctx.restore();
}

function drawProjectiles() {
    for (let proj of projectiles) {
        proj.draw();
    }
}

function updateAndDrawSwarmMarks() {
    for (let i = swarmMarks.length - 1; i >= 0; i--) {
        const mark = swarmMarks[i];
        
        // Decrementar lifetime
        mark.lifetime--;
        
        // Desenhar a marca
        const mouthWidth = mark.radius * 1.8;
        const mouthHeight = mark.radius * 0.9;
        const leftX = mark.x - mouthWidth / 2;
        const rightX = mark.x + mouthWidth / 2;
        const lipHeight = mouthHeight * 0.5;

        ctx.save();
        ctx.translate(mark.x, mark.y);
        ctx.rotate((Math.sin(mark.lifetime * 0.08) * 0.1));
        ctx.translate(-mark.x, -mark.y);

        // Boca aberta sem rosto
        ctx.fillStyle = 'rgba(180, 0, 180, 0.65)';
        ctx.beginPath();
        ctx.ellipse(mark.x, mark.y, mouthWidth / 2, mouthHeight / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2b002b';
        ctx.beginPath();
        ctx.ellipse(mark.x, mark.y + mouthHeight * 0.1, mouthWidth / 2.1, mouthHeight / 2.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Dentes dentro da boca
        const teeth = 7;
        const toothWidth = mouthWidth / teeth * 0.9;
        const toothHeight = mouthHeight * 0.7;
        for (let t = 0; t < teeth; t++) {
            const tx = mark.x - mouthWidth / 2 + toothWidth * 0.5 + t * toothWidth;
            const ty = mark.y + mouthHeight * 0.05;
            ctx.beginPath();
            ctx.moveTo(tx - toothWidth * 0.45, ty);
            ctx.lineTo(tx, ty + toothHeight);
            ctx.lineTo(tx + toothWidth * 0.45, ty);
            ctx.closePath();
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        }

        // Sombra da boca
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(mark.x, mark.y, mouthWidth / 2, mouthHeight / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        
        // Remover marcas expiradas
        if (mark.lifetime <= 0) {
            swarmMarks.splice(i, 1);
        }
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
            return 'swarmPod';
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
    const size = opts.size || getProjectileDefaultSize(opts.style);
    const proj = new Projectile(x, y, targetX, targetY, damage, color, speed, 'player', size, opts);
    proj.critPercent = opts.critPercent || 0;
    if (opts.homing) {
        proj.homing = true;
        proj.homingTarget = opts.homingTarget || currentMonster;
        proj.homingStrength = typeof opts.homingStrength === 'number' ? opts.homingStrength : 0.06;
    }
    projectiles.push(proj);
    return proj;
}

function spawnMonsterProjectile(x, y, targetX, targetY, damage, color, speed, opts = {}) {
    opts.monsterType = opts.monsterType || currentMonster?.type || '';
    opts.style = opts.style || getMonsterProjectileStyle(opts.monsterType);
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

function spawnTornadoHurricane() {
    const x = player.x + player.width / 2;
    const y = player.y + player.height / 2;
    const targetX = currentMonster ? currentMonster.x + currentMonster.width / 2 : x + 120;
    const targetY = currentMonster ? currentMonster.y + currentMonster.height / 2 : y;
    const proj = new Projectile(x, y, targetX, targetY, 0, '#76d7ff', 3, 'player', 42, {
        style: 'tornadoHurricane',
        ignoreCollision: true,
        homing: true,
        homingTarget: currentMonster,
        homingStrength: 0.18,
        homingDuration: 300,
        lifetime: 75,
        immortal: false,
        pullStrength: 0.55,
        pullRadius: 260,
        maxDistance: 10000
    });
    if (proj.vx === 0 && proj.vy === 0) {
        proj.vx = 3;
        proj.vy = 0;
        proj.savedVx = proj.vx;
        proj.savedVy = proj.vy;
    }
    projectiles.push(proj);
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

function drawSelectionBackground() {
    const pulse = 0.9 + Math.sin(selectionBackgroundTick * 0.045) * 0.18;
    const depth = 0.16 + Math.sin(selectionBackgroundTick * 0.035) * 0.06;
    const glow = 0.5 + Math.sin(selectionBackgroundTick * 0.08) * 0.08;

    const gradient = ctx.createRadialGradient(gameWidth * 0.5, gameHeight * 0.36, 20, gameWidth * 0.5, gameHeight * 0.36, gameWidth);
    gradient.addColorStop(0, `rgba(${12 * pulse}, ${28 * pulse}, ${44 * pulse}, ${0.98 * glow})`);
    gradient.addColorStop(0.4, `rgba(${8 * pulse}, ${20 * pulse}, ${34 * pulse}, 0.8)`);
    gradient.addColorStop(1, `rgba(${2 * pulse}, ${6 * pulse}, ${12 * pulse}, 0.95)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, gameWidth, gameHeight);

    ctx.save();
    for (let i = 0; i < selectionBackgroundParticles.length; i++) {
        const p = selectionBackgroundParticles[i];
        p.y += p.speed * (0.95 + Math.sin(selectionBackgroundTick * 0.026 + i) * 0.04);
        p.x += Math.sin((selectionBackgroundTick + i * 20) * 0.02) * 0.4;
        if (p.y > gameHeight + 30) p.y = -20;
        if (p.x < -20) p.x = gameWidth + 20;
        if (p.x > gameWidth + 20) p.x = -20;

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
    for (let x = -spacing; x <= gameWidth + spacing; x += spacing) {
        const offset = Math.sin((selectionBackgroundTick + x) * 0.018) * 10;
        ctx.beginPath();
        ctx.moveTo(x + offset, 0);
        ctx.lineTo(x - offset, gameHeight);
        ctx.stroke();
    }
    for (let y = -spacing; y <= gameHeight + spacing; y += spacing) {
        const offset = Math.cos((selectionBackgroundTick + y) * 0.018) * 10;
        ctx.beginPath();
        ctx.moveTo(0, y + offset);
        ctx.lineTo(gameWidth, y - offset);
        ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${depth * 1.1})`;
    ctx.fillRect(0, 0, gameWidth, gameHeight);
    ctx.restore();

    selectionBackgroundTick += 1;
}

function getWeaponSelectionLayout() {
    const buttonWidth = 200;
    const buttonHeight = 120;
    const spacing = 22;
    const totalWidth = weapons.length * buttonWidth + (weapons.length - 1) * spacing;
    const startX = (gameWidth - totalWidth) / 2;
    const startY = gameHeight / 2 - buttonHeight / 2 + 40;
    const radius = 20;
    return { buttonWidth, buttonHeight, spacing, startX, startY, radius };
}

function drawWeaponSelection() {
    drawSelectionBackground();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
    ctx.fillRect(0, 0, gameWidth, gameHeight);

    ctx.fillStyle = '#8cffc5';
    ctx.font = 'bold 34px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Escolha sua Arma', gameWidth / 2, 92);

    const layout = getWeaponSelectionLayout();
    const { buttonWidth, buttonHeight, spacing, startX, startY } = layout;

    for (let i = 0; i < weapons.length; i++) {
        const bx = startX + i * (buttonWidth + spacing);
        const by = startY;
        const weapon = weapons[i];
        const isSelected = i === selectedWeaponIndex;

        ctx.fillStyle = isSelected ? '#2c3b2f' : '#10141a';
        ctx.fillRect(bx, by, buttonWidth, buttonHeight);

        ctx.strokeStyle = isSelected ? '#ffffff' : '#555555';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, buttonWidth, buttonHeight);

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1;
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(weapon.name, bx + buttonWidth / 2, by + buttonHeight / 2 - 8);
        ctx.strokeText(weapon.name, bx + buttonWidth / 2, by + buttonHeight / 2 - 8);
        ctx.restore();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.font = '13px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        wrapText(weapon.desc || '', bx + buttonWidth / 2, by + buttonHeight / 2 + 10, buttonWidth - 36, 18);
    }

    ctx.fillStyle = '#b6f5d4';
    ctx.font = '15px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Use as setas ou clique para escolher', gameWidth / 2, gameHeight - 64);
    ctx.fillText('Pressione Espaço ou Enter para confirmar', gameWidth / 2, gameHeight - 38);
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
    document.getElementById('statsDisplay').innerHTML = 
        `Arma: ${weaponName} | Monstros: ${monstersDefeated} | Vida: ${Math.max(0, Math.round(player.health))}/${player.maxHealth}`;
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
    spawnSpinAttackStartProjectiles();
    upgradeChoices = getRandomUpgrades(4);
    selectedUpgradeIndex = 0;
    isUpgrading = false;
    pendingUpgrade = true;
    upgradeDelayTimer = 30;
    upgradeOverlayY = gameHeight / 2;
    upgradeOverlayAlpha = 1;
    upgradeOverlayAnimating = false;
}

function getRandomUpgrades(count) {
    const available = [...upgradeOptions];
    const choices = [];
    while (choices.length < count && available.length > 0) {
        const index = Math.floor(Math.random() * available.length);
        choices.push(available.splice(index, 1)[0]);
    }
    return choices;
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
            player.spinAttack = true;
            break;
        default:
            player[pick.effect] = (player[pick.effect] || 0) + pick.value;
            break;
    }

    isUpgrading = false;
    upgradeChoices = [];
    roundStartTimer = 60;
}

function drawCountdownOverlay(text, subtitle = '', y = gameHeight / 2, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, gameWidth, gameHeight);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 92px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, gameWidth / 2, y);
    if (subtitle) {
        ctx.font = '20px Arial';
        ctx.fillStyle = '#a8ecff';
        ctx.fillText(subtitle, gameWidth / 2, y + 48);
    }
    ctx.restore();
}

function drawUpgradeMenu() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, gameWidth, gameHeight);

    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Escolha um Upgrade', gameWidth / 2, 80);

    const buttonWidth = 180;
    const buttonHeight = 70;
    const spacing = 20;
    const totalWidth = upgradeChoices.length * buttonWidth + (upgradeChoices.length - 1) * spacing;
    const startX = (gameWidth - totalWidth) / 2;
    const startY = gameHeight / 2 - 45;

    for (let i = 0; i < upgradeChoices.length; i++) {
        const bx = startX + i * (buttonWidth + spacing);
        const by = startY;
        const isSelected = i === selectedUpgradeIndex;

        ctx.fillStyle = isSelected ? '#00ff00' : '#003300';
        ctx.fillRect(bx, by, buttonWidth, buttonHeight);

        ctx.strokeStyle = isSelected ? '#00ff00' : '#00aa00';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeRect(bx, by, buttonWidth, buttonHeight);

        ctx.fillStyle = '#000000';
        ctx.font = isSelected ? 'bold 14px Arial' : '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(upgradeChoices[i].name, bx + buttonWidth / 2, by + buttonHeight / 2 + 5);
    }

    if (upgradeChoices[selectedUpgradeIndex]) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        const desc = upgradeChoices[selectedUpgradeIndex].desc || '';
        ctx.fillText(desc, gameWidth / 2, startY + buttonHeight + 45);
    }

    ctx.fillStyle = '#00d4ff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Use as Setas ou Clique para Selecionar', gameWidth / 2, gameHeight - 60);
    ctx.fillText('Pressione Espaço ou Enter para Confirmar', gameWidth / 2, gameHeight - 30);
}


function gameLoop() {
    // Desenhar fundo estilizado
    drawBackground();

    if (isSelectingWeapon) {
        drawWeaponSelection();
    } else if (upgradeDelayTimer > 0) {
        player.draw();
        currentMonster.draw();
        drawProjectiles();
        drawCritEffects();
        updateHealthBars();
        updateUI();

        upgradeDelayTimer--;
        if (upgradeDelayTimer <= 0) {
            upgradeDelayTimer = 0;
            upgradeOverlayAnimating = true;
        }

        drawCountdownOverlay('Melhorias!', 'Pense bem...', upgradeOverlayY, upgradeOverlayAlpha);
    } else if (upgradeOverlayAnimating) {
        player.draw();
        currentMonster.draw();
        drawProjectiles();
        drawCritEffects();
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
        player.draw();
        currentMonster.draw();
        drawProjectiles();
        drawCritEffects();
        updateHealthBars();
        updateUI();
        drawUpgradeMenu();
    } else if (!gameOver) {
        if (roundStartTimer > 0) {
            player.draw();
            currentMonster.draw();
            drawProjectiles();
            drawCritEffects();
            updateHealthBars();
            updateUI();

            const countdownNumber = Math.max(1, Math.ceil(roundStartTimer / 20));
            const subtitle = countdownNumber === 1 ? 'Vai!' : '';
            drawCountdownOverlay(countdownNumber.toString(), subtitle);
            roundStartTimer--;
            requestAnimationFrame(gameLoop);
            return;
        }

        // Atualizar
        player.update(keys);
        currentMonster.update(player.x + player.width / 2, player.y + player.height / 2);
        updateProjectiles();
        updateProjectiles();
        updateMonsterHitscans();
        updateAndDrawSwarmMarks();
        updateDelayedShots();

        // Verificar colisão de contato com o monstro (AABB - Axis-Aligned Bounding Box)
        const isColliding = 
            player.x < currentMonster.x + currentMonster.width &&
            player.x + player.width > currentMonster.x &&
            player.y < currentMonster.y + currentMonster.height &&
            player.y + player.height > currentMonster.y;

        if (isColliding && currentMonster.attackCooldown === 0) {
            const effectiveDamage = Math.max(0, currentMonster.getAttackDamage() - player.damageReduction);
            player.health -= effectiveDamage;
            currentMonster.attackCooldown = 60;
        }

        processMeleeHit();
        processConeHit();

        // Verificar morte do monstro
        if (currentMonster.health <= 0) {
            monstersDefeated++;
            defeatedTotal++;
            if (monstersDefeated >= 2) {
                phase++;
                monstersDefeated = 0;
                prevPhaseMonsterTypes = new Set(phaseMonsterTypes);
                phaseMonsterTypes.clear();
            }
            spawnNewMonster();
        }

        // Verificar morte do jogador
        if (player.health <= 0) {
            gameOver = true;
        }

        // Desenhar
        player.draw();
        currentMonster.draw();
        drawProjectiles();
        drawMonsterHitscans();
        drawCritEffects();
        updateHealthBars();
        updateUI();
    }

    // Game Over
    if (gameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, gameWidth, gameHeight);
        ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('DERROTA!', gameWidth / 2, gameHeight / 2);
        ctx.font = '20px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Recarregue a página para tentar novamente', gameWidth / 2, gameHeight / 2 + 50);
    }

    

    requestAnimationFrame(gameLoop);
}

// Iniciar com seleção de arma
currentMonster = new Monster(phase, chooseMonsterType());
isSelectingWeapon = true;
gameLoop();