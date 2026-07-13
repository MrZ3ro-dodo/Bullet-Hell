// Backup preservado do código da bomba/granada do jogo
// Este arquivo foi criado para evitar perda do trecho da bomba caso o script principal seja alterado.

let thrownExplosives = [];
let fireZones = [];
let grenadeFragments = [];

function applyAreaDamageAt(x, y, radius, damage) {
    if (!player) return 0;

    let applied = 0;
    if (playerInsideConstruction) {
        for (const enemy of castleInteriorEnemies) {
            if (!enemy || enemy.isDying || enemy.health <= 0) continue;
            const ex = enemy.x + enemy.width / 2;
            const ey = enemy.y + enemy.height / 2;
            if (Math.hypot(ex - x, ey - y) <= radius + Math.max(enemy.width, enemy.height) * 0.35) {
                applyDamageToInteriorEnemy(enemy, damage);
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
            applied += 1;
        }
    }
    return applied;
}

function spawnFireZone(x, y) {
    const zone = {
        x,
        y,
        damage: 40,
        tickDamage: 5,
        maxRadius: 72,
        radius: 72,
        duration: 3 * 60,
        life: 3 * 60,
        tickTimer: 60,
        color: '#ff8c1a'
    };
    fireZones.push(zone);
    applyAreaDamageAt(x, y, zone.radius, zone.damage);
    spawnEvaporationEffect(x, y, '#ff9e3c', 24, 18);
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
    const count = 10;
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
        grenadeFragments.push({
            x,
            y,
            vx: Math.cos(angle) * 20,
            vy: Math.sin(angle) * 20,
            size: 3.8,
            life: 28,
            damage: 3,
            color: '#ffb347'
        });
    }
}

function launchThrowingExplosive(attackType = 'bomb') {
    const startX = player.x + player.width / 2;
    const startY = player.y + player.height / 2;
    const targetX = mouseX + cameraX;
    const targetY = mouseY + cameraY;
    const travelTime = attackType === 'bomb' ? 38 : 32;
    const arcHeight = attackType === 'bomb' ? 180 : 150;

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
                spawnFireZone(projectile.targetX, projectile.targetY);
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
            zone.tickTimer = 60;
        }
        if (zone.life <= 0) {
            fireZones.splice(i, 1);
        }
    }
}

function updateGrenadeFragments() {
    for (let i = grenadeFragments.length - 1; i >= 0; i--) {
        const fragment = grenadeFragments[i];
        fragment.x += fragment.vx;
        fragment.y += fragment.vy;
        fragment.life -= 1;

        if (playerInsideConstruction) {
            for (const enemy of castleInteriorEnemies) {
                if (!enemy || enemy.isDying || enemy.health <= 0) continue;
                if (fragment.x > enemy.x && fragment.x < enemy.x + enemy.width && fragment.y > enemy.y && fragment.y < enemy.y + enemy.height) {
                    applyDamageToInteriorEnemy(enemy, fragment.damage);
                    grenadeFragments.splice(i, 1);
                    break;
                }
            }
        } else if (currentMonster && currentMonster.health > 0 && !currentMonster.isDying) {
            if (fragment.x > currentMonster.x && fragment.x < currentMonster.x + currentMonster.width && fragment.y > currentMonster.y && fragment.y < currentMonster.y + currentMonster.height) {
                currentMonster.takeDamage(fragment.damage);
                grenadeFragments.splice(i, 1);
            }
        }

        if (fragment.life <= 0) {
            grenadeFragments.splice(i, 1);
        }
    }
}

function drawThrownExplosives() {
    for (const projectile of thrownExplosives) {
        ctx.save();
        ctx.translate(projectile.x, projectile.y);
        ctx.fillStyle = projectile.type === 'bomb' ? '#ff8c1a' : '#8b1e00';
        ctx.shadowColor = projectile.type === 'bomb' ? '#ffb347' : '#ff7a00';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(0, 0, projectile.type === 'bomb' ? 8 : 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawFireZones() {
    for (const zone of fireZones) {
        const alpha = Math.max(0.15, zone.life / zone.duration);
        ctx.save();
        ctx.globalAlpha = alpha * 0.65;
        ctx.fillStyle = '#ff8c1a';
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 220, 120, 0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }
}

function drawGrenadeFragments() {
    for (const fragment of grenadeFragments) {
        ctx.save();
        ctx.fillStyle = fragment.color;
        ctx.beginPath();
        ctx.arc(fragment.x, fragment.y, fragment.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// Trecho do attemptAttack para a arma tipo grenade
function attemptAttack(source = 'mouse') {
    if (!player.weapon) return;

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
}
