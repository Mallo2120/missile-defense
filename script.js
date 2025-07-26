(() => {
  // Grab elements
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const healthEl = document.getElementById('health');
  const gameOverOverlay = document.getElementById('gameOverOverlay');
  const finalScoreEl = document.getElementById('finalScore');
  const restartButton = document.getElementById('restartButton');

  let missiles = [];
  let lastSpawnTime = 0;
  let spawnInterval = 2000; // ms between spawns; decreases over time
  let spawnDecay = 0.995; // factor to decrease spawnInterval each spawn
  let lastTimestamp = 0;
  let score = 0;
  let health = 5;
  let gameOver = false;
  let starField = [];
  // Explosion effects array. Each entry will store properties of
  // an explosion such as position, current radius, maximum radius,
  // and opacity. Explosions expand and fade out over a short
  // duration.
  let explosions = [];

  /**
   * Spawn an explosion effect at the specified location. The initial
   * radius is zero and it expands to a maximum radius over 0.3 seconds
   * while fading out. The scale of the explosion can be tuned via
   * maxRadius.
   *
   * @param {number} x - x-coordinate of the explosion center in canvas
   * coordinate space (CSS pixels).
   * @param {number} y - y-coordinate of the explosion center in canvas
   * coordinate space (CSS pixels).
   * @param {number} baseRadius - base radius of the originating missile to
   * determine explosion size. If not provided, a default value is used.
   */
  function createExplosion(x, y, baseRadius = 20) {
    const explosion = {
      x,
      y,
      radius: 0,
      maxRadius: baseRadius * 3.0,
      alpha: 1.0,
      duration: 800, // milliseconds (lengthen duration for visibility)
      elapsed: 0
    };
    explosions.push(explosion);
  }

  // Create a single AudioContext for sound effects. Using one shared
  // context is more efficient and avoids concurrent contexts on
  // repeated clicks. Some browsers (especially mobile) require
  // AudioContext to be created in response to a user gesture; this
  // context will be instantiated lazily on the first call to
  // playExplosionSound().
  let audioCtx = null;

  /**
   * Play a simple explosion-like sound effect. This uses the
   * Web Audio API to synthesise a short burst that ramps down
   * quickly. Because downloading external audio resources can be
   * unreliable or require user authentication, this synthesised
   * effect provides audible feedback without loading any files.
   */
  function playExplosionSound() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Create an oscillator and gain node for the effect.
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.type = 'square';
    // Start at a relatively high frequency and exponentially ramp down
    // to simulate an explosion decay.
    const now = audioCtx.currentTime;
    oscillator.frequency.setValueAtTime(300, now);
    oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.3);
    // Control the volume envelope; ramp down quickly for a short pop.
    gainNode.gain.setValueAtTime(0.8, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.3);
  }

  // Generate star positions (percentage values so they scale with canvas)
  function generateStars(count) {
    starField = [];
    for (let i = 0; i < count; i++) {
      starField.push({
        x: Math.random(),
        y: Math.random(),
        brightness: 0.5 + Math.random() * 0.5,
        size: 0.5 + Math.random() * 1.5
      });
    }
  }

  // Missile constructor
  function createMissile() {
    const radius = 15 + Math.random() * 10;
    const x = radius + Math.random() * (canvas.clientWidth - radius * 2);
    const speed = 40 + Math.random() * 30 + score * 1.0; // increase speed based on score
    missiles.push({ x, y: -radius, radius, speed });
  }

  // Resize the canvas and re-generate stars
  function resizeCanvas() {
    // Use a one‑to‑one pixel mapping for the canvas.  High DPI
    // displays might render the game slightly less sharp, but it
    // greatly simplifies hit detection because CSS and canvas
    // coordinates are identical.  Avoid scaling by device pixel ratio.
    const { innerWidth: width, innerHeight: height } = window;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width = width;
    canvas.height = height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // regenerate stars for new canvas size
    generateStars(100);
  }

  // Draw star field background
  function drawStars() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
    for (const star of starField) {
      const x = star.x * canvas.clientWidth;
      const y = star.y * canvas.clientHeight;
      ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
      ctx.beginPath();
      ctx.arc(x, y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw Earth at bottom with a more detailed look.  The Earth is drawn
  // as a semi‑circle using a radial gradient to suggest curvature
  // and several green shapes to represent simplified continents.
  function drawEarth() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    // Determine Earth radius relative to the smaller canvas dimension.  A
    // larger multiplier makes the Earth appear bigger on tall screens.
    const earthRadius = Math.min(width, height) * 0.4;
    // Center horizontally; vertically position the centre below the bottom
    // of the canvas so only the top half is visible.
    const centerX = width / 2;
    const centerY = height + earthRadius * 0.5;
    // Create a radial gradient: lighter near the top (sunlit) fading to
    // darker blue toward the bottom of the planet.
    const grad = ctx.createRadialGradient(
      centerX,
      centerY - earthRadius * 0.4,
      earthRadius * 0.1,
      centerX,
      centerY,
      earthRadius
    );
    grad.addColorStop(0, '#2e8bc0'); // light blue highlight
    grad.addColorStop(1, '#063c77'); // dark blue shadow
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, earthRadius, Math.PI, Math.PI * 2);
    ctx.fill();
    // Draw continents as simple polygon shapes.  Coordinates are
    // relative to the Earth radius; positive y values move up (toward
    // the top of the visible hemisphere).  These shapes are loosely
    // inspired by real continents but kept abstract.
    const continents = [
      // Rough representation of the Americas
      [
        [-0.3, -0.15],
        [-0.1, 0.1],
        [0.05, 0.0],
        [-0.05, -0.25],
        [-0.25, -0.3]
      ],
      // Rough representation of Eurasia/Africa
      [
        [0.05, 0.05],
        [0.25, 0.2],
        [0.35, 0.15],
        [0.3, -0.05],
        [0.1, -0.1],
        [0.0, -0.05]
      ]
    ];
    ctx.fillStyle = '#159447';
    continents.forEach(shape => {
      ctx.beginPath();
      shape.forEach((pt, idx) => {
        // Convert relative coordinates into canvas space.  The y
        // coordinate uses a negative multiplier because the y axis
        // increases downward in canvas.
        const px = centerX + pt[0] * earthRadius;
        const py = centerY - earthRadius + pt[1] * earthRadius;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
    });
  }

  // Draw a missile at its current position
  function drawMissile(missile) {
    ctx.save();
    ctx.translate(missile.x, missile.y);
    // draw body
    ctx.fillStyle = '#555';
    const bodyWidth = missile.radius * 0.4;
    const bodyHeight = missile.radius * 1.6;
    ctx.fillRect(-bodyWidth / 2, -bodyHeight / 2, bodyWidth, bodyHeight);
    // draw tip
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.moveTo(-bodyWidth / 2, -bodyHeight / 2);
    ctx.lineTo(bodyWidth / 2, -bodyHeight / 2);
    ctx.lineTo(0, -bodyHeight);
    ctx.closePath();
    ctx.fill();
    // draw fins
    ctx.fillStyle = '#888';
    const finHeight = bodyHeight * 0.3;
    const finWidth = bodyWidth * 0.8;
    ctx.beginPath();
    ctx.moveTo(-bodyWidth / 2, bodyHeight / 2);
    ctx.lineTo(-bodyWidth / 2 - finWidth, bodyHeight / 2 + finHeight);
    ctx.lineTo(-bodyWidth / 2, bodyHeight / 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bodyWidth / 2, bodyHeight / 2);
    ctx.lineTo(bodyWidth / 2 + finWidth, bodyHeight / 2 + finHeight);
    ctx.lineTo(bodyWidth / 2, bodyHeight / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * Determine whether a given point lies within the drawn shape of a missile.
   * This function mirrors the drawing logic used in drawMissile() to build
   * a path for the missile (body, tip and fins) and then uses
   * CanvasRenderingContext2D.isPointInPath() to test whether the point
   * intersects the path.  The coordinates px and py should be in
   * canvas space (the same coordinate system used for missile.x and
   * missile.y).
   *
   * @param {Object} m The missile object with x, y and radius properties.
   * @param {number} px The x-coordinate of the point to test in canvas
   * space.
   * @param {number} py The y-coordinate of the point to test in canvas
   * space.
   * @returns {boolean} True if the point lies within the missile shape.
   */
  function pointInMissile(m, px, py) {
    // Compute dimensions consistent with drawMissile()
    const bodyWidth = m.radius * 0.4;
    const bodyHeight = m.radius * 1.6;
    const finHeight = bodyHeight * 0.3;
    const finWidth = bodyWidth * 0.8;
    // Save context state and translate to missile centre
    ctx.save();
    ctx.translate(m.x, m.y);
    // Build the composite path for the missile
    ctx.beginPath();
    // Body rectangle
    ctx.rect(-bodyWidth / 2, -bodyHeight / 2, bodyWidth, bodyHeight);
    // Tip triangle
    ctx.moveTo(-bodyWidth / 2, -bodyHeight / 2);
    ctx.lineTo(bodyWidth / 2, -bodyHeight / 2);
    ctx.lineTo(0, -bodyHeight);
    ctx.closePath();
    // Left fin
    ctx.moveTo(-bodyWidth / 2, bodyHeight / 2);
    ctx.lineTo(-bodyWidth / 2 - finWidth, bodyHeight / 2 + finHeight);
    ctx.lineTo(-bodyWidth / 2, bodyHeight / 2 + finHeight);
    ctx.closePath();
    // Right fin
    ctx.moveTo(bodyWidth / 2, bodyHeight / 2);
    ctx.lineTo(bodyWidth / 2 + finWidth, bodyHeight / 2 + finHeight);
    ctx.lineTo(bodyWidth / 2, bodyHeight / 2 + finHeight);
    ctx.closePath();
    // Determine if the global point (px, py) is inside the path.  Because
    // we applied a translation, the current transformation matrix maps
    // world coordinates to the missile’s local coordinate space.  The
    // isPointInPath() call automatically applies this transform when
    // performing the test.
    const hit = ctx.isPointInPath(px, py);
    // Restore context to undo the translation
    ctx.restore();
    return hit;
  }

  // Main game loop using requestAnimationFrame
  function gameLoop(timestamp) {
    if (gameOver) return;
    if (!lastTimestamp) lastTimestamp = timestamp;
    const delta = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    // spawn missiles if enough time elapsed
    if (timestamp - lastSpawnTime > spawnInterval) {
      createMissile();
      lastSpawnTime = timestamp;
      // gradually increase difficulty by reducing spawn interval
      spawnInterval *= spawnDecay;
      if (spawnInterval < 400) spawnInterval = 400; // cap spawn speed
    }
    // Update missile positions
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      m.y += (m.speed * delta) / 1000;
      // Check if missile hits Earth
      if (m.y - m.radius > canvas.clientHeight) {
        missiles.splice(i, 1);
        health--;
        updateHUD();
        if (health <= 0) {
          endGame();
          return;
        }
      }
    }
    // Draw scene
    drawStars();
    drawEarth();
    for (const m of missiles) {
      drawMissile(m);
    }

    // Update and draw explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
      const exp = explosions[i];
      // Advance explosion timer
      exp.elapsed += delta;
      const progress = Math.min(exp.elapsed / exp.duration, 1);
      // Calculate radius and alpha based on progress
      exp.radius = exp.maxRadius * progress;
      exp.alpha = 1 - progress;
      // Draw explosion using a radial gradient for a more vivid effect
      ctx.save();
      // Create radial gradient: bright center fading to transparent edges
      const gradient = ctx.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, exp.radius);
      // Inner color (bright yellow) scaled by alpha
      gradient.addColorStop(0, `rgba(255, 255, 200, ${0.8 * exp.alpha})`);
      // Mid color (orange)
      gradient.addColorStop(0.5, `rgba(255, 140, 0, ${0.5 * exp.alpha})`);
      // Outer edge fully transparent
      gradient.addColorStop(1, `rgba(255, 69, 0, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
      ctx.fill();
      // Draw a bright core to make the explosion stand out
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 255, 255, ${0.6 * exp.alpha})`;
      ctx.arc(exp.x, exp.y, exp.radius * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Remove explosion if its duration is over
      if (progress >= 1) {
        explosions.splice(i, 1);
      }
    }
    requestAnimationFrame(gameLoop);
  }

  // Update HUD
  function updateHUD() {
    scoreEl.textContent = `Score: ${score}`;
    healthEl.textContent = `Earth Health: ${health}`;
  }

  // Handle click/tap to destroy missiles
  function handlePointer(event) {
    if (gameOver) return;
    // Determine the pointer’s client coordinates (mouse or first touch).
    let clientX, clientY;
    if (event.touches && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }
    // Map client coordinates to canvas coordinate space.  We obtain
    // the bounding rect of the canvas and scale the client offset by
    // the ratio of canvas pixels to displayed size.  Because the
    // canvas is drawn at one CSS pixel per canvas pixel (see
    // resizeCanvas()), rect.width and canvas.width should be equal,
    // but performing this calculation makes the code robust to
    // potential CSS transforms.
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (clientX - rect.left) * scaleX;
    const py = (clientY - rect.top) * scaleY;
    // Simplified click handling: remove the missile closest to Earth
    // (the one with the largest y-coordinate) when the player clicks
    // anywhere on the canvas.  This ensures the game remains
    // responsive even if precise hit detection fails.  If no
    // missiles are present, do nothing.
    if (missiles.length > 0) {
      // Find missile with maximum y (closest to Earth)
      let targetIndex = 0;
      let maxY = missiles[0].y;
      for (let i = 1; i < missiles.length; i++) {
        if (missiles[i].y > maxY) {
          maxY = missiles[i].y;
          targetIndex = i;
        }
      }
      const removed = missiles[targetIndex];
      missiles.splice(targetIndex, 1);
      score++;
      updateHUD();
      createExplosion(removed.x, removed.y, removed.radius);
      playExplosionSound();
    }
  }

  // Game start
  function startGame() {
    missiles = [];
    explosions = [];
    lastSpawnTime = 0;
    spawnInterval = 2000;
    score = 0;
    health = 5;
    gameOver = false;
    lastTimestamp = 0;
    updateHUD();
    gameOverOverlay.classList.add('hidden');
    requestAnimationFrame(gameLoop);
  }

  // End game
  function endGame() {
    gameOver = true;
    finalScoreEl.textContent = score;
    gameOverOverlay.classList.remove('hidden');
  }

  // Restart button handler
  restartButton.addEventListener('click', startGame);
  // Canvas click/touch events
  canvas.addEventListener('click', handlePointer);
  canvas.addEventListener('touchstart', handlePointer);
  // Resize handler
  window.addEventListener('resize', resizeCanvas);
  // Initialize
  resizeCanvas();
  startGame();
})();