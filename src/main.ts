// Walking-skeleton bootstrap: placeholder canvas paint, no game logic yet.
const HINT = "press any key";

function paint(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    return;
  }
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#eee";
  ctx.font = "16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(HINT, canvas.width / 2, canvas.height / 2);
}

function boot(): void {
  const existing = document.querySelector<HTMLCanvasElement>("#board");
  if (existing !== null) {
    paint(existing);
    return;
  }
  const app = document.querySelector<HTMLElement>("#app");
  if (app === null) {
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.id = "board";
  canvas.width = 240;
  canvas.height = 400;
  app.appendChild(canvas);
  paint(canvas);
}

boot();
