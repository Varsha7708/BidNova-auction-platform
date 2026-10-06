import { ArrowUpRight, Heart, Radio, Timer } from 'lucide-react';
import { money, timeRemaining } from '../lib/api';

export default function AuctionCard({ auction, now, onOpen, onToggleWatch }) {
  const ended = auction.status === 'ended';

  return (
    <article className="auction-card" onClick={() => onOpen(auction)}>
      <div className={`auction-art art-${auction.visual || 'other'}`}>
        <div className="art-grain" />
        <div className="art-orbit art-orbit-one" />
        <div className="art-orbit art-orbit-two" />
        <div className="art-topline">
          <span className={`live-tag ${ended ? 'ended-tag' : ''}`}>
            {ended ? <Timer size={12} /> : <Radio size={12} />}
            {ended ? 'CLOSED' : 'LIVE AUCTION'}
          </span>
          <button
            className={`watch-button ${auction.isWatched ? 'is-watched' : ''}`}
            type="button"
            title={auction.isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
            aria-label={auction.isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
            onClick={(event) => {
              event.stopPropagation();
              onToggleWatch(auction);
            }}
          >
            <Heart size={17} fill={auction.isWatched ? 'currentColor' : 'none'} />
          </button>
        </div>
        {auction.featured && <span className="art-featured">CURATOR’S PICK</span>}
        <div className="art-object" aria-hidden="true">{auction.icon || '✨'}</div>
        <span className="art-caption">{auction.category?.toUpperCase()}</span>
      </div>

      <div className="auction-card-body">
        <div className="card-category-row">
          <span className="card-category">{auction.category}</span>
          <span className="card-bids">{auction.bidCount || 0} bids</span>
        </div>
        <h3>{auction.title}</h3>
        <p className="seller-line">Offered by <span>{auction.sellerName}</span></p>

        <div className="card-price-row">
          <div>
            <span className="micro-label">CURRENT BID</span>
            <strong>{money(auction.currentPrice)}</strong>
          </div>
          <div className="card-timer">
            <Timer size={14} />
            <span>{timeRemaining(auction.endsAt, now)}</span>
          </div>
        </div>

        <button className="card-open-button" type="button" onClick={(event) => { event.stopPropagation(); onOpen(auction); }}>
          View lot <ArrowUpRight size={16} />
        </button>
      </div>
    </article>
  );
}
