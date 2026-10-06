import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Check,
  CircleHelp,
  Clock3,
  Eye,
  EyeOff,
  Gavel,
  Heart,
  Loader2,
  MessageCircle,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react';
import { api, compactDate, money, timeRemaining } from '../lib/api';

function ModalFrame({ children, onClose, className = '' }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className={`modal-panel ${className}`} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}

export function AuthModal({ onClose, onSuccess }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload = { email, password, ...(mode === 'register' ? { name } : {}) };
      const result = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      onSuccess(result.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function useDemoAccount() {
    setMode('login');
    setEmail('demo@bidnova.in');
    setPassword('BidNova123!');
    setError('');
  }

  return (
    <ModalFrame onClose={onClose} className="auth-modal">
      <button className="modal-close" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button>
      <div className="auth-brand-mark"><Gavel size={20} /></div>
      <span className="eyebrow">A better way to bid</span>
      <h2>{mode === 'login' ? 'Welcome back.' : 'Join the room.'}</h2>
      <p className="modal-intro">{mode === 'login' ? 'Sign in to follow lots, place bids and talk with the community.' : 'Create your free collector account and find your next great thing.'}</p>

      <form className="stacked-form" onSubmit={submit}>
        {mode === 'register' && (
          <label className="field-label">Your name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Priya Nair" autoComplete="name" required minLength={2} maxLength={48} />
          </label>
        )}
        <label className="field-label">Email address
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" type="email" autoComplete="email" required />
        </label>
        <label className="field-label">Password
          <span className="password-input-wrap">
            <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'} type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : 1} />
            <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </span>
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button button-primary button-wide" type="submit" disabled={busy}>
          {busy ? <Loader2 className="spin" size={17} /> : mode === 'login' ? <ArrowRight size={17} /> : <Check size={17} />}
          {busy ? 'One moment…' : mode === 'login' ? 'Sign in securely' : 'Create account'}
        </button>
      </form>

      <div className="auth-switch">
        {mode === 'login' ? 'New to BidNova?' : 'Already a member?'}{' '}
        <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? 'Create an account' : 'Sign in'}
        </button>
      </div>
      <div className="demo-box">
        <div className="demo-box-icon"><BadgeCheck size={17} /></div>
        <div><strong>Just exploring?</strong><span>Try the preloaded demo collector account.</span></div>
        <button type="button" onClick={useDemoAccount}>Use demo</button>
      </div>
      <div className="secure-note"><ShieldCheck size={14} /> Passwords are hashed; your session is held in a secure, HttpOnly cookie.</div>
    </ModalFrame>
  );
}

export function CreateAuctionModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Design');
  const [description, setDescription] = useState('');
  const [startingPrice, setStartingPrice] = useState('');
  const [minimumIncrement, setMinimumIncrement] = useState('500');
  const [durationHours, setDurationHours] = useState('24');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api('/api/auctions', {
        method: 'POST',
        body: JSON.stringify({ title, category, description, startingPrice: Number(startingPrice), minimumIncrement: Number(minimumIncrement), durationHours: Number(durationHours) }),
      });
      onCreated(result.auction);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalFrame onClose={onClose} className="create-modal">
      <div className="modal-heading-row">
        <div><span className="eyebrow">Your item, center stage</span><h2>List a new lot</h2></div>
        <button className="modal-close modal-close-inline" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button>
      </div>
      <p className="modal-intro">Give collectors the details they need to bid with confidence.</p>
      <form className="stacked-form create-form" onSubmit={submit}>
        <label className="field-label">Lot title
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What are you putting up for auction?" required minLength={4} maxLength={90} />
        </label>
        <div className="form-two-col">
          <label className="field-label">Category
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {['Art', 'Automobilia', 'Books', 'Cameras', 'Design', 'Watches', 'Other'].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="field-label">Auction duration
            <select value={durationHours} onChange={(event) => setDurationHours(event.target.value)}>
              <option value="6">6 hours</option><option value="12">12 hours</option><option value="24">24 hours</option><option value="48">2 days</option><option value="72">3 days</option><option value="168">7 days</option>
            </select>
          </label>
        </div>
        <label className="field-label">Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Condition, provenance, what makes it special…" required minLength={20} maxLength={1200} rows={4} />
        </label>
        <div className="form-two-col">
          <label className="field-label">Starting price <span className="field-hint">INR</span>
            <input value={startingPrice} onChange={(event) => setStartingPrice(event.target.value)} type="number" min="1" step="1" placeholder="e.g. 5000" required />
          </label>
          <label className="field-label">Minimum bid step <span className="field-hint">INR</span>
            <input value={minimumIncrement} onChange={(event) => setMinimumIncrement(event.target.value)} type="number" min="1" step="1" required />
          </label>
        </div>
        <div className="seller-note"><ShieldCheck size={17} /><span>Listings go live immediately. You can manage bids from your account.</span></div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button button-primary button-wide" type="submit" disabled={busy}>
          {busy ? <Loader2 className="spin" size={17} /> : <Gavel size={17} />}{busy ? 'Publishing lot…' : 'Publish auction'}
        </button>
      </form>
    </ModalFrame>
  );
}

