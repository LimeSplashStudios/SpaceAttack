"use strict";

const canvas = document.getElementById("game-canvas");
const context = canvas.getContext("2d");

if (!context) {
  throw new Error("This browser does not support the Canvas 2D API.");
}

const keys = new Set();
const player = {
  x: canvas.width / 2,
  y: canvas.height - 52,
  width: 44,
  height: 32,
  speed: 360,
  fireCooldown: 0,
};
const projectiles = [];
const enemyProjectiles = [];
const enemies = [];
const hitEffects = [];
const initialLives = 3;
const invulnerabilityDuration = 1.2;
const enemyFormation = {
  direction: 1,
  speed: 48,
  dropDistance: 22,
};

let score = 0;
let lives = initialLives;
let wave = 1;
let waveBannerTime = 0;
let invulnerabilityTime = 0;
let hitFlashTime = 0;
let backgroundTime = 0;
let enemyFireCooldown = 1.5;
let gameState = "start";
let previousTime = 0;

function createEnemies() {
  const rows = 4;
  const columns = 8;
  const spacingX = 72;
  const spacingY = 48;
  const startX = (canvas.width - (columns - 1) * spacingX) / 2;
  const startY = 112;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      enemies.push({
        x: startX + column * spacingX,
        y: startY + row * spacingY,
        width: 34,
        height: 26,
        row,
      });
    }
  }
}

function startWave() {
  enemies.length = 0;
  projectiles.length = 0;
  enemyProjectiles.length = 0;
  enemyFormation.direction = 1;
  enemyFormation.speed = Math.min(48 + (wave - 1) * 8, 120);
  enemyFireCooldown = 1.5;
  createEnemies();
  waveBannerTime = 1.8;
}

function setKey(event, isPressed) {
  const key = event.key.toLowerCase();
  if (["arrowleft", "arrowright", " "].includes(key)) {
    event.preventDefault();
  }

  if (isPressed) {
    if (gameState === "playing") keys.add(key);
  } else {
    keys.delete(key);
  }
}

function resetGame() {
  score = 0;
  lives = initialLives;
  wave = 1;
  player.x = canvas.width / 2;
  player.y = canvas.height - 52;
  player.fireCooldown = 0;
  invulnerabilityTime = 0;
  hitFlashTime = 0;
  hitEffects.length = 0;
  projectiles.length = 0;
  enemyProjectiles.length = 0;
  keys.clear();
  startWave();
  previousTime = 0;
  gameState = "playing";
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    if (gameState === "start" || gameState === "gameOver") resetGame();
    return;
  }
  setKey(event, true);
});
window.addEventListener("keyup", (event) => setKey(event, false));
window.addEventListener("blur", () => keys.clear());

function fireProjectile() {
  projectiles.push({
    x: player.x,
    y: player.y - player.height / 2,
    width: 5,
    height: 16,
    speed: 520,
  });
  player.fireCooldown = 0.28;
}

function updatePlayer(deltaTime) {
  const movingLeft = keys.has("arrowleft") || keys.has("a");
  const movingRight = keys.has("arrowright") || keys.has("d");

  if (movingLeft) player.x -= player.speed * deltaTime;
  if (movingRight) player.x += player.speed * deltaTime;
  player.x = Math.max(player.width / 2, Math.min(canvas.width - player.width / 2, player.x));

  player.fireCooldown = Math.max(0, player.fireCooldown - deltaTime);
  if (keys.has(" ") && player.fireCooldown === 0) {
    fireProjectile();
  }
}

function updateEnemies(deltaTime) {
  if (enemies.length === 0) return;

  let leftEdge = Infinity;
  let rightEdge = -Infinity;
  for (const enemy of enemies) {
    leftEdge = Math.min(leftEdge, enemy.x - enemy.width / 2);
    rightEdge = Math.max(rightEdge, enemy.x + enemy.width / 2);
  }

  const nextLeft = leftEdge + enemyFormation.direction * enemyFormation.speed * deltaTime;
  const nextRight = rightEdge + enemyFormation.direction * enemyFormation.speed * deltaTime;
  if (nextLeft <= 12 || nextRight >= canvas.width - 12) {
    enemyFormation.direction *= -1;
    for (const enemy of enemies) {
      enemy.y += enemyFormation.dropDistance;
    }
  }

  for (const enemy of enemies) {
    enemy.x += enemyFormation.direction * enemyFormation.speed * deltaTime;
  }

  const lowestEnemy = enemies.reduce(
    (lowest, enemy) => Math.max(lowest, enemy.y + enemy.height / 2),
    0,
  );
  if (lowestEnemy >= player.y - player.height / 2) {
    // Reaching the player's area ends the run immediately.
    lives = 0;
    gameState = "gameOver";
  }
}

