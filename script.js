const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const gameWidth = Math.min(800, window.innerWidth - 20);
const gameHeight = 600;
canvas.width = gameWidth;
canvas.height = gameHeight;

// ===== CLASSES DO JOGO =====
class Projectile {
    constructor(x, y, targetX, targetY, damage, color, speed, owner = 'player', size = 8) {
        this.x = x;
        this.y = y;
        this.size = size;
        const dx = targetX - x;
        const dy = targetY - y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        this.vx = (dx / dist) * speed;
        this.vy = (dy / dist) * speed;
        this.damage = damage;
        this.color = color;
        this.owner = owner;
        this.maxDistance = 800;
        this.traveled = 0;
        this.critPercent = 0;
        this.homing = false;
        this.homingTarget = null;
        this.homingStrength = 0.06;
    }

    update() {
        if (this.homing && this.homingTarget) {
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
        }

        this.x += this.vx;
        this.y += this.vy;
        this.traveled += Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }

    isAlive() {
        return this.traveled < this.maxDistance && this.x > 0 && this.x < gameWidth && this.y > 0 && this.y < gameHeight;
    }
}

class Player {
    constructor() {
        this.x = gameWidth / 2;
        this.y = gameHeight - 150;
        this.width = 15;
        this.height = 20;
        this.speed = 3.75;
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
    }

    draw() {
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.strokeStyle = '#00aa00';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);

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
        this.width = 80 + phase * 20;
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
        this.direction = Math.random() > 0.5 ? 1 : -1;

        if (this.type === 'shooter') {
            this.health = 35 + phase * 15;
            this.speed = 1 + phase * 0.15;
            this.maxHealth = this.health;
            this.desiredDistance = 250;
            this.projectileSpeed = 6 + phase * 0.5;
        } else if (this.type === 'tank') {
            this.health = 90 + phase * 40;
            this.speed = 0.8 + phase * 0.2;
            this.maxHealth = this.health;
            this.dashCooldown = 100;
            this.dashTimer = 0;
            this.dashSpeed = 5 + phase * 0.8;
        } else {
            this.health = 50 + phase * 30;
            this.speed = 1 + phase * 0.5;
            this.maxHealth = this.health;
        }
    }

    chooseType() {
        const roll = Math.random();
        if (roll < 0.35) return 'shooter';
        if (roll < 0.65) return 'tank';
        return 'basic';
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
                const attackChoice = Math.random();
                if (attackChoice < 0.25) {
                    this.sprayAttack(playerX, playerY);
                    this.projectileAttackCooldown = Math.max(60, 100 - this.phase * 10);
                } else if (attackChoice < 0.5) {
                    this.flareAttack(playerX, playerY);
                    this.projectileAttackCooldown = Math.max(65, 105 - this.phase * 10);
                } else {
                    this.rangedAttack(playerX, playerY);
                    this.projectileAttackCooldown = Math.max(50, 90 - this.phase * 10);
                }
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
                    this.rangedAttack(playerX, playerY);
                    this.projectileAttackCooldown = Math.max(70, 100 - this.phase * 8);
                } else if (this.projectileAttackCooldown > 0) {
                    this.projectileAttackCooldown--;
                }

                if (this.areaAttackCooldown <= 0 && dist < this.attackRange + 30) {
                    this.burstAttack();
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
        } else {
            if (dist > this.attackRange) {
                if (dx > 0) this.x += this.speed;
                else this.x -= this.speed;
                if (dy > 0) this.y += this.speed;
                else this.y -= this.speed;
            }

            if (this.projectileAttackCooldown <= 0 && dist > this.attackRange + 30) {
                this.rangedAttack(playerX, playerY);
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
            : this.type === 'tank' ? 6 : 5;

        for (let i = 0; i < shots; i++) {
            const angle = (Math.PI * 2 / shots) * i;
            const targetX = this.x + this.width / 2 + Math.cos(angle) * 120;
            const targetY = this.y + this.height / 2 + Math.sin(angle) * 120;

            projectiles.push(new Projectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                this.getAttackDamage(),
                '#00ccff',
                speed,
                'monster'
            ));
        }
    }

    burstAttack() {
        this.attackEffectTimer = 12;
        const particles = 6;
        const color = this.type === 'tank' ? '#ff5555' : this.type === 'shooter' ? '#88ddff' : '#ffdd55';
        const speed = this.type === 'tank' ? 5 : this.type === 'shooter' ? 1.5 : 4.5;

        for (let i = 0; i < particles; i++) {
            const angle = (Math.PI * 2 / particles) * i;
            const targetX = this.x + this.width / 2 + Math.cos(angle) * 120;
            const targetY = this.y + this.height / 2 + Math.sin(angle) * 120;

            projectiles.push(new Projectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                Math.max(2, this.getAttackDamage() - 2),
                color,
                speed,
                'monster'
            ));
        }
    }

    sprayAttack(playerX, playerY) {
        const shots = 6 + this.phase;
        const speed = (this.projectileSpeed || 6) * 0.25;

        for (let i = 0; i < shots; i++) {
            const angle = (Math.PI * 2 / shots) * i + (Math.random() - 0.5) * 0.2;
            const targetX = this.x + this.width / 2 + Math.cos(angle) * 120;
            const targetY = this.y + this.height / 2 + Math.sin(angle) * 120;

            projectiles.push(new Projectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                this.getAttackDamage(),
                '#66bbff',
                speed,
                'monster'
            ));
        }

        this.attackEffectTimer = 8;
    }

    flareAttack(playerX, playerY) {
        const speed = ((this.projectileSpeed || 6) + 1) * 0.25;
        const angles = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, 5 * Math.PI / 4, 3 * Math.PI / 2, 7 * Math.PI / 4];

        for (let angle of angles) {
            const targetX = this.x + this.width / 2 + Math.cos(angle) * 140;
            const targetY = this.y + this.height / 2 + Math.sin(angle) * 140;

            projectiles.push(new Projectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                Math.max(4, this.getAttackDamage() - 1),
                '#99ddff',
                speed,
                'monster'
            ));
        }

        this.attackEffectTimer = 12;
    }

    draw() {
        if (this.type === 'shooter') {
            ctx.fillStyle = '#0055cc';
            ctx.strokeStyle = '#33ccff';
        } else if (this.type === 'tank') {
            ctx.fillStyle = '#770000';
            ctx.strokeStyle = '#ff5555';
        } else {
            ctx.fillStyle = '#cc0000';
            ctx.strokeStyle = '#ff0000';
        }

        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.lineWidth = 3;
        ctx.strokeRect(this.x, this.y, this.width, this.height);

        if (this.type === 'tank') {
            ctx.fillStyle = '#000000';
            ctx.fillRect(this.x + 8, this.y + 12, this.width - 16, 10);
        }

        ctx.fillStyle = '#ffff00';
        ctx.fillRect(this.x + 15, this.y + 20, 12, 12);
        ctx.fillRect(this.x + this.width - 27, this.y + 20, 12, 12);

        if (this.type === 'shooter') {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + this.height - 18, 8, 0, Math.PI * 2);
            ctx.fill();
        }

        if (this.attackEffectTimer > 0) {
            ctx.strokeStyle = '#ffff66';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.attackRange + 15, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    getAttackDamage() {
        if (this.type === 'shooter') return 8 + this.phase * 2;
        if (this.type === 'tank') return 12 + this.phase * 4;
        return 5 + this.phase * 3;
    }
}

