import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.join(__dirname, 'data');
const dataFile = path.join(dataDirectory, 'auction-store.json');
let database;
let writeQueue = Promise.resolve();

const isoAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const isoFromNow = (hours) => new Date(Date.now() + hours * 60 * 60_000).toISOString();

function makeSeededDatabase(demoPasswordHash) {
  const demoUser = {
    id: 'demo-user-001',
    name: 'Priya Nair',
    email: 'demo@bidnova.in',
    passwordHash: demoPasswordHash,
    createdAt: new Date().toISOString(),
  };

  const auctionSeeds = [
    {
      id: 'lot-leica-m3',
      title: 'Leica M3 Rangefinder',
      category: 'Cameras',
      description: 'A beautifully preserved 1962 Leica M3 in classic chrome. Smooth shutter action, a bright viewfinder, and the kind of patina only a well-loved camera earns. Includes body cap and a fitted leather case.',
      sellerId: 'seller-curated-house',
      sellerName: 'The Curated House',
      startingPrice: 56000,
      currentPrice: 78000,
      minimumIncrement: 2000,
      icon: '📷',
      visual: 'camera',
      condition: 'Excellent vintage condition',
      endsAt: isoFromNow(5),
      createdAt: isoAgo(60 * 24),
      featured: true,
      bidAmounts: [58000, 62000, 68000, 72000, 78000],
    },
    {
      id: 'lot-porsche-911',
      title: '1969 Porsche 911 S',
      category: 'Automobilia',
      description: 'A lovingly documented, numbers-matching 911 S with a recent mechanical refresh. Original service booklet, period-correct details, and a full inspection report are included in this collector sale.',
      sellerId: 'seller-motoring-club',
      sellerName: 'North Star Motor Club',
      startingPrice: 2250000,
      currentPrice: 2400000,
      minimumIncrement: 25000,
      icon: '🏎️',
      visual: 'automobilia',
      condition: 'Restored; inspection report included',
      endsAt: isoFromNow(10),
      createdAt: isoAgo(60 * 30),
      featured: true,
      bidAmounts: [2275000, 2300000, 2350000, 2400000],
    },
    {
      id: 'lot-walnut-chair',
      title: 'Walnut Lounge Chair, 1960s',
      category: 'Design',
      description: 'An elegant mid-century lounge chair with a sculptural walnut frame and recently reupholstered oatmeal linen. Restored by a Chennai-based furniture atelier using traditional joinery.',
      sellerId: 'seller-curated-house',
      sellerName: 'The Curated House',
      startingPrice: 55000,
      currentPrice: 72500,
      minimumIncrement: 2500,
      icon: '🪑',
      visual: 'design',
      condition: 'Restored; excellent condition',
      endsAt: isoFromNow(16),
      createdAt: isoAgo(60 * 18),
      featured: false,
      bidAmounts: [57500, 60000, 62500, 67500, 70000, 72500],
    },
    {
      id: 'lot-dune-first-edition',
      title: 'Dune — First Edition, 1965',
      category: 'Books',
      description: 'A scarce first edition of Frank Herbert’s landmark science-fiction novel, published by Chilton in 1965. Jacket has light shelf wear; the book is clean and presents beautifully. Condition notes and provenance available.',
      sellerId: 'seller-paper-trail',
      sellerName: 'Paper Trail Books',
      startingPrice: 8500,
      currentPrice: 14000,
      minimumIncrement: 500,
      icon: '📚',
      visual: 'books',
      condition: 'Very good; original dust jacket',
      endsAt: isoFromNow(21),
      createdAt: isoAgo(60 * 12),
      featured: false,
      bidAmounts: [9000, 10000, 11500, 12500, 14000],
    },
    {
      id: 'lot-seiko-chronograph',
      title: 'Seiko 6139 “Pogue” Chronograph',
      category: 'Watches',
      description: 'A crisp, serviced example of Seiko’s celebrated 6139 automatic chronograph. Original dial and hands, fresh crystal, and a period-style bracelet. Timing report from the watchmaker is supplied.',
      sellerId: 'seller-timepiece-room',
      sellerName: 'The Timepiece Room',
      startingPrice: 32000,
      currentPrice: 43000,
      minimumIncrement: 1000,
      icon: '⌚',
      visual: 'watches',
      condition: 'Serviced; very good vintage condition',
      endsAt: isoFromNow(33),
      createdAt: isoAgo(60 * 8),
      featured: false,
      bidAmounts: [33000, 35000, 37500, 40000, 43000],
    },
    {
      id: 'lot-abstract-no-12',
      title: 'Abstract No. 12, signed original',
      category: 'Art',
      description: 'A vivid, one-of-a-kind mixed-media composition on archival cotton paper. Signed and dated by the artist, with a certificate of authenticity and a custom archival mount.',
      sellerId: 'seller-studio-collective',
      sellerName: 'Studio Collective',
      startingPrice: 85000,
      currentPrice: 108000,
      minimumIncrement: 3000,
      icon: '🎨',
      visual: 'art',
      condition: 'Excellent; certificate of authenticity',
      endsAt: isoFromNow(46),
      createdAt: isoAgo(60 * 5),
      featured: true,
      bidAmounts: [88000, 92000, 97000, 102000, 108000],
    },
  ];

  const bidderNames = ['Arjun Mehta', 'Maya Chen', 'Dev Shah', 'Ananya Rao', 'Kabir Sethi', 'Ira Menon'];
  const auctions = auctionSeeds.map(({ bidAmounts, ...auction }) => auction);
  const bids = [];

  auctionSeeds.forEach((auction, auctionIndex) => {
    auction.bidAmounts.forEach((amount, bidIndex) => {
      bids.push({
        id: `seed-${auction.id}-${bidIndex + 1}`,
        auctionId: auction.id,
        userId: `seed-bidder-${(auctionIndex + bidIndex) % bidderNames.length}`,
        userName: bidderNames[(auctionIndex + bidIndex) % bidderNames.length],
        amount,
        createdAt: isoAgo((auction.bidAmounts.length - bidIndex) * (11 + auctionIndex * 2)),
      });
    });
  });

  return {
    users: [demoUser],
    auctions,
    bids,
    watchlists: [],
    messages: [],
    notifications: [],
  };
}

