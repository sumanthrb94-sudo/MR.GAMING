/**
 * MR. GAMING x MR. SANDWICH LOUNGE (INDIA)
 * Exclusive Boutique Gaming Room: 1x PS5 Station + 1x Xbox Series X Station
 * Interactive Engine: WhatsApp Booking, Slot Booking Calculator in INR (₹),
 * FIFA Tournament System, Live FOMO Toasts & Futuristic UI FX
 */

// Global Configuration (MR. GAMING Lounge at MR. Sandwich: 1 PS5 + 1 Xbox Setup)
const LOUNGE_CONFIG = {
  brandName: "MR. GAMING (Located at MR. Sandwich)",
  whatsappNumber: "917337230311", // Indian franchise WhatsApp number (+91)
  currencySymbol: "₹",
  tournamentPrizePool: "₹25,000",
  tournamentEntryFee: 299,
  baseHourlyRatePS5: 199,
  monthlyPass6Hr: 799,
  baseHourlyRateXbox: 199,
  bothConsolesRate: 699, // Squad room: both consoles, up to 4 players, min 2 hrs
  totalConsoles: 2 // 1 PS5, 1 Xbox
};

// Sound FX Synth (Web Audio API - No external files required)
class SoundFX {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  playBleep(freq = 600, duration = 0.08, type = 'sine') {
    if (!this.enabled) return;
    try {
      this.init();
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  playClick() {
    this.playBleep(880, 0.04, 'triangle');
  }

  playSuccess() {
    this.playBleep(523.25, 0.08, 'sine');
    setTimeout(() => this.playBleep(659.25, 0.08, 'sine'), 60);
    setTimeout(() => this.playBleep(783.99, 0.12, 'sine'), 120);
  }
}

const sfx = new SoundFX();

// ==========================================
// 1. TOURNAMENT COUNTDOWN TIMER
// ==========================================
function initCountdown() {
  const now = new Date();
  const targetDate = new Date();
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
  targetDate.setDate(now.getDate() + daysUntilSunday);
  targetDate.setHours(12, 0, 0, 0);

  function update() {
    const current = new Date().getTime();
    const diff = targetDate.getTime() - current;

    if (diff <= 0) {
      document.getElementById('days').textContent = '00';
      document.getElementById('hours').textContent = '00';
      document.getElementById('minutes').textContent = '00';
      document.getElementById('seconds').textContent = '00';
      return;
    }

    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);

    const pad = (n) => String(n).padStart(2, '0');

    const dEl = document.getElementById('days');
    const hEl = document.getElementById('hours');
    const mEl = document.getElementById('minutes');
    const sEl = document.getElementById('seconds');

    if (dEl) dEl.textContent = pad(d);
    if (hEl) hEl.textContent = pad(h);
    if (mEl) mEl.textContent = pad(m);
    if (sEl) sEl.textContent = pad(s);
  }

  update();
  setInterval(update, 1000);
}

// ==========================================
// 2. LIVE SLOT & COMBO CALCULATOR (INR ₹ - 1 PS5 & 1 XBOX)
// ==========================================
const calculatorState = {
  consoleType: 'ps5',
  consoleName: 'PlayStation 5 Station (4K 120Hz)',
  baseRatePerHour: 199,
  durationHours: 2,
  players: 1,
  durationLabel: '2 Hours',
  sandwichCombo: 'none',
  sandwichPrice: 0,
  sandwichName: 'No Food Added',
  foodDiscountPercent: 10 // Console bookers get 10% off MR. Sandwich food & drinks
};

function initCalculator() {
  const consoleBtns = document.querySelectorAll('.calc-console-btn');
  const durationBtns = document.querySelectorAll('.calc-duration-btn');
  const foodBtns = document.querySelectorAll('.calc-food-btn');

  consoleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.playClick();
      consoleBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      calculatorState.consoleType = btn.dataset.console;
      calculatorState.consoleName = btn.dataset.name;
      calculatorState.baseRatePerHour = parseInt(btn.dataset.rate, 10);
      applyRoomRules();
      recalculatePrice();
    });
  });

  durationBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.playClick();
      durationBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      calculatorState.durationHours = parseInt(btn.dataset.hours, 10);
      calculatorState.durationLabel = btn.dataset.label;
      calculatorState.isMonthlyPass = btn.dataset.isPass === 'true';
      recalculatePrice();
    });
  });

  const playerBtns = document.querySelectorAll('.calc-players-btn');
  playerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.playClick();
      playerBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      calculatorState.players = parseInt(btn.dataset.players, 10);
      recalculatePrice();
    });
  });

  foodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.playClick();
      foodBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      calculatorState.sandwichCombo = btn.dataset.combo;
      calculatorState.sandwichPrice = parseInt(btn.dataset.price, 10);
      calculatorState.sandwichName = btn.dataset.name;
      recalculatePrice();
    });
  });

  const whatsappBookingBtn = document.getElementById('calc-whatsapp-book-btn');
  if (whatsappBookingBtn) {
    whatsappBookingBtn.addEventListener('click', () => {
      sfx.playSuccess();
      sendBookingToWhatsApp();
    });
  }

  recalculatePrice();
}

