const BACKEND_URL = "https://funlearning-backend-t6ml.onrender.com"; 
let socket = null;
let currentActiveQuiz = null;

// Core Page Navigation Matrix Engine
function navigateToPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
}

// Global UI Loading Overlay Controller
function showGlobalSpinner(show) {
    const spinner = document.getElementById('global-loading-indicator');
    if (spinner) spinner.style.display = show ? 'flex' : 'none';
}

// Option B: 20 Daily Free Lessons Auto-Reset Logic Track
function checkDailyLessonQuota() {
    const todayStr = new Date().toDateString();
    const activeQuotaDate = localStorage.getItem("quotaTrackingDate");
    
    if (activeQuotaDate !== todayStr) {
        // It's a new day! Wipe old counts automatically at midnight
        localStorage.setItem("quotaTrackingDate", todayStr);
        localStorage.setItem("lessonsGeneratedTodayCount", "0");
        return true;
    }

    const currentCount = parseInt(localStorage.getItem("lessonsGeneratedTodayCount")) || 0;
    return currentCount < 20; 
}

function incrementLessonQuotaCounter() {
    let count = parseInt(localStorage.getItem("lessonsGeneratedTodayCount")) || 0;
    localStorage.setItem("lessonsGeneratedTodayCount", (count + 1).toString());
    syncUsageUI();
}

// Syncs Quota Numbers dynamically across Dashboard & Learn Screens
function syncUsageUI() {
    const currentCount = localStorage.getItem("lessonsGeneratedTodayCount") || "0";
    
    const dashCountNode = document.getElementById('dash-usage-count');
    if (dashCountNode) {
        dashCountNode.innerText = `${currentCount}/20`;
    }
    const tickerValNode = document.getElementById('ticker-count-val');
    if (tickerValNode) {
        tickerValNode.innerText = (20 - parseInt(currentCount));
    }
}

function openPaywall() {
    const modal = document.getElementById('paywall-modal-overlay');
    if (modal) modal.style.display = 'flex';
}

function closePaywall() {
    const modal = document.getElementById('paywall-modal-overlay');
    if (modal) modal.style.display = 'none';
    window.location.href = "dashboard.html";
}

// Google OAuth Stream Node
function handleGoogleOAuthAuthentication() {
    showGlobalSpinner(true);
    window.location.href = `${BACKEND_URL}/api/auth/google`;
}

// Dynamic Streak Tracker Grid
function updateStreakInterfaceUI() {
    let currentStreak = parseInt(localStorage.getItem("userLearningStreak")) || 0;
    const lastActiveDate = localStorage.getItem("userLastActiveDate");
    const todayStr = new Date().toDateString();

    if (!lastActiveDate) {
        currentStreak = 1;
    } else if (lastActiveDate !== todayStr) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        if (lastActiveDate === yesterday.toDateString()) {
            currentStreak += 1;
        } else {
            currentStreak = 1; // Reset streak if a day was skipped
        }
    }
    
    localStorage.setItem("userLearningStreak", currentStreak);
    localStorage.setItem("userLastActiveDate", todayStr);
    
    const countNode = document.getElementById('streak-count-value');
    if (countNode) countNode.innerText = currentStreak;
}

