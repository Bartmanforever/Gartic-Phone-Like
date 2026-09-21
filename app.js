import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get, remove, onDisconnect } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCxZY1l6bfC7rXO02JtOwuauGviNSTkhYA",
    authDomain: "telephone-arabe.firebaseapp.com",
    databaseURL: "https://telephone-arabe-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "telephone-arabe",
    appId: "1:227254624373:web:fa1542bc7551a1083fd83c"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const myId = 'u' + Math.floor(Math.random() * 1000000);
let myName = "", isAdmin = false, players = [], currentStep = -1;
let submittedStep = -1, submittingStep = -1, finalizingStep = -1;

function hasStep(books, bookId, step) {
    return Boolean(books?.[bookId] &&
        Object.prototype.hasOwnProperty.call(books[bookId], `step${step}`));
}

function orderedPlayers(playerData) {
    return Object.entries(playerData || {})
        .sort(([, first], [, second]) => (first.joinedAt || 0) - (second.joinedAt || 0))
        .map(([id]) => id);
}

function showScreen(id) {
    document.querySelectorAll('.container > div').forEach(d => d.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

document.getElementById('btn-player-join').onclick = () => {
    const n = document.getElementById('login-name').value;
    if(n) join(n, false);
};
document.getElementById('btn-admin-join').onclick = () => {
    const n = document.getElementById('admin-name').value;
    if(n && document.getElementById('admin-pass').value === "admin") join(n, true);
};

function join(name, adm) {
    myName = name; isAdmin = adm;
    set(ref(db, `scrum_phone/players/${myId}`), { name, isAdmin: adm, joinedAt: Date.now() });
    onDisconnect(ref(db, `scrum_phone/players/${myId}`)).remove();
    if(adm) document.getElementById('persistent-admin-panel').classList.remove('hidden');
    showScreen('screen-lobby');
}

onValue(ref(db, 'scrum_phone'), (snap) => {
    const data = snap.val();
    if(!data) return;
    players = orderedPlayers(data.players);
    document.getElementById('player-list').innerText = data.players ? Object.values(data.players).map(p => p.name).join(" • ") : "";

    if(data.state === "PLAYING") {
        if(isAdmin) {
            document.getElementById('admin-setup-tools').classList.add('hidden');
            document.getElementById('btn-admin-view-results').classList.add('hidden');
        }

        const newStep = data.step || 0;
        const myIdx = players.indexOf(myId);
        const bookOwnerIdx = (myIdx - newStep + players.length) % players.length;
        const bookOwnerId = players[bookOwnerIdx];

        if (newStep !== currentStep) {
            currentStep = newStep;
            submittedStep = -1;
            submittingStep = -1;
            finalizingStep = -1;
            clearCanvas();
            document.getElementById('input-write').value = "";
            document.getElementById('input-guess').value = "";
            document.getElementById('turn-counter').innerText = `TOUR ${currentStep + 1} / ${players.length}`;
            document.getElementById('wait-message').innerText = "BIEN JOUÉ !";
            document.getElementById('wait-subtext').innerText = "Attente des autres joueurs...";
            document.getElementById('wait-icon').innerText = "🏎️💨";
        }

        if(isAdmin) {
            const books = data.books || {};
            let finishedCount = 0;
            players.forEach((pId, pIdx) => {
                const bId = players[(pIdx - currentStep + players.length) % players.length];
                if(hasStep(books, bId, currentStep)) finishedCount++;
            });

            if(data.timer <= 0 && finalizingStep !== currentStep) {
                finalizeExpiredStep(data, books);
            } else if(finishedCount >= players.length && finishedCount > 0 && finalizingStep !== currentStep) {
                advanceStep(currentStep);
            }
        }

        if(hasStep(data.books, bookOwnerId, currentStep)) {
            submittedStep = currentStep;
            showScreen('screen-wait');
        } else {
            handleStepUI(data.books, bookOwnerId);
        }

        if(data.timer <= 0 && submittedStep !== currentStep && !isAdmin) {
            const value = currentStep === 0
                ? document.getElementById('input-write').value
                : currentStep % 2 === 1
                    ? canvas.toDataURL('image/png')
                    : document.getElementById('input-guess').value;
            submitData(value, true);
        }
    } else if(data.state === "RESULTS") {
        document.getElementById('admin-setup-tools').classList.add('hidden');
        if(isAdmin) document.getElementById('btn-admin-view-results').classList.remove('hidden');
        renderResults(data.books, data.players);
    } else if(data.state === "LOBBY") {
        if(isAdmin) {
            document.getElementById('admin-setup-tools').classList.remove('hidden');
            document.getElementById('btn-admin-view-results').classList.add('hidden');
        }
        if(myName) showScreen('screen-lobby');
    }

    const tc = document.getElementById('timer-container');
    if(data.timer >= 0 && data.state === "PLAYING") {
        tc.classList.remove('hidden');
        document.getElementById('timer-display').innerText = data.timer + "s";
        document.getElementById('timer-progress').style.width = (data.timer / data.maxTime * 100) + "%";
    } else tc.classList.add('hidden');
});

function handleStepUI(books, bookOwnerId) {
    books = books || {};
    showScreen('screen-game');
    const title = document.getElementById('game-title');
    const inst = document.getElementById('game-instruction');
    document.getElementById('zone-write').classList.add('hidden');
    document.getElementById('zone-draw').classList.add('hidden');
    document.getElementById('zone-guess').classList.add('hidden');

    if(currentStep === 0) {
        title.innerText = "TOUR 1 : L'IDÉE";
        inst.innerText = "Écris une phrase rigolote !";
        document.getElementById('zone-write').classList.remove('hidden');
    } else {
        const prevStepData = books[bookOwnerId]?.['step' + (currentStep - 1)] || {};
        const sender = prevStepData.author || "Joueur précédent";
        const content = prevStepData.content || "(aucun contenu)";
        inst.replaceChildren(
            document.createTextNode(`Envoyé par ${sender} :`),
            document.createElement('br'),
            document.createTextNode(`"${content}"`)
        );

        if(currentStep % 2 === 1) {
            title.innerText = `TOUR ${currentStep+1} : DESSIN`;
            document.getElementById('zone-draw').classList.remove('hidden');
        } else {
            title.innerText = `TOUR ${currentStep+1} : DEVINETTE`;
            inst.replaceChildren(document.createTextNode(`Dessin envoyé par ${sender} :`));
            document.getElementById('img-to-guess').src = prevStepData.content || "";
            document.getElementById('zone-guess').classList.remove('hidden');
        }
    }
}

async function finalizeExpiredStep(data, books) {
    if (!isAdmin || finalizingStep === currentStep || !players.length) return;
    const stepToFinalize = currentStep;
    finalizingStep = stepToFinalize;

    await new Promise(resolve => setTimeout(resolve, 500));
    const latestSnapshot = await get(ref(db, 'scrum_phone'));
    const latestData = latestSnapshot.val();
    if (!latestData || latestData.state !== "PLAYING" || latestData.step !== stepToFinalize) return;

    const latestBooks = latestData.books || {};
    const updates = {};
    const isDrawingStep = stepToFinalize > 0 && stepToFinalize % 2 === 1;
    players.forEach((playerId, playerIndex) => {
        const bookOwnerId = players[(playerIndex - stepToFinalize + players.length) % players.length];
        if (hasStep(latestBooks, bookOwnerId, stepToFinalize)) return;
        updates[`books/${bookOwnerId}/step${stepToFinalize}`] = {
            content: "",
            author: "Système (temps écoulé)",
            automatic: true,
            drawing: isDrawingStep
        };
    });

    const nextStep = stepToFinalize + 1;
    if (nextStep >= players.length) {
        updates.state = "RESULTS";
        updates.timer = -1;
    } else {
        updates.step = nextStep;
        updates.timer = parseInt(document.getElementById('cfg-timer').value) || 60;
        updates.maxTime = updates.timer;
    }
    await update(ref(db, 'scrum_phone'), updates);
}

function advanceStep(step) {
    const nextStep = step + 1;
    if(nextStep >= players.length) {
        update(ref(db, 'scrum_phone'), { state: "RESULTS", timer: -1 });
    } else {
        const duration = parseInt(document.getElementById('cfg-timer').value) || 60;
        update(ref(db, 'scrum_phone'), { step: nextStep, timer: duration, maxTime: duration });
    }
}

async function submitData(val, automatic = false) {
    if (submittedStep === currentStep || submittingStep === currentStep) return;
    const myIdx = players.indexOf(myId);
    if (myIdx === -1 || currentStep < 0) return;

    const bookOwnerId = players[(myIdx - currentStep + players.length) % players.length];
    const stepRef = ref(db, `scrum_phone/books/${bookOwnerId}/step${currentStep}`);
    submittingStep = currentStep;
    try {
        const existing = await get(stepRef);
        if (!existing.exists()) {
            await set(stepRef, { content: val, author: myName, automatic });
        }
        submittedStep = currentStep;
        showScreen('screen-wait');
    } finally {
        submittingStep = -1;
    }
}

document.getElementById('btn-submit-write').onclick = () => submitData(document.getElementById('input-write').value);
document.getElementById('btn-submit-draw').onclick = () => submitData(canvas.toDataURL('image/png'));
document.getElementById('btn-submit-guess').onclick = () => submitData(document.getElementById('input-guess').value);

document.getElementById('btn-start-game').onclick = () => {
    const dur = parseInt(document.getElementById('cfg-timer').value) || 60;
    update(ref(db, 'scrum_phone'), { state: "PLAYING", step: 0, timer: dur, maxTime: dur, books: null });
};

document.getElementById('btn-admin-view-results').onclick = async () => {
    const snap = await get(ref(db, 'scrum_phone'));
    const data = snap.val();
    if(data) {
        players = orderedPlayers(data.players);
        renderResults(data.books || {}, data.players || {});
    }
};

document.getElementById('btn-replay-game').onclick = () => {
    if(confirm("RETOUR AU LOBBY POUR TOUT LE MONDE ?")) {
        update(ref(db, 'scrum_phone'), { state: "LOBBY", step: 0, timer: -1, books: null });
    }
};

document.getElementById('btn-reset-all').onclick = () => {
    if(confirm("RESET TOTAL ?")) remove(ref(db, 'scrum_phone'));
};

const canvas = document.getElementById('paintCanvas');
const ctx = canvas.getContext('2d');
let drawing = false, color = "#000";
const palette = ["#000", "#7d4a03", "#f00", "#00f", "#0a0", "#ff0", "#f0f", "#ffa500", "#95a5a6", "#fff"];
const palDiv = document.getElementById('palette');
palette.forEach(c => {
    const dot = document.createElement('div');
    dot.className = 'color-dot';
    dot.style.background = c;
    dot.onclick = () => {
        color = c;
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
    };
    palDiv.appendChild(dot);
    if(c === "#000") dot.classList.add('active');
});

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height)
    };
}

