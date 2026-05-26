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
        this.splitOnPlayerAttack = opts.splitOnPlayerAttack || false;
        this.splitDistance = opts.splitDistance || 90;
        this.splitTriggered = false;
        this.delayTimer = opts.delayTimer || 0;
        this.delayDuration = opts.delayDuration || 0;
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
        } else {
            this.health = 75 + phase * 45;
            this.speed = 1.45 + phase * 0.725;
            this.maxHealth = this.health;
        }
    }

    chooseType() {
        const roll = Math.random();
        if (roll < 0.25) return 'shooter';
        if (roll < 0.45) return 'tank';
        if (roll < 0.65) return 'swarm';
        if (roll < 0.8) return 'caster';
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
                    projectiles.push(new Projectile(
                        spawnX, spawnY,
                        targetX, targetY,
                        this.getAttackDamage() * 0.6,
                        '#ff00ff',
                        3.5 + this.phase * 0.2,
                        'monster',
                        6,
                        homingOpt
                    ));
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
                        projectiles.push(new Projectile(
                            this.portalX, this.portalY,
                            targetX, targetY,
                            this.getAttackDamage() * 0.7,
                            '#00ffff',
                            4.5 + this.phase * 0.2,
                            'monster',
                            7
                        ));
                    }
                }
            }
        } else {
            // Basic: padrão original
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
        const speed = this.type === 'tank' ? 6.65 : this.type === 'shooter' ? 1.5 : 4.5;

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
            const targetX = this.x + this.width / 2 + Math.cos(angle) * 180;
            const targetY = this.y + this.height / 2 + Math.sin(angle) * 180;

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

    spiralWaveAttack(playerX, playerY) {
        const shots = 10 + this.phase * 2;
        const speed = 4.5 * 0.67;
        const baseAngle = Math.atan2(playerY - (this.y + this.height / 2), playerX - (this.x + this.width / 2));

        for (let i = 0; i < shots; i++) {
            const angle = baseAngle + i * 0.45;
            const targetX = this.x + this.width / 2 + Math.cos(angle) * 360;
            const targetY = this.y + this.height / 2 + Math.sin(angle) * 360;

            projectiles.push(new Projectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                this.getAttackDamage(),
                '#44aaff',
                speed,
                'monster'
            ));
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

            projectiles.push(new Projectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                this.getAttackDamage(),
                '#88eeff',
                speed,
                'monster'
            ));
        }

        this.attackEffectTimer = 10;
    }

    splitAwareAttack(playerX, playerY) {
        const speed = 5;
        const angle = Math.atan2(playerY - (this.y + this.height / 2), playerX - (this.x + this.width / 2));
        const targetX = this.x + this.width / 2 + Math.cos(angle) * 400;
        const targetY = this.y + this.height / 2 + Math.sin(angle) * 400;

        projectiles.push(new Projectile(
            this.x + this.width / 2,
            this.y + this.height / 2,
            targetX,
            targetY,
            this.getAttackDamage(),
            '#ff6633',
            speed,
            'monster',
            10,
            { splitOnPlayerAttack: true, splitDistance: 160, maxDistance: 1400 }
        ));
    }

    armorBarrage(playerX, playerY) {
        const shots = 4 + Math.min(3, this.phase);
        const speed = 7;
        const baseAngle = Math.atan2(playerY - (this.y + this.height / 2), playerX - (this.x + this.width / 2));

        for (let i = 0; i < shots; i++) {
            const angle = baseAngle + (i - (shots - 1) / 2) * 0.22;
            const targetX = this.x + this.width / 2 + Math.cos(angle) * 240;
            const targetY = this.y + this.height / 2 + Math.sin(angle) * 240;

            projectiles.push(new Projectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                this.getAttackDamage() + 2,
                '#cc4444',
                speed,
                'monster',
                12
            ));
        }

        this.attackEffectTimer = 14;
    }

    chargeMissiles(playerX, playerY) {
        const missiles = 2;
        const speed = 7.5;
        const baseAngle = Math.atan2(playerY - (this.y + this.height / 2), playerX - (this.x + this.width / 2));

        for (let i = 0; i < missiles; i++) {
            const angle = baseAngle + (i - (missiles - 1) / 2) * 0.18;
            const targetX = this.x + this.width / 2 + Math.cos(angle) * 260;
            const targetY = this.y + this.height / 2 + Math.sin(angle) * 260;
            const proj = new Projectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                Math.max(6, this.getAttackDamage() + 1),
                '#dd3333',
                speed,
                'monster',
                12,
                { homing: true, homingTarget: player, homingStrength: 0.06 }
            );
            projectiles.push(proj);
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

            projectiles.push(new Projectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                Math.max(4, this.getAttackDamage() - 1),
                color,
                speed,
                'monster'
            ));
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

            const proj = new Projectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                targetX,
                targetY,
                damage,
                '#ff3333',
                speed,
                'monster',
                10,
                { homing: true, homingTarget: player, critPercent: 100 }
            );
            projectiles.push(proj);
        }
    }

    flareAttack(playerX, playerY) {
        let speed = ((this.projectileSpeed || 6) + 1) * 0.25;
        speed *= 0.67;
        const angles = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, 5 * Math.PI / 4, 3 * Math.PI / 2, 7 * Math.PI / 4];

        for (let angle of angles) {
            const targetX = this.x + this.width / 2 + Math.cos(angle) * 210;
            const targetY = this.y + this.height / 2 + Math.sin(angle) * 210;

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
        } else if (this.type === 'swarm') {
            ctx.fillStyle = '#ff00ff';
            ctx.strokeStyle = '#ff66ff';
        } else if (this.type === 'caster') {
            ctx.fillStyle = '#0099cc';
            ctx.strokeStyle = '#00ffff';
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

        if (this.type === 'swarm') {
            // Desenha padrão giratório ao redor
            ctx.strokeStyle = '#ff66ff';
            ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                const angle = this.orbitalAngle + (i * Math.PI * 2 / 3);
                const px = this.x + this.width / 2 + Math.cos(angle) * 40;
                const py = this.y + this.height / 2 + Math.sin(angle) * 40;
                ctx.beginPath();
                ctx.arc(px, py, 4, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        if (this.type === 'caster') {
            // Desenha portal ativo se existir
            if (this.portalTimer > 0) {
                ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
                ctx.beginPath();
                ctx.arc(this.portalX, this.portalY, 40, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
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
let swarmMarks = [];

const weapons = [
    { name: 'Espada ⚔️', type: 'sword', color: '#ffaa00', cooldown: 0, range: 45, damage: 14 },
    { name: 'Arco 🏹', type: 'bow', color: '#00ff00', cooldown: 90, range: 37.5, damage: 12, speed: 15 },
    { name: 'Varinha 🔮', type: 'staff', color: '#ff00ff', cooldown: 35, range: 25, damage: 22, speed: 0.75 },
    { name: 'Revolver 🔫', type: 'gun', color: '#ffff00', cooldown: 12, range: 50, damage: 2, speed: 10 },
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
    // Verificar colisões entre projéteis do jogador e do monstro
    const projectilesToRemove = new Set();
    
    for (let i = 0; i < projectiles.length; i++) {
        if (projectilesToRemove.has(i) || projectiles[i].owner !== 'player') continue;
        
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
                // Projectile atingiu a marca - gerar 3 projéteis retos aleatórios
                for (let k = 0; k < 3; k++) {
                    const angle = Math.random() * Math.PI * 2;
                    const targetX = mark.x + Math.cos(angle) * 200;
                    const targetY = mark.y + Math.sin(angle) * 200;
                    const baseSize = 6;
                    const sizeFromMark = Math.max(1, Math.round(baseSize * 2.75)); // +175%
                    projectiles.push(new Projectile(
                        mark.x, mark.y,
                        targetX, targetY,
                        8,
                        '#ffff00',
                        5 + Math.random() * 3,
                        'player',
                        sizeFromMark
                    ));
                }
                
                // Remover a marca
                swarmMarks.splice(j, 1);
                break;
            }
        }
    }
    
    for (let i = projectiles.length - 1; i >= 0; i--) {
        projectiles[i].update();
        
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
        spawnPlayerProjectile(centerX, centerY, targetX, targetY, damage, '#ffcc00', speed, { size, homing: true, homingStrength: 0.05 });
    });
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
        if (mark.active) {
            ctx.fillStyle = 'rgba(255, 0, 255, 0.6)';
            ctx.beginPath();
            ctx.arc(mark.x, mark.y, mark.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ff00ff';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            // Marca inativa - desenhar com estilo diferente
            ctx.fillStyle = 'rgba(255, 0, 255, 0.2)';
            ctx.beginPath();
            ctx.arc(mark.x, mark.y, mark.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 0, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        
        // Remover marcas expiradas
        if (mark.lifetime <= 0) {
            swarmMarks.splice(i, 1);
        }
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

function spawnTankCounterAttack() {
    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    const distance = 80;
    const speed = 6;
    const delayFrames = 36; // 0.6 segundos a 60 fps
    
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
        
        const proj = new Projectile(spawnX, spawnY, targetX, targetY, 8, '#ffff00', speed, 'player', 10, {
            delayTimer: delayFrames,
            delayDuration: delayFrames
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
        updateProjectiles();
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