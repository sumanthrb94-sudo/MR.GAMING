/**
 * MR. GAMING x MR. SANDWICH LOUNGE (INDIA)
 * Exclusive Boutique Gaming Room: 1x PS5 Station + 1x Xbox Series X Station
 * Interactive Engine: WhatsApp AI Concierge, Slot Booking Calculator in INR (₹),
 * FIFA Tournament System, Live FOMO Toasts & Futuristic UI FX
 */

// Global Configuration (MR. GAMING Lounge at MR. Sandwich: 1 PS5 + 1 Xbox Setup)
const LOUNGE_CONFIG = {
  brandName: "MR. GAMING (Located at MR. Sandwich)",
  whatsappNumber: "919876543210", // Indian franchise WhatsApp number (+91)
  currencySymbol: "₹",
  tournamentPrizePool: "₹25,000",
  tournamentEntryFee: 299,
  baseHourlyRatePS5: 199,
  monthlyPass6Hr: 799,
  baseHourlyRateXbox: 199,
  bothConsolesRate: 279, // Private room takeover: both PS5 + Xbox together
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
  durationLabel: '2 Hours (Includes Free Garlic Fries)',
  sandwichCombo: 'none',
  sandwichPrice: 0,
  sandwichName: 'No Food Added',
  discountPercent: 10 // MRGAMER10 Promo Code
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

function recalculatePrice() {
  let gamingTotal = calculatorState.baseRatePerHour * calculatorState.durationHours;
  if (calculatorState.isMonthlyPass) {
    gamingTotal = 799; // Flat 6-Hour Monthly Pass rate (Save ₹395)
  }
  const foodTotal = calculatorState.sandwichPrice;
  const subtotal = gamingTotal + foodTotal;
  const discountAmount = Math.round((subtotal * calculatorState.discountPercent) / 100);
  const finalTotal = subtotal - discountAmount;

  // Update UI Elements
  const elConsole = document.getElementById('calc-summary-console');
  const elGamingPrice = document.getElementById('calc-summary-gaming-price');
  const elFood = document.getElementById('calc-summary-food');
  const elFoodPrice = document.getElementById('calc-summary-food-price');
  const elDiscount = document.getElementById('calc-summary-discount');
  const elTotal = document.getElementById('calc-summary-total');

  if (elConsole) elConsole.textContent = `${calculatorState.consoleName} (${calculatorState.durationHours} hr${calculatorState.durationHours > 1 ? 's' : ''})`;
  if (elGamingPrice) elGamingPrice.textContent = `₹${gamingTotal}`;
  if (elFood) elFood.textContent = calculatorState.sandwichName;
  if (elFoodPrice) elFoodPrice.textContent = foodTotal > 0 ? `₹${foodTotal}` : '₹0';
  if (elDiscount) elDiscount.textContent = `-₹${discountAmount} (10% OFF)`;
  if (elTotal) elTotal.textContent = `₹${finalTotal}`;

  calculatorState.computedTotal = finalTotal;
}

function sendBookingToWhatsApp(customNote = '') {
  const text = `🎮 *MR. GAMING LOUNGE RESERVATION (INDIA)* 🥪%0A%0A` +
    `• *Station:* ${calculatorState.consoleName}%0A` +
    `• *Duration:* ${calculatorState.durationHours} Hour(s)%0A` +
    `• *MR. Sandwich Food:* ${calculatorState.sandwichName}%0A` +
    `• *Estimated Total:* ₹${calculatorState.computedTotal} (INR)%0A` +
    `• *Promo Code:* MRGAMER10 (10% VIP Discount)%0A` +
    (customNote ? `• *Note:* ${encodeURIComponent(customNote)}%0A%0A` : `%0A`) +
    `*Hey Meta WhatsApp AI Concierge, is this station free right now? Please confirm booking!*`;

  const url = `https://wa.me/${LOUNGE_CONFIG.whatsappNumber}?text=${text}`;
  window.open(url, '_blank');
}

// ==========================================
// 3. META WHATSAPP AI ASSISTANT SIMULATOR (1 PS5 + 1 XBOX)
// ==========================================
const aiChatResponses = [
  {
    triggers: ['slot', 'available', 'ps5', 'xbox', 'station', 'setup', 'booth', 'timing'],
    reply: `🎮 *Current Gaming Room Status:*%0AWe have an exclusive private gaming setup with *1x PS5 Station* and *1x Xbox Series X Station*.%0A• *PS5:* Currently in match (Free in 25 mins)%0A• *Xbox Series X:* 🟢 *AVAILABLE NOW for walk-in!*%0AHourly rate is *₹199/hr*, or you can grab our popular *6-Hour Monthly Pass for just ₹799* (valid 30 days, save ₹395!). Want me to reserve a station for you?`
  },
  {
    triggers: ['fifa', 'tournament', 'championship', 'prize', 'ea fc'],
    reply: `⚽ *MR. GAMING FC INDIA CHAMPIONSHIP!* 🏆%0A• Matches played head-to-head on our PS5 & Xbox tournament setups.%0A• *Cash Prize Pool:* ₹25,000 (1st: ₹15,000 + Trophy)%0A• *Entry Fee:* ₹299 (Includes a FREE Gourmet Cheese Melt & Chilled Drink)%0A• *Slots:* 28/32 Filled! Only 4 spots left. Reply with your Gamer Tag to lock your slot via UPI!`
  },
  {
    triggers: ['sandwich', 'food', 'menu', 'eat', 'burger', 'shake', 'price'],
    reply: `🥪 *MR. Sandwich 100% PURE VEG Lounge Favorites:*%0A1. *God-Tier Triple Cheese Corn Melt* - ₹139%0A2. *Spicy Tandoori Paneer Tikka Sub* - ₹189%0A3. *Makhani Paneer Grilled Melt* - ₹149%0A4. *Peri-Peri Loaded Cheese Fries* - ₹119%0A5. *Blue Lagoon Gamer Chiller* - ₹99%0AFreshly grilled and served right at your console station!`
  },
  {
    triggers: ['both', 'room', 'private', 'squad', 'party'],
    reply: `👑 *Private Gaming Den Takeover!*%0AYes! You can book *BOTH the PS5 and Xbox Series X together* for your squad for just *₹279/hr*! You get the entire air-conditioned gaming room to yourself with zero interruption.`
  },
  {
    triggers: ['location', 'where', 'address', 'timing', 'open', 'hyderabad', 'place', 'map', 'directions'],
    reply: `📍 *MR. GAMING (Inside MR. Sandwich Pure Veg) - Hyderabad:*%0AWe are located at Sri Nagar Colony, Moosarambagh (Near Malakpet / Dilsukhnagar Metro), Hyderabad, Telangana - 500036.%0A🗺️ *Google Maps Directions:* https://maps.google.com/maps?ftid=0x3bcb93688e70c197:0x435d8fffc928f5b4%0AOpen daily! Walk-ins welcome or text me here to reserve Station 01 (PS5) or Station 02 (Xbox)!`
  }
];

function initWhatsAppWidget() {
  const triggerBtn = document.getElementById('floating-wa-trigger');
  const chatWindow = document.getElementById('wa-chat-window');
  const closeBtn = document.getElementById('wa-close-btn');
  const sendBtn = document.getElementById('wa-send-btn');
  const inputField = document.getElementById('wa-input-text');
  const messagesContainer = document.getElementById('wa-messages-container');

  if (!triggerBtn || !chatWindow) return;

  triggerBtn.addEventListener('click', () => {
    sfx.playClick();
    chatWindow.classList.toggle('open');
    const badge = document.getElementById('wa-unread-badge');
    if (badge) badge.style.display = 'none';
    if (chatWindow.classList.contains('open')) {
      inputField && inputField.focus();
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      sfx.playClick();
      chatWindow.classList.remove('open');
    });
  }

  function appendMessage(text, isSent = false) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isSent ? 'bubble-sent' : 'bubble-received'}`;
    bubble.innerHTML = text.replace(/%0A/g, '<br>').replace(/\*(.*?)\*/g, '<strong>$1</strong>');
    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function handleSend() {
    const userText = inputField.value.trim();
    if (!userText) return;

    appendMessage(userText, true);
    inputField.value = '';
    sfx.playClick();

    const typingBubble = document.createElement('div');
    typingBubble.className = 'chat-bubble bubble-received';
    typingBubble.innerHTML = '<em>MR. Bot is typing... ⚡</em>';
    messagesContainer.appendChild(typingBubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    setTimeout(() => {
      typingBubble.remove();
      const lower = userText.toLowerCase();
      let matched = aiChatResponses.find(item => item.triggers.some(t => lower.includes(t)));

      if (matched) {
        appendMessage(matched.reply, false);
      } else {
        appendMessage(`Hey gamer! I'm *MR. Bot*, your Meta WhatsApp AI concierge for MR. GAMING in Hyderabad (located inside MR. Sandwich Pure Veg). We have *1 dedicated PS5 station* and *1 Xbox Series X station*. I can check console availability, book the ₹25,000 EA FC Tournament, provide Google Maps directions, or order fresh melts. Chat with us on WhatsApp anytime!`, false);
      }
      sfx.playBleep(800, 0.08);
    }, 850);
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', handleSend);
  }

  if (inputField) {
    inputField.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSend();
    });
  }

  document.querySelectorAll('.quick-action-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      sfx.playClick();
      const prompt = pill.dataset.prompt;
      inputField.value = prompt;
      handleSend();
    });
  });
}