function updateProjectiles(deltaTime) {
  for (let index = projectiles.length - 1; index >= 0; index -= 1) {
    const projectile = projectiles[index];
    projectile.y -= projectile.speed * deltaTime;
    if (projectile.y + projectile.height / 2 < 0) {
      projectiles.splice(index, 1);
    }
  }
}

function updateEnemyFire(deltaTime) {
  enemyFireCooldown -= deltaTime;
  if (enemyFireCooldown > 0 || enemies.length === 0) return;

  const shooter = enemies[Math.floor(Math.random() * enemies.length)];
  enemyProjectiles.push({
    x: shooter.x,
    y: shooter.y + shooter.height / 2,
    width: 7,
    height: 16,
    speed: 250,
  });
  // Randomized intervals keep enemy shots spread out instead of synchronized.
  const firingIntervalScale = Math.max(0.55, 1 - (wave - 1) * 0.08);
  enemyFireCooldown = (0.9 + Math.random() * 1.1) * firingIntervalScale;
}

function updateEnemyProjectiles(deltaTime) {
  for (let index = enemyProjectiles.length - 1; index >= 0; index -= 1) {
    const projectile = enemyProjectiles[index];
    projectile.y += projectile.speed * deltaTime;

    if (projectile.y - projectile.height / 2 > canvas.height) {
      enemyProjectiles.splice(index, 1);
    }
  }
}

function overlaps(projectile, enemy) {
  return (
    projectile.x - projectile.width / 2 < enemy.x + enemy.width / 2 &&
    projectile.x + projectile.width / 2 > enemy.x - enemy.width / 2 &&
    projectile.y - projectile.height / 2 < enemy.y + enemy.height / 2 &&
    projectile.y + projectile.height / 2 > enemy.y - enemy.height / 2
  );
}

function checkPlayerHit() {
  for (let index = enemyProjectiles.length - 1; index >= 0; index -= 1) {
    if (!overlaps(enemyProjectiles[index], player)) continue;

    enemyProjectiles.splice(index, 1);
    if (invulnerabilityTime > 0) continue;

    lives -= 1;
    invulnerabilityTime = invulnerabilityDuration;
    hitFlashTime = 0.25;
    if (lives <= 0) gameState = "gameOver";
    return;
  }
}

function checkCollisions() {
  for (let projectileIndex = projectiles.length - 1; projectileIndex >= 0; projectileIndex -= 1) {
    const projectile = projectiles[projectileIndex];
    const enemyIndex = enemies.findIndex((enemy) => overlaps(projectile, enemy));

    if (enemyIndex !== -1) {
      hitEffects.push({
        x: enemies[enemyIndex].x,
        y: enemies[enemyIndex].y,
        life: 0.24,
      });
      enemies.splice(enemyIndex, 1);
      projectiles.splice(projectileIndex, 1);
      score += 10;
    }
  }
}

function advanceWave() {
  if (enemies.length !== 0) return;

  wave += 1;
  startWave();
}

function update(deltaTime) {
  if (gameState !== "playing") return;

  waveBannerTime = Math.max(0, waveBannerTime - deltaTime);
  invulnerabilityTime = Math.max(0, invulnerabilityTime - deltaTime);
  hitFlashTime = Math.max(0, hitFlashTime - deltaTime);
  for (let index = hitEffects.length - 1; index >= 0; index -= 1) {
    hitEffects[index].life -= deltaTime;
    if (hitEffects[index].life <= 0) hitEffects.splice(index, 1);
  }
  updatePlayer(deltaTime);
  updateEnemies(deltaTime);
  updateProjectiles(deltaTime);
  updateEnemyFire(deltaTime);
  updateEnemyProjectiles(deltaTime);
  checkCollisions();
  checkPlayerHit();
  if (gameState === "playing") advanceWave();
}