// Student Registration Form Handler
async function handleRegistration(e) {
    e.preventDefault();
    showGlobalSpinner(true);
    
    const payload = {
        name: document.getElementById('reg-name').value,
        class_category: document.getElementById('reg-class').value,
        age: parseInt(document.getElementById('reg-age').value) || 0,
        sex: document.getElementById('reg-sex').value,
        email: document.getElementById('reg-email').value,
        password: document.getElementById('reg-pass').value
    };
    
    try {
        const r = await fetch(`${BACKEND_URL}/api/auth/signup`, {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if (!r.ok) throw new Error("Registration Pipeline Failed");
        
        // Cache user info locally for instant interface loading
        localStorage.setItem("activeStudent", payload.name);
        localStorage.setItem("loggedInUserEmail", payload.email); 
        window.location.href = "dashboard.html";
    } catch(err) { 
        alert(err.message); 
    } finally { 
        showGlobalSpinner(false); 
    }
}

// Student Authentication Login Handler
async function handleLogin(e) {
    e.preventDefault();
    showGlobalSpinner(true);
    
    const payload = {
        email: document.getElementById('login-email').value,
        password: document.getElementById('login-pass').value
    };
    
    try {
        const r = await fetch(`${BACKEND_URL}/api/auth/login`, {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const res = await r.json();
        if (!r.ok) throw new Error(res.error || "Authentication failed");
        
        // Save profiles to unlock secure local environment metrics
        localStorage.setItem("activeStudent", res.student_name);
        localStorage.setItem("loggedInUserEmail", payload.email); 
        window.location.href = "dashboard.html";
    } catch(err) { 
        alert(err.message); 
    } finally { 
        showGlobalSpinner(false); 
    }
}

// Requests Tailored Course Syllabi Nodes From Gemini Model Layer
async function requestLiveAILesson() {
    if (!checkDailyLessonQuota()) {
        openPaywall();
        return;
    }

    showGlobalSpinner(true);
    const trackType = document.querySelector('input[name="learning_track"]:checked').value;
    const specifiedDifficulty = document.getElementById('text-difficulty').value;
    
    const payload = {
        subject: document.getElementById('select-subject').value,
        startFromScratch: (trackType === 'scratch'),
        difficultyAreas: trackType === 'custom' ? specifiedDifficulty : ""
    };
    
    try {
        const r = await fetch(`${BACKEND_URL}/api/generate-lesson`, {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await r.json();
        
        document.getElementById('lesson-title-display').innerText = data.title;
        document.getElementById('lesson-body-display').innerText = data.content;
        
        if (typeof switchSubview === "function") {
            switchSubview('subview-reader');
        }
        
        incrementLessonQuotaCounter();
        updateStreakInterfaceUI();
    } catch(err) { 
        alert("AI pipeline adaptive generation failure."); 
    } finally { 
        showGlobalSpinner(false); 
    }
}

// Requests Adaptive Multiple Choice Questions
async function requestLiveAIQuiz() {
    showGlobalSpinner(true);
    try {
        const r = await fetch(`${BACKEND_URL}/api/generate-quiz`, {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ subject: "Mathematics" })
        });
        currentActiveQuiz = await r.json();
        
        document.getElementById('quiz-question-text').innerText = currentActiveQuiz.question;
        const box = document.getElementById('quiz-options-box');
        box.innerHTML = "";
        
        currentActiveQuiz.options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = "quiz-choice-row";
            btn.innerText = opt;
            btn.onclick = () => evaluateQuizSelection(idx, btn);
            box.appendChild(btn);
        });
        
        document.getElementById('quiz-explanation-box').style.display = "none";
        document.getElementById('quiz-explanation-text').innerText = currentActiveQuiz.explanation;
        
        document.querySelectorAll('.subview').forEach(v => v.classList.remove('active'));
        document.getElementById('quiz-subview-arena').classList.add('active');
    } catch(err) { 
        alert("Could not pull active quiz framework."); 
    } finally { 
        showGlobalSpinner(false); 
    }
}

function evaluateQuizSelection(selected, btnElement) {
    const rowBtns = document.querySelectorAll('.quiz-choice-row');
    rowBtns.forEach(b => b.disabled = true);
    
    if (selected === currentActiveQuiz.correctIndex) {
        btnElement.style.background = "#2E7D32"; 
        btnElement.style.color = "#FFF";
    } else {
        btnElement.style.background = "#D32F2F"; 
        btnElement.style.color = "#FFF";
        rowBtns[currentActiveQuiz.correctIndex].style.background = "#2E7D32";
        rowBtns[currentActiveQuiz.correctIndex].style.color = "#FFF";
    }
}

function revealQuizExplanation() {
    const box = document.getElementById('quiz-explanation-box');
    if (box) box.style.display = box.style.display === "none" ? "block" : "none";
}

// Real-Time Peer Lounge WebSocket Synchronization Engine
function initializeLoungeSocket() {
    if (typeof io !== 'undefined' && !socket) {
        socket = io(BACKEND_URL);
        
        socket.on('receive_message', (data) => {
            const timeline = document.getElementById('chat-messages-timeline');
            if (timeline) {
                const bubble = document.createElement('div');
                const user = localStorage.getItem("activeStudent") || "Explorer";
                
                // Assign visual structural styles based on sender criteria identity
                bubble.className = `chat-bubble ${data.sender === user ? 'sent' : 'received'}`;
                bubble.innerHTML = `<p><strong>${data.sender}:</strong> ${data.message}</p>`;
                
                timeline.appendChild(bubble);
                timeline.scrollTop = timeline.scrollHeight; // Keep view snapped to bottom automatically
            }
        });
    }
}

function sendLoungeMessage() {
    const input = document.getElementById('chat-entry-field');
    const user = localStorage.getItem("activeStudent") || "Explorer";
    
    if (input && input.value.trim() !== "") {
        if (!socket) {
            initializeLoungeSocket();
        }
        if (socket) {
            socket.emit('send_message', { sender: user, message: input.value.trim() });
            input.value = "";
        }
    }
}