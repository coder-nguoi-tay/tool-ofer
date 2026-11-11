// FPS Counter Timer
    setInterval(() => {
      fpsBadge.textContent = `${fpsCount} FPS`;
      fpsCount = 0;
    }, 1000);