// ==========================================
// 4. FOMO LIVE TOAST NOTIFICATION ENGINE (1 PS5 & 1 XBOX INVENTORY)
// ==========================================
const fomoActivities = [
  { name: "Rahul S. (Moosarambagh, Hyderabad)", action: "reserved Station 01 (PS5) for 7:00 PM session", icon: "fa-gamepad", time: "Just now" },
  { name: "Aman Verma (Dilsukhnagar, Hyderabad)", action: "registered for FIFA Hyderabad Championship (Slot 29/32)", icon: "fa-trophy", time: "3 mins ago" },
  { name: "Vikram & Squad (Malakpet, Hyderabad)", action: "booked Private VIP Takeover (Both PS5 & Xbox) for 2 hours", icon: "fa-crown", time: "6 mins ago" },
  { name: "Rohan K. (Kothapet, Hyderabad)", action: "locked Station 02 (Xbox Series X) for Black Ops 6 120 FPS duel", icon: "fa-xbox", time: "9 mins ago" },
  { name: "Pooja M. (Hyderabad)", action: "ordered Makhani Paneer Melt & Blue Lagoon for PS5 session", icon: "fa-burger", time: "12 mins ago" }
];

function initFomoToasts() {
  const container = document.getElementById('fomo-toast-container');
  if (!container) return;

  let activityIndex = 0;

  function triggerToast() {
    const item = fomoActivities[activityIndex % fomoActivities.length];
    activityIndex++;

    const toast = document.createElement('div');
    toast.className = 'fomo-toast';
    toast.innerHTML = `
      <div class="toast-icon-wrap">
        <i class="fas ${item.icon}"></i>
      </div>
      <div class="toast-content">
        <h5>${item.name}</h5>
        <p>${item.action}</p>
        <span class="toast-time">⚡ ${item.time}</span>
      </div>
    `;

    container.appendChild(toast);
    sfx.playBleep(1050, 0.05, 'triangle');

    setTimeout(() => {
      toast.classList.add('show');
    }, 50);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 500);
    }, 5500);
  }

  setTimeout(triggerToast, 3000);
  setInterval(triggerToast, 16000);
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

      const waMsg = `🏆 *MR. GAMING FC INDIA CHAMPIONSHIP REGISTRATION* ⚽%0A%0A` +
        `• *Gamer Tag:* ${encodeURIComponent(gamerTag)}%0A` +
        `• *Player Name:* ${encodeURIComponent(playerName)}%0A` +
        `• *WhatsApp:* ${encodeURIComponent(phone)}%0A` +
        `• *Preferred Console:* ${encodeURIComponent(consolePref)}%0A` +
        `• *Favorite Team:* ${encodeURIComponent(favoriteTeam)}%0A` +
        `• *Entry Fee:* ₹299 (Includes Free Grilled Cheese Melt & Beverage)%0A%0A` +
        `*Please send UPI QR Code / Payment link to confirm my slot!*`;

      tourneyModal.classList.remove('open');
      window.open(`https://wa.me/${LOUNGE_CONFIG.whatsappNumber}?text=${waMsg}`, '_blank');
      alert(`Success! Your registration for "${gamerTag}" is initiated. Redirecting to WhatsApp to complete your ₹299 confirmation.`);
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
  initCountdown();
  initCalculator();
  initWhatsAppWidget();
  initFomoToasts();
  initGamesFilter();
  initModals();
  initMenuActions();
  initNavigation();
});
