export function makeAuctionView(auction, database, userId = null) {
  const auctionBids = database.bids
    .filter((bid) => bid.auctionId === auction.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const highestBid = auctionBids.reduce((highest, bid) => (!highest || bid.amount > highest.amount ? bid : highest), null);
  const isWatched = userId
    ? database.watchlists.some((entry) => entry.userId === userId && entry.auctionId === auction.id)
    : false;
  const isOver = auction.status === 'ended' || new Date(auction.endsAt).getTime() <= Date.now();

  return {
    ...auction,
    status: isOver ? 'ended' : 'active',
    currentPrice: Math.max(auction.currentPrice || 0, highestBid?.amount || 0),
    bidCount: auctionBids.length,
    highBidder: highestBid ? { name: highestBid.userName, userId: highestBid.userId } : null,
    isWatched,
    isSeller: Boolean(userId && auction.sellerId === userId),
  };
}

export function sortAuctions(auctions, sort) {
  const sorted = [...auctions];
  switch (sort) {
    case 'ending':
      return sorted.sort((a, b) => new Date(a.endsAt) - new Date(b.endsAt));
    case 'price-low':
      return sorted.sort((a, b) => a.currentPrice - b.currentPrice);
    case 'price-high':
      return sorted.sort((a, b) => b.currentPrice - a.currentPrice);
    case 'most-bids':
      return sorted.sort((a, b) => b.bidCount - a.bidCount);
    case 'newest':
      return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    default:
      return sorted.sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || new Date(a.endsAt) - new Date(b.endsAt));
  }
}