// ===== VARIÁVEIS GLOBAIS =====
let player = new Player();
let currentMonster = new Monster(1);
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
let projectiles = [];
let critEffects = [];

const weapons = [
    { name: 'Espada ⚔️', type: 'sword', color: '#ffaa00', cooldown: 0, range: 45, damage: 14 },
    { name: 'Arco 🏹', type: 'bow', color: '#00ff00', cooldown: 90, range: 75, damage: 12, speed: 15 },
    { name: 'Varinha 🔮', type: 'staff', color: '#ff00ff', cooldown: 35, range: 50, damage: 22, speed: 0.75 },
    { name: 'Revolver 🔫', type: 'gun', color: '#ffff00', cooldown: 12, range: 100, damage: 4, speed: 10 },
    { name: 'Lança Tornado 🌪️', type: 'cone', color: '#83bfd3', cooldown: 35, range: 80, damage: 1, coneAngle: Math.PI / 3 }
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
    { name: 'Ataque Giratório', effect: 'spinAttack', value: 1, desc: 'Ataque corpo a corpo causa dano em área.' },
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
        
        const buttonWidth = 160;
        const buttonHeight = 60;
        const spacing = 15;
        const totalWidth = weapons.length * buttonWidth + (weapons.length - 1) * spacing;
        const startX = (gameWidth - totalWidth) / 2;
        const startY = gameHeight / 2 - 40;
        
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
            // Gera um projétil da ponta do cone somente a cada dois ataques
            player.coneAttackCount = (player.coneAttackCount || 0) + 1;
            if (player.coneAttackCount % 2 === 0) {
                const tipX = player.x + player.width / 2 + Math.cos(baseAngle) * weapon.range;
                const tipY = player.y + player.height / 2 + Math.sin(baseAngle) * weapon.range;
                const projTargetX = tipX + Math.cos(baseAngle) * (weapon.range + 120);
                const projTargetY = tipY + Math.sin(baseAngle) * (weapon.range + 120);
                spawnPlayerProjectile(tipX, tipY, projTargetX, projTargetY, attackDamage, weapon.color, ((weapon.speed || 6) + player.projectileSpeedBonus) * 0.5, { size: 32, critPercent });
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
    for (let i = projectiles.length - 1; i >= 0; i--) {
        projectiles[i].update();
        
        if (!projectiles[i].isAlive()) {
            projectiles.splice(i, 1);
            continue;
        }
        
        const p = projectiles[i];

        if (p.owner === 'player') {
            const isHit = 
                p.x < currentMonster.x + currentMonster.width &&
                p.x > currentMonster.x &&
                p.y < currentMonster.y + currentMonster.height &&
                p.y > currentMonster.y;
            
            if (isHit) {
                currentMonster.health -= p.damage;
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

        currentMonster.health -= attackDamage;
        player.meleeHitRegistered = true;

        if (player.attackMove > 0 && dist > 0) {
            player.x = Math.max(0, Math.min(player.x + ((mx - px) / dist) * player.attackMove, gameWidth - player.width));
            player.y = Math.max(0, Math.min(player.y + ((my - py) / dist) * player.attackMove, gameHeight - player.height));
        }

        if (player.spinAttack) {
            const spinRadius = 18;
            if (dist <= spinRadius + targetRadius) {
                currentMonster.health -= Math.round(attackDamage * 0.5);
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

        currentMonster.health -= attackDamage;
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
        spawnPlayerProjectile(centerX, centerY, targetX, targetY, damage, '#ffcc00', speed, { size, homing: true, homingStrength: 0.05 });
    });
}

function drawProjectiles() {
    for (let proj of projectiles) {
        proj.draw();
    }
}

function spawnPlayerProjectile(x, y, targetX, targetY, damage, color, speed, opts = {}) {
    const size = opts.size || 8;
    const proj = new Projectile(x, y, targetX, targetY, damage, color, speed, 'player', size);
    proj.critPercent = opts.critPercent || 0;
    if (opts.homing) {
        proj.homing = true;
        proj.homingTarget = currentMonster;
        proj.homingStrength = typeof opts.homingStrength === 'number' ? opts.homingStrength : 0.06;
    }
    projectiles.push(proj);
    return proj;
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
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(effect.text, effect.x, effect.y);
        ctx.globalAlpha = 1;
    }
}

function drawWeaponSelection() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, gameWidth, gameHeight);
    
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Escolha sua Arma', gameWidth / 2, 80);
    
    const buttonWidth = 160;
    const buttonHeight = 60;
    const spacing = 15;
    const totalWidth = weapons.length * (buttonWidth + spacing);
    const startX = (gameWidth - totalWidth) / 2;
    const startY = gameHeight / 2 - 40;
    
    for (let i = 0; i < weapons.length; i++) {
        const bx = startX + i * (buttonWidth + spacing);
        const by = startY;
        const isSelected = i === selectedWeaponIndex;
        
        ctx.fillStyle = isSelected ? '#00ff00' : '#003300';
        ctx.fillRect(bx, by, buttonWidth, buttonHeight);
        
        ctx.strokeStyle = isSelected ? '#00ff00' : '#00aa00';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeRect(bx, by, buttonWidth, buttonHeight);
        
        ctx.fillStyle = '#000000';
        ctx.font = isSelected ? 'bold 13px Arial' : '13px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(weapons[i].name, bx + buttonWidth / 2, by + buttonHeight / 2 + 5);
    }
    
    ctx.fillStyle = '#00d4ff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Use as Setas ou Clique para Selecionar', gameWidth / 2, gameHeight - 60);
    ctx.fillText('Pressione Espaço ou Enter para Confirmar', gameWidth / 2, gameHeight - 30);
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
    monstersDefeated++;
    defeatedTotal++;
    if (monstersDefeated >= 3) {
        phase++;
        monstersDefeated = 0;
    }
    projectiles = [];
    currentMonster = new Monster(phase);
    spawnSpinAttackStartProjectiles();
    upgradeChoices = getRandomUpgrades(4);
    selectedUpgradeIndex = 0;
    isUpgrading = true;
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
    // Limpar canvas
    ctx.fillStyle = '#0f1419';
    ctx.fillRect(0, 0, gameWidth, gameHeight);

    if (isSelectingWeapon) {
        drawWeaponSelection();
    } else if (isUpgrading) {
        player.draw();
        currentMonster.draw();
        drawProjectiles();
        drawCritEffects();
        updateHealthBars();
        updateUI();
        drawUpgradeMenu();
    } else if (!gameOver) {
        // Atualizar
        player.update(keys);
        currentMonster.update(player.x + player.width / 2, player.y + player.height / 2);
        updateProjectiles();
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
isSelectingWeapon = true;
gameLoop();