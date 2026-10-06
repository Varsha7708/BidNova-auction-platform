import { useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import {
  ArrowDown,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Compass,
  Gavel,
  Heart,
  LayoutGrid,
  LogOut,
  Menu,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  X,
} from 'lucide-react';
import AuctionCard from './components/AuctionCard';
import { AuthModal, AuctionModal, CreateAuctionModal, NotificationsPopover, Toast } from './components/Overlays';
import { api, money, timeRemaining } from './lib/api';

const CATEGORY_LIST = ['All lots', 'Art', 'Automobilia', 'Books', 'Cameras', 'Design', 'Watches', 'Other'];

export default function App() {
  const [socket] = useState(() => io({ withCredentials: true, autoConnect: false }));
  const [user, setUser] = useState(null);
  const [auctions, setAuctions] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All lots');
  const [sort, setSort] = useState('featured');
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [selectedAuction, setSelectedAuction] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [toastMessage, setToastMessage] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const unreadCount = notifications.filter((item) => !item.readAt).length;
  const visibleAuctions = useMemo(
    () => watchlistOnly ? auctions.filter((auction) => auction.isWatched) : auctions,
    [auctions, watchlistOnly],
  );
  const featuredAuction = auctions.find((auction) => auction.featured) || auctions[0] || null;

  useEffect(() => {
    socket.connect();
    return () => socket.disconnect();
  }, [socket]);

  useEffect(() => {
    let active = true;
    api('/api/me')
      .then((result) => { if (active) setUser(result.user); })
      .catch(() => { if (active) setUser(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (category !== 'All lots') params.set('category', category);
      if (sort !== 'featured') params.set('sort', sort);
      api(`/api/auctions${params.size ? `?${params.toString()}` : ''}`)
        .then((result) => { if (active) setAuctions(result.auctions); })
        .catch((error) => { if (active) setToastMessage(error.message); })
        .finally(() => { if (active) setLoading(false); });
    }, query ? 220 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, category, sort, user]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return undefined;
    }
    let active = true;
    api('/api/notifications')
      .then((result) => { if (active) setNotifications(result.notifications); })
      .catch(() => { if (active) setNotifications([]); });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    function updateAuction(auction) {
      if (!auction?.id) return;
      setAuctions((current) => {
        const exists = current.some((item) => item.id === auction.id);
        return exists ? current.map((item) => item.id === auction.id ? { ...item, ...auction } : item) : [auction, ...current];
      });
      setSelectedAuction((current) => current?.id === auction.id ? { ...current, ...auction } : current);
    }
    function onNotification(notification) {
      setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 40));
      setToastMessage(notification.title);
    }
    function onClosed(auction) {
      updateAuction({ ...auction, status: 'ended' });
    }
    socket.on('auction:updated', updateAuction);
    socket.on('auction:created', updateAuction);
    socket.on('auction:closed', onClosed);
    socket.on('notification:new', onNotification);
    return () => {
      socket.off('auction:updated', updateAuction);
      socket.off('auction:created', updateAuction);
      socket.off('auction:closed', onClosed);
      socket.off('notification:new', onNotification);
    };
  }, [socket]);

  const openAuth = useCallback(() => {
    setAccountOpen(false);
    setNotificationsOpen(false);
    setAuthOpen(true);
  }, []);

  function onAuthSuccess(nextUser) {
    setUser(nextUser);
    setAuthOpen(false);
    setAccountOpen(false);
    // Refresh the socket handshake so the HttpOnly session is used for room chat and private updates.
    socket.disconnect();
    socket.connect();
    setToastMessage(`Welcome, ${nextUser.name.split(' ')[0]}. You’re signed in.`);
  }

  async function signOut() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // Clearing local app state is still preferable if a network request fails.
    }
    setUser(null);
    setAccountOpen(false);
    setNotificationsOpen(false);
    setWatchlistOnly(false);
    setNotifications([]);
    socket.disconnect();
    socket.connect();
    setToastMessage('You have signed out.');
  }

  function scrollToLots() {
    setMobileNavOpen(false);
    document.getElementById('auctions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showAllLots() {
    setWatchlistOnly(false);
    setCategory('All lots');
    setMobileNavOpen(false);
    scrollToLots();
  }

  function showWatchlist() {
    setMobileNavOpen(false);
    if (!user) return openAuth();
    setWatchlistOnly(true);
    setCategory('All lots');
    setQuery('');
    document.getElementById('auctions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function toggleWatch(auction) {
    if (!user) return openAuth();
    try {
      const result = await api(`/api/watchlist/${encodeURIComponent(auction.id)}/toggle`, { method: 'POST' });
      setAuctions((current) => current.map((item) => item.id === auction.id ? { ...item, isWatched: result.isWatched } : item));
      setSelectedAuction((current) => current?.id === auction.id ? { ...current, isWatched: result.isWatched } : current);
      setToastMessage(result.isWatched ? 'Added to your watchlist.' : 'Removed from your watchlist.');
    } catch (error) {
      setToastMessage(error.message);
    }
  }

  async function placeBid(auctionId, amount) {
    const result = await api(`/api/auctions/${encodeURIComponent(auctionId)}/bids`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
    setSelectedAuction((current) => current?.id === auctionId ? { ...current, ...result.auction } : current);
    setAuctions((current) => current.map((item) => item.id === auctionId ? { ...item, ...result.auction } : item));
    setToastMessage(`Bid placed for ${money(result.bid.amount)}.`);
    return result;
  }

  function onAuctionCreated(auction) {
    setCreateOpen(false);
    setWatchlistOnly(false);
    setCategory('All lots');
    setQuery('');
    setAuctions((current) => [auction, ...current.filter((item) => item.id !== auction.id)]);
    setToastMessage('Your lot is live. Good luck with the auction!');
    window.setTimeout(scrollToLots, 100);
  }

  async function selectNotification(auctionId) {
    setNotificationsOpen(false);
    if (!auctionId) return;
    try {
      const result = await api(`/api/auctions/${encodeURIComponent(auctionId)}`);
      setSelectedAuction(result.auction);
    } catch (error) {
      setToastMessage(error.message);
    }
  }

  async function markNotificationsRead() {
    try {
      await api('/api/notifications/read', { method: 'POST' });
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || readAt })));
    } catch (error) {
      setToastMessage(error.message);
    }
  }

  function startListing() {
    if (!user) return openAuth();
    setCreateOpen(true);
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="header-inner">
          <button className="brand" type="button" onClick={showAllLots} aria-label="BidNova home">
            <span className="brand-mark"><Gavel size={19} strokeWidth={2.2} /></span>
            <span>bidnova<span className="brand-period">.</span></span>
          </button>

          <nav className={`main-nav ${mobileNavOpen ? 'nav-open' : ''}`} aria-label="Main navigation">
            <button className={!watchlistOnly ? 'nav-active' : ''} type="button" onClick={showAllLots}>Explore auctions</button>
            <button className={watchlistOnly ? 'nav-active' : ''} type="button" onClick={showWatchlist}>Watchlist{user && <span className="nav-count">{auctions.filter((item) => item.isWatched).length || ''}</span>}</button>
            <a href="#how-it-works" onClick={() => setMobileNavOpen(false)}>How it works</a>
          </nav>

          <div className="header-actions">
            <button className={`header-icon-button notification-trigger ${notificationsOpen ? 'button-selected' : ''}`} type="button" aria-label="Notifications" onClick={() => {
              if (!user) return openAuth();
              setNotificationsOpen((value) => !value);
              setAccountOpen(false);
            }}>
              <Bell size={18} />{unreadCount > 0 && <span className="notification-count">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            <div className="account-wrap">
              {user ? (
                <button className="user-chip" type="button" onClick={() => { setAccountOpen((value) => !value); setNotificationsOpen(false); }}>
                  <span className="user-avatar">{user.name.slice(0, 1).toUpperCase()}</span><span className="user-first-name">{user.name.split(' ')[0]}</span><ChevronDown size={14} />
                </button>
              ) : <button className="sign-in-button" type="button" onClick={openAuth}>Sign in</button>}
              {accountOpen && user && <div className="account-popover">
                <div className="account-popover-user"><span className="user-avatar user-avatar-large">{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><span>{user.email}</span></div></div>
                <div className="account-divider" />
                <button type="button" onClick={showWatchlist}><Heart size={15} />My watchlist</button>
                <button type="button" onClick={startListing}><Plus size={15} />List an item</button>
                <button className="logout-action" type="button" onClick={signOut}><LogOut size={15} />Sign out</button>
              </div>}
            </div>
            <button className="button button-primary header-list-button" type="button" onClick={startListing}><Plus size={16} /> List an item</button>
            <button className="mobile-menu-button" type="button" aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMobileNavOpen((value) => !value)}>{mobileNavOpen ? <X size={20} /> : <Menu size={20} />}</button>
          </div>

          {notificationsOpen && user && <NotificationsPopover
            notifications={notifications}
            unreadCount={unreadCount}
            onClose={() => setNotificationsOpen(false)}
            onRead={markNotificationsRead}
            onSelect={selectNotification}
          />}
        </div>
      </header>

      <main>
        <section className="hero-section page-width">
          <div className="hero-copy">
            <div className="hero-kicker"><span className="kicker-pulse" /> A NEW KIND OF AUCTION HOUSE</div>
            <h1>Great finds.<br /><span>Better timing.</span></h1>
            <p>Discover things worth keeping, meet the people who love them, and make your next bid with a little more insight.</p>
            <div className="hero-actions">
              <button className="button button-primary hero-cta" type="button" onClick={scrollToLots}>Explore live lots <ArrowRight size={17} /></button>
              <a className="text-link" href="#how-it-works">How BidNova works <ArrowDown size={15} /></a>
            </div>
            <div className="hero-trust-row"><span className="trust-icon"><ShieldCheck size={16} /></span><span>Secure bidding</span><span className="trust-separator">·</span><span>Built for collectors</span></div>
          </div>

          <button className="hero-feature-card" type="button" onClick={() => featuredAuction && setSelectedAuction(featuredAuction)} aria-label={featuredAuction ? `View featured lot ${featuredAuction.title}` : 'Featured lot'}>
            <div className="hero-feature-art">
              <div className="hero-art-glow" />
              <div className="hero-feature-meta"><span className="featured-lot-label"><Sparkles size={13} /> EDITOR’S PICK</span><span className="live-inline"><span /> LIVE NOW</span></div>
              <span className={`hero-feature-object art-${featuredAuction?.visual || 'other'}`}>{featuredAuction?.icon || '📷'}</span>
              <span className="hero-art-stamp">01 <i>/ 06</i></span>
            </div>
            <div className="hero-feature-info">
              <div className="hero-feature-title"><span className="eyebrow">{featuredAuction?.category || 'THE CURATED EDIT'}</span><h2>{featuredAuction?.title || 'Something exceptional is up for bid'}</h2></div>
              <div className="hero-feature-price"><span>CURRENT BID</span><strong>{featuredAuction ? money(featuredAuction.currentPrice) : 'Explore lots'}</strong></div>
              <div className="hero-feature-bottom"><span><Timer size={14} /> {featuredAuction ? timeRemaining(featuredAuction.endsAt, now) : 'New lots daily'}</span><span className="round-arrow"><ArrowRight size={17} /></span></div>
            </div>
          </button>
          <div className="hero-decoration hero-decoration-one" /><div className="hero-decoration hero-decoration-two" />
        </section>

        <section className="trust-strip page-width" aria-label="BidNova features">
          <div className="trust-strip-item"><span className="strip-icon strip-icon-purple"><Radio size={17} /></span><div><strong>Live, down to the second</strong><span>Real-time bids from every bidder</span></div></div>
          <div className="trust-strip-divider" />
          <div className="trust-strip-item"><span className="strip-icon strip-icon-orange"><ShieldCheck size={17} /></span><div><strong>Secure by design</strong><span>Protected accounts and sessions</span></div></div>
          <div className="trust-strip-divider" />
          <div className="trust-strip-item"><span className="strip-icon strip-icon-green"><Sparkles size={17} /></span><div><strong>Smarter signals</strong><span>Understand the pace of a lot</span></div></div>
        </section>

        <section className="market-section page-width" id="auctions">
          <div className="market-heading-row">
            <div className="market-heading-copy">
              <div className="section-eyebrow"><span className="section-eyebrow-dot" /> {watchlistOnly ? 'SAVED FOR LATER' : 'THE AUCTION FLOOR'}</div>
              <h2>{watchlistOnly ? 'Your watchlist' : 'Find your next great thing'}<span className="heading-period">.</span></h2>
              <p>{watchlistOnly ? 'The lots you’re keeping an eye on.' : 'Good objects, thoughtful sellers, and a little friendly competition.'}</p>
            </div>
            <div className="market-controls">
              <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setWatchlistOnly(false); }} placeholder="Search lots, makers, categories…" aria-label="Search auction lots" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={15} /></button>}</label>
              <label className="sort-select-wrap"><span className="sort-label">SORT</span><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort auctions"><option value="featured">Featured</option><option value="ending">Ending soon</option><option value="most-bids">Most bids</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="newest">Newest</option></select><ChevronDown size={14} /></label>
            </div>
          </div>

          <div className="category-row">
            <div className="category-scroll" role="tablist" aria-label="Auction categories">
              {CATEGORY_LIST.map((item) => <button key={item} className={`category-pill ${category === item ? 'category-active' : ''}`} type="button" role="tab" aria-selected={category === item} onClick={() => { setCategory(item); setWatchlistOnly(false); }}>{item === 'All lots' && <LayoutGrid size={14} />}{item}</button>)}
            </div>
            <span className="lot-count-label"><span className="lot-count-pulse" />{visibleAuctions.length} {visibleAuctions.length === 1 ? 'lot' : 'lots'} live</span>
          </div>

          {loading ? <div className="loading-row"><span className="loading-orbit" /><span>Opening the auction room…</span></div> : visibleAuctions.length > 0 ? (
            <div className="auction-grid">
              {visibleAuctions.map((auction) => <AuctionCard key={auction.id} auction={auction} now={now} onOpen={setSelectedAuction} onToggleWatch={toggleWatch} />)}
            </div>
          ) : (
            <div className="empty-market">
              <div className="empty-market-icon">{watchlistOnly ? <Heart size={21} /> : <Compass size={21} />}</div>
              <h3>{watchlistOnly ? 'Your watchlist is waiting.' : 'No lots found this time.'}</h3>
              <p>{watchlistOnly ? 'Tap the heart on any auction to save it here and keep track of the bidding.' : 'Try a different search or category. There are new finds around every corner.'}</p>
              <button className="button button-secondary" type="button" onClick={() => { setQuery(''); setCategory('All lots'); setWatchlistOnly(false); }}>Browse all lots <ArrowRight size={15} /></button>
            </div>
          )}
        </section>

        <section className="how-section page-width" id="how-it-works">
          <div className="how-heading"><div className="section-eyebrow"><span className="section-eyebrow-dot" /> A MORE THOUGHTFUL WAY TO BID</div><h2>Good things happen<br /><span>when you know the room.</span></h2><p>From the first watch to the final second, BidNova keeps the experience clear, connected and in your hands.</p></div>
          <div className="how-steps">
            <article className="how-step"><span className="step-number">01</span><div className="step-icon step-icon-lilac"><Search size={19} /></div><h3>Find your kind of thing</h3><p>Explore curated lots across art, design, watches, books and the unexpected.</p><span className="step-line" /></article>
            <article className="how-step"><span className="step-number">02</span><div className="step-icon step-icon-peach"><Heart size={19} /></div><h3>Follow what you love</h3><p>Save a lot, watch the timer and talk directly in its live auction room.</p><span className="step-line" /></article>
            <article className="how-step"><span className="step-number">03</span><div className="step-icon step-icon-mint"><Gavel size={19} /></div><h3>Bid with intention</h3><p>See activity signals, know the next minimum and set a limit that feels right.</p></article>
          </div>
        </section>

        <section className="seller-banner page-width">
          <div className="seller-banner-icon"><CircleDollarSign size={22} /></div>
          <div className="seller-banner-copy"><span className="eyebrow">HAVE SOMETHING SPECIAL?</span><h2>Give it a room of its own.</h2><p>List a lot in minutes and meet the people who’ll appreciate it.</p></div>
          <button className="button button-light" type="button" onClick={startListing}>Start a listing <ArrowRight size={16} /></button>
          <div className="banner-sparkle banner-sparkle-one">✳</div><div className="banner-sparkle banner-sparkle-two">✴</div>
        </section>
      </main>

      <footer className="site-footer page-width">
        <div className="footer-brand"><span className="brand-mark"><Gavel size={17} /></span><strong>bidnova<span className="brand-period">.</span></strong><span>Find your next great thing.</span></div>
        <div className="footer-note"><span><ShieldCheck size={14} /> Built for curious collectors</span><span>© {new Date().getFullYear()} BidNova · Demo marketplace</span></div>
      </footer>

      {selectedAuction && <AuctionModal auction={selectedAuction} user={user} socket={socket} now={now} onClose={() => setSelectedAuction(null)} onOpenAuth={openAuth} onToggleWatch={toggleWatch} onBid={placeBid} />}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={onAuthSuccess} />}
      {createOpen && <CreateAuctionModal onClose={() => setCreateOpen(false)} onCreated={onAuctionCreated} />}
      <Toast message={toastMessage} onClose={() => setToastMessage('')} />
    </div>
  );
}
