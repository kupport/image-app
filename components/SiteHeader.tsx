'use client';

import { useState } from 'react';
import { BagIcon, HeartIcon, SearchIcon, UserIcon } from './Icons';

const NAV_ITEMS = ['Women', 'Men', 'Kids', 'Home & Design', 'Beauty', 'Try-On', 'Gifting', 'Brands', 'Stores', 'Events'];

export default function SiteHeader() {
  const [showInfo, setShowInfo] = useState(true);

  return (
    <>
      <div className="top-strip"><u>Free</u> AI virtual try-on: upload &amp; generate now!</div>

      <header className="header">
        <div className="header-left">
          <SearchIcon />
          <span className="header-search">What are you looking for?</span>
        </div>
        <a className="wordmark" href="#">ATELIER</a>
        <div className="header-right">
          <span className="discover">Discover <span className="discover-badge">Try-On Studio</span></span>
          <UserIcon />
          <HeartIcon />
          <BagIcon />
          <span className="lang"><strong>EN</strong><span className="lang-sep" />IT</span>
        </div>
      </header>

      <nav className="nav" aria-label="Categories">
        {NAV_ITEMS.map((item) => (
          <a key={item} href="#" className={item === 'Try-On' ? 'accent' : undefined}>{item}</a>
        ))}
      </nav>

      {showInfo && (
        <div className="info-bar">
          <span><u>Upload</u> a person &amp; a garment to generate your look.</span>
          <button className="info-close" aria-label="Close" onClick={() => setShowInfo(false)}>&times;</button>
        </div>
      )}
    </>
  );
}