export function AuctionModal({ auction, user, socket, now, onClose, onOpenAuth, onToggleWatch, onBid }) {
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [chatError, setChatError] = useState('');
  const [bidAmount, setBidAmount] = useState(String(auction.currentPrice + auction.minimumIncrement));
  const [bidError, setBidError] = useState('');
  const [bidBusy, setBidBusy] = useState(false);
  const [bidSuccess, setBidSuccess] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef(null);
  const ended = auction.status === 'ended' || new Date(auction.endsAt).getTime() <= now;
  const minimumBid = auction.currentPrice + auction.minimumIncrement;

  useEffect(() => {
    let active = true;
    setInsights(null);
    setInsightsLoading(true);
    api(`/api/auctions/${encodeURIComponent(auction.id)}/insights`)
      .then((result) => { if (active) setInsights(result.insights); })
      .catch(() => { if (active) setInsights(null); })
      .finally(() => { if (active) setInsightsLoading(false); });
    return () => { active = false; };
  }, [auction.id]);

  useEffect(() => {
    setBidAmount(String(auction.currentPrice + auction.minimumIncrement));
    setBidError('');
    setBidSuccess(false);
  }, [auction.id]);

  useEffect(() => {
    const nextMinimum = auction.currentPrice + auction.minimumIncrement;
    setBidAmount((value) => Number(value) < nextMinimum ? String(nextMinimum) : value);
  }, [auction.currentPrice, auction.minimumIncrement]);

  useEffect(() => {
    if (!user || !socket) {
      setMessages([]);
      return undefined;
    }
    let active = true;
    const receiveMessage = (message) => {
      if (message.auctionId !== auction.id) return;
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message].slice(-80));
    };
    socket.emit('auction:join', auction.id);
    socket.on('chat:new', receiveMessage);
    api(`/api/auctions/${encodeURIComponent(auction.id)}/messages`)
      .then((result) => { if (active) setMessages(result.messages); })
      .catch(() => { if (active) setMessages([]); });
    return () => {
      active = false;
      socket.emit('auction:leave', auction.id);
      socket.off('chat:new', receiveMessage);
    };
  }, [auction.id, socket, user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  async function submitBid(event) {
    event.preventDefault();
    setBidError('');
    setBidSuccess(false);
    if (!user) return onOpenAuth();
    if (auction.isSeller) return setBidError('You cannot bid on your own listing.');
    if (ended) return setBidError('This auction has ended.');
    if (Number(bidAmount) < minimumBid) return setBidError(`The next valid bid is ${money(minimumBid)}.`);
    setBidBusy(true);
    try {
      await onBid(auction.id, Number(bidAmount));
      setBidSuccess(true);
    } catch (error) {
      setBidError(error.message);
      if (error.minimumBid) setBidAmount(String(error.minimumBid));
    } finally {
      setBidBusy(false);
    }
  }

  function sendMessage(event) {
    event.preventDefault();
    const text = messageText.trim();
    if (!text) return;
    if (!user) return onOpenAuth();
    if (!socket?.connected) return setChatError('Reconnecting to the auction room… please try again.');
    setChatBusy(true);
    setChatError('');
    socket.emit('chat:send', { auctionId: auction.id, text }, (result) => {
      setChatBusy(false);
      if (!result?.ok) return setChatError(result?.error || 'Message could not be sent.');
      setMessageText('');
    });
  }

  return (
    <ModalFrame onClose={onClose} className="auction-modal">
      <button className="modal-close auction-close" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button>
      <div className="auction-detail-grid">
        <div className="auction-detail-main">
          <div className={`detail-art art-${auction.visual || 'other'}`}>
            <div className="art-grain" /><div className="art-orbit art-orbit-one" /><div className="art-orbit art-orbit-two" />
            <span className={`live-tag ${ended ? 'ended-tag' : ''}`}>{ended ? <Timer size={12} /> : <Radio size={12} />}{ended ? 'CLOSED' : 'LIVE AUCTION'}</span>
            <span className="detail-art-icon">{auction.icon || '✨'}</span>
            <span className="detail-art-caption">{auction.category?.toUpperCase()} · BIDNOVA LOT</span>
          </div>
          <div className="detail-title-row">
            <div><span className="eyebrow">{auction.category} · {auction.condition}</span><h2>{auction.title}</h2></div>
            <button className={`detail-watch ${auction.isWatched ? 'is-watched' : ''}`} type="button" onClick={() => onToggleWatch(auction)} aria-label="Toggle watchlist"><Heart fill={auction.isWatched ? 'currentColor' : 'none'} size={18} /></button>
          </div>
          <p className="detail-description">{auction.description}</p>
          <div className="detail-meta-grid">
            <div><span>SELLER</span><strong><UserRound size={14} />{auction.sellerName}</strong></div>
            <div><span>CONDITION</span><strong><BadgeCheck size={14} />{auction.condition}</strong></div>
            <div><span>ENDS IN</span><strong><Clock3 size={14} />{timeRemaining(auction.endsAt, now)}</strong></div>
          </div>

          <section className="insight-card" aria-label="Auction activity insight">
            <div className="insight-heading"><div className="insight-icon"><Sparkles size={17} /></div><div><span className="eyebrow">BIDNOVA SIGNAL</span><h3>Smart activity insight</h3></div><span className="signal-chip">{insightsLoading ? 'ANALYSING' : insights?.momentum || 'ACTIVITY'}</span></div>
            {insightsLoading ? (
              <div className="insight-loading"><Loader2 className="spin" size={16} /> Reading recent bidding activity…</div>
            ) : insights ? (
              <>
                <div className="signal-score-row"><span>Bid momentum</span><strong>{insights.score}<small>/100</small></strong></div>
                <div className="signal-meter"><span style={{ width: `${insights.score}%` }} /></div>
                <p className="insight-summary">{insights.summary}</p>
                <div className="insight-watch"><TrendingUp size={15} /><span>{insights.watchFor}</span></div>
                <div className="insight-foot"><Activity size={13} /> {insights.provider} · {insights.confidence} confidence</div>
                <p className="insight-disclaimer">{insights.disclaimer}</p>
              </>
            ) : <p className="insight-summary">Activity insight is temporarily unavailable. You can still follow the live bid and lot timer.</p>}
          </section>

          <section className="room-card">
            <div className="room-heading"><div className="room-icon"><MessageCircle size={18} /></div><div><h3>Auction room</h3><p>Questions and conversation, live.</p></div><span className="room-live"><span /> LIVE</span></div>
            {!user ? (
              <div className="chat-locked"><p>Sign in to read and join the collector conversation for this lot.</p><button type="button" onClick={onOpenAuth}>Sign in to join <ArrowRight size={15} /></button></div>
            ) : (
              <>
                <div className="chat-messages" aria-live="polite">
                  {messages.length === 0 ? <div className="chat-empty"><MessageCircle size={18} /><span>Be the first to start a thoughtful conversation.</span></div> : messages.map((message) => (
                    <div className={`chat-message ${message.userId === user.id ? 'own-message' : ''}`} key={message.id}>
                      <span className="chat-avatar">{(message.userName || '?').slice(0, 1).toUpperCase()}</span>
                      <div className="chat-bubble-wrap"><div className="chat-byline"><strong>{message.userName}{message.userId === user.id ? ' · you' : ''}</strong><time>{compactDate(message.createdAt)}</time></div><p>{message.text}</p></div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                {chatError && <div className="chat-error">{chatError}</div>}
                <form className="chat-compose" onSubmit={sendMessage}>
                  <input value={messageText} onChange={(event) => setMessageText(event.target.value)} maxLength={600} placeholder="Ask a question or say hello…" aria-label="Write a message" />
                  <button type="submit" disabled={chatBusy || !messageText.trim()} aria-label="Send message">{chatBusy ? <Loader2 className="spin" size={17} /> : <Send size={17} />}</button>
                </form>
              </>
            )}
          </section>
        </div>

        <aside className="bid-panel">
          <div className="bid-panel-top"><span className="eyebrow">CURRENT BID</span><button type="button" className={`bid-heart ${auction.isWatched ? 'is-watched' : ''}`} onClick={() => onToggleWatch(auction)} aria-label="Toggle watchlist"><Heart size={18} fill={auction.isWatched ? 'currentColor' : 'none'} /></button></div>
          <strong className="detail-price">{money(auction.currentPrice)}</strong>
          <div className="bid-panel-sub"><span>{auction.bidCount || 0} bids</span><span>·</span><span>Lot {auction.id.slice(-4).toUpperCase()}</span></div>
          <div className="bid-timer"><Timer size={16} /><div><span>TIME REMAINING</span><strong>{timeRemaining(auction.endsAt, now)}</strong></div></div>
          {auction.highBidder && <div className="high-bidder"><span className="high-bidder-avatar">{auction.highBidder.name.slice(0, 1)}</span><div><span>LEADING BIDDER</span><strong>{auction.highBidder.name}</strong></div><BadgeCheck size={16} /></div>}
          <div className="panel-divider" />
          {ended ? (
            <div className="ended-message"><Timer size={18} /><strong>This auction has closed</strong><span>Thanks for being part of the room.</span></div>
          ) : auction.isSeller ? (
            <div className="seller-own-lot"><CircleHelp size={19} /><strong>Your listing is live</strong><span>You can follow bids and join the auction room, but cannot bid on your own lot.</span></div>
          ) : (
            <form className="bid-form" onSubmit={submitBid}>
              <label className="field-label">Your bid <span className="field-hint">INR</span>
                <input value={bidAmount} onChange={(event) => { setBidAmount(event.target.value); setBidSuccess(false); }} type="number" min={minimumBid} step="1" required />
              </label>
              <div className="minimum-bid-note">Minimum next bid <strong>{money(minimumBid)}</strong></div>
              {bidError && <div className="form-error" role="alert">{bidError}</div>}
              {bidSuccess && <div className="bid-success"><Check size={15} /> Your bid is in. Good luck!</div>}
              <button className="button button-primary button-wide place-bid-button" type="submit" disabled={bidBusy}>
                {bidBusy ? <Loader2 className="spin" size={17} /> : <Gavel size={17} />}{bidBusy ? 'Placing bid…' : user ? 'Place bid' : 'Sign in to bid'}
              </button>
              <p className="secure-bid-note"><ShieldCheck size={13} /> Secure bidding · bids cannot be withdrawn</p>
            </form>
          )}
          <div className="panel-divider" />
          <div className="bid-guide"><div className="bid-guide-icon"><CircleHelp size={15} /></div><p>Choose a limit you are comfortable with. The activity signal is not a valuation.</p></div>
        </aside>
      </div>
    </ModalFrame>
  );
}

export function NotificationsPopover({ notifications, unreadCount, onClose, onRead, onSelect }) {
  return (
    <div className="notifications-popover">
      <div className="popover-heading"><div><span className="eyebrow">YOUR UPDATES</span><h3>Notifications</h3></div><button type="button" className="popover-close" onClick={onClose} aria-label="Close notifications"><X size={17} /></button></div>
      {notifications.length === 0 ? (
        <div className="notifications-empty"><div className="empty-notice-icon"><Radio size={19} /></div><strong>All quiet for now</strong><span>Bid updates and account activity will appear here.</span></div>
      ) : (
        <div className="notification-list">
          {notifications.slice(0, 8).map((notification) => (
            <button type="button" className={`notification-item ${notification.readAt ? '' : 'unread'}`} key={notification.id} onClick={() => onSelect(notification.auctionId)}>
              <span className={`notification-dot notification-${notification.type || 'default'}`} />
              <span className="notification-copy"><strong>{notification.title}</strong><span>{notification.body}</span><time>{compactDate(notification.createdAt)}</time></span>
            </button>
          ))}
        </div>
      )}
      {notifications.length > 0 && <button className="mark-read-button" type="button" onClick={onRead}>{unreadCount ? 'Mark all as read' : 'You’re all caught up'} <Check size={14} /></button>}
    </div>
  );
}

export function Toast({ message, onClose }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 4200);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);
  if (!message) return null;
  return <div className="toast-message" role="status"><span><Check size={16} /></span>{message}<button type="button" onClick={onClose} aria-label="Dismiss"><X size={15} /></button></div>;
}
