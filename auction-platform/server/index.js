import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cookie from 'cookie';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { z } from 'zod';
import { getAuctionInsights } from './insights.js';
import { makeAuctionView, sortAuctions } from './auction-utils.js';
import { getDatabaseSnapshot, initStore, transact } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server, {
  // The Vite dev server proxies /socket.io, so browser traffic stays same-origin.
  serveClient: true,
  maxHttpBufferSize: 64 * 1024,
});
const PORT = Number(process.env.PORT || 4000);
const COOKIE_NAME = 'bidnova_session';
const JWT_SECRET = process.env.JWT_SECRET || 'local-development-secret-change-before-deploying';
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || /replace|change-me|development/i.test(process.env.JWT_SECRET))) {
  throw new Error('Production requires a unique JWT_SECRET with at least 32 characters.');
}
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
const CATEGORIES = ['Art', 'Automobilia', 'Books', 'Cameras', 'Design', 'Watches', 'Other'];

app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
}));
app.use(express.json({ limit: '40kb' }));
app.use(cookieParser());

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

function optionalAuth(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = getDatabaseSnapshot().users.find((candidate) => candidate.id === payload.sub);
      if (user) req.user = publicUser(user);
    } catch {
      // Expired or invalid sessions are treated as signed out.
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
  next();
}

app.use(optionalAuth);
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again shortly.' },
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' },
});

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(48, 'Name is too long.'),
  email: z.string().trim().email('Enter a valid email address.').max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(72, 'Password is too long.'),
});
const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1, 'Enter your password.').max(72),
});
const bidSchema = z.object({
  amount: z.coerce.number().int('Bid amount must be a whole number.').positive().max(100_000_000),
});
const auctionSchema = z.object({
  title: z.string().trim().min(4, 'Title must be at least 4 characters.').max(90),
  category: z.enum(CATEGORIES),
  description: z.string().trim().min(20, 'Add at least 20 characters of detail.').max(1200),
  startingPrice: z.coerce.number().int().positive().max(100_000_000),
  minimumIncrement: z.coerce.number().int().positive().max(10_000_000),
  durationHours: z.coerce.number().int().min(1).max(168),
});
const chatSchema = z.object({
  auctionId: z.string().min(1).max(80),
  text: z.string().trim().min(1).max(600),
});

function validationError(result) {
  return result.error.issues.map((issue) => issue.message).join(' ');
}

function issueSessionCookie(res, user) {
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
}

function addNotification(database, userId, type, title, body, auctionId) {
  const notification = {
    id: randomUUID(),
    userId,
    type,
    title,
    body,
    auctionId,
    createdAt: new Date().toISOString(),
    readAt: null,
  };
  database.notifications.push(notification);
  return notification;
}

function emitNotifications(notifications) {
  for (const notification of notifications) {
    io.to(`user:${notification.userId}`).emit('notification:new', notification);
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'BidNova API' }));

app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: validationError(parsed) });
    const { name, email, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 12);
    const user = {
      id: randomUUID(),
      name,
      email,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    const exists = await transact((database) => {
      if (database.users.some((candidate) => candidate.email === email)) return true;
      database.users.push(user);
      return false;
    });
    if (exists) return res.status(409).json({ error: 'An account with that email already exists.' });
    issueSessionCookie(res, user);
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: validationError(parsed) });
    const database = getDatabaseSnapshot();
    const user = database.users.find((candidate) => candidate.email === parsed.data.email);
    const passwordMatches = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;
    if (!user || !passwordMatches) return res.status(401).json({ error: 'Email or password did not match.' });
    issueSessionCookie(res, user);
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: COOKIE_OPTIONS.httpOnly,
    sameSite: COOKIE_OPTIONS.sameSite,
    secure: COOKIE_OPTIONS.secure,
    path: COOKIE_OPTIONS.path,
  });
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => res.json({ user: req.user || null }));

app.get('/api/auctions', (req, res) => {
  const database = getDatabaseSnapshot();
  const query = String(req.query.q || '').trim().toLowerCase();
  const category = String(req.query.category || '').trim();
  const views = database.auctions
    .map((auction) => makeAuctionView(auction, database, req.user?.id))
    .filter((auction) => auction.status === 'active')
    .filter((auction) => !category || category === 'All lots' || auction.category === category)
    .filter((auction) => {
      if (!query) return true;
      return `${auction.title} ${auction.category} ${auction.description} ${auction.sellerName}`.toLowerCase().includes(query);
    });
  res.json({ auctions: sortAuctions(views, String(req.query.sort || 'featured')), categories: CATEGORIES });
});

app.get('/api/auctions/:auctionId', (req, res) => {
  const database = getDatabaseSnapshot();
  const auction = database.auctions.find((candidate) => candidate.id === req.params.auctionId);
  if (!auction) return res.status(404).json({ error: 'Auction not found.' });
  return res.json({ auction: makeAuctionView(auction, database, req.user?.id) });
});

