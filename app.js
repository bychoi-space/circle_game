/**
 * Perfect Circle Drawing Accuracy Game
 * Fully self-contained, mobile-optimized, premium visuals, and synthesized audio.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const canvas = document.getElementById('game-canvas');
  const container = document.getElementById('canvas-container');
  const centerPoint = document.getElementById('center-point');
  const drawGuideText = document.getElementById('draw-guide-text');
  
  const bestScoreEl = document.getElementById('best-score');
  const lastScoreEl = document.getElementById('last-score');
  const realtimeScoreEl = document.getElementById('realtime-score');
  
  const resultOverlay = document.getElementById('result-overlay');
  const resultScoreEl = document.getElementById('result-score');
  const resultGradeEl = document.getElementById('result-grade');
  const detailCenterAccEl = document.getElementById('detail-center-acc');
  const detailRadiusDevEl = document.getElementById('detail-radius-dev');
  const detailCloseAccEl = document.getElementById('detail-close-acc');
  const resultCommentEl = document.getElementById('result-comment');
  
  const progressRingBar = document.getElementById('progress-ring-bar');
  
  const soundToggleBtn = document.getElementById('sound-toggle');
  const infoBtn = document.getElementById('info-btn');
  const infoOverlay = document.getElementById('info-overlay');
  const closeInfoBtn = document.getElementById('close-info-btn');
  const closeResultBtn = document.getElementById('close-result-btn');
  const resetCanvasBtn = document.getElementById('reset-canvas-btn');
  const guideCircleToggle = document.getElementById('guide-circle-toggle');
  const historyList = document.getElementById('history-list');
  const clearHistoryBtn = document.getElementById('clear-history-btn');

  const soundOnIcon = soundToggleBtn.querySelector('.sound-on-icon');
  const soundOffIcon = soundToggleBtn.querySelector('.sound-off-icon');

  // Canvas context
  const ctx = canvas.getContext('2d');

  // State Variables
  let isDrawing = false;
  let points = [];
  let bestScore = parseFloat(localStorage.getItem('perfect_circle_best') || '0.0');
  let soundEnabled = localStorage.getItem('perfect_circle_sound') !== 'false';
  let centerCoord = { x: 0, y: 0 };
  let screenScale = 1;
  let lastResult = null;
  let scoreHistory = JSON.parse(localStorage.getItem('perfect_circle_history') || '[]');

  // Audio Context (Lazy Initialized)
  let audioCtx = null;

  // Initialize display scores
  bestScoreEl.textContent = `${bestScore.toFixed(1)}%`;
  updateSoundIcon();
  renderHistory();

  // Render score list
  function renderHistory() {
    historyList.innerHTML = '';
    if (scoreHistory.length === 0) {
      historyList.innerHTML = '<li class="empty-history">아직 시도한 기록이 없습니다.</li>';
      return;
    }
    
    scoreHistory.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML = `
        <div class="history-item-left">
          <span class="history-num">#${scoreHistory.length - index}</span>
          <span class="history-score">${item.score.toFixed(1)}%</span>
        </div>
        <div class="history-item-right">
          <span class="history-grade-badge ${item.grade.toLowerCase()}">${item.grade}</span>
          <span class="history-time">${item.time}</span>
        </div>
      `;
      historyList.appendChild(li);
    });
  }

  function addScoreToHistory(score, grade) {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    // Add to beginning of array
    scoreHistory.unshift({ score, grade, time: timeStr });
    
    // Keep max 10 items
    if (scoreHistory.length > 10) {
      scoreHistory.pop();
    }
    
    localStorage.setItem('perfect_circle_history', JSON.stringify(scoreHistory));
    renderHistory();
  }

  // Real-time score calculator while drawing
  function updateRealtimeScore() {
    if (points.length < 10) {
      realtimeScoreEl.textContent = '0.0%';
      realtimeScoreEl.className = 'realtime-score bad';
      return;
    }

    // 1. Centroid
    let sumX = 0, sumY = 0;
    points.forEach(p => {
      sumX += p.x;
      sumY += p.y;
    });
    const centroidX = sumX / points.length;
    const centroidY = sumY / points.length;

    // 2. Avg Radius & Radii
    let sumRadius = 0;
    const radii = points.map(p => {
      const r = Math.hypot(p.x - centroidX, p.y - centroidY);
      sumRadius += r;
      return r;
    });
    const avgRadius = sumRadius / points.length;

    if (avgRadius < 5) return;

    // 3. Radius consistency (Circular deviation)
    let sumSquaredDeviation = 0;
    radii.forEach(r => {
      sumSquaredDeviation += Math.pow(r - avgRadius, 2);
    });
    const stdDevRadius = Math.sqrt(sumSquaredDeviation / points.length);
    const radiusScore = Math.max(0, 100 - (stdDevRadius / avgRadius) * 260);

    // 4. Center Precision (Target center vs centroid)
    const targetCenterX = centerCoord.x;
    const targetCenterY = centerCoord.y;
    const centerDist = Math.hypot(centroidX - targetCenterX, centroidY - targetCenterY);
    const centerScore = Math.max(0, 100 - (centerDist / avgRadius) * 120);

    // Blended real-time score (70% shape consistency, 30% center precision)
    let runningScore = (radiusScore * 0.7) + (centerScore * 0.3);
    runningScore = Math.max(0, Math.min(100, runningScore));

    realtimeScoreEl.textContent = `${runningScore.toFixed(1)}%`;

    // Apply color indicators
    realtimeScoreEl.className = 'realtime-score';
    if (runningScore >= 90) {
      realtimeScoreEl.classList.add('good');
    } else if (runningScore >= 70) {
      realtimeScoreEl.classList.add('warn');
    } else {
      realtimeScoreEl.classList.add('bad');
    }
  }

  // Setup Canvas Resolution
  function resizeCanvas() {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Set actual canvas size adjusted for device pixel ratio
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    // Scale context to match DPR
    ctx.scale(dpr, dpr);
    
    // Store logical center coordinates
    centerCoord.x = rect.width / 2;
    centerCoord.y = rect.height / 2;
    
    // Reset point helper
    screenScale = rect.width / 400; // normalize metrics
    
    drawInitialState();
  }

  // Draw target center point & initial guide helper
  function drawInitialState() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (guideCircleToggle.checked && !isDrawing && !lastResult) {
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.22)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      // Draw a faint guide circle of radius 100 normalized by scale
      ctx.arc(centerCoord.x, centerCoord.y, 100 * screenScale, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Handle resizing
  window.addEventListener('resize', resizeCanvas);
  // Initial resize
  setTimeout(resizeCanvas, 100);

  // Sound Synthesizer Functions
  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  function playSound(type) {
    if (!soundEnabled) return;
    initAudio();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'draw') {
      // Small tick sound when starting to draw
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'success') {
      // Triumphant sound
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554, now + 0.1);
      osc.frequency.setValueAtTime(659, now + 0.2);
      osc.frequency.setValueAtTime(880, now + 0.3);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.4);
      gain.gain.linearRampToValueAtTime(0, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (type === 'fail') {
      // Descending buzz
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.3);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  }

  // Draw functions
  function getCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function startDrawing(e) {
    e.preventDefault();
    isDrawing = true;
    points = [];
    
    // Hide guide text
    drawGuideText.classList.add('hidden');
    
    // Clean canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const coord = getCoordinates(e);
    points.push(coord);
    
    // Show realtime score element
    realtimeScoreEl.textContent = '0.0%';
    realtimeScoreEl.className = 'realtime-score bad';
    realtimeScoreEl.classList.remove('hidden');
    
    playSound('draw');
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    
    const coord = getCoordinates(e);
    
    // Filter out redundant points or points that are too close
    const lastPoint = points[points.length - 1];
    if (lastPoint) {
      const dist = Math.hypot(coord.x - lastPoint.x, coord.y - lastPoint.y);
      if (dist < 2) return;
    }
    
    points.push(coord);
    
    // Draw current path
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Path glow styling
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0, 242, 254, 0.6)';
    
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    // Update real-time score display
    updateRealtimeScore();
  }

  function endDrawing(e) {
    if (!isDrawing) return;
    isDrawing = false;
    e.preventDefault();

    if (points.length < 15) {
      // Hide realtime score and reset
      realtimeScoreEl.classList.add('hidden');
      // Too few points
      alert('원을 더 크고 완전하게 그려보세요!');
      drawGuideText.classList.remove('hidden');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    realtimeScoreEl.classList.add('hidden');
    calculateScore();
  }

  // Accuracy and Circle calculation logic
  function calculateScore() {
    // 1. Calculate centroid of drawn points
    let sumX = 0, sumY = 0;
    points.forEach(p => {
      sumX += p.x;
      sumY += p.y;
    });
    const centroidX = sumX / points.length;
    const centroidY = sumY / points.length;

    // 2. Calculate average radius and distances to centroid
    let sumRadius = 0;
    const radii = points.map(p => {
      const r = Math.hypot(p.x - centroidX, p.y - centroidY);
      sumRadius += r;
      return r;
    });
    const avgRadius = sumRadius / points.length;

    // 3. Radius consistency (Circular deviation)
    let sumSquaredDeviation = 0;
    radii.forEach(r => {
      sumSquaredDeviation += Math.pow(r - avgRadius, 2);
    });
    const stdDevRadius = Math.sqrt(sumSquaredDeviation / points.length);
    // Score based on radius deviation (stdDev / avgRadius)
    // deviation of 0% -> 100 points, 35% or more deviation -> 0 points (more generous)
    const radiusScore = Math.max(0, 100 - (stdDevRadius / avgRadius) * 260);

    // 4. Center Precision (Target center vs centroid)
    const targetCenterX = centerCoord.x;
    const targetCenterY = centerCoord.y;
    const centerDist = Math.hypot(centroidX - targetCenterX, centroidY - targetCenterY);
    // Score based on centroid distance compared to circle's size (more generous)
    const centerScore = Math.max(0, 100 - (centerDist / avgRadius) * 120);

    // 5. Angular Span (Checking if it wraps full circle)
    // Find min/max angles to ensure 360 degree coverage
    const angles = points.map(p => Math.atan2(p.y - centroidY, p.x - centroidX));
    // Sort angles to calculate cumulative coverage
    const sortedAngles = [...angles].sort((a, b) => a - b);
    let maxGap = 0;
    for (let i = 0; i < sortedAngles.length; i++) {
      const nextAngle = sortedAngles[(i + 1) % sortedAngles.length];
      let gap = nextAngle - sortedAngles[i];
      if (gap < 0) gap += 2 * Math.PI;
      if (gap > maxGap) maxGap = gap;
    }
    // If the largest gap is small, coverage is complete. (more generous penalty)
    const coverageScore = Math.max(0, 100 - (maxGap / (Math.PI / 2)) * 35);

    // 6. Closure Acc (Start point vs End point distance)
    const startPoint = points[0];
    const endPoint = points[points.length - 1];
    const startEndDist = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
    const closureScore = Math.max(0, 100 - (startEndDist / avgRadius) * 120);

    // Final weighted score
    let finalScore = (radiusScore * 0.5) + (centerScore * 0.3) + (closureScore * 0.2);
    // Multiply by coverage ratio to prevent drawing semi-circles
    finalScore = finalScore * (coverageScore / 100);
    
    // Cap score between 0 and 100
    finalScore = Math.max(0, Math.min(100, finalScore));

    // UI Updates
    showResults(finalScore, centerScore, radiusScore, closureScore, centroidX, centroidY, avgRadius);
  }

  function showResults(score, centerScore, radiusScore, closureScore, cx, cy, r) {
    // Save last result state
    lastResult = { cx, cy, r };
    
    // Save last score
    lastScoreEl.textContent = `${score.toFixed(1)}%`;

    // Save best score if beaten
    if (score > bestScore) {
      bestScore = score;
      bestScoreEl.textContent = `${score.toFixed(1)}%`;
      localStorage.setItem('perfect_circle_best', score.toString());
      triggerConfetti();
      playSound('success');
    } else {
      if (score > 60) {
        playSound('success');
      } else {
        playSound('fail');
      }
    }

    // Determine Grade and Comments
    let grade = 'F';
    let comment = '이게 원인가요? 더 노력해 보세요!';
    if (score >= 98) {
      grade = 'SSS';
      comment = '인간의 영역을 넘어섰습니다! 완벽 그 자체!';
    } else if (score >= 95) {
      grade = 'SS';
      comment = '소름 돋을 정도로 완벽한 신의 원형도!';
    } else if (score >= 90) {
      grade = 'S';
      comment = '경이적인 정확도입니다! 뛰어난 손감각이네요.';
    } else if (score >= 80) {
      grade = 'A';
      comment = '정말 훌륭한 원입니다! 조금만 더 세밀하게 그려보세요.';
    } else if (score >= 70) {
      grade = 'B';
      comment = '나쁘지 않은 대칭이네요. 중심을 더 신경써 보세요.';
    } else if (score >= 50) {
      grade = 'C';
      comment = '일그러진 모양입니다. 원의 궤도를 천천히 따라가 보세요.';
    }

    // Save score history
    addScoreToHistory(score, grade);

    // Update Result Modal Elements
    resultScoreEl.textContent = `${score.toFixed(1)}%`;
    resultGradeEl.textContent = grade;
    detailCenterAccEl.textContent = `${centerScore.toFixed(1)}%`;
    detailRadiusDevEl.textContent = `${(100 - (100 - radiusScore)/4).toFixed(1)}%`; // Normalized readability
    detailCloseAccEl.textContent = `${closureScore.toFixed(1)}%`;
    resultCommentEl.textContent = comment;

    // Draw reference ideal circle overlay on canvas
    drawReferenceCircles(cx, cy, r);

    // Animate radial progress ring
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    progressRingBar.style.strokeDasharray = `${circumference} ${circumference}`;
    
    // Reset offset first to trigger transition
    progressRingBar.style.strokeDashoffset = circumference.toString();
    setTimeout(() => {
      progressRingBar.style.strokeDashoffset = offset.toString();
    }, 100);

    // Show overlay
    resultOverlay.classList.remove('hidden');
  }

  function drawReferenceCircles(cx, cy, r) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw User Path in muted blue-grey for light mode
    ctx.strokeStyle = 'rgba(0, 180, 216, 0.6)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    // 2. Draw Ideal Circle (Calculated Centroid & Avg Radius)
    if (guideCircleToggle.checked) {
      ctx.strokeStyle = '#00c853'; // success green
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.shadowBlur = 0; // disabled glow shadow for light mode clarity
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]); // Reset
    }

    // 3. Draw Target Center reference lines
    ctx.strokeStyle = 'rgba(255, 0, 127, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(centerCoord.x, centerCoord.y, r, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // Reset/Clear canvas for new try
  function resetCanvas() {
    points = [];
    isDrawing = false;
    lastResult = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawInitialState();
    drawGuideText.classList.remove('hidden');
  }

  // Sound Config Toggle
  function updateSoundIcon() {
    if (soundEnabled) {
      soundOnIcon.classList.remove('hidden');
      soundOffIcon.classList.add('hidden');
    } else {
      soundOnIcon.classList.add('hidden');
      soundOffIcon.classList.remove('hidden');
    }
  }

  soundToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('perfect_circle_sound', soundEnabled.toString());
    updateSoundIcon();
  });

  // Modal actions
  infoBtn.addEventListener('click', () => {
    infoOverlay.classList.remove('hidden');
  });

  closeInfoBtn.addEventListener('click', () => {
    infoOverlay.classList.add('hidden');
  });

  closeResultBtn.addEventListener('click', () => {
    resultOverlay.classList.add('hidden');
    resetCanvas();
  });

  resetCanvasBtn.addEventListener('click', () => {
    resetCanvas();
  });

  clearHistoryBtn.addEventListener('click', () => {
    if (confirm('모든 기록을 삭제하시겠습니까?')) {
      scoreHistory = [];
      localStorage.removeItem('perfect_circle_history');
      renderHistory();
    }
  });

  // Re-draw when guide circle toggle state changes
  guideCircleToggle.addEventListener('change', () => {
    if (lastResult) {
      drawReferenceCircles(lastResult.cx, lastResult.cy, lastResult.r);
    } else {
      drawInitialState();
    }
  });

  // Confetti Particle Effect (Self-contained simple confetti canvas logic)
  function triggerConfetti() {
    const canvasConfetti = document.createElement('canvas');
    canvasConfetti.style.position = 'absolute';
    canvasConfetti.style.top = '0';
    canvasConfetti.style.left = '0';
    canvasConfetti.style.width = '100%';
    canvasConfetti.style.height = '100%';
    canvasConfetti.style.pointerEvents = 'none';
    canvasConfetti.style.zIndex = '999';
    document.body.appendChild(canvasConfetti);

    const cCtx = canvasConfetti.getContext('2d');
    canvasConfetti.width = window.innerWidth;
    canvasConfetti.height = window.innerHeight;

    const colors = ['#00f2fe', '#4facfe', '#ff007f', '#00e676', '#ffd600'];
    const particles = [];

    for (let i = 0; i < 60; i++) {
      particles.push({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 6 + 4,
        speedX: (Math.random() - 0.5) * 15,
        speedY: (Math.random() - 0.5) * 15 - 5,
        gravity: 0.3,
        life: 1.0,
        decay: Math.random() * 0.02 + 0.015
      });
    }

    function animate() {
      cCtx.clearRect(0, 0, canvasConfetti.width, canvasConfetti.height);
      let alive = false;

      particles.forEach(p => {
        if (p.life > 0) {
          p.x += p.speedX;
          p.y += p.speedY;
          p.speedY += p.gravity;
          p.life -= p.decay;
          
          cCtx.fillStyle = p.color;
          cCtx.globalAlpha = p.life;
          cCtx.beginPath();
          cCtx.arc(p.x, p.y, p.size, 0, 2 * Math.PI);
          cCtx.fill();
          
          alive = true;
        }
      });

      if (alive) {
        requestAnimationFrame(animate);
      } else {
        canvasConfetti.remove();
      }
    }

    animate();
  }

  // Canvas Mouse & Touch Event Listeners
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  window.addEventListener('mouseup', endDrawing);

  canvas.addEventListener('touchstart', startDrawing, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  window.addEventListener('touchend', endDrawing, { passive: false });
});