async function persist(nextDatabase) {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${dataFile}.${process.pid}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(nextDatabase, null, 2), 'utf8');
  await rename(temporaryFile, dataFile);
}

export async function initStore() {
  await mkdir(dataDirectory, { recursive: true });
  try {
    const contents = await readFile(dataFile, 'utf8');
    const loaded = JSON.parse(contents);
    if (!loaded || !Array.isArray(loaded.users) || !Array.isArray(loaded.auctions)) {
      throw new Error('The auction store has an invalid shape.');
    }
    database = {
      users: loaded.users,
      auctions: loaded.auctions,
      bids: Array.isArray(loaded.bids) ? loaded.bids : [],
      watchlists: Array.isArray(loaded.watchlists) ? loaded.watchlists : [],
      messages: Array.isArray(loaded.messages) ? loaded.messages : [],
      notifications: Array.isArray(loaded.notifications) ? loaded.notifications : [],
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const demoPasswordHash = await bcrypt.hash('BidNova123!', 12);
    database = makeSeededDatabase(demoPasswordHash);
    await persist(database);
    console.log('Created a fresh demo auction store.');
  }
}

export function getDatabaseSnapshot() {
  if (!database) throw new Error('Auction store is not initialized.');
  return structuredClone(database);
}

// Transactions are serialized and persisted atomically, so two bids received
// at nearly the same time cannot both win against the same displayed price.
export function transact(mutator) {
  const operation = writeQueue.then(async () => {
    if (!database) throw new Error('Auction store is not initialized.');
    const nextDatabase = structuredClone(database);
    const result = await mutator(nextDatabase);
    await persist(nextDatabase);
    database = nextDatabase;
    return result;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}