// Squad room: flat rate for up to 4 players, minimum 2 hours, monthly pass not valid
function applyRoomRules() {
  const isRoom = calculatorState.consoleType === 'both';
  const playersStep = document.getElementById('calc-players-step');
  if (playersStep) playersStep.style.display = isRoom ? 'none' : '';

  document.querySelectorAll('.calc-duration-btn').forEach(btn => {
    const blocked = isRoom && (btn.dataset.hours === '1' || btn.dataset.isPass === 'true');
    btn.disabled = blocked;
    btn.style.opacity = blocked ? '0.35' : '';
    if (blocked && btn.classList.contains('selected')) {
      btn.classList.remove('selected');
      const twoHr = document.querySelector('.calc-duration-btn[data-hours="2"]');
      twoHr.classList.add('selected');
      calculatorState.durationHours = 2;
      calculatorState.durationLabel = twoHr.dataset.label;
      calculatorState.isMonthlyPass = false;
    }
  });
}

function recalculatePrice() {
  // Single stations are priced per person; the room takeover is a flat room rate
  const isRoom = calculatorState.consoleType === 'both';
  const players = isRoom ? 1 : calculatorState.players;
  let gamingTotal = calculatorState.baseRatePerHour * calculatorState.durationHours * players;
  if (calculatorState.isMonthlyPass) {
    gamingTotal = 799 * players; // 6-Hour Monthly Pass, per person
  }
  const foodTotal = calculatorState.sandwichPrice;
  const subtotal = gamingTotal + foodTotal;
  const discountAmount = Math.round((foodTotal * calculatorState.foodDiscountPercent) / 100);
  const finalTotal = subtotal - discountAmount;

  // Update UI Elements
  const elConsole = document.getElementById('calc-summary-console');
  const elGamingPrice = document.getElementById('calc-summary-gaming-price');
  const elFood = document.getElementById('calc-summary-food');
  const elFoodPrice = document.getElementById('calc-summary-food-price');
  const elDiscount = document.getElementById('calc-summary-discount');
  const elTotal = document.getElementById('calc-summary-total');

  const playersText = isRoom ? '' : `, ${players} player${players > 1 ? 's' : ''}`;
  if (elConsole) elConsole.textContent = `${calculatorState.consoleName} (${calculatorState.durationHours} hr${calculatorState.durationHours > 1 ? 's' : ''}${playersText})`;
  if (elGamingPrice) elGamingPrice.textContent = `₹${gamingTotal}`;
  if (elFood) elFood.textContent = calculatorState.sandwichName;
  if (elFoodPrice) elFoodPrice.textContent = foodTotal > 0 ? `₹${foodTotal}` : '₹0';
  if (elDiscount) elDiscount.textContent = `-₹${discountAmount}`;
  if (elTotal) elTotal.textContent = `₹${finalTotal}`;

  calculatorState.computedTotal = finalTotal;
}

function sendBookingToWhatsApp(customNote = '') {
  const lines = [
    '🎮 *MR. GAMING BOOKING* 🥪',
    '',
    `• *Station:* ${calculatorState.consoleName}`,
    `• *Duration:* ${calculatorState.durationHours} Hour(s)`,
    calculatorState.consoleType === 'both' ? '• *Players:* Squad (up to 4)' : `• *Players:* ${calculatorState.players}`,
    `• *MR. Sandwich Food:* ${calculatorState.sandwichName}`,
    `• *Estimated Total:* ₹${calculatorState.computedTotal}`,
    '• *Gamer Perk:* 10% off MR. Sandwich food & drinks'
  ];
  if (customNote) lines.push(`• *Note:* ${customNote}`);
  lines.push('', '*Hi MR. GAMING, is this station free? Please confirm my booking!*');

  openWhatsApp(lines.join('\n'));
}

