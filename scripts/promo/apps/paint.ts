/**
 * Demo app for the promo spot: "PIXEL PAINT", a paint program in attract mode
 * (it draws by itself). Built and launched by CATTIPU's own Forge and Launch
 * during `record.mjs`; plain TypeScript, no packages.
 */
const W = 240;
const H = 180;
document.body.style.cssText = "margin:0;background:#c9bfa4;font:12px monospace;display:flex;flex-direction:column;height:100vh";
const bar = document.createElement("div");
bar.style.cssText = "display:flex;gap:6px;padding:6px;background:#E9DFC4;border-bottom:2px solid #1d1d1d;align-items:center";
const COLORS = ["#002A73", "#A40000", "#0E7A3C", "#5B1B63", "#C6971F", "#1d1d1d"];
bar.innerHTML = `<b style="margin-right:8px">PIXEL PAINT</b>` + COLORS.map((c) => `<span style="width:18px;height:18px;background:${c};border:2px solid #1d1d1d;display:inline-block"></span>`).join("");
const canvas = document.createElement("canvas");
canvas.width = W;
canvas.height = H;
canvas.style.cssText = "flex:1;width:100%;image-rendering:pixelated;background:#fffaf0";
document.body.append(bar, canvas);
const g = canvas.getContext("2d") as CanvasRenderingContext2D;
g.fillStyle = "#fffaf0";
g.fillRect(0, 0, W, H);

// A sun, a house and a rocket, drawn one dab at a time.
const strokes: Array<{ color: string; points: Array<[number, number]> }> = [];
const circle = (cx: number, cy: number, r: number) => Array.from({ length: 48 }, (_, i): [number, number] => [cx + Math.cos(i / 7.6) * r, cy + Math.sin(i / 7.6) * r]);
const line = (a: [number, number], b: [number, number]) => Array.from({ length: 24 }, (_, i): [number, number] => [a[0] + ((b[0] - a[0]) * i) / 23, a[1] + ((b[1] - a[1]) * i) / 23]);
strokes.push({ color: "#C6971F", points: circle(190, 40, 16) });
strokes.push({ color: "#A40000", points: [...line([40, 120], [80, 80]), ...line([80, 80], [120, 120])] });
strokes.push({ color: "#002A73", points: [...line([48, 120], [48, 160]), ...line([48, 160], [112, 160]), ...line([112, 160], [112, 120])] });
strokes.push({ color: "#0E7A3C", points: line([0, 166], [240, 166]) });
strokes.push({ color: "#5B1B63", points: [...line([170, 150], [170, 100]), ...line([170, 100], [178, 86]), ...line([178, 86], [186, 100]), ...line([186, 100], [186, 150])] });

let s = 0;
let p = 0;
function step() {
  for (let k = 0; k < 2; k += 1) {
    const stroke = strokes[s % strokes.length];
    const [x, y] = stroke.points[p];
    g.fillStyle = stroke.color;
    g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    p += 1;
    if (p >= stroke.points.length) {
      p = 0;
      s += 1;
      if (s % strokes.length === 0) {
        g.fillStyle = "#fffaf0";
        g.fillRect(0, 0, W, H);
      }
    }
  }
  requestAnimationFrame(step);
}
requestAnimationFrame(step);

// A module, so each demo keeps its own scope.
export {};