function drawBackground() {
  context.fillStyle = "#0b1023";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#91a7d8";
  for (let i = 0; i < 36; i += 1) {
    const x = (i * 137) % canvas.width;
    const baseY = (i * 223) % canvas.height;
    const speed = 10 + (i % 4) * 5;
    const y = (baseY + backgroundTime * speed) % canvas.height;
    const size = i % 7 === 0 ? 3 : 2;
    context.globalAlpha = i % 3 === 0 ? 0.55 : 0.85;
    context.fillRect(x, y, size, size);
  }
  context.globalAlpha = 1;
}

function drawPlayer() {
  if (invulnerabilityTime > 0 && Math.floor(invulnerabilityTime * 12) % 2 === 0) return;

  context.save();
  context.shadowColor = hitFlashTime > 0 ? "#ffffff" : "#65e6ff";
  context.shadowBlur = hitFlashTime > 0 ? 24 : 12;

  // Small engine flame behind the ship.
  context.fillStyle = hitFlashTime > 0 ? "#ffffff" : "#f6c85f";
  context.beginPath();
  context.moveTo(player.x - 7, player.y + 8);
  context.lineTo(player.x, player.y + 24 + Math.sin(backgroundTime * 24) * 3);
  context.lineTo(player.x + 7, player.y + 8);
  context.closePath();
  context.fill();

  context.fillStyle = hitFlashTime > 0 ? "#ffffff" : "#65e6ff";
  context.beginPath();
  context.moveTo(player.x, player.y - player.height / 2);
  context.lineTo(player.x - player.width / 2, player.y + player.height / 2);
  context.lineTo(player.x, player.y + player.height / 4);
  context.lineTo(player.x + player.width / 2, player.y + player.height / 2);
  context.closePath();
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = "#d5faff";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = "#d5faff";
  context.beginPath();
  context.ellipse(player.x, player.y - 2, 5, 9, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawEnemies() {
  for (const enemy of enemies) {
    const color = enemy.row < 2 ? "#ff718b" : "#f6c85f";
    context.save();
    context.shadowColor = color;
    context.shadowBlur = 7;
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(enemy.x - enemy.width / 2, enemy.y - 4);
    context.lineTo(enemy.x - enemy.width / 2 + 7, enemy.y - enemy.height / 2);
    context.lineTo(enemy.x + enemy.width / 2 - 7, enemy.y - enemy.height / 2);
    context.lineTo(enemy.x + enemy.width / 2, enemy.y - 4);
    context.lineTo(enemy.x + enemy.width / 2 - 4, enemy.y + enemy.height / 2);
    context.lineTo(enemy.x + 7, enemy.y + 6);
    context.lineTo(enemy.x, enemy.y + enemy.height / 2);
    context.lineTo(enemy.x - 7, enemy.y + 6);
    context.lineTo(enemy.x - enemy.width / 2 + 4, enemy.y + enemy.height / 2);
    context.closePath();
    context.fill();
    context.restore();

    context.fillStyle = "#0b1023";
    context.fillRect(enemy.x - 9, enemy.y - 3, 4, 5);
    context.fillRect(enemy.x + 5, enemy.y - 3, 4, 5);
  }
}

function drawProjectiles() {
  for (const projectile of projectiles) {
    context.save();
    context.shadowColor = "#65e6ff";
    context.shadowBlur = 12;
    context.fillStyle = "#e8fdff";
    context.fillRect(
      projectile.x - projectile.width / 2,
      projectile.y - projectile.height / 2,
      projectile.width,
      projectile.height,
    );
    context.restore();
  }

  for (const projectile of enemyProjectiles) {
    context.save();
    context.shadowColor = "#ff718b";
    context.shadowBlur = 10;
    context.fillStyle = "#ff9caf";
    context.beginPath();
    context.moveTo(projectile.x, projectile.y + projectile.height / 2);
    context.lineTo(projectile.x + projectile.width / 2, projectile.y);
    context.lineTo(projectile.x, projectile.y - projectile.height / 2);
    context.lineTo(projectile.x - projectile.width / 2, projectile.y);
    context.closePath();
    context.fill();
    context.restore();
  }
}

function drawHitEffects() {
  for (const effect of hitEffects) {
    const progress = 1 - effect.life / 0.24;
    const radius = 5 + progress * 16;
    context.globalAlpha = 1 - progress;
    context.strokeStyle = "#fff1b8";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
    context.stroke();
  }
  context.globalAlpha = 1;
}

function drawPanel(x, y, width, height) {
  context.fillStyle = "rgb(8 13 31 / 82%)";
  context.fillRect(x, y, width, height);
  context.strokeStyle = "#263e66";
  context.lineWidth = 2;
  context.strokeRect(x, y, width, height);
}

function drawHud() {
  context.fillStyle = "rgb(8 13 31 / 78%)";
  context.fillRect(0, 0, canvas.width, 68);
  context.strokeStyle = "#263455";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, 68);
  context.lineTo(canvas.width, 68);
  context.stroke();

  context.font = "bold 13px Arial, sans-serif";
  context.fillStyle = "#91a7d8";
  context.textAlign = "left";
  context.fillText("SCORE", 20, 22);
  context.textAlign = "center";
  context.fillText("WAVE", canvas.width / 2, 22);
  context.textAlign = "right";
  context.fillText("LIVES", canvas.width - 20, 22);

  context.font = "bold 21px Arial, sans-serif";
  context.fillStyle = "#f3f6ff";
  context.textAlign = "left";
  context.fillText(String(score).padStart(4, "0"), 20, 49);
  context.textAlign = "center";
  context.fillStyle = "#65e6ff";
  context.fillText(String(wave).padStart(2, "0"), canvas.width / 2, 49);
  context.textAlign = "right";
  context.fillStyle = "#f3f6ff";
  context.fillText("● ".repeat(lives).trim(), canvas.width - 20, 49);
}

function drawStartScreen() {
  drawPanel(145, 130, 510, 350);
  context.textAlign = "center";
  context.shadowColor = "#65e6ff";
  context.shadowBlur = 18;
  context.fillStyle = "#65e6ff";
  context.font = "bold 48px Arial, sans-serif";
  context.fillText("SPACE ATTACK", canvas.width / 2, 218);
  context.shadowBlur = 0;
  context.fillStyle = "#91a7d8";
  context.font = "13px Arial, sans-serif";
  context.fillText("DEFEND THE SECTOR", canvas.width / 2, 248);
  context.fillStyle = "#f3f6ff";
  context.font = "18px Arial, sans-serif";
  context.fillText("Move   ←  →   or   A / D", canvas.width / 2, 305);
  context.fillText("Shoot   Space", canvas.width / 2, 341);
  context.fillStyle = "#f6c85f";
  context.font = "bold 17px Arial, sans-serif";
  context.fillText("PRESS ENTER TO START", canvas.width / 2, 420);
}

function drawGameOverScreen() {
  context.fillStyle = "rgb(5 8 18 / 76%)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawPanel(190, 195, 420, 220);
  context.textAlign = "center";
  context.fillStyle = "#ff718b";
  context.font = "bold 42px Arial, sans-serif";
  context.fillText("GAME OVER", canvas.width / 2, 260);
  context.fillStyle = "#91a7d8";
  context.font = "13px Arial, sans-serif";
  context.fillText("FINAL SCORE", canvas.width / 2, 300);
  context.fillStyle = "#f3f6ff";
  context.font = "bold 25px Arial, sans-serif";
  context.fillText(String(score).padStart(4, "0"), canvas.width / 2, 335);
  context.fillStyle = "#f6c85f";
  context.font = "bold 16px Arial, sans-serif";
  context.fillText("PRESS ENTER TO RESTART", canvas.width / 2, 382);
}

function drawWaveBanner() {
  if (waveBannerTime <= 0) return;

  const fadeIn = Math.min(1, (1.8 - waveBannerTime) * 5);
  context.globalAlpha = fadeIn;
  drawPanel(260, canvas.height / 2 - 34, 280, 68);
  context.textAlign = "center";
  context.fillStyle = "#f6c85f";
  context.font = "bold 28px Arial, sans-serif";
  context.fillText(`WAVE ${wave}`, canvas.width / 2, canvas.height / 2 + 10);
  context.globalAlpha = 1;
}

function render() {
  drawBackground();

  if (gameState === "start") {
    drawStartScreen();
    return;
  }

  drawEnemies();
  drawProjectiles();
  drawHitEffects();
  drawPlayer();
  drawHud();
  drawWaveBanner();

  if (gameState === "gameOver") drawGameOverScreen();
}

function gameLoop(currentTime) {
  const deltaTime = previousTime === 0 ? 0 : (currentTime - previousTime) / 1000;
  previousTime = currentTime;
  backgroundTime += Math.min(deltaTime, 0.05);

  update(deltaTime);
  render();
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