app.get('/api/auctions/:auctionId/insights', async (req, res, next) => {
  try {
    const database = getDatabaseSnapshot();
    const auction = database.auctions.find((candidate) => candidate.id === req.params.auctionId);
    if (!auction) return res.status(404).json({ error: 'Auction not found.' });
    const bids = database.bids.filter((bid) => bid.auctionId === auction.id);
    const insights = await getAuctionInsights(auction, bids);
    return res.json({ insights });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auctions/:auctionId/bids', requireAuth, async (req, res, next) => {
  try {
    const parsed = bidSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: validationError(parsed) });
    const result = await transact((database) => {
      const auction = database.auctions.find((candidate) => candidate.id === req.params.auctionId);
      if (!auction) return { error: 'Auction not found.', status: 404 };
      if (auction.status === 'ended' || new Date(auction.endsAt).getTime() <= Date.now()) {
        auction.status = 'ended';
        return { error: 'This auction has ended.', status: 409 };
      }
      if (auction.sellerId === req.user.id) return { error: 'You cannot bid on your own listing.', status: 403 };

      const currentView = makeAuctionView(auction, database, req.user.id);
      const minimumBid = currentView.currentPrice + auction.minimumIncrement;
      if (parsed.data.amount < minimumBid) {
        return { error: `The next valid bid is ${minimumBid}.`, status: 409, minimumBid };
      }

      const previousLeader = database.bids
        .filter((bid) => bid.auctionId === auction.id)
        .reduce((highest, bid) => (!highest || bid.amount > highest.amount ? bid : highest), null);
      const bid = {
        id: randomUUID(),
        auctionId: auction.id,
        userId: req.user.id,
        userName: req.user.name,
        amount: parsed.data.amount,
        createdAt: new Date().toISOString(),
      };
      database.bids.push(bid);
      auction.currentPrice = bid.amount;

      const notifications = [];
      if (previousLeader && previousLeader.userId !== req.user.id && database.users.some((user) => user.id === previousLeader.userId)) {
        notifications.push(addNotification(
          database,
          previousLeader.userId,
          'outbid',
          'You have been outbid',
          `${req.user.name} placed a higher bid on “${auction.title}”.`,
          auction.id,
        ));
      }
      const seller = database.users.find((user) => user.id === auction.sellerId);
      if (seller && seller.id !== req.user.id) {
        notifications.push(addNotification(
          database,
          seller.id,
          'seller',
          'A new bid came in',
          `${req.user.name} bid on “${auction.title}”.`,
          auction.id,
        ));
      }
      notifications.push(addNotification(
        database,
        req.user.id,
        'bid-placed',
        'Bid placed successfully',
        `Your bid on “${auction.title}” is now ${bid.amount.toLocaleString('en-IN')}.`,
        auction.id,
      ));

      return {
        auction: makeAuctionView(auction, database, req.user.id),
        bid,
        notifications,
      };
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error, minimumBid: result.minimumBid });
    }
    io.emit('auction:updated', result.auction);
    emitNotifications(result.notifications);
    return res.status(201).json({ auction: result.auction, bid: result.bid });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auctions', requireAuth, async (req, res, next) => {
  try {
    const parsed = auctionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: validationError(parsed) });
    const { title, category, description, startingPrice, minimumIncrement, durationHours } = parsed.data;
    const iconByCategory = {
      Art: '🎨',
      Automobilia: '🏎️',
      Books: '📚',
      Cameras: '📷',
      Design: '🪑',
      Watches: '⌚',
      Other: '✨',
    };
    const visualByCategory = {
      Art: 'art',
      Automobilia: 'automobilia',
      Books: 'books',
      Cameras: 'camera',
      Design: 'design',
      Watches: 'watches',
      Other: 'other',
    };
    const auction = {
      id: randomUUID(),
      title,
      category,
      description,
      sellerId: req.user.id,
      sellerName: req.user.name,
      startingPrice,
      currentPrice: startingPrice,
      minimumIncrement,
      icon: iconByCategory[category],
      visual: visualByCategory[category],
      condition: 'Seller-provided details',
      endsAt: new Date(Date.now() + durationHours * 60 * 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      featured: false,
      status: 'active',
    };
    const view = await transact((database) => {
      database.auctions.push(auction);
      return makeAuctionView(auction, database, req.user.id);
    });
    io.emit('auction:created', view);
    return res.status(201).json({ auction: view });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/watchlist', requireAuth, (req, res) => {
  const database = getDatabaseSnapshot();
  const watchedIds = new Set(database.watchlists.filter((entry) => entry.userId === req.user.id).map((entry) => entry.auctionId));
  const auctions = database.auctions
    .filter((auction) => watchedIds.has(auction.id))
    .map((auction) => makeAuctionView(auction, database, req.user.id));
  res.json({ auctions });
});