function start(e) {
    drawing = true;
    const pos = getPos(e);
    ctx.beginPath(); ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.lineJoin = 'round'; ctx.strokeStyle = color; ctx.moveTo(pos.x, pos.y);
    if(e.cancelable) e.preventDefault();
}
function move(e) {
    if (!drawing) return;
    const pos = getPos(e); ctx.lineTo(pos.x, pos.y); ctx.stroke();
    if(e.cancelable) e.preventDefault();
}
function stop() { if (drawing) { ctx.closePath(); drawing = false; } }

canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move);
window.addEventListener('mouseup', stop); canvas.addEventListener('touchstart', start, {passive: false});
canvas.addEventListener('touchmove', move, {passive: false}); window.addEventListener('touchend', stop);

window.setEraser = () => { color = "#fff"; };
window.clearCanvas = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); };
document.getElementById('btn-eraser').addEventListener('click', window.setEraser);
document.getElementById('btn-clear-canvas').addEventListener('click', window.clearCanvas);

function renderResults(books, playerList) {
    showScreen('screen-results');
    const gal = document.getElementById('results-gallery');
    gal.innerHTML = "";
    if(!books || !playerList) return;

    const bookIds = [...new Set([...Object.keys(playerList), ...Object.keys(books)])];
    const stepCount = Math.max(0, ...Object.values(books).flatMap(book =>
        Object.keys(book || {})
            .filter(key => /^step\d+$/.test(key))
            .map(key => Number(key.slice(4)) + 1)
    ));

    bookIds.forEach(pId => {
        const card = document.createElement('div'); card.className = 'result-card';
        const heading = document.createElement('h3');
        heading.textContent = `Histoire de ${playerList[pId]?.name || "Joueur"}`;
        card.appendChild(heading);
        for(let i = 0; i < stepCount; i++) {
            const entry = books[pId]?.['step' + i];
            if(!entry) continue;
            const label = document.createElement('p');
            const author = document.createElement('b');
            author.textContent = `${entry.author || "Joueur"}:`;
            label.appendChild(author);
            if(i % 2 === 0) {
                label.appendChild(document.createTextNode(` "${entry.content ?? ""}"`));
                card.appendChild(label);
            } else {
                card.appendChild(label);
                if(entry.content) {
                    const image = document.createElement('img');
                    image.src = entry.content; image.style.width = '100%'; image.style.border = '1px solid #eee';
                    card.appendChild(image);
                } else {
                    const emptyDrawing = document.createElement('p');
                    emptyDrawing.textContent = "Dessin non envoyé (temps écoulé)";
                    card.appendChild(emptyDrawing);
                }
            }
        }
        gal.appendChild(card);
    });
    window.scrollTo(0,0);
}

setInterval(() => {
    if(isAdmin) {
        get(ref(db, 'scrum_phone')).then(s => {
            const d = s.val();
            if(d && d.state === "PLAYING" && d.timer > 0) update(ref(db, 'scrum_phone'), { timer: d.timer - 1 });
        });
    }
}, 1000);
