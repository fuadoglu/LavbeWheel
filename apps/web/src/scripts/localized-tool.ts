if (document.querySelector('#bottle-setup')) {
  await import('./bottle');
} else if (document.querySelector('#game-setup')) {
  await import('./games');
}

export {};
