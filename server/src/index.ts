import express from "express";
import cors from "cors";
import http from "http";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();
const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN === "*" ? true : (process.env.CLIENT_ORIGIN || "http://localhost:5173"), credentials: true }));
app.use(express.json());
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const tokenFor = (id: string) => jwt.sign({ id }, JWT_SECRET, { expiresIn: "7d" });
function auth(req: any, res: any, next: any) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer /, "");
    req.user = jwt.verify(token, JWT_SECRET) as { id: string };
    next();
  } catch { res.status(401).json({ error: "Faça login novamente." }); }
}
app.get("/api/health", (_req, res) => res.json({ ok: true, game: "MINI SUS" }));

app.post("/api/register", async (req, res) => {
  const parsed = z.object({ username: z.string().min(3).max(18).regex(/^[a-zA-Z0-9_]+$/), password: z.string().min(6).max(72) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Use nome de 3–18 caracteres e senha de 6 ou mais." });
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({ data: { username: parsed.data.username, passwordHash } });
    res.json({ token: tokenFor(user.id), user: { id: user.id, username: user.username } });
  } catch { res.status(409).json({ error: "Esse nome já está em uso." }); }
});
app.post("/api/login", async (req, res) => {
  const parsed = z.object({ username: z.string(), password: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos." });
  const user = await prisma.user.findUnique({ where: { username: parsed.data.username } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return res.status(401).json({ error: "Nome ou senha incorretos." });
  res.json({ token: tokenFor(user.id), user: { id: user.id, username: user.username } });
});
app.get("/api/me", auth, async (req: any, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, username: true, createdAt: true } });
  res.json(user);
});
app.get("/api/friends", auth, async (req: any, res) => {
  const rows = await prisma.friendship.findMany({ where: { OR: [{ senderId: req.user.id }, { receiverId: req.user.id }] }, include: { sender: { select: { id: true, username: true } }, receiver: { select: { id: true, username: true } } } });
  res.json(rows.map((r: any) => ({ id: r.id, status: r.status, user: r.senderId === req.user.id ? r.receiver : r.sender })));
});
app.post("/api/friends", auth, async (req: any, res) => {
  const target = await prisma.user.findUnique({ where: { username: String(req.body.username || "") } });
  if (!target || target.id === req.user.id) return res.status(404).json({ error: "Jogador não encontrado." });
  try {
    const friendship = await prisma.friendship.create({ data: { senderId: req.user.id, receiverId: target.id } });
    res.json({ id: friendship.id, status: friendship.status });
  } catch { res.status(409).json({ error: "Solicitação já existe." }); }
});

type Player = { id: string; username: string; socketId: string; alive: boolean; role: "CREWMATE" | "IMPOSTOR"; tasks: number; votes?: string };
type Room = { code: string; players: Player[]; phase: "LOBBY" | "PLAYING" | "MEETING" | "ENDED"; map: string; sabotage: string | null };
const rooms = new Map<string, Room>();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });
const makeCode = () => Math.random().toString(36).slice(2, 7).toUpperCase();
io.use((socket, next) => {
  try {
    const token = String(socket.handshake.auth?.token || "");
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
    socket.data.userId = decoded.id; next();
  } catch { next(new Error("Não autenticado")); }
});
io.on("connection", async socket => {
  const user = await prisma.user.findUnique({ where: { id: socket.data.userId }, select: { id: true, username: true } });
  if (!user) return socket.disconnect();
  socket.on("room:create", ({ map = "Nave" } = {}, cb) => {
    const code = makeCode();
    const room: Room = { code, players: [{ ...user, socketId: socket.id, alive: true, role: "CREWMATE", tasks: 0 }], phase: "LOBBY", map, sabotage: null };
    rooms.set(code, room); socket.join(code); cb?.({ code }); io.to(code).emit("room:update", publicRoom(room));
  });
  socket.on("room:join", ({ code }, cb) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room || room.phase !== "LOBBY" || room.players.length >= 15 || room.players.some(p => p.id === user.id)) return cb?.({ error: "Sala indisponível." });
    room.players.push({ ...user, socketId: socket.id, alive: true, role: "CREWMATE", tasks: 0 });
    socket.join(room.code); cb?.({ ok: true }); io.to(room.code).emit("room:update", publicRoom(room));
  });
  socket.on("game:start", ({ code }, cb) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room || room.players[0]?.id !== user.id || room.players.length < 4) return cb?.({ error: "A partida exige 4 jogadores e o líder deve iniciá-la." });
    const shuffled = [...room.players].sort(() => Math.random() - .5);
    const impostors = Math.max(1, Math.floor(room.players.length / 5));
    room.players.forEach(p => { p.role = shuffled.slice(0, impostors).some(x => x.id === p.id) ? "IMPOSTOR" : "CREWMATE"; p.alive = true; p.tasks = 0; p.votes = undefined; });
    room.phase = "PLAYING"; io.to(room.code).emit("game:started", { players: room.players.map(p => ({ id: p.id, username: p.username, alive: p.alive })), map: room.map }); socket.emit("game:role", { role: room.players.find(p => p.id === user.id)?.role }); cb?.({ ok: true });
  });
  socket.on("task:complete", ({ code }, cb) => {
    const room = rooms.get(String(code || "").toUpperCase()); const p = room?.players.find(x => x.id === user.id);
    if (!room || room.phase !== "PLAYING" || !p || p.role !== "CREWMATE" || !p.alive) return cb?.({ error: "Ação indisponível." });
    p.tasks++; io.to(room.code).emit("game:progress", { completed: room.players.filter(x => x.role === "CREWMATE").reduce((a,x)=>a+x.tasks,0) }); cb?.({ tasks: p.tasks });
  });
  socket.on("sabotage", ({ code, type }, cb) => {
    const room = rooms.get(String(code || "").toUpperCase()); const p = room?.players.find(x => x.id === user.id);
    if (!room || room.phase !== "PLAYING" || p?.role !== "IMPOSTOR" || !p.alive) return cb?.({ error: "Ação indisponível." });
    room.sabotage = String(type || "Luzes"); io.to(room.code).emit("game:sabotage", { type: room.sabotage }); cb?.({ ok: true });
  });
  socket.on("meeting:call", ({ code }, cb) => {
    const room = rooms.get(String(code || "").toUpperCase()); if (!room || room.phase !== "PLAYING") return cb?.({ error: "Reunião indisponível." });
    room.phase = "MEETING"; room.players.forEach(p => p.votes = undefined); io.to(room.code).emit("meeting:started"); cb?.({ ok: true });
  });
  socket.on("vote", ({ code, targetId }, cb) => {
    const room = rooms.get(String(code || "").toUpperCase()); const p = room?.players.find(x => x.id === user.id);
    if (!room || room.phase !== "MEETING" || !p?.alive || !room.players.some(x => x.id === targetId && x.alive)) return cb?.({ error: "Voto inválido." });
    p.votes = targetId; const alive = room.players.filter(x => x.alive);
    if (alive.every(x => x.votes)) {
      const tally = new Map<string, number>(); alive.forEach(x => tally.set(x.votes!, (tally.get(x.votes!) || 0) + 1));
      const top = [...tally].sort((a,b)=>b[1]-a[1]); const ejected = top.length && top[0][1] > (top[1]?.[1] || 0) ? room.players.find(x=>x.id===top[0][0]) : undefined;
      if (ejected) ejected.alive = false; room.phase = "PLAYING"; io.to(room.code).emit("meeting:result", { ejected: ejected?.username || null, players: room.players.map(x=>({id:x.id,username:x.username,alive:x.alive})) });
    } else io.to(room.code).emit("meeting:votes", { count: alive.filter(x=>x.votes).length, total: alive.length });
    cb?.({ ok: true });
  });
  socket.on("disconnect", () => {
    for (const [code, room] of rooms) { room.players = room.players.filter(p => p.socketId !== socket.id); if (!room.players.length) rooms.delete(code); else io.to(code).emit("room:update", publicRoom(room)); }
  });
});
function publicRoom(room: Room) { return { code: room.code, phase: room.phase, map: room.map, players: room.players.map(p => ({ id: p.id, username: p.username, alive: p.alive })) }; }
const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`MINI SUS server on ${port}`));