app.post('/api/watchlist/:auctionId/toggle', requireAuth, async (req, res, next) => {
  try {
    const result = await transact((database) => {
      if (!database.auctions.some((auction) => auction.id === req.params.auctionId)) {
        return { error: 'Auction not found.', status: 404 };
      }
      const existingIndex = database.watchlists.findIndex((entry) => entry.userId === req.user.id && entry.auctionId === req.params.auctionId);
      if (existingIndex >= 0) {
        database.watchlists.splice(existingIndex, 1);
        return { isWatched: false };
      }
      database.watchlists.push({ userId: req.user.id, auctionId: req.params.auctionId, createdAt: new Date().toISOString() });
      return { isWatched: true };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/notifications', requireAuth, (req, res) => {
  const notifications = getDatabaseSnapshot().notifications
    .filter((notification) => notification.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 40);
  res.json({ notifications, unreadCount: notifications.filter((notification) => !notification.readAt).length });
});

app.post('/api/notifications/read', requireAuth, async (req, res, next) => {
  try {
    const updated = await transact((database) => {
      let count = 0;
      const readAt = new Date().toISOString();
      database.notifications.forEach((notification) => {
        if (notification.userId === req.user.id && !notification.readAt) {
          notification.readAt = readAt;
          count += 1;
        }
      });
      return count;
    });
    return res.json({ ok: true, markedRead: updated });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/auctions/:auctionId/messages', requireAuth, (req, res) => {
  const database = getDatabaseSnapshot();
  if (!database.auctions.some((auction) => auction.id === req.params.auctionId)) {
    return res.status(404).json({ error: 'Auction not found.' });
  }
  const messages = database.messages
    .filter((message) => message.auctionId === req.params.auctionId)
    .slice(-80);
  return res.json({ messages });
});

io.use((socket, next) => {
  try {
    const cookies = cookie.parse(socket.request.headers.cookie || '');
    const token = cookies[COOKIE_NAME];
    if (token) {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = getDatabaseSnapshot().users.find((candidate) => candidate.id === payload.sub);
      if (user) socket.data.user = publicUser(user);
    }
  } catch {
    socket.data.user = null;
  }
  next();
});

io.on('connection', (socket) => {
  if (socket.data.user) socket.join(`user:${socket.data.user.id}`);

  socket.on('auction:join', (auctionId) => {
    if (!socket.data.user) return;
    if (typeof auctionId !== 'string' || auctionId.length > 80) return;
    const exists = getDatabaseSnapshot().auctions.some((auction) => auction.id === auctionId);
    if (exists) socket.join(`auction:${auctionId}`);
  });

  socket.on('auction:leave', (auctionId) => {
    if (typeof auctionId === 'string') socket.leave(`auction:${auctionId}`);
  });

  socket.on('chat:send', async (payload, acknowledge) => {
    const ack = typeof acknowledge === 'function' ? acknowledge : () => {};
    if (!socket.data.user) return ack({ ok: false, error: 'Sign in to join the auction room.' });
    if (Date.now() - (socket.data.lastChatAt || 0) < 650) return ack({ ok: false, error: 'Please pause briefly before sending another message.' });
    const parsed = chatSchema.safeParse(payload);
    if (!parsed.success) return ack({ ok: false, error: validationError(parsed) });
    try {
      const message = await transact((database) => {
        if (!database.auctions.some((auction) => auction.id === parsed.data.auctionId)) return null;
        const saved = {
          id: randomUUID(),
          auctionId: parsed.data.auctionId,
          userId: socket.data.user.id,
          userName: socket.data.user.name,
          text: parsed.data.text,
          createdAt: new Date().toISOString(),
        };
        database.messages.push(saved);
        if (database.messages.length > 5000) database.messages.splice(0, database.messages.length - 5000);
        return saved;
      });
      if (!message) return ack({ ok: false, error: 'Auction not found.' });
      socket.data.lastChatAt = Date.now();
      io.to(`auction:${parsed.data.auctionId}`).emit('chat:new', message);
      return ack({ ok: true, messageId: message.id });
    } catch {
      return ack({ ok: false, error: 'Message could not be sent. Please try again.' });
    }
  });
});

async function closeExpiredAuctions() {
  const snapshot = getDatabaseSnapshot();
  const hasExpired = snapshot.auctions.some((auction) => auction.status !== 'ended' && new Date(auction.endsAt).getTime() <= Date.now());
  if (!hasExpired) return;
  const closedViews = await transact((database) => {
    const closed = [];
    database.auctions.forEach((auction) => {
      if (auction.status !== 'ended' && new Date(auction.endsAt).getTime() <= Date.now()) {
        auction.status = 'ended';
        closed.push(makeAuctionView(auction, database));
      }
    });
    return closed;
  });
  closedViews.forEach((auction) => io.emit('auction:closed', auction));
}

const expirationTimer = setInterval(() => {
  closeExpiredAuctions().catch((error) => console.error('Auction expiry check failed:', error.message));
}, 15_000);
expirationTimer.unref();

const distDirectory = path.resolve(__dirname, '../dist');
if (existsSync(distDirectory)) {
  app.use(express.static(distDirectory, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    return res.sendFile(path.join(distDirectory, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  if (res.headersSent) return;
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

await initStore();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`BidNova API listening on http://0.0.0.0:${PORT}`);
  console.log('Demo sign-in: demo@bidnova.in / BidNova123!');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('development')) {
    console.warn('Using a local fallback JWT secret. Set JWT_SECRET before deploying.');
  }
});

function shutdown() {
  clearInterval(expirationTimer);
  io.close();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
