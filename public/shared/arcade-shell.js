(() => {
  'use strict';
  const match=location.pathname.match(/^\/games\/(tempo-rush|key-battle|neon-relay)(?:\/|$)/);
  if(match){try{localStorage.setItem('litejam-arcade:last-played',match[1]);}catch{}}
  // The pixel wordmark is an Arcade variant; the supplied original is retained
  // in the asset folder for brand provenance and future production handoff.
  document.querySelectorAll('.arcade-brand-logo').forEach(img=>{img.src='/assets/brand/litejam-pixel.svg';});
  window.addEventListener('pagehide',()=>{document.querySelectorAll('audio,video').forEach(media=>media.pause());});
})();
