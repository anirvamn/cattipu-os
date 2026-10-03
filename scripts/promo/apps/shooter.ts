/**
 * Demo app for the promo spot: "STAR FORGE", a pixel space shooter in attract
 * mode (it plays itself). Built and launched by CATTIPU's own Forge and Launch
 * during `record.mjs`; plain TypeScript, no packages, like any Forge project.
 */
const canvas = document.createElement("canvas");
canvas.width = 320;
canvas.height = 240;
canvas.style.cssText = "width:100vw;height:100vh;image-rendering:pixelated;background:#05060f;display:block";
document.body.style.margin = "0";
document.body.appendChild(canvas);
const g = canvas.getContext("2d") as CanvasRenderingContext2D;

interface Thing { x: number; y: number; vx: number; vy: number; life: number }
const stars: Thing[] = Array.from({ length: 60 }, (_, i) => ({ x: (i * 53) % 320, y: (i * 97) % 240, vx: 0, vy: 0.4 + (i % 3) * 0.5, life: 0 }));
let shots: Thing[] = [];
let enemies: Thing[] = [];
let sparks: Thing[] = [];
let score = 0;
let frame = 0;

function sprite(rows: string[], x: number, y: number, color: string) {
  g.fillStyle = color;
  rows.forEach((row, j) => [...row].forEach((c, i) => c === "#" && g.fillRect(x + i * 2, y + j * 2, 2, 2)));
}
const SHIP = ["...#...", "..###..", ".#####.", "##.#.##", "#..#..#"];
const ALIEN = ["#.....#", ".#####.", "##.#.##", "#######", ".#...#."];

function step() {
  frame += 1;
  const px = 160 + Math.sin(frame / 40) * 120;
  if (frame % 9 === 0) shots.push({ x: px, y: 214, vx: 0, vy: -5, life: 60 });
  if (frame % 24 === 0) enemies.push({ x: 20 + ((frame * 37) % 280), y: -10, vx: Math.sin(frame) * 0.6, vy: 0.9, life: 999 });

  g.fillStyle = "#05060f";
  g.fillRect(0, 0, 320, 240);
  for (const s of stars) {
    s.y = (s.y + s.vy) % 240;
    g.fillStyle = s.vy > 1 ? "#E9DFC4" : "#5b6ba8";
    g.fillRect(s.x, s.y, 1, 1);
  }
  shots = shots.filter((s) => (s.y += s.vy) > -8);
  enemies = enemies.filter((e) => (e.x += e.vx, e.y += e.vy) < 250);
  for (const e of enemies) {
    const hit = shots.find((s) => Math.abs(s.x - (e.x + 7)) < 9 && Math.abs(s.y - (e.y + 5)) < 8);
    if (hit) {
      hit.y = -99;
      score += 100;
      for (let k = 0; k < 14; k += 1) sparks.push({ x: e.x + 7, y: e.y + 5, vx: Math.cos(k) * 2, vy: Math.sin(k * 1.7) * 2, life: 20 });
      e.y = 999;
    }
  }
  enemies = enemies.filter((e) => e.y < 900);
  sparks = sparks.filter((p) => (p.x += p.vx, p.y += p.vy, (p.life -= 1)) > 0);
  for (const s of shots) { g.fillStyle = "#ffd447"; g.fillRect(s.x, s.y, 2, 6); }
  for (const e of enemies) sprite(ALIEN, e.x, e.y, "#7bd88f");
  for (const p of sparks) { g.fillStyle = p.life > 10 ? "#ff5a3c" : "#ffd447"; g.fillRect(p.x, p.y, 2, 2); }
  sprite(SHIP, px - 7, 216, "#E9DFC4");
  g.fillStyle = "#E9DFC4";
  g.font = "10px monospace";
  g.fillText(`STAR FORGE   SCORE ${String(score).padStart(6, "0")}`, 8, 12);
  requestAnimationFrame(step);
}
requestAnimationFrame(step);

// A module, so each demo keeps its own scope.
export {};