// ==========================================
// 3. WHATSAPP LINKS (floating button + chat preview pills)
// ==========================================
function openWhatsApp(message) {
  const url = `https://wa.me/${LOUNGE_CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

function initWhatsAppWidget() {
  const triggerBtn = document.getElementById('floating-wa-trigger');
  if (triggerBtn) {
    triggerBtn.addEventListener('click', () => {
      sfx.playClick();
      openWhatsApp("Hi MR. GAMING! I'd like to book a console.");
    });
  }

  document.querySelectorAll('.quick-action-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      sfx.playClick();
      openWhatsApp(`Hi MR. GAMING! ${pill.dataset.prompt}`);
    });
  });
}

// ==========================================
// 5. TRENDING GAMES FILTER
// ==========================================
function initGamesFilter() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  const gameCards = document.querySelectorAll('.game-poster-card');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.playClick();
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.dataset.filter;
      gameCards.forEach(card => {
        if (filter === 'all' || card.dataset.category.includes(filter)) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

  document.querySelectorAll('.btn-reserve-game').forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.playSuccess();
      const gameTitle = btn.dataset.game;
      const consoleReq = btn.dataset.console || 'PS5';
      const text = `Hey MR. GAMING! 🎮 I want to reserve your *${consoleReq} Station* to play *${gameTitle}* today. Is the console free?`;
      window.open(`https://wa.me/${LOUNGE_CONFIG.whatsappNumber}?text=${encodeURIComponent(text)}`, '_blank');
    });
  });
}

// ==========================================
// 6. MODALS MANAGEMENT
// ==========================================
function initModals() {
  const openTourneyBtns = document.querySelectorAll('.btn-open-tournament-modal');
  const tourneyModal = document.getElementById('tournament-modal');
  const closeTourneyBtn = document.getElementById('close-tournament-modal');
  const tourneyForm = document.getElementById('tournament-reg-form');

  openTourneyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.playClick();
      tourneyModal.classList.add('open');
    });
  });

  if (closeTourneyBtn) {
    closeTourneyBtn.addEventListener('click', () => {
      sfx.playClick();
      tourneyModal.classList.remove('open');
    });
  }

  if (tourneyForm) {
    tourneyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sfx.playSuccess();
      const gamerTag = document.getElementById('reg-gamertag').value;
      const playerName = document.getElementById('reg-name').value;
      const phone = document.getElementById('reg-phone').value;
      const consolePref = document.getElementById('reg-console').value;
      const favoriteTeam = document.getElementById('reg-team').value;

      const waMsg = `🏆 *MR. GAMING FIFA CUP WAITLIST* ⚽%0A%0A` +
        `• *Gamer Tag:* ${encodeURIComponent(gamerTag)}%0A` +
        `• *Player Name:* ${encodeURIComponent(playerName)}%0A` +
        `• *WhatsApp:* ${encodeURIComponent(phone)}%0A` +
        `• *Preferred Console:* ${encodeURIComponent(consolePref)}%0A` +
        `• *Favorite Team:* ${encodeURIComponent(favoriteTeam)}%0A` +
        `%0A*Please add me to the tournament waitlist!*`;

      tourneyModal.classList.remove('open');
      window.open(`https://wa.me/${LOUNGE_CONFIG.whatsappNumber}?text=${waMsg}`, '_blank');
      alert(`Thanks ${gamerTag}! Redirecting to WhatsApp to join the waitlist.`);
    });
  }

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      e.target.classList.remove('open');
    }
  });
}

// ==========================================
// 7. MENU ADD TO COMBO ACTION
// ==========================================
function initMenuActions() {
  document.querySelectorAll('.btn-add-food').forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.playClick();
      const itemName = btn.dataset.name;
      const itemPrice = parseInt(btn.dataset.price, 10);

      calculatorState.sandwichPrice = itemPrice;
      calculatorState.sandwichName = itemName;
      recalculatePrice();

      const calcEl = document.getElementById('calculator');
      if (calcEl) {
        calcEl.scrollIntoView({ behavior: 'smooth' });
      }

      const summaryFood = document.getElementById('calc-summary-food');
      if (summaryFood) {
        summaryFood.style.color = '#00ff88';
        setTimeout(() => summaryFood.style.color = '', 1000);
      }
    });
  });
}

// ==========================================
// 8. MOBILE NAV & SOUND TOGGLE
// ==========================================
function initNavigation() {
  const toggleBtn = document.getElementById('mobile-nav-toggle');
  const navLinks = document.getElementById('nav-links');
  const soundBtn = document.getElementById('sound-toggle-btn');

  if (toggleBtn && navLinks) {
    toggleBtn.addEventListener('click', () => {
      sfx.playClick();
      navLinks.classList.toggle('mobile-open');
    });

    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('mobile-open');
      });
    });
  }

  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      const isSoundOn = sfx.toggle();
      soundBtn.innerHTML = isSoundOn ? '<i class="fas fa-volume-high"></i>' : '<i class="fas fa-volume-xmark"></i>';
      soundBtn.title = isSoundOn ? 'Sound FX: ON' : 'Sound FX: MUTED';
      if (isSoundOn) sfx.playSuccess();
    });
  }
}

// DOM Ready initialization
document.addEventListener('DOMContentLoaded', () => {
  initCalculator();
  initWhatsAppWidget();
  initGamesFilter();
  initModals();
  initMenuActions();
  initNavigation();
});
