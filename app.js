// ======================================================
// ===== 1. CONFIGURACIÓN Y VARIABLES GLOBALES =====
// ======================================================

const firebaseConfig = {
    apiKey: "AIzaSyAX9jZYnVSGaXdM06I0LTBvbvDpNulMPpk",
    authDomain: "panel-arte.firebaseapp.com",
    projectId: "panel-arte",
    storageBucket: "panel-arte.firebasestorage.app",
    messagingSenderId: "236381043860",
    appId: "1:236381043860:web:f6a9c2cb211dd9161d0881"
}; 

// Inicialización segura de Firebase
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} else if (typeof firebase === 'undefined') {
    console.error("Error CRÍTICO: El SDK de Firebase no se ha cargado en el HTML.");
}

const db_firestore = firebase.firestore(); 
// Habilitar persistencia offline para velocidad
db_firestore.enablePersistence({ synchronizeTabs: true }).catch(err => console.warn('Persistencia:', err.code));

// --- Configuración Global ---
const CONFIG = {
    DEPARTMENTS: {
        ART: 'P_Art',
        SEW: 'P_Sew',
        CUT: 'P_Cut',
        PRINT: 'P_Printing',
        PRESS: 'P_Press',
        SHIP: 'P_Shipping',
        NONE: 'Sin Departamento'
    },
    STATUS: {
        COMPLETED: 'Completada',
        TRAY: 'Bandeja',
        PROD: 'Producción',
        AUDIT: 'Auditoría'
    },
    // LISTA DE EXCLUIDOS: Agrega aquí los nombres que no deben salir en métricas
    EXCLUDED_DESIGNERS: ['Magdali Fernandez'], 
    DB_VERSION: 1,
    PAGINATION_DEFAULT: 50
};

// --- Variables de Estado ---
let allOrders = []; 
let selectedOrders = new Set();
let usuarioActual = null; 
let isExcelLoaded = false;
let userRole = 'user'; 
let currentDesignerName = null; 

// Filtros y Paginación
let currentFilter = 'all';
let currentSearch = '';
let currentClientFilter = '';
let currentStyleFilter = '';
let currentTeamFilter = '';
let currentDepartamentoFilter = '';
let currentDesignerFilter = '';
let currentCustomStatusFilter = '';
let currentDateFrom = '';
let currentDateTo = '';
let sortConfig = { key: 'date', direction: 'asc' };
let currentPage = 1;
let rowsPerPage = CONFIG.PAGINATION_DEFAULT;
let paginatedOrders = [];

// Caché de Filtrado
let filteredCache = { key: null, results: [], timestamp: 0 };

// Variables de Edición y Batch
let currentEditingOrderId = null;
let designerList = []; 
let needsRecalculation = true; 
let autoCompleteBatchWrites = []; 
let autoCompletedOrderIds = new Set(); 
let masterOrdersLoaded = false;

// Suscripciones de Firebase
let unsubscribeAssignments = null;
let unsubscribeHistory = null;
let unsubscribeChildOrders = null;
let unsubscribeDesigners = null;
let unsubscribeWeeklyPlan = null;
let unsubscribeNotifications = null;
let unsubscribeChat = null;

// Mapas de Datos en Memoria
let masterOrdersMap = new Map();
let firebaseAssignmentsMap = new Map();
let firebaseHistoryMap = new Map();
let firebaseChildOrdersMap = new Map();
let firebaseDesignersMap = new Map(); 
let firebaseWeeklyPlanMap = new Map();

// Gráficos
let designerDoughnutChart = null;
let designerBarChart = null;
let deptLoadPieChart = null;
let deptLoadBarChart = null;
let compareChart = null;
let currentCompareDesigner1 = '';

// ======================================================
// ===== 2. GESTOR DE MODALES =====
// ======================================================
const modalStack = []; 
function openModalById(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.zIndex = 2000 + (modalStack.length * 10);
    if (modalId === 'confirmModal') modal.style.zIndex = parseInt(modal.style.zIndex) + 1000;
    modal.classList.add('active');
    modalStack.push(modalId);
    document.body.classList.add('modal-open');
}
function closeTopModal() {
    if (modalStack.length === 0) return;
    const modalId = modalStack.pop(); 
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
    if (modalStack.length === 0) document.body.classList.remove('modal-open');
}
function closeAllModals() {
    document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
    modalStack.length = 0;
    document.body.classList.remove('modal-open');
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalStack.length > 0) closeTopModal(); });
window.closeModal = () => closeTopModal(); window.closeConfirmModal = () => closeTopModal(); window.closeMultiModal = () => closeTopModal(); window.closeAddChildModal = () => closeTopModal(); window.closeDesignerManager = () => closeTopModal(); window.closeCompareModals = () => closeAllModals(); window.closeWeeklyReportModal = () => closeTopModal(); window.closeLegendModal = () => closeTopModal();

// ======================================================
// ===== 3. UTILIDADES (THEME FIX BUG #2) =====
// ======================================================

// BUG #2: Definir initTheme ANTES de usarlo
function initTheme() {
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    updateThemeIcon();
}

function updateThemeIcon() {
    const icon = document.getElementById('themeIcon');
    if (icon) {
        const isDark = document.documentElement.classList.contains('dark');
        icon.className = isDark ? 'fa-solid fa-sun text-yellow-400' : 'fa-solid fa-moon text-slate-400';
    }
}

window.toggleTheme = () => {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    } else {
        html.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }
    updateThemeIcon();
};

async function safeFirestoreOperation(operation, loadingMsg = 'Procesando...', successMsg = null) {
    showLoading(loadingMsg);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 10000));
    try {
        await Promise.race([operation(), timeoutPromise]);
        if (successMsg) showCustomAlert(successMsg, 'success');
        return true;
    } catch (error) {
        console.error("Error Seguro:", error);
        showCustomAlert(error.message === 'TIMEOUT' ? 'La operación tardó demasiado.' : `Error: ${error.message}`, 'error');
        return false;
    } finally { hideLoading(); }
}

function showCustomAlert(message, type = 'info') {
    const alertDiv = document.getElementById('customAlert');
    if(!alertDiv) return;
    let borderClass = type === 'error' ? 'border-red-500' : type === 'success' ? 'border-green-500' : 'border-blue-500';
    let icon = type === 'error' ? 'fa-circle-xmark text-red-500' : type === 'success' ? 'fa-circle-check text-green-500' : 'fa-circle-info text-blue-500';
    alertDiv.className = `fixed top-5 right-5 z-[3000] max-w-sm w-full bg-white dark:bg-slate-800 shadow-2xl rounded-xl pointer-events-auto transform transition-all duration-300 ring-1 ring-black/5 overflow-hidden border-l-4 ${borderClass}`;
    alertDiv.innerHTML = `<div class="p-4 flex items-start"><div class="flex-shrink-0"><i class="fa-solid ${icon} text-xl"></i></div><div class="ml-3 w-0 flex-1 pt-0.5"><p class="text-sm font-medium text-slate-900 dark:text-white uppercase">${type}</p><p class="mt-1 text-xs text-slate-500 dark:text-slate-300">${escapeHTML(message)}</p></div><div class="ml-4 flex flex-shrink-0"><button onclick="document.getElementById('customAlert').style.display='none'" class="text-slate-400 hover:text-slate-500 dark:hover:text-white"><i class="fa-solid fa-xmark"></i></button></div></div>`;
    alertDiv.style.display = 'block';
    if (window.alertTimeout) clearTimeout(window.alertTimeout);
    window.alertTimeout = setTimeout(() => { alertDiv.style.display = 'none'; }, 4000);
}

function showLoading(msg='Cargando...') {
    if (document.getElementById('loadingOverlay')) return;
    const o = document.createElement('div'); o.id = 'loadingOverlay'; o.className = 'loading-overlay fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm'; 
    o.innerHTML = `<div class="spinner border-4 border-slate-200 dark:border-slate-700 border-t-blue-600 dark:border-t-blue-500 rounded-full w-10 h-10 animate-spin"></div><p class="text-xs font-bold text-slate-600 dark:text-slate-300 mt-4 animate-pulse">${escapeHTML(msg)}</p>`;
    document.body.appendChild(o);
}
function hideLoading() { const o = document.getElementById('loadingOverlay'); if(o) o.remove(); }
let debounceTimer;
function debounce(func, delay) { return function() { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => func.apply(this, arguments), delay); } }
function preventDefaults(e){ e.preventDefault(); e.stopPropagation(); }
function escapeHTML(str) { return !str ? '' : String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function formatDate(d) { return d ? d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'; }
function getWeekIdentifierString(d) { const date = new Date(d.getTime()); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7); var week1 = new Date(date.getFullYear(), 0, 4); return `${date.getFullYear()}-W${String(1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)).padStart(2, '0')}`; }
async function createNotification(recipientEmail, type, title, message, orderId) { try { await db_firestore.collection('notifications').add({ recipientEmail: recipientEmail.toLowerCase().trim(), type, title, message, orderId, read: false, timestamp: new Date().toISOString() }); } catch (e) { console.error("Error notify:", e); } }

// ======================================================
// ===== 4. INICIALIZACIÓN Y AUTH =====
// ======================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('App v7.2 Loaded (Bugfixes + Performance)');
    
    // BUG #2 FIX: InitTheme ya está definido arriba
    initTheme();
    
    const btnLogin = document.getElementById('loginButton');
    if(btnLogin) btnLogin.addEventListener('click', iniciarLoginConGoogle);
    const btnLogout = document.getElementById('logoutNavBtn');
    if(btnLogout) btnLogout.addEventListener('click', iniciarLogout);

    firebase.auth().onAuthStateChanged((user) => {
        const login = document.getElementById('loginSection');
        const upload = document.getElementById('uploadSection');
        const main = document.getElementById('appMainContainer');
        const nav = document.getElementById('mainNavigation');

        if (user) {
            usuarioActual = user;
            if(document.getElementById('navUserName')) document.getElementById('navUserName').textContent = user.displayName;
            const userEmail = user.email.toLowerCase();
            db_firestore.collection('users').doc(userEmail).get().then((doc) => {
                if (doc.exists && doc.data().role === 'admin') {
                    userRole = 'admin';
                    if(document.getElementById('nav-resetApp')) document.getElementById('nav-resetApp').style.display = 'flex';
                    if(document.getElementById('nav-manageTeam')) document.getElementById('nav-manageTeam').style.display = 'flex';
                } else {
                    userRole = 'user';
                    if(document.getElementById('nav-resetApp')) document.getElementById('nav-resetApp').style.display = 'none';
                    if(document.getElementById('nav-manageTeam')) document.getElementById('nav-manageTeam').style.display = 'none';
                }
            }).catch(() => { userRole = 'user'; });

            login.style.display = 'none';
            if (!isExcelLoaded) {
                upload.style.display = 'block'; main.style.display = 'none'; nav.style.display = 'none'; main.classList.remove('main-content-shifted');
            } else {
                upload.style.display = 'none'; main.style.display = 'block'; nav.style.display = 'flex'; main.classList.add('main-content-shifted');
            }
            conectarDatosDeFirebase();
        } else {
            desconectarDatosDeFirebase(); usuarioActual = null; isExcelLoaded = false; userRole = 'user';
            login.style.display = 'flex'; upload.style.display = 'none'; main.style.display = 'none'; nav.style.display = 'none'; main.classList.remove('main-content-shifted');
        }
    });

    // Sidebar & Filtros
    const sidebarBtn = document.getElementById('sidebarToggleBtn');
    if (sidebarBtn) sidebarBtn.addEventListener('click', () => { document.body.classList.toggle('sidebar-collapsed'); });
    const searchInp = document.getElementById('searchInput');
    if(searchInp) searchInp.addEventListener('input', debounce((e) => { currentSearch = e.target.value; currentPage = 1; updateTable(); }, 300));
    ['clientFilter', 'styleFilter', 'teamFilter', 'departamentoFilter', 'designerFilter', 'customStatusFilter', 'dateFrom', 'dateTo'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('change', debounce((e) => {
            if(id==='clientFilter') currentClientFilter = e.target.value;
            if(id==='styleFilter') currentStyleFilter = e.target.value;
            if(id==='teamFilter') currentTeamFilter = e.target.value;
            if(id==='departamentoFilter') currentDepartamentoFilter = e.target.value;
            if(id==='designerFilter') currentDesignerFilter = e.target.value;
            if(id==='customStatusFilter') currentCustomStatusFilter = e.target.value;
            if(id==='dateFrom') currentDateFrom = e.target.value;
            if(id==='dateTo') currentDateTo = e.target.value;
            currentPage = 1; updateTable();
        }, 150));
    });

    const dropZone = document.getElementById('dropZone'), fileInput = document.getElementById('fileInput');
    if(dropZone && fileInput) {
        ['dragenter','dragover','dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, preventDefaults, false));
        dropZone.addEventListener('drop', (e) => { dropZone.classList.remove('border-blue-500','bg-blue-50'); handleFiles(e.dataTransfer.files); });
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    }

    const delegate = (id, sel, cb) => { const el = document.getElementById(id); if(el) el.addEventListener('click', e => { const t = e.target.closest(sel); if(t) cb(t, e); }); };
    delegate('designerManagerList', '.btn-delete-designer', (btn) => deleteDesigner(btn.dataset.id, btn.dataset.name));
    delegate('metricsSidebarList', '.filter-btn', (btn) => {
        document.querySelectorAll('#metricsSidebarList .filter-btn').forEach(b => b.classList.remove('active', 'bg-blue-50', 'border-blue-200'));
        btn.classList.add('active', 'bg-blue-50', 'border-blue-200');
        generateDesignerMetrics(btn.dataset.designer);
    });
    delegate('childOrdersList', '.btn-delete-child', (btn, e) => { e.stopPropagation(); deleteChildOrder(btn.dataset.childId, btn.dataset.childCode); });
    
    // FIX BUG #8: removeOrderFromPlan is now defined properly below
    delegate('view-workPlanContent', '.btn-remove-from-plan', (btn, e) => { e.stopPropagation(); removeOrderFromPlan(btn.dataset.planEntryId, btn.dataset.orderCode); });
});

function iniciarLoginConGoogle() { firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => showCustomAlert(e.message, 'error')); }
function iniciarLogout() { firebase.auth().signOut().then(() => { document.getElementById('mainNavigation').style.transform = 'translateX(-100%)'; document.getElementById('appMainContainer').classList.remove('main-content-shifted'); }); }

// ======================================================
// ===== 5. LÓGICA DE DATOS (FIXED MEMORY LEAKS) =====
// ======================================================

function conectarDatosDeFirebase() {
    if (!usuarioActual) return;
    const navDbStatus = document.getElementById('navDbStatus'); 
    const setStatus = (c) => { if(navDbStatus) navDbStatus.innerHTML = c ? `<span class="w-1.5 h-1.5 rounded-full bg-green-500"></span> Conectado` : `<span class="w-1.5 h-1.5 rounded-full bg-yellow-500"></span> Sincronizando...`; };
    setStatus(false);
    loadMasterOrders().then(() => { console.log("Datos maestros listos."); setupRealtimeListeners(setStatus); });
}

async function loadMasterOrders() {
    try {
        const snapshot = await db_firestore.collection('master_orders').get();
        masterOrdersMap.clear();
        snapshot.forEach(doc => masterOrdersMap.set(doc.id, doc.data()));
        masterOrdersLoaded = true;
        isExcelLoaded = masterOrdersMap.size > 0; 
        if (masterOrdersMap.size > 0) {
            rebuildAllOrders();
            document.getElementById('uploadSection').style.display = 'none';
            document.getElementById('appMainContainer').style.display = 'block';
            document.getElementById('appMainContainer').classList.add('main-content-shifted');
            document.getElementById('mainNavigation').style.display = 'flex';
            setTimeout(() => document.getElementById('mainNavigation').style.transform = 'translateX(0)', 50);
            navigateTo('dashboard');
        }
    } catch (e) { console.error("Error master:", e); showCustomAlert("Error cargando base de datos.", "error"); }
}

function setupRealtimeListeners(statusCallback) {
    unsubscribeAssignments = db_firestore.collection('assignments').onSnapshot(s => {
        firebaseAssignmentsMap.clear(); s.forEach(d => firebaseAssignmentsMap.set(d.id, d.data()));
        if(masterOrdersLoaded) mergeYActualizar(); 
        statusCallback(true);
    });
    unsubscribeHistory = db_firestore.collection('history').orderBy('timestamp', 'desc').limit(100).onSnapshot(s => {
        firebaseHistoryMap.clear(); s.forEach(d => { const v = d.data(); if(!firebaseHistoryMap.has(v.orderId)) firebaseHistoryMap.set(v.orderId, []); firebaseHistoryMap.get(v.orderId).push(v); });
    });
    unsubscribeChildOrders = db_firestore.collection('childOrders').onSnapshot(s => {
        firebaseChildOrdersMap.clear(); s.forEach(d => { const v = d.data(); if(!firebaseChildOrdersMap.has(v.parentOrderId)) firebaseChildOrdersMap.set(v.parentOrderId, []); firebaseChildOrdersMap.get(v.parentOrderId).push(v); });
        needsRecalculation = true; if(masterOrdersLoaded) mergeYActualizar();
    });
    unsubscribeDesigners = db_firestore.collection('designers').orderBy('name').onSnapshot(s => {
        firebaseDesignersMap.clear(); let newDesignerList = [];
        s.forEach(d => { const v = d.data(); firebaseDesignersMap.set(d.id, v); newDesignerList.push(v.name); if (usuarioActual && v.email && v.email.toLowerCase() === usuarioActual.email.toLowerCase()) currentDesignerName = v.name; });
        designerList = newDesignerList; updateAllDesignerDropdowns(); populateDesignerManagerModal(); if(document.getElementById('dashboard').style.display === 'block') updateDashboard();
    });
    unsubscribeWeeklyPlan = db_firestore.collection('weeklyPlan').onSnapshot(s => {
        firebaseWeeklyPlanMap.clear(); s.forEach(d => { const v = d.data(); if(!firebaseWeeklyPlanMap.has(v.weekIdentifier)) firebaseWeeklyPlanMap.set(v.weekIdentifier, []); firebaseWeeklyPlanMap.get(v.weekIdentifier).push(v); });
        if(document.getElementById('workPlanView').style.display === 'block') generateWorkPlan();
    });
    listenToMyNotifications();
}

function desconectarDatosDeFirebase() {
    if(unsubscribeAssignments) unsubscribeAssignments(); if(unsubscribeHistory) unsubscribeHistory();
    if(unsubscribeChildOrders) unsubscribeChildOrders(); if(unsubscribeDesigners) unsubscribeDesigners();
    if(unsubscribeWeeklyPlan) unsubscribeWeeklyPlan(); if(unsubscribeNotifications) unsubscribeNotifications(); 
    // BUG #4 FIX: Limpiar chat listener también
    if(unsubscribeChat) unsubscribeChat();
    autoCompletedOrderIds.clear(); masterOrdersLoaded = false;
}

// ... (Resto de Notificaciones y RebuildAllOrders igual) ...

function mergeYActualizar() {
    if (!masterOrdersLoaded) return;
    
    // BUG #9 FIX: Optimización de recálculo
    if (needsRecalculation) {
        recalculateChildPieces(); 
        needsRecalculation = false;
    }
    
    autoCompleteBatchWrites = []; 
    filteredCache.key = null;

    for (let i = 0; i < allOrders.length; i++) {
        const o = allOrders[i];
        const fb = firebaseAssignmentsMap.get(o.orderId);
        
        if (fb) {
            o.designer = fb.designer || ''; o.customStatus = fb.customStatus || '';
            o.receivedDate = fb.receivedDate || ''; o.notes = fb.notes || ''; o.completedDate = fb.completedDate || null;
            o.complexity = fb.complexity || 'Media'; 
        } else {
            o.designer = ''; o.customStatus = ''; o.receivedDate = ''; o.notes = ''; o.completedDate = null; o.complexity = 'Media';
        }

        if (fb && o.departamento !== CONFIG.DEPARTMENTS.ART && o.departamento !== CONFIG.DEPARTMENTS.NONE) {
            if (fb.customStatus !== CONFIG.STATUS.COMPLETED && !autoCompletedOrderIds.has(o.orderId)) {
                autoCompleteBatchWrites.push({
                    orderId: o.orderId, displayCode: o.codigoContrato,
                    data: { customStatus: CONFIG.STATUS.COMPLETED, completedDate: new Date().toISOString(), lastModified: new Date().toISOString(), schemaVersion: CONFIG.DB_VERSION },
                    history: [`Salio de Arte (en ${o.departamento}) → Completada`]
                });
                autoCompletedOrderIds.add(o.orderId);
            }
        }
    }
    
    if (document.getElementById('dashboard').style.display === 'block') updateDashboard(); 
    if (autoCompleteBatchWrites.length > 0) confirmAutoCompleteBatch();
}

// BUG #5 FIX: Limpiar IDs
async function ejecutarAutoCompleteBatch() {
    if (!usuarioActual || autoCompleteBatchWrites.length === 0) return;
    document.body.classList.add('processing-batch');
    await safeFirestoreOperation(async () => {
        const batch = db_firestore.batch();
        const user = usuarioActual.displayName;
        autoCompleteBatchWrites.slice(0, 400).forEach(w => {
            batch.set(db_firestore.collection('assignments').doc(w.orderId), w.data, { merge: true });
            batch.set(db_firestore.collection('history').doc(), { orderId: w.orderId, change: w.history[0], user, timestamp: new Date().toISOString() });
            autoCompletedOrderIds.add(w.orderId);
        });
        await batch.commit();
        autoCompleteBatchWrites = []; 
        
        // BUG #5 FIX: Limpieza de memoria
        if (autoCompletedOrderIds.size > 1000) {
            const arr = Array.from(autoCompletedOrderIds);
            autoCompletedOrderIds.clear();
            arr.slice(-500).forEach(id => autoCompletedOrderIds.add(id));
        }
        return true;
    }, 'Sincronizando...', 'Estados actualizados.');
    document.body.classList.remove('processing-batch');
}

// ======================================================
// ===== 6. PARSER EXCEL & CLOUD UPLOAD (DIFFERENTIAL) =====
// ======================================================

function handleFiles(files) {
    if (files.length > 0) {
        document.getElementById('fileName').textContent = files[0].name;
        processAndUploadFile(files[0]);
    }
}

async function processAndUploadFile(file) {
    // 1. Verificación de Rol
    if (userRole !== 'admin') {
        return showCustomAlert('Solo los administradores pueden actualizar la Base de Datos Maestra.', 'error');
    }

    showLoading('Analizando Excel...');
    
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        
        const sheetName = workbook.SheetNames.find(n => /working\s*pro[c]{1,2}ess/i.test(n));
        if (!sheetName) throw new Error('No se encontró la hoja "Working Process".');
        
        const arr = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
        
        // Escaneo de Encabezados
        let hIdx = -1;
        for (let i = 0; i < Math.min(arr.length, 20); i++) {
            const r = arr[i].map(c => String(c).toLowerCase().trim());
            if (r.some(c => c.includes('fecha')) && r.some(c => c.includes('cliente'))) { hIdx = i; break; }
        }
        if (hIdx === -1) throw new Error('Encabezados clave no encontrados.');

        const rawHeaders = arr[hIdx].map(h => String(h).trim().replace(/,/g, '').toLowerCase());
        
        const cols = {
            fecha: rawHeaders.findIndex(h => h.includes('fecha')),
            cliente: rawHeaders.findIndex(h => h.includes('cliente')),
            codigo: rawHeaders.findIndex(h => h.includes('codigo') || h.includes('contrato')),
            estilo: rawHeaders.findIndex(h => h.includes('estilo')),
            team: rawHeaders.findIndex(h => h.includes('team'))
        };

        const depts = [
            { p: /p[_\s]*art/i, n: CONFIG.DEPARTMENTS.ART }, 
            { p: /p[_\s]*sew/i, n: CONFIG.DEPARTMENTS.SEW },
            { p: /p[_\s]*cut/i, n: CONFIG.DEPARTMENTS.CUT }, 
            { p: /p[_\s]*print/i, n: CONFIG.DEPARTMENTS.PRINT },
            { p: /p[_\s]*press/i, n: CONFIG.DEPARTMENTS.PRESS }, 
            { p: /p[_\s]*ship/i, n: CONFIG.DEPARTMENTS.SHIP }
        ];
        
        const deptCols = [];
        rawHeaders.forEach((h, i) => { 
            const m = depts.find(d => d.p.test(h)); 
            if (m) deptCols.push({ idx: i, name: m.n }); 
        });

        showLoading('Calculando diferencias...');
        const rows = arr.slice(hIdx + 1);
        let batchData = [];
        
        // Contexto Fill-Down
        let currentClient = "", currentContrato = "", currentStyle = "", currentTeam = "", currentDate = null;

        for (const r of rows) {
            if (!r || r.every(c => !c)) continue;
            
            if (cols.fecha >= 0 && r[cols.fecha]) { 
                const v = r[cols.fecha]; 
                let dObj = null;
                if (typeof v === 'number') dObj = new Date((v - 25569) * 86400 * 1000);
                else { const parsed = new Date(v); if (!isNaN(parsed.getTime())) dObj = parsed; }
                if (dObj) currentDate = new Date(Date.UTC(dObj.getFullYear(), dObj.getMonth(), dObj.getDate()));
            }
            
            if (cols.cliente >= 0 && r[cols.cliente]) currentClient = String(r[cols.cliente]).trim();
            if (cols.codigo >= 0 && r[cols.codigo]) currentContrato = String(r[cols.codigo]).trim();
            if (cols.estilo >= 0 && r[cols.estilo]) currentStyle = String(r[cols.estilo]).trim();
            if (cols.team >= 0 && r[cols.team]) currentTeam = String(r[cols.team]).trim();

            if (!currentClient || !currentContrato) continue;

            let qty = 0, dept = CONFIG.DEPARTMENTS.NONE;
            for (let i = deptCols.length - 1; i >= 0; i--) {
                const val = r[deptCols[i].idx];
                if (val) { 
                    const n = Number(String(val).replace(/[^0-9.-]+/g,"")); 
                    if (!isNaN(n) && n > 0) { qty = n; dept = deptCols[i].name; break; } 
                }
            }

            const timePart = currentDate ? currentDate.getTime() : 'nodate';
            const oid = `${currentClient}_${currentContrato}_${timePart}_${currentStyle}`;
            const fdISO = currentDate ? currentDate.toISOString() : null;

            // --- OPTIMIZACIÓN C: ESCRITURA DIFERENCIAL ---
            // Comparamos con lo que ya tenemos en memoria (masterOrdersMap)
            const existing = masterOrdersMap.get(oid);
            
            let hasChanges = true;
            if (existing) {
                // Si existe, verificamos si algo importante cambió
                if (existing.cantidad === qty && 
                    existing.departamento === dept && 
                    existing.fechaDespacho === fdISO &&
                    existing.teamName === currentTeam) {
                    hasChanges = false; // Datos idénticos, no subir
                }
            }

            if (hasChanges) {
                batchData.push({
                    orderId: oid,
                    fechaDespacho: fdISO,
                    cliente: currentClient,
                    codigoContrato: currentContrato,
                    estilo: currentStyle,
                    teamName: currentTeam,
                    departamento: dept,
                    cantidad: qty,
                    lastModified: new Date().toISOString() // Timestamp para sincronización futura
                });
            }
        }

        if (batchData.length === 0) {
            showCustomAlert('El archivo se analizó pero no hay cambios nuevos para subir.', 'success');
            hideLoading();
            return;
        }

        // Subida en lotes de solo lo que cambió
        await uploadBatchesToFirestore(batchData);

    } catch (e) { 
        showCustomAlert(e.message, 'error'); 
        console.error(e); 
    } finally { 
        hideLoading(); 
    }
}

async function uploadBatchesToFirestore(dataArray) {
    const BATCH_SIZE = 400; 
    const totalBatches = Math.ceil(dataArray.length / BATCH_SIZE);
    
    showLoading(`Actualizando ${dataArray.length} registros en la nube...`);
    
    for (let i = 0; i < totalBatches; i++) {
        const start = i * BATCH_SIZE;
        const end = start + BATCH_SIZE;
        const chunk = dataArray.slice(start, end);
        
        const batch = db_firestore.batch();
        chunk.forEach(item => {
            const ref = db_firestore.collection('master_orders').doc(item.orderId);
            batch.set(ref, item, { merge: true });
        });
        
        showLoading(`Sincronizando bloque ${i + 1} de ${totalBatches}...`);
        await batch.commit();
    }
    
    showCustomAlert(`¡Éxito! Se actualizaron ${dataArray.length} órdenes.`, 'success');
    document.getElementById('uploadSection').style.display = 'none';
    
    // Recargar datos locales para reflejar los cambios
    loadMasterOrders();
}
// ======================================================
// ===== 7. FILTRADO OPTIMIZADO (SPRINT 1 - CACHÉ) =====
// ======================================================

function getFilteredOrders() {
    const currentFilterKey = JSON.stringify({
        s: currentSearch.trim().toLowerCase(),
        c: currentClientFilter, d: currentDepartamentoFilter, des: currentDesignerFilter, st: currentCustomStatusFilter,
        f: currentFilter, df: currentDateFrom, dt: currentDateTo, sort: sortConfig
    });

    const now = Date.now();
    if (filteredCache.key === currentFilterKey && (now - filteredCache.timestamp < 2000)) {
        return filteredCache.results;
    }

    let res = allOrders;
    const s = currentSearch.toLowerCase();
    
    if (s) {
        res = res.filter(o => 
            (o.cliente || '').toLowerCase().includes(s) || (o.codigoContrato || '').toLowerCase().includes(s) || 
            (o.estilo || '').toLowerCase().includes(s) || (o.designer || '').toLowerCase().includes(s)
        );
    }
    
    if (currentClientFilter) res = res.filter(o => o.cliente === currentClientFilter);
    
    if (currentDepartamentoFilter) res = res.filter(o => o.departamento === currentDepartamentoFilter);
    else res = res.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART); 
    
    if (currentDesignerFilter) res = res.filter(o => o.designer === currentDesignerFilter);
    if (currentCustomStatusFilter) res = res.filter(o => o.customStatus === currentCustomStatusFilter);
    
    if (currentFilter === 'late') res = res.filter(o => o.isLate);
    else if (currentFilter === 'veryLate') res = res.filter(o => o.isVeryLate);
    else if (currentFilter === 'aboutToExpire') res = res.filter(o => o.isAboutToExpire);
    
    if(currentDateFrom) res = res.filter(o => o.fechaDespacho && o.fechaDespacho >= new Date(currentDateFrom));
    if(currentDateTo) res = res.filter(o => o.fechaDespacho && o.fechaDespacho <= new Date(currentDateTo));

    res.sort((a, b) => {
        let va = a[sortConfig.key], vb = b[sortConfig.key];
        if (sortConfig.key === 'date') { va = a.fechaDespacho ? a.fechaDespacho.getTime() : 0; vb = b.fechaDespacho ? b.fechaDespacho.getTime() : 0; }
        if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
        return (va < vb ? -1 : 1) * (sortConfig.direction === 'asc' ? 1 : -1);
    });
    
    filteredCache = { key: currentFilterKey, results: res, timestamp: now };
    return res;
}

// ======================================================
// ===== 8. OPERACIONES BATCH & PLAN (BLINDADAS) =====
// ======================================================

function confirmAutoCompleteBatch() {
    if (document.body.classList.contains('processing-batch') || autoCompleteBatchWrites.length === 0) return;
    const count = autoCompleteBatchWrites.length;
    const examples = autoCompleteBatchWrites.slice(0, 3).map(w => w.displayCode).join(', ');
    const message = `Se han detectado ${count} órdenes que salieron de Arte (Ej: ${examples}...). \n\n¿Marcar como 'Completada'?`;

    showConfirmModal(message, () => ejecutarAutoCompleteBatch());
}

async function ejecutarAutoCompleteBatch() {
    if (!usuarioActual || autoCompleteBatchWrites.length === 0) return;
    document.body.classList.add('processing-batch');
    
    await safeFirestoreOperation(async () => {
        const batch = db_firestore.batch();
        const user = usuarioActual.displayName;
        
        autoCompleteBatchWrites.slice(0, 400).forEach(w => {
            const ref = db_firestore.collection('assignments').doc(w.orderId);
            batch.set(ref, w.data, { merge: true });
            const hRef = db_firestore.collection('history').doc();
            batch.set(hRef, { orderId: w.orderId, change: w.history[0], user, timestamp: new Date().toISOString() });
            autoCompletedOrderIds.add(w.orderId);
        });

        await batch.commit();
        autoCompleteBatchWrites = []; 
        return true;
    }, 'Sincronizando estados...', 'Estados actualizados correctamente.');
    
    document.body.classList.remove('processing-batch');
}

window.loadUrgentOrdersToPlan = async () => {
    const wid = document.getElementById('view-workPlanWeekSelector').value;
    if (!wid) return showCustomAlert('Selecciona una semana primero', 'error');
    
    const urgents = allOrders.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART && (o.isLate || o.isAboutToExpire));
    if (urgents.length === 0) return showCustomAlert('No hay órdenes urgentes', 'info');
    
    showConfirmModal(`Cargar ${urgents.length} órdenes urgentes al plan ${wid}?`, async () => {
        await safeFirestoreOperation(async () => {
            const batch = db_firestore.batch();
            let count = 0;
            urgents.slice(0, 450).forEach(o => {
                const pid = `${o.orderId}_${wid}`;
                const ref = db_firestore.collection('weeklyPlan').doc(pid);
                batch.set(ref, {
                    planEntryId: pid, orderId: o.orderId, weekIdentifier: wid, designer: o.designer || '',
                    cliente: o.cliente || '', codigoContrato: o.codigoContrato || '', estilo: o.estilo || '',
                    fechaDespacho: o.fechaDespacho ? o.fechaDespacho.toISOString() : null,
                    cantidad: o.cantidad || 0, childPieces: o.childPieces || 0, isLate: !!o.isLate, isAboutToExpire: !!o.isAboutToExpire,
                    addedAt: new Date().toISOString(), schemaVersion: CONFIG.DB_VERSION
                }, { merge: true });
                count++;
            });
            await batch.commit();
            generateWorkPlan(); 
            return true;
        }, `Cargando urgentes...`, `¡Éxito! ${urgents.length} órdenes agregadas.`);
    });
};

window.addSelectedToWorkPlan = async () => {
    if (selectedOrders.size === 0) return showCustomAlert('Selecciona órdenes primero', 'info');
    const wid = getWeekIdentifierString(new Date());

    await safeFirestoreOperation(async () => {
        const batch = db_firestore.batch();
        let count = 0;
        for (let id of selectedOrders) {
            const o = allOrders.find(x => x.orderId === id);
            if (o && o.departamento === CONFIG.DEPARTMENTS.ART) {
                const pid = `${o.orderId}_${wid}`;
                const ref = db_firestore.collection('weeklyPlan').doc(pid);
                batch.set(ref, {
                    planEntryId: pid, orderId: o.orderId, weekIdentifier: wid, designer: o.designer || '',
                    cliente: o.cliente, codigoContrato: o.codigoContrato, estilo: o.estilo,
                    fechaDespacho: o.fechaDespacho ? o.fechaDespacho.toISOString() : null,
                    cantidad: o.cantidad, childPieces: o.childPieces, isLate: !!o.isLate, isAboutToExpire: !!o.isAboutToExpire,
                    addedAt: new Date().toISOString(), schemaVersion: CONFIG.DB_VERSION
                }, { merge: true });
                count++;
            }
        }
        if (count === 0) throw new Error("Ninguna orden válida (deben estar en P_Art).");
        await batch.commit();
        clearSelection(); 
        if(document.getElementById('workPlanView').style.display === 'block') generateWorkPlan();
        return true;
    }, 'Agregando al plan...', `${selectedOrders.size} órdenes procesadas.`);
};
// ======================================================
// ===== 9. SISTEMA DE NAVEGACIÓN (ROUTER UI - BUG #6 FIX) =====
// ======================================================

function navigateTo(viewId) {
    // Protección: No navegar si no hay datos (salvo para ir a cargar archivo)
    if (!isExcelLoaded && viewId !== 'uploadSection') return;

    // 1. Ocultar todas las vistas
    document.querySelectorAll('.main-view').forEach(el => el.style.display = 'none');
    
    // 2. Mostrar vista objetivo
    const target = document.getElementById(viewId);
    if (target) {
        target.style.display = 'block';
        window.scrollTo(0, 0);
    }

    // 3. Resetear estilos del menú
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active-nav', 'bg-blue-50', 'text-blue-700', 'border-l-4', 'border-blue-600', 'font-bold');
        btn.classList.add('text-slate-500'); 
        const icon = btn.querySelector('i');
        if(icon) {
            // Limpiar colores específicos previos
            icon.className = icon.className.replace(/text-(blue|pink|orange|purple|green)-[0-9]+/g, '').trim();
            icon.classList.add('text-slate-400');
        }
    });

    // 4. Activar botón actual
    const activeBtn = document.getElementById('nav-' + viewId);
    if (activeBtn) {
        activeBtn.classList.add('active-nav', 'bg-blue-50', 'text-blue-700', 'border-l-4', 'border-blue-600', 'font-bold');
        activeBtn.classList.remove('text-slate-500');
        const icon = activeBtn.querySelector('i');
        if (icon) {
            icon.classList.remove('text-slate-400');
            if (viewId === 'dashboard') icon.classList.add('text-blue-600');
            if (viewId === 'kanbanView') icon.classList.add('text-pink-500');
            if (viewId === 'workPlanView') icon.classList.add('text-orange-500');
            if (viewId === 'designerMetricsView') icon.classList.add('text-purple-500');
            if (viewId === 'departmentMetricsView') icon.classList.add('text-green-500');
        }
    }

    // 5. Inicializar lógica específica de la vista
    if (viewId === 'dashboard') {
        updateDashboard();
    } 
    else if (viewId === 'kanbanView') {
        // BUG #6 FIX: Verificar existencia antes de llamar
        if (typeof updateKanbanDropdown === 'function') updateKanbanDropdown(); 
        if (typeof updateKanban === 'function') updateKanban(); 
    } 
    else if (viewId === 'workPlanView') {
        if (typeof generateWorkPlan === 'function') generateWorkPlan();
    }
    else if (viewId === 'designerMetricsView') {
        if (typeof populateMetricsSidebar === 'function') populateMetricsSidebar();
    }
    else if (viewId === 'departmentMetricsView') {
        if (typeof generateDepartmentMetrics === 'function') generateDepartmentMetrics();
    }
    
    // 6. Limpieza de memoria (Gráficos)
    if (viewId !== 'designerMetricsView' && viewId !== 'departmentMetricsView') {
        if (typeof destroyAllCharts === 'function') destroyAllCharts();
    }
}

// ======================================================
// ===== 10. RENDERIZADO UI (DASHBOARD & TABLAS) =====
// ======================================================

function updateDashboard() {
    if (!isExcelLoaded) return;
    
    if (needsRecalculation && typeof recalculateChildPieces === 'function') {
        recalculateChildPieces();
    }
    
    const artOrders = allOrders.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART);
    const stats = calculateStats(artOrders);
    
    if(document.getElementById('statTotal')) document.getElementById('statTotal').textContent = artOrders.length;
    
    // Protección contra NaN
    const totalPiezas = artOrders.reduce((s, o) => s + (Number(o.cantidad) || 0) + (Number(o.childPieces) || 0), 0);
    if(document.getElementById('statTotalPieces')) document.getElementById('statTotalPieces').textContent = totalPiezas.toLocaleString();
    
    if(document.getElementById('statLate')) document.getElementById('statLate').textContent = stats.late;
    if(document.getElementById('statExpiring')) document.getElementById('statExpiring').textContent = stats.aboutToExpire;
    if(document.getElementById('statOnTime')) document.getElementById('statOnTime').textContent = stats.onTime;
    
    const thisWeekCount = artOrders.filter(o => {
        if (!o.fechaDespacho) return false;
        const today = new Date(); today.setHours(0,0,0,0);
        const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
        return o.fechaDespacho >= today && o.fechaDespacho <= nextWeek;
    }).length;
    if(document.getElementById('statThisWeek')) document.getElementById('statThisWeek').textContent = thisWeekCount;
    
    updateAlerts(stats);
    updateWidgets(artOrders);
    
    // Solo actualizar dropdowns si es necesario (Optimización)
    if(document.getElementById('clientFilter') && document.getElementById('clientFilter').children.length <= 1) {
        populateFilterDropdowns();
    }
    
    updateTable();
}

function calculateStats(orders) {
    return {
        total: orders.length,
        late: orders.filter(o => o.isLate).length,
        veryLate: orders.filter(o => o.isVeryLate).length,
        aboutToExpire: orders.filter(o => o.isAboutToExpire).length,
        onTime: orders.filter(o => !o.isLate && !o.isAboutToExpire).length
    };
}

function updateAlerts(stats) {
    const container = document.getElementById('notif-system');
    if (!container) return;

    let html = '';
    if (stats.veryLate > 0) {
        html += `
        <div onclick="setFilter('veryLate'); toggleNotifications();" class="p-3 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer border-b border-slate-50 dark:border-slate-700 group transition flex gap-3 items-start bg-white dark:bg-slate-800">
            <div class="mt-1 text-red-500"><i class="fa-solid fa-circle-exclamation"></i></div>
            <div>
                <p class="text-xs font-bold text-slate-700 dark:text-slate-200 group-hover:text-red-600 dark:group-hover:text-red-400">Muy Atrasadas (>7 días)</p>
                <p class="text-[10px] text-slate-500 dark:text-slate-400">${stats.veryLate} órdenes requieren atención inmediata</p>
            </div>
        </div>`;
    }
    if (stats.aboutToExpire > 0) {
        html += `
        <div onclick="setFilter('aboutToExpire'); toggleNotifications();" class="p-3 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 cursor-pointer border-b border-slate-50 dark:border-slate-700 group transition flex gap-3 items-start bg-white dark:bg-slate-800">
            <div class="mt-1 text-yellow-500"><i class="fa-solid fa-stopwatch"></i></div>
            <div>
                <p class="text-xs font-bold text-slate-700 dark:text-slate-200 group-hover:text-yellow-600 dark:group-hover:text-yellow-400">Por Vencer (≤2 días)</p>
                <p class="text-[10px] text-slate-500 dark:text-slate-400">${stats.aboutToExpire} órdenes próximas a vencer</p>
            </div>
        </div>`;
    }
    
    container.innerHTML = html;
    if(typeof updateTotalBadge === 'function') updateTotalBadge();
}

function updateWidgets(artOrders) {
    // 1. Top Clientes
    const clientCounts = {};
    artOrders.forEach(o => clientCounts[o.cliente] = (clientCounts[o.cliente] || 0) + 1);
    const topClients = Object.entries(clientCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    
    const clientReport = document.getElementById('clientReport');
    if (clientReport) {
        clientReport.innerHTML = topClients.map(([c, n], i) => `
            <div class="flex justify-between py-2 border-b border-slate-50 dark:border-slate-700 last:border-0 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 px-2 rounded transition">
                <span class="text-slate-600 dark:text-slate-300 truncate w-40 font-medium" title="${c}">${i+1}. ${c}</span>
                <span class="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">${n}</span>
            </div>`).join('');
    }

    // 2. Carga de Trabajo (Soporte Array Excluidos)
    const workload = {};
    let totalWorkload = 0;
    
    artOrders.forEach(o => {
        if (o.designer) {
            const pieces = (Number(o.cantidad) || 0) + (Number(o.childPieces) || 0);
            workload[o.designer] = (workload[o.designer] || 0) + pieces;
            
            // FILTRO DE EXCLUIDOS MEJORADO (Array)
            if (!CONFIG.EXCLUDED_DESIGNERS.includes(o.designer)) {
                totalWorkload += pieces;
            }
        }
    });
    
    if(document.getElementById('workloadTotal')) document.getElementById('workloadTotal').textContent = totalWorkload.toLocaleString() + ' pzs';
    
    const workloadList = document.getElementById('workloadList');
    if (workloadList) {
        workloadList.innerHTML = Object.entries(workload)
            .sort((a, b) => b[1] - a[1])
            .map(([designer, pieces]) => {
                const isExcluded = CONFIG.EXCLUDED_DESIGNERS.includes(designer);
                const pct = (totalWorkload > 0 && !isExcluded) ? ((pieces / totalWorkload) * 100).toFixed(1) : 0;
                
                return `
                <div class="mb-3 ${isExcluded ? 'opacity-50' : ''}">
                    <div class="flex justify-between text-xs mb-1">
                        <span class="text-slate-700 dark:text-slate-300 font-bold truncate w-32">${designer} ${isExcluded ? '(Excl)' : ''}</span>
                        <span class="text-slate-500 dark:text-slate-400">${pieces.toLocaleString()} ${!isExcluded ? `(${pct}%)` : ''}</span>
                    </div>
                    <div class="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div class="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full" style="width: ${isExcluded ? 0 : pct}%"></div>
                    </div>
                </div>`;
            }).join('');
    }
}

function updateTable() {
    if (typeof getFilteredOrders !== 'function') return;
    
    const filtered = getFilteredOrders();
    const start = (currentPage - 1) * rowsPerPage;
    paginatedOrders = filtered.slice(start, start + rowsPerPage);
    
    if(document.getElementById('resultCount')) document.getElementById('resultCount').textContent = filtered.length;
    const totalTable = filtered.reduce((s, o) => s + (Number(o.cantidad) || 0) + (Number(o.childPieces) || 0), 0);
    if(document.getElementById('resultPieces')) document.getElementById('resultPieces').textContent = totalTable.toLocaleString();

    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    if (paginatedOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" class="text-center py-12 text-slate-400 italic">No se encontraron órdenes con los filtros actuales.</td></tr>`;
    } else {
        tbody.innerHTML = paginatedOrders.map(order => {
            const rowClass = order.isVeryLate ? 'very-late' : order.isLate ? 'late' : order.isAboutToExpire ? 'expiring' : '';
            const statusBadge = getStatusBadge(order);
            const internalBadge = getCustomStatusBadge(order.customStatus);
            const hasChild = order.childPieces > 0 ? `<span class="ml-1 text-[9px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 rounded-full font-bold border border-blue-200 dark:border-blue-800">+${order.childPieces}</span>` : '';
            const isArt = order.departamento === CONFIG.DEPARTMENTS.ART;

            const pillBase = "px-3 py-1 rounded-full text-xs font-medium border inline-block shadow-sm text-center whitespace-nowrap";
            let deptBadge = '-';
            if (order.departamento) {
                const isPArt = order.departamento === CONFIG.DEPARTMENTS.ART;
                const deptClass = isPArt ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' : 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600';
                deptBadge = `<span class="${pillBase} ${deptClass}">${escapeHTML(order.departamento)}</span>`;
            }

            let designerBadge = '<span class="text-slate-400 text-xs italic">--</span>';
            if (order.designer) {
                designerBadge = `<span class="${pillBase} bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800">${escapeHTML(order.designer)}</span>`;
            }

            return `
            <tr class="${rowClass} hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors cursor-pointer border-b border-slate-50 dark:border-slate-700 last:border-b-0" onclick="openAssignModal('${order.orderId}')">
                <td class="px-3 py-2.5 text-center" onclick="event.stopPropagation()">
                    ${isArt ? `<input type="checkbox" class="rounded border-slate-300 dark:border-slate-500 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" onchange="toggleOrderSelection('${order.orderId}')" ${selectedOrders.has(order.orderId) ? 'checked' : ''}>` : ''}
                </td>
                <td class="px-3 py-2.5" data-label="Estado">${statusBadge}</td>
                <td class="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap" data-label="Fecha">${formatDate(order.fechaDespacho)}</td>
                <td class="px-3 py-2.5 font-medium text-slate-900 dark:text-white truncate max-w-[160px]" title="${escapeHTML(order.cliente)}">${escapeHTML(order.cliente)}</td>
                <td class="px-3 py-2.5 text-slate-500 dark:text-slate-400 font-mono text-xs whitespace-nowrap">${escapeHTML(order.codigoContrato)}</td>
                <td class="px-3 py-2.5 text-slate-600 dark:text-slate-300 truncate max-w-[160px]" title="${escapeHTML(order.estilo)}">${escapeHTML(order.estilo)}</td>
                <td class="px-3 py-2.5 hidden lg:table-cell text-slate-500 dark:text-slate-400 text-[11px] max-w-[160px] truncate" title="${escapeHTML(order.teamName)}">${escapeHTML(order.teamName)}</td>
                <td class="px-3 py-2.5 hidden md:table-cell">${deptBadge}</td>
                <td class="px-3 py-2.5">${designerBadge}</td>
                <td class="px-3 py-2.5">${internalBadge}</td>
                <td class="px-3 py-2.5 hidden lg:table-cell text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">${order.receivedDate ? formatDate(new Date(order.receivedDate + 'T00:00:00')) : '-'}</td>
                <td class="px-3 py-2.5 text-right">
                    <div class="flex items-center justify-end gap-1 font-bold text-slate-700 dark:text-slate-200">
                        ${(Number(order.cantidad)||0).toLocaleString()} 
                        ${hasChild}
                    </div>
                </td>
                <td class="px-3 py-2.5 text-right">
                    <i class="fa-solid fa-chevron-right text-slate-300 dark:text-slate-600 text-[10px]"></i>
                </td>
            </tr>`;
        }).join('');
    }
    
    const sa = document.getElementById('selectAll');
    if (sa) {
        const allChecked = paginatedOrders.length > 0 && paginatedOrders.every(o => selectedOrders.has(o.orderId));
        sa.checked = allChecked;
        sa.indeterminate = !allChecked && paginatedOrders.some(o => selectedOrders.has(o.orderId));
    }
    
    const bar = document.getElementById('multiSelectBar');
    if (selectedOrders.size > 0) {
        bar.classList.add('active');
        document.getElementById('selectedCount').textContent = selectedOrders.size;
    } else {
        bar.classList.remove('active');
    }
    
    renderPagination();
}

// ======================================================
// ===== 11. MODALES Y ACCIONES (CON EMAIL LINKING) =====
// ======================================================

window.loadChildOrders = async () => {
    const list = document.getElementById('childOrdersList');
    if(!list) return;
    const children = firebaseChildOrdersMap.get(currentEditingOrderId) || [];
    document.getElementById('childOrderCount').textContent = children.length;
    
    list.innerHTML = children.map(c => `
        <div class="flex justify-between items-center bg-white dark:bg-slate-700 p-2 rounded border border-slate-200 dark:border-slate-600 shadow-sm text-xs">
            <div><strong class="text-blue-600 dark:text-blue-400 block">${escapeHTML(c.childCode)}</strong><span class="text-slate-500 dark:text-slate-300">${c.cantidad} pzs</span></div>
            <button class="btn-delete-child text-red-400 hover:text-red-600 p-1" data-child-id="${c.childOrderId}" data-child-code="${c.childCode}"><i class="fa-solid fa-trash"></i></button>
        </div>`).join('') || '<p class="text-slate-400 italic text-xs p-2 text-center">No hay órdenes hijas.</p>';
};

window.openAssignModal = async (id) => {
    currentEditingOrderId = id;
    const o = allOrders.find(x => x.orderId === id);
    if (!o) return;

    // UI Estática
    document.getElementById('detailCliente').textContent = o.cliente || '-';
    document.getElementById('detailCodigo').textContent = o.codigoContrato || '-';
    document.getElementById('detailEstilo').textContent = o.estilo || '-';
    document.getElementById('detailFecha').textContent = formatDate(o.fechaDespacho);
    const totalPcs = (Number(o.cantidad)||0) + (Number(o.childPieces)||0);
    document.getElementById('detailPiezas').textContent = `${(Number(o.cantidad)||0).toLocaleString()} (+${(Number(o.childPieces)||0)}) = ${totalPcs.toLocaleString()}`;
    
    // Inyección Selector Complejidad
    const statusSelect = document.getElementById('modalStatus');
    if (!document.getElementById('modalComplexityWrapper')) {
        const wrapper = document.createElement('div');
        wrapper.id = 'modalComplexityWrapper';
        wrapper.innerHTML = `<label class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">Complejidad Visual</label>
            <select id="modalComplexity" class="w-full rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white text-xs py-2 focus:ring-blue-500">
                <option value="Baja">🟢 Baja (Básico)</option><option value="Media">🟡 Media (Estándar)</option><option value="Alta">🔴 Alta (Complejo)</option>
            </select>`;
        if(statusSelect?.parentNode?.parentNode) {
            statusSelect.parentNode.parentNode.insertBefore(wrapper, statusSelect.parentNode.nextSibling);
            statusSelect.closest('.grid')?.classList.replace('grid-cols-2', 'md:grid-cols-3');
        }
    }

    // Valores Inputs
    document.getElementById('modalStatus').value = o.customStatus || 'Bandeja';
    document.getElementById('modalReceivedDate').value = o.receivedDate || new Date().toISOString().split('T')[0];
    if(document.getElementById('modalComplexity')) document.getElementById('modalComplexity').value = o.complexity || 'Media';

    // Auto-Asignación UI
    const designerSelect = document.getElementById('modalDesigner');
    const container = designerSelect.parentNode;
    if(document.getElementById('btn-self-assign')) document.getElementById('btn-self-assign').remove();
    
    designerSelect.style.display = 'block';
    designerSelect.value = o.designer || '';

    if (currentDesignerName && userRole !== 'admin') {
        designerSelect.style.display = 'none';
        const btn = document.createElement('button');
        btn.id = 'btn-self-assign';
        btn.className = 'w-full py-2 rounded-lg text-xs font-bold transition shadow-sm border flex items-center justify-center gap-2 mt-1';
        
        if (o.designer === currentDesignerName) {
            btn.classList.add('bg-red-50', 'text-red-600', 'border-red-200', 'hover:bg-red-100', 'dark:bg-red-900/30', 'dark:text-red-400', 'dark:border-red-800');
            btn.innerHTML = `<i class="fa-solid fa-user-xmark"></i> Liberar (Es mía)`;
            btn.onclick = () => { designerSelect.value = ''; saveAssignment(); };
        } else if (!o.designer || o.designer === 'Sin asignar') {
            btn.classList.add('bg-green-50', 'text-green-600', 'border-green-200', 'hover:bg-green-100', 'dark:bg-green-900/30', 'dark:text-green-400', 'dark:border-green-800');
            btn.innerHTML = `<i class="fa-solid fa-hand-point-up"></i> Tomar Orden`;
            btn.onclick = () => { designerSelect.value = currentDesignerName; saveAssignment(); };
        } else {
            btn.classList.add('bg-slate-100', 'text-slate-500', 'border-slate-200', 'cursor-not-allowed', 'dark:bg-slate-700', 'dark:text-slate-400', 'dark:border-slate-600');
            btn.innerHTML = `<i class="fa-solid fa-lock"></i> De: ${o.designer}`;
            btn.disabled = true;
        }
        container.appendChild(btn);
    }
    
    // Historial
    const h = firebaseHistoryMap.get(id) || [];
    document.getElementById('modalHistory').innerHTML = h.length ? h.reverse().map(x => `
        <div class="border-b border-slate-100 dark:border-slate-700 pb-2 last:border-0 mb-2">
            <div class="flex justify-between items-center text-[10px] text-slate-400 mb-0.5"><span>${new Date(x.timestamp).toLocaleString()}</span><span>${escapeHTML(x.user)}</span></div>
            <div class="text-xs text-slate-600 dark:text-slate-300">${escapeHTML(x.change)}</div>
        </div>`).join('') : '<p class="text-slate-400 italic text-xs text-center py-4">Sin historial.</p>';

    if (typeof loadOrderComments === 'function') loadOrderComments(id);
    await loadChildOrders();
    openModalById('assignModal');
};

window.saveAssignment = async () => {
    if (!currentEditingOrderId) return;
    const o = allOrders.find(x => x.orderId === currentEditingOrderId);
    
    const desName = document.getElementById('modalDesigner').value;
    const stat = document.getElementById('modalStatus').value;
    const rd = document.getElementById('modalReceivedDate').value;
    const comp = document.getElementById('modalComplexity') ? document.getElementById('modalComplexity').value : 'Media';
    
    const changes = []; 
    const data = {};
    
    // --- LÓGICA DE EMAIL VINCULADO ---
    let desEmail = null;
    if (desName && desName !== 'Sin asignar') {
        // Buscar el email correspondiente al nombre seleccionado
        firebaseDesignersMap.forEach(dData => { 
            if (dData.name === desName) desEmail = dData.email; 
        });
    }

    // 1. Cambio de Diseñador
    if(o.designer !== desName) { 
        changes.push(`Diseñador: ${o.designer || 'N/A'} -> ${desName}`); 
        data.designer = desName; 
        data.designerEmail = desEmail; // <--- AQUÍ GUARDAMOS EL EMAIL EN LA BD

        // Notificación
        if (desEmail && usuarioActual && usuarioActual.email !== desEmail) {
            if(typeof createNotification === 'function') {
                createNotification(desEmail, 'assign', 'Nueva Asignación', `${usuarioActual.displayName || 'Admin'} te asignó ${o.codigoContrato}`, currentEditingOrderId);
            }
        }
    }

    // 2. Cambio de Estado
    if(o.customStatus !== stat) { 
        changes.push(`Estado: ${o.customStatus || 'N/A'} -> ${stat}`); 
        data.customStatus = stat; 
        if(stat === CONFIG.STATUS.COMPLETED) data.completedDate = new Date().toISOString(); 
    }
    
    if(o.receivedDate !== rd) { changes.push(`Fecha Rx: ${rd}`); data.receivedDate = rd; }
    
    // 3. Complejidad
    if((o.complexity || 'Media') !== comp) {
        changes.push(`Complejidad: ${o.complexity || 'Media'} -> ${comp}`);
        data.complexity = comp;
        o.complexity = comp; 
    }
    
    if(changes.length === 0) return showCustomAlert('Sin cambios', 'info');

    const ok = await safeFirestoreOperation(async () => {
        const batch = db_firestore.batch();
        // Guardamos nombre Y email
        batch.set(db_firestore.collection('assignments').doc(currentEditingOrderId), { 
            ...data, lastModified: new Date().toISOString(), schemaVersion: CONFIG.DB_VERSION 
        }, { merge: true });
        
        changes.forEach(c => {
            batch.set(db_firestore.collection('history').doc(), { 
                orderId: currentEditingOrderId, change: c, user: usuarioActual.displayName, timestamp: new Date().toISOString() 
            });
        });
        await batch.commit();
    }, 'Guardando...', 'Guardado');

    if(ok) closeTopModal();
};

// --- Funciones de soporte (Hijas, Batch, Equipo) se mantienen igual ---
window.openAddChildModal = () => {
    const o = allOrders.find(x => x.orderId === currentEditingOrderId);
    document.getElementById('parentOrderInfo').textContent = `${o.cliente} - ${o.estilo}`;
    document.getElementById('childOrderCode').value = o.codigoContrato + '-';
    document.getElementById('childOrderNumber').value = '';
    document.getElementById('childPieces').value = '';
    openModalById('addChildModal');
};
window.updateChildOrderCode = () => {
    const o = allOrders.find(x => x.orderId === currentEditingOrderId);
    if(o) document.getElementById('childOrderCode').value = `${o.codigoContrato}-${document.getElementById('childOrderNumber').value}`;
};
window.saveChildOrder = async () => {
    const o = allOrders.find(x => x.orderId === currentEditingOrderId);
    const num = document.getElementById('childOrderNumber').value;
    const pcs = parseInt(document.getElementById('childPieces').value);
    const date = document.getElementById('childDeliveryDate').value;
    if (!num || !pcs) return showCustomAlert('Datos incompletos', 'error');
    const ok = await safeFirestoreOperation(async () => {
        const childId = `${o.orderId}_child_${Date.now()}`;
        await db_firestore.collection('childOrders').doc(childId).set({
            childOrderId: childId, parentOrderId: o.orderId, childCode: `${o.codigoContrato}-${num}`,
            cantidad: pcs, fechaDespacho: date ? new Date(date) : (o.fechaDespacho || null), createdAt: new Date().toISOString(), schemaVersion: CONFIG.DB_VERSION
        });
    }, 'Creando...', 'Orden hija creada');
    if(ok) closeTopModal();
};
window.deleteChildOrder = async (id, code) => {
    if (userRole !== 'admin') return showCustomAlert('Acceso denegado', 'error');
    showConfirmModal(`¿Eliminar ${code}?`, async () => { await safeFirestoreOperation(() => db_firestore.collection('childOrders').doc(id).delete(), 'Eliminando...', 'Eliminada'); });
};
window.openMultiAssignModal = () => { 
    if (selectedOrders.size === 0) return showCustomAlert('Selecciona órdenes', 'info');
    document.getElementById('multiModalCount').textContent = selectedOrders.size;
    openModalById('multiAssignModal');
};
window.saveMultiAssignment = async () => {
    if (selectedOrders.size === 0) return;
    const d = document.getElementById('multiModalDesigner').value;
    const s = document.getElementById('multiModalStatus').value;
    const r = document.getElementById('multiModalReceivedDate').value;
    const n = document.getElementById('multiModalNotes').value;
    
    // Buscar email para asignación masiva
    let desEmail = null;
    if (d && d !== 'Sin asignar') {
        firebaseDesignersMap.forEach(dData => { if (dData.name === d) desEmail = dData.email; });
    }

    const ok = await safeFirestoreOperation(async () => {
        const batch = db_firestore.batch();
        let c = 0;
        selectedOrders.forEach(id => {
            const data = { schemaVersion: CONFIG.DB_VERSION, lastModified: new Date().toISOString() };
            if (d) { data.designer = d; data.designerEmail = desEmail; } // Guardamos email también
            if (s) data.customStatus = s; 
            if (r) data.receivedDate = r; if (n) data.notes = n; 
            if (Object.keys(data).length > 2) { 
                batch.set(db_firestore.collection('assignments').doc(id), data, { merge: true }); 
                c++; 
            }
        });
        if(c > 0) await batch.commit();
        else throw new Error("Sin cambios seleccionados.");
    }, 'Aplicando...', 'Actualizado');
    if(ok) { closeTopModal(); clearSelection(); }
};
window.openDesignerManager = () => { populateDesignerManagerModal(); openModalById('designerManagerModal'); };
function populateDesignerManagerModal() {
    const l = document.getElementById('designerManagerList');
    l.innerHTML = firebaseDesignersMap.size === 0 ? '<p class="text-center text-slate-400 text-xs py-4">Sin diseñadores.</p>' : '';
    firebaseDesignersMap.forEach((d, id) => {
        l.innerHTML += `<div class="flex justify-between items-center p-3 border-b border-slate-100 dark:border-slate-600 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700 rounded transition"><div><div class="font-bold text-slate-800 dark:text-white text-xs">${escapeHTML(d.name)}</div><div class="text-[10px] text-slate-400">${escapeHTML(d.email)}</div></div><button class="btn-delete-designer text-red-500 hover:text-red-700 text-[10px] font-bold px-2 py-1 bg-red-50 dark:bg-red-900/20 rounded hover:bg-red-100 transition" data-name="${escapeHTML(d.name)}" data-id="${id}">Eliminar</button></div>`;
    });
}
window.addDesigner = async () => {
    if (userRole !== 'admin') return showCustomAlert('Acceso denegado', 'error');
    const name = document.getElementById('newDesignerName').value.trim();
    const email = document.getElementById('newDesignerEmail').value.trim().toLowerCase();
    if(!name || !email) return showCustomAlert('Datos incompletos', 'error');
    const ok = await safeFirestoreOperation(() => db_firestore.collection('designers').add({ name, email, createdAt: new Date().toISOString() }), 'Agregando...', 'Agregado');
    if(ok) { document.getElementById('newDesignerName').value = ''; document.getElementById('newDesignerEmail').value = ''; populateDesignerManagerModal(); }
};
window.deleteDesigner = (id, name) => {
    if (userRole !== 'admin') return showCustomAlert('Acceso denegado', 'error');
    showConfirmModal(`¿Eliminar a ${name}?`, async () => { await safeFirestoreOperation(() => db_firestore.collection('designers').doc(id).delete(), 'Eliminando...', 'Eliminado'); });
};

// ======================================================
// ===== 12. MÉTRICAS DE DISEÑADORES (DARK MODE FIX) =====
// ======================================================

function populateMetricsSidebar() {
    const list = document.getElementById('metricsSidebarList');
    if (!list) return;
    
    const artOrders = allOrders.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART);
    const designers = {};
    
    artOrders.forEach(o => {
        const d = o.designer || 'Sin asignar';
        if (!designers[d]) designers[d] = { total: 0, pieces: 0 };
        designers[d].total++;
        designers[d].pieces += o.cantidad + o.childPieces;
    });
    
    list.innerHTML = Object.entries(designers)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([name, data]) => `
            <button class="filter-btn w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-blue-50 dark:hover:bg-slate-700 hover:border-blue-200 transition-all" data-designer="${escapeHTML(name)}">
                <div class="flex justify-between items-center">
                    <span class="font-bold text-slate-800 dark:text-white text-sm">${escapeHTML(name)}</span>
                    <span class="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full text-[10px] font-bold">${data.total}</span>
                </div>
                <div class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">${data.pieces.toLocaleString()} piezas</div>
            </button>
        `).join('');
}

function generateDesignerMetrics(designerName) {
    const detail = document.getElementById('metricsDetail');
    if (!detail) return;
    
    if (typeof Chart === 'undefined') {
        detail.innerHTML = '<div class="text-center py-12"><p class="text-red-600">Error: Chart.js no está cargado</p></div>';
        return;
    }
    
    const orders = allOrders.filter(o => 
        o.departamento === CONFIG.DEPARTMENTS.ART && 
        (designerName === 'Sin asignar' ? !o.designer : o.designer === designerName)
    );
    
    if (orders.length === 0) {
        detail.innerHTML = `<div class="text-center py-12"><i class="fa-regular fa-folder-open text-4xl text-slate-300 dark:text-slate-600 mb-3"></i><p class="text-slate-400">No hay órdenes para este diseñador</p></div>`;
        return;
    }
    
    const stats = calculateStats(orders);
    const totalPieces = orders.reduce((s, o) => s + o.cantidad + o.childPieces, 0);
    
    if (designerDoughnutChart) { designerDoughnutChart.destroy(); designerDoughnutChart = null; }
    if (designerBarChart) { designerBarChart.destroy(); designerBarChart = null; }
    
    // HTML CON CLASES DARK MODE AGREGADAS
    detail.innerHTML = `
        <div class="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white mb-6 shadow-lg">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-2xl font-bold">${escapeHTML(designerName)}</h2>
                <button onclick="openCompareModal('${escapeHTML(designerName)}')" class="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm font-medium transition">
                    <i class="fa-solid fa-code-compare mr-1"></i> Comparar
                </button>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                    <div class="text-white/70 text-xs uppercase font-bold mb-1">Total Órdenes</div>
                    <div class="text-3xl font-bold">${orders.length}</div>
                </div>
                <div class="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                    <div class="text-white/70 text-xs uppercase font-bold mb-1">Total Piezas</div>
                    <div class="text-3xl font-bold">${totalPieces.toLocaleString()}</div>
                </div>
            </div>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow border border-slate-200 dark:border-slate-700">
                <h3 class="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    <i class="fa-solid fa-chart-pie text-blue-500"></i> Distribución de Estados
                </h3>
                <div class="relative h-64 w-full">
                    <canvas id="designerDoughnutChart"></canvas>
                </div>
            </div>
            
            <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow border border-slate-200 dark:border-slate-700">
                <h3 class="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    <i class="fa-solid fa-chart-bar text-green-500"></i> Análisis de Entregas
                </h3>
                <div class="relative h-64 w-full">
                    <canvas id="designerBarChart"></canvas>
                </div>
            </div>
        </div>
        
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div class="bg-slate-50 dark:bg-slate-700 px-6 py-4 border-b border-slate-200 dark:border-slate-600 flex justify-between items-center">
                <h3 class="font-bold text-slate-800 dark:text-white">Detalle de Órdenes</h3>
                <button onclick="exportDesignerMetricsPDF('${escapeHTML(designerName)}')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition">
                    <i class="fa-solid fa-file-pdf mr-1"></i> Exportar PDF
                </button>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-xs text-slate-700 dark:text-slate-300">
                    <thead class="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600">
                        <tr class="text-left text-slate-600 dark:text-slate-400 uppercase font-bold">
                            <th class="px-4 py-3">Estado</th>
                            <th class="px-4 py-3">Cliente</th>
                            <th class="px-4 py-3">Código</th>
                            <th class="px-4 py-3">Estilo</th>
                            <th class="px-4 py-3">Fecha</th>
                            <th class="px-4 py-3 text-right">Piezas</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                        ${orders.map(o => `
                            <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer" onclick="openAssignModal('${o.orderId}')">
                                <td class="px-4 py-3">${getStatusBadge(o)}</td>
                                <td class="px-4 py-3 font-medium text-slate-900 dark:text-white">${escapeHTML(o.cliente)}</td>
                                <td class="px-4 py-3 font-mono text-slate-500 dark:text-slate-400">${escapeHTML(o.codigoContrato)}</td>
                                <td class="px-4 py-3">${escapeHTML(o.estilo)}</td>
                                <td class="px-4 py-3 text-slate-600 dark:text-slate-400">${formatDate(o.fechaDespacho)}</td>
                                <td class="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">${(o.cantidad + o.childPieces).toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    // (Resto del código de inicialización de Charts igual, solo cambia el HTML de arriba)
    setTimeout(() => {
        if (typeof Chart === 'undefined') return;

        const statusCounts = {
            [CONFIG.STATUS.TRAY]: orders.filter(o => o.customStatus === CONFIG.STATUS.TRAY).length,
            [CONFIG.STATUS.PROD]: orders.filter(o => o.customStatus === CONFIG.STATUS.PROD).length,
            [CONFIG.STATUS.AUDIT]: orders.filter(o => o.customStatus === CONFIG.STATUS.AUDIT).length,
            [CONFIG.STATUS.COMPLETED]: orders.filter(o => o.customStatus === CONFIG.STATUS.COMPLETED).length,
            'Sin Estado': orders.filter(o => !o.customStatus).length
        };
        
        const doughnutCanvas = document.getElementById('designerDoughnutChart');
        if (doughnutCanvas) {
            designerDoughnutChart = new Chart(doughnutCanvas, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(statusCounts),
                    datasets: [{
                        data: Object.values(statusCounts),
                        backgroundColor: ['#fbbf24', '#a855f7', '#3b82f6', '#64748b', '#e2e8f0'],
                        borderColor: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff'
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: document.documentElement.classList.contains('dark') ? '#cbd5e1' : '#666' } } } }
            });
        }
        
        const barCanvas = document.getElementById('designerBarChart');
        if (barCanvas) {
            designerBarChart = new Chart(barCanvas, {
                type: 'bar',
                data: {
                    labels: ['A Tiempo', 'Atrasadas', 'Muy Atrasadas'],
                    datasets: [{
                        label: 'Órdenes',
                        data: [stats.onTime, stats.late - stats.veryLate, stats.veryLate],
                        backgroundColor: ['#10b981', '#f59e0b', '#ef4444']
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    scales: { 
                        y: { beginAtZero: true, grid: { color: document.documentElement.classList.contains('dark') ? '#334155' : '#e5e5e5' }, ticks: { color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#666' } },
                        x: { grid: { display: false }, ticks: { color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#666' } }
                    },
                    plugins: { legend: { labels: { color: document.documentElement.classList.contains('dark') ? '#cbd5e1' : '#666' } } }
                }
            });
        }
    }, 100);
}

// ======================================================
// ===== 13. ANÁLISIS AVANZADO (LEAD TIME & CALIDAD) =====
// ======================================================

function generateDepartmentMetrics() {
    const content = document.getElementById('departmentMetricsContent');
    if (!content) return;
    
    if (typeof Chart === 'undefined') {
        content.innerHTML = '<p class="text-red-500 text-center">Chart.js no cargado</p>';
        return;
    }
    
    if (deptLoadPieChart) { deptLoadPieChart.destroy(); deptLoadPieChart = null; }
    if (deptLoadBarChart) { deptLoadBarChart.destroy(); deptLoadBarChart = null; }

    const leadTimes = {}; 
    const reworkCounts = {}; 
    const complexityDist = { 'Baja': 0, 'Media': 0, 'Alta': 0 }; 
    
    const artOrders = allOrders.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART);
    
    artOrders.forEach(o => {
        const designer = o.designer || 'Sin asignar';
        
        // FILTRO DE EXCLUIDOS (Array)
        if (CONFIG.EXCLUDED_DESIGNERS.includes(designer)) return;

        // A. Lead Time
        if (o.customStatus === CONFIG.STATUS.COMPLETED && o.receivedDate && o.completedDate) {
            const start = new Date(o.receivedDate);
            const end = new Date(o.completedDate);
            const diffTime = Math.abs(end - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            if (!leadTimes[designer]) leadTimes[designer] = { totalDays: 0, count: 0 };
            leadTimes[designer].totalDays += diffDays;
            leadTimes[designer].count++;
        }

        // B. Complejidad
        const comp = o.complexity || 'Media'; 
        if (complexityDist[comp] !== undefined) complexityDist[comp]++;

        // C. Retrabajo
        const hist = firebaseHistoryMap.get(o.orderId) || [];
        const hasRework = hist.some(h => {
            const t = h.change.toLowerCase();
            return (t.includes('auditoría -> producción') || 
                    t.includes('completada -> producción') || 
                    t.includes('completada -> auditoría'));
        });

        if (hasRework) {
            reworkCounts[designer] = (reworkCounts[designer] || 0) + 1;
        }
    });

    const designers = Object.keys(leadTimes);
    const avgDays = designers.map(d => (leadTimes[d].totalDays / leadTimes[d].count).toFixed(1));
    const reworkDesigners = Object.keys(reworkCounts);
    const reworkValues = Object.values(reworkCounts);

    content.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow border border-slate-200 dark:border-slate-700">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <i class="fa-solid fa-stopwatch text-blue-500"></i> Lead Time Promedio
                        </h3>
                        <p class="text-[10px] text-slate-400">Días desde "Recibida" hasta "Completada"</p>
                    </div>
                </div>
                <div class="relative h-64 w-full">
                    <canvas id="deptLoadBarChart"></canvas> 
                </div>
            </div>
            
            <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow border border-slate-200 dark:border-slate-700">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <i class="fa-solid fa-rotate-left text-red-500"></i> Tasa de Retrabajo
                        </h3>
                        <p class="text-[10px] text-slate-400">Órdenes devueltas a fases anteriores</p>
                    </div>
                </div>
                <div class="relative h-64 w-full">
                    <canvas id="reworkChart"></canvas>
                </div>
            </div>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow border border-slate-200 dark:border-slate-700">
            <h3 class="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <i class="fa-solid fa-layer-group text-purple-500"></i> Distribución de Complejidad Actual
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 flex items-center justify-between">
                    <div>
                        <p class="text-xs font-bold text-green-700 dark:text-green-400 uppercase">Baja</p>
                        <p class="text-[10px] text-green-600/70 dark:text-green-400/70">Básicos / Rapidos</p>
                    </div>
                    <span class="text-2xl font-bold text-green-800 dark:text-green-300">${complexityDist['Baja']}</span>
                </div>
                <div class="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800 flex items-center justify-between">
                    <div>
                        <p class="text-xs font-bold text-yellow-700 dark:text-yellow-400 uppercase">Media</p>
                        <p class="text-[10px] text-yellow-600/70 dark:text-yellow-400/70">Estándar</p>
                    </div>
                    <span class="text-2xl font-bold text-yellow-800 dark:text-yellow-300">${complexityDist['Media']}</span>
                </div>
                <div class="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 flex items-center justify-between">
                    <div>
                        <p class="text-xs font-bold text-red-700 dark:text-red-400 uppercase">Alta</p>
                        <p class="text-[10px] text-red-600/70 dark:text-red-400/70">Complejos / Full Print</p>
                    </div>
                    <span class="text-2xl font-bold text-red-800 dark:text-red-300">${complexityDist['Alta']}</span>
                </div>
            </div>
        </div>
    `;

    setTimeout(() => {
        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#cbd5e1' : '#666';
        const gridColor = isDark ? '#334155' : '#e5e5e5';

        const ctx1 = document.getElementById('deptLoadBarChart');
        if (ctx1) {
            deptLoadBarChart = new Chart(ctx1, {
                type: 'bar',
                data: {
                    labels: designers,
                    datasets: [{
                        label: 'Días Promedio',
                        data: avgDays,
                        backgroundColor: '#3b82f6',
                        borderRadius: 4
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { grid: { color: gridColor }, ticks: { color: textColor } },
                        y: { grid: { display: false }, ticks: { color: textColor } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        const ctx2 = document.getElementById('reworkChart');
        if (ctx2 && reworkDesigners.length > 0) {
            deptLoadPieChart = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: reworkDesigners,
                    datasets: [{
                        data: reworkValues,
                        backgroundColor: ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#6366f1'],
                        borderColor: isDark ? '#1e293b' : '#fff',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'right', labels: { color: textColor, boxWidth: 12, font: { size: 10 } } } }
                }
            });
        } else if (ctx2) {
            ctx2.parentNode.innerHTML = '<div class="flex h-full items-center justify-center text-slate-400 text-xs italic">No se han detectado retrabajos en el historial.</div>';
        }
    }, 100);
}

// ======================================================
// ===== 14. GRÁFICOS Y PLAN SEMANAL (DARK MODE FIX) =====
// ======================================================

function destroyAllCharts() {
    if (designerDoughnutChart) { designerDoughnutChart.destroy(); designerDoughnutChart = null; }
    if (designerBarChart) { designerBarChart.destroy(); designerBarChart = null; }
    if (deptLoadPieChart) { deptLoadPieChart.destroy(); deptLoadPieChart = null; }
    if (deptLoadBarChart) { deptLoadBarChart.destroy(); deptLoadBarChart = null; }
    if (compareChart) { compareChart.destroy(); compareChart = null; }
}

function generateWorkPlan() {
    const container = document.getElementById('view-workPlanContent');
    const weekInput = document.getElementById('view-workPlanWeekSelector');
    
    if (!weekInput) return;
    if (!weekInput.value) weekInput.value = getWeekIdentifierString(new Date());
    
    const weekIdentifier = weekInput.value;
    container.innerHTML = '<div class="spinner"></div>';
    
    setTimeout(() => {
        const planData = firebaseWeeklyPlanMap.get(weekIdentifier) || [];
        
        if (planData.length === 0) {
            container.innerHTML = `<div class="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <i class="fa-regular fa-calendar-xmark text-3xl text-slate-300 dark:text-slate-600 mb-2"></i>
                <p class="text-slate-400 font-medium">El plan para la semana ${weekIdentifier} está vacío.</p>
            </div>`;
            const summary = document.getElementById('view-workPlanSummary');
            if(summary) summary.textContent = "0 órdenes";
            return;
        }

        let totalPzs = 0, doneCount = 0;
        
        planData.sort((a, b) => {
            const oa = allOrders.find(x => x.orderId === a.orderId);
            const da = oa && oa.customStatus === CONFIG.STATUS.COMPLETED;
            const db = allOrders.find(x => x.orderId === b.orderId) && allOrders.find(x => x.orderId === b.orderId).customStatus === CONFIG.STATUS.COMPLETED;
            
            if (da && !db) return 1;
            if (!da && db) return -1;
            return (a.isLate === b.isLate) ? 0 : a.isLate ? -1 : 1;
        });

        // HTML DE LA TABLA CORREGIDO PARA DARK MODE
        let html = `
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table class="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-xs">
                <thead class="bg-slate-50 dark:bg-slate-700 font-bold text-slate-500 dark:text-slate-300 uppercase">
                    <tr>
                        <th class="px-4 py-3 text-left">Estado</th>
                        <th class="px-4 py-3 text-left">Orden</th>
                        <th class="px-4 py-3 text-left">Diseñador</th>
                        <th class="px-4 py-3 text-left">Entrega</th>
                        <th class="px-4 py-3 text-right">Piezas</th>
                        <th class="px-4 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">`;

        planData.forEach(item => {
            const liveOrder = allOrders.find(o => o.orderId === item.orderId);
            const isCompleted = liveOrder && liveOrder.customStatus === CONFIG.STATUS.COMPLETED;
            const pzs = (item.cantidad || 0) + (item.childPieces || 0);
            totalPzs += pzs; 
            if (isCompleted) doneCount++;

            let badge = isCompleted 
                ? `<span class="bg-slate-600 text-white px-2 py-1 rounded font-bold flex items-center gap-1 w-fit shadow-sm"><i class="fa-solid fa-check"></i> LISTO</span>` 
                : item.isLate 
                    ? `<span class="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-1 rounded font-bold border border-red-200 dark:border-red-800">ATRASADA</span>` 
                    : `<span class="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded font-bold border border-blue-100 dark:border-blue-800">En Proceso</span>`;
            
            let rowClasses = isCompleted ? 'bg-slate-50 dark:bg-slate-900 opacity-60 grayscale' : 'hover:bg-slate-50 dark:hover:bg-slate-700';

            html += `
            <tr class="${rowClasses} transition-colors">
                <td class="px-4 py-3">${badge}</td>
                <td class="px-4 py-3">
                    <div class="font-bold text-slate-800 dark:text-white text-sm">${escapeHTML(item.cliente)}</div>
                    <div class="text-slate-500 dark:text-slate-400 text-[11px]">${escapeHTML(item.codigoContrato)} - ${escapeHTML(item.estilo)}</div>
                </td>
                <td class="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">${escapeHTML(item.designer || 'Sin asignar')}</td>
                <td class="px-4 py-3 text-slate-600 dark:text-slate-400">${item.fechaDespacho ? new Date(item.fechaDespacho).toLocaleDateString() : '-'}</td>
                <td class="px-4 py-3 text-right font-bold text-slate-800 dark:text-white">${pzs.toLocaleString()}</td>
                <td class="px-4 py-3 text-right">
                    <button class="btn-remove-from-plan text-red-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20" data-plan-entry-id="${item.planEntryId}" data-order-code="${item.codigoContrato}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        });
        
        html += `</tbody></table></div>`;
        
        const progress = planData.length > 0 ? Math.round((doneCount / planData.length) * 100) : 0;
        
        container.innerHTML = `
        <div class="mb-6 bg-white dark:bg-slate-800 border border-blue-100 dark:border-slate-700 p-4 rounded-xl shadow-sm flex items-center justify-between gap-6">
            <div class="flex-1">
                <div class="flex justify-between mb-2">
                    <span class="font-bold text-slate-700 dark:text-slate-300 text-xs uppercase">Progreso Semanal</span>
                    <span class="font-bold text-blue-600 dark:text-blue-400 text-xs">${progress}%</span>
                </div>
                <div class="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                    <div class="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-500" style="width: ${progress}%"></div>
                </div>
            </div>
            <div class="text-right border-l border-slate-100 dark:border-slate-700 pl-6">
                 <div class="text-2xl font-bold text-slate-800 dark:text-white">${doneCount} <span class="text-slate-400 text-sm font-normal">/ ${planData.length}</span></div>
                 <div class="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide">Órdenes Listas</div>
            </div>
        </div>
        ${html}
        `;
        
        const summary = document.getElementById('view-workPlanSummary');
        if(summary) summary.textContent = `${planData.length} órdenes`;

    }, 100);
}

// ======================================================
// ===== 15. EXPORTACIÓN Y COMPARACIÓN (DARK MODE FIX) =====
// ======================================================

window.openCompareModal = (name) => {
    currentCompareDesigner1 = name;
    document.getElementById('compareDesigner1Name').textContent = name;
    const sel = document.getElementById('compareDesignerSelect');
    
    sel.innerHTML = '<option value="">Selecciona...</option>' + 
        designerList.filter(d => d !== name).map(d => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
    
    openModalById('selectCompareModal');
};

window.startComparison = () => {
    const n2 = document.getElementById('compareDesignerSelect').value;
    if (!n2) return showCustomAlert('Selecciona un diseñador para comparar', 'error');
    
    if (typeof Chart === 'undefined') { showCustomAlert('Error: Chart.js no está cargado', 'error'); return; }
    
    const art = allOrders.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART);
    const s1 = calculateStats(art.filter(o => o.designer === currentCompareDesigner1));
    const s2 = calculateStats(art.filter(o => o.designer === n2));
    
    if (compareChart) { compareChart.destroy(); compareChart = null; }
    
    const canvas = document.getElementById('compareChartCanvas');
    if (canvas) {
        compareChart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: { 
                labels: ['Total', 'A Tiempo', 'Atrasadas'], 
                datasets: [
                    { label: currentCompareDesigner1, data: [s1.total, s1.onTime, s1.late], backgroundColor: '#3b82f6' }, 
                    { label: n2, data: [s2.total, s2.onTime, s2.late], backgroundColor: '#f59e0b' }
                ] 
            },
            options: { 
                responsive: true, maintainAspectRatio: false, 
                scales: { 
                    y: { beginAtZero: true, ticks: { color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#666' }, grid: { color: document.documentElement.classList.contains('dark') ? '#334155' : '#e5e5e5' } },
                    x: { ticks: { color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#666' } }
                },
                plugins: { legend: { labels: { color: document.documentElement.classList.contains('dark') ? '#cbd5e1' : '#666' }, position: 'bottom' } }
            }
        });
    }
    
    const container = document.getElementById('compareTableContainer');
    if(container) {
        container.innerHTML = `
            <table class="w-full text-xs text-left mt-4 border-collapse text-slate-700 dark:text-slate-300">
                <thead>
                    <tr class="bg-slate-100 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                        <th class="p-2">Métrica</th>
                        <th class="p-2 font-bold text-blue-600 dark:text-blue-400">${escapeHTML(currentCompareDesigner1)}</th>
                        <th class="p-2 font-bold text-amber-600 dark:text-amber-400">${escapeHTML(n2)}</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                    <tr><td class="p-2">Total Órdenes</td><td class="p-2 font-bold">${s1.total}</td><td class="p-2 font-bold">${s2.total}</td></tr>
                    <tr><td class="p-2">Eficiencia (A tiempo)</td><td class="p-2">${s1.total > 0 ? Math.round((s1.onTime/s1.total)*100) : 0}%</td><td class="p-2">${s2.total > 0 ? Math.round((s2.onTime/s2.total)*100) : 0}%</td></tr>
                    <tr><td class="p-2">Muy Atrasadas</td><td class="p-2 text-red-500 dark:text-red-400">${s1.veryLate}</td><td class="p-2 text-red-500 dark:text-red-400">${s2.veryLate}</td></tr>
                </tbody>
            </table>
        `;
    }
    
    document.getElementById('selectCompareModal').classList.remove('active');
    openModalById('compareModal');
};

window.exportDesignerMetricsPDF = (name) => {
    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF.API.autoTable === 'undefined') {
        return showCustomAlert('Error: Librería PDF no cargada', 'error');
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(16); doc.text(`Reporte de Desempeño: ${name}`, 14, 15);
    doc.setFontSize(10); doc.text(`Generado: ${new Date().toLocaleDateString()}`, 14, 22);
    
    const orders = allOrders.filter(x => x.departamento === CONFIG.DEPARTMENTS.ART && (name === 'Sin asignar' ? !x.designer : x.designer === name));
    
    const body = orders.map(x => [
        x.cliente.substring(0, 20), x.codigoContrato, x.estilo.substring(0, 20), 
        x.customStatus || '-', x.cantidad.toLocaleString()
    ]);
    
    doc.autoTable({ 
        head: [['Cliente', 'Contrato', 'Estilo', 'Estado', 'Pzs']], body: body, startY: 30,
        styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [37, 99, 235] }, alternateRowStyles: { fillColor: [248, 250, 252] }
    });
    
    const finalY = doc.lastAutoTable.finalY + 10;
    const totalPzs = orders.reduce((s,o) => s+o.cantidad, 0);
    doc.setFontSize(10);
    doc.text(`Total Órdenes: ${orders.length} | Total Piezas: ${totalPzs.toLocaleString()}`, 14, finalY);
    
    doc.save(`Metricas_${name.replace(/\s+/g,'_')}.pdf`);
};

window.exportTableToExcel = () => {
    if (allOrders.length === 0) return showCustomAlert('No hay datos', 'error');
    if (typeof XLSX === 'undefined') return showCustomAlert('Error: XLSX no cargado', 'error');
    
    const ordersToExport = getFilteredOrders();
    const data = ordersToExport.map(o => ({
        "Cliente": o.cliente, "Código": o.codigoContrato, "Estilo": o.estilo, "Departamento": o.departamento,
        "Fecha Despacho": o.fechaDespacho ? o.fechaDespacho.toLocaleDateString() : '',
        "Diseñador": o.designer, "Estado Interno": o.customStatus, 
        "Piezas": o.cantidad, "Piezas Hijas": o.childPieces, "Total Piezas": o.cantidad + o.childPieces, "Notas": o.notes || ''
    }));
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Reporte");
    XLSX.writeFile(wb, `Reporte_Panel_${new Date().toISOString().slice(0,10)}.xlsx`);
};

window.generateWeeklyReport = () => {
    const w = document.getElementById('weekSelector').value;
    if(!w) { showCustomAlert('Selecciona una semana', 'error'); return; }
    
    const [y, wk] = w.split('-W').map(Number);
    const d = new Date(y, 0, 1 + (wk - 1) * 7);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    
    const start = new Date(d.setDate(diff)); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23,59,59,999);
    
    const filtered = allOrders.filter(o => {
        if(!o.receivedDate) return false;
        const rd = new Date(o.receivedDate + 'T00:00:00');
        return rd >= start && rd <= end;
    });
    
    document.getElementById('weeklyReportContent').innerHTML = filtered.length ? `
        <h3 class="font-bold mb-2 text-slate-700 dark:text-slate-300">Resultados Semana ${w}: ${filtered.length} órdenes ingresadas</h3>
        <table id="weeklyReportTable" class="w-full text-xs border-collapse border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300">
            <thead>
                <tr class="bg-slate-100 dark:bg-slate-700 text-left text-slate-600 dark:text-slate-400">
                    <th class="p-2 border border-slate-200 dark:border-slate-600">Fecha Rx</th>
                    <th class="p-2 border border-slate-200 dark:border-slate-600">Cliente</th>
                    <th class="p-2 border border-slate-200 dark:border-slate-600">Estilo</th>
                    <th class="p-2 border border-slate-200 dark:border-slate-600 text-right">Pzs</th>
                    <th class="p-2 border border-slate-200 dark:border-slate-600">Diseñador</th>
                </tr>
            </thead>
            <tbody>
                ${filtered.map(o => `
                    <tr class="hover:bg-slate-50 dark:hover:bg-slate-700">
                        <td class="p-2 border border-slate-200 dark:border-slate-600">${o.receivedDate}</td>
                        <td class="p-2 border border-slate-200 dark:border-slate-600">${escapeHTML(o.cliente)}</td>
                        <td class="p-2 border border-slate-200 dark:border-slate-600">${escapeHTML(o.estilo)}</td>
                        <td class="p-2 border border-slate-200 dark:border-slate-600 text-right font-mono">${o.cantidad}</td>
                        <td class="p-2 border border-slate-200 dark:border-slate-600">${escapeHTML(o.designer || '-')}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    ` : '<p class="text-center text-slate-400 py-8 italic">No hay órdenes recibidas en este periodo.</p>';
};

window.exportWeeklyReportAsPDF = () => {
    if (typeof window.jspdf === 'undefined') return showCustomAlert('Error PDF', 'error');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const weekVal = document.getElementById('weekSelector').value || 'Actual';
    doc.text(`Reporte Semanal de Entradas (${weekVal})`, 14, 15);
    doc.autoTable({ html: '#weeklyReportTable', startY: 20, theme: 'grid', styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [50, 50, 50] } });
    doc.save(`reporte_semanal_${weekVal}.pdf`);
};

window.showConfirmModal = (msg, cb) => {
    document.getElementById('confirmModalMessage').textContent = msg;
    const btn = document.getElementById('confirmModalConfirm');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => { cb(); closeTopModal(); });
    openModalById('confirmModal');
};

window.openLegendModal = () => openModalById('legendModal');

window.openWeeklyReportModal = () => {
    const weekSelector = document.getElementById('weekSelector');
    if (weekSelector) weekSelector.value = getWeekIdentifierString(new Date());
    generateWeeklyReport();
    openModalById('weeklyReportModal');
};

window.resetApp = () => {
    if (userRole !== 'admin') return showCustomAlert('Acceso Denegado', 'error');
    showConfirmModal("¿Subir nuevo archivo? Se perderán los datos no guardados.", () => {
        document.getElementById('appMainContainer').style.display = 'none';
        document.getElementById('mainNavigation').style.display = 'none';
        document.getElementById('uploadSection').style.display = 'block';
        allOrders = []; isExcelLoaded = false;
        document.getElementById('fileInput').value = ''; document.getElementById('fileName').textContent = '';
        desconectarDatosDeFirebase(); destroyAllCharts();
    });
};

// ======================================================
// ===== 16. INICIALIZACIÓN FINAL =====
// ======================================================

console.log('✅ Panel Arte v6.7 - Código Completo Cargado');
console.log('📋 Funciones Corregidas:');
console.log('   - populateMetricsSidebar()');
console.log('   - generateDesignerMetrics()');
console.log('   - generateDepartmentMetrics()');
console.log('   - Verificaciones de librerías externas');
console.log('   - Gestión de gráficos mejorada');

// ======================================================
// ===== 17. LÓGICA KANBAN (NEXT LEVEL) =====
// ======================================================

function updateKanban() {
    // 1. Obtener datos filtrados
    const designerFilterSelect = document.getElementById('kanbanDesignerFilter');
    let targetDesigner = designerFilterSelect.value;
    
    // LÓGICA DE PRIVACIDAD: Si soy diseñador (y no admin), FUERZO el filtro
    if (currentDesignerName && userRole !== 'admin') {
        targetDesigner = currentDesignerName;
        // Ocultar visualmente el filtro para que no confunda
        designerFilterSelect.style.display = 'none'; 
    } else {
        designerFilterSelect.style.display = 'block';
    }

    // Filtrar solo órdenes de Arte
    let orders = allOrders.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART);
    
    // Aplicar filtro de diseñador si existe (o si fue forzado)
    if(targetDesigner) {
        orders = orders.filter(o => o.designer === targetDesigner);
    }

    // 2. Referencias a columnas del DOM
    const columns = {
        'Bandeja': document.querySelector('.kanban-dropzone[data-status="Bandeja"]'),
        'Producción': document.querySelector('.kanban-dropzone[data-status="Producción"]'),
        'Auditoría': document.querySelector('.kanban-dropzone[data-status="Auditoría"]'),
        'Completada': document.querySelector('.kanban-dropzone[data-status="Completada"]')
    };

    // Limpiar columnas
    Object.keys(columns).forEach(k => {
        if(columns[k]) columns[k].innerHTML = '';
        const countEl = document.getElementById(`count-${k}`);
        if(countEl) countEl.textContent = '0';
    });
    
    const counts = { 'Bandeja': 0, 'Producción': 0, 'Auditoría': 0, 'Completada': 0 };

    // 3. Generar tarjetas
    orders.forEach(o => {
        let status = o.customStatus || 'Bandeja';
        if (!columns[status]) status = 'Bandeja'; 
        
        counts[status]++;

        const card = document.createElement('div');
        // NOTA: Se agregaron clases dark: para modo oscuro
        card.className = 'kanban-card bg-white dark:bg-slate-700 p-3 rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 cursor-move hover:shadow-md transition group relative border-l-4';
        
        // Colores de borde según urgencia
        if(o.isVeryLate) card.classList.add('border-l-red-500');
        else if(o.isLate) card.classList.add('border-l-orange-400');
        else if(o.isAboutToExpire) card.classList.add('border-l-yellow-400');
        else card.classList.add('border-l-slate-300'); 

        card.draggable = true;
        card.dataset.id = o.orderId;
        card.ondragstart = drag;
        
        // Al hacer clic, abrir el modal
        card.onclick = () => openAssignModal(o.orderId); 

        // Contenido HTML de la tarjeta (con soporte Dark Mode)
        card.innerHTML = `
            <div class="flex justify-between items-start mb-1">
                <span class="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 rounded truncate max-w-[120px]">${escapeHTML(o.cliente)}</span>
                ${o.childPieces > 0 ? '<span class="text-[9px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-1 rounded-full font-bold">+'+o.childPieces+'</span>' : ''}
            </div>
            <div class="font-bold text-xs text-slate-800 dark:text-slate-200 mb-0.5 truncate" title="${escapeHTML(o.estilo)}">${escapeHTML(o.estilo)}</div>
            <div class="text-[10px] text-slate-500 dark:text-slate-400 font-mono mb-2">${escapeHTML(o.codigoContrato)}</div>
            
            <div class="flex justify-between items-end border-t border-slate-50 dark:border-slate-600 pt-2">
                <div class="flex items-center gap-1">
                    <div class="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white flex items-center justify-center text-[9px] font-bold" title="${escapeHTML(o.designer)}">
                        ${o.designer ? o.designer.substring(0,2).toUpperCase() : '?'}
                    </div>
                    <span class="text-[10px] text-slate-400 dark:text-slate-500">${formatDate(o.fechaDespacho).slice(0,5)}</span>
                </div>
                <div class="font-bold text-xs text-slate-700 dark:text-slate-300">${(o.cantidad + o.childPieces).toLocaleString()} pzs</div>
            </div>
        `;

        if(columns[status]) columns[status].appendChild(card);
    });

    // Actualizar badges
    Object.keys(counts).forEach(k => {
        const countEl = document.getElementById(`count-${k}`);
        if(countEl) countEl.textContent = counts[k];
    });
    
    filterKanbanCards();
}

// --- BUSCADOR REALTIME DEL KANBAN ---
window.filterKanbanCards = () => {
    const input = document.getElementById('kanbanSearchInput');
    if(!input) return;
    
    const term = input.value.toLowerCase().trim();
    const cards = document.querySelectorAll('.kanban-card');

    cards.forEach(card => {
        const textContent = card.innerText.toLowerCase();
        if (textContent.includes(term)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
};

// --- FUNCIONES DRAG & DROP ---

function allowDrop(ev) {
    ev.preventDefault();
    // Resaltado visual de la zona de destino
    ev.currentTarget.classList.add('bg-blue-50/50', 'ring-2', 'ring-blue-300', 'ring-inset');
}

function dragLeave(ev) {
    // Quitar resaltado al salir
    ev.currentTarget.classList.remove('bg-blue-50/50', 'ring-2', 'ring-blue-300', 'ring-inset');
}

function drag(ev) {
    ev.dataTransfer.setData("text", ev.target.dataset.id);
    ev.dataTransfer.effectAllowed = "move";
}

async function drop(ev) {
    ev.preventDefault();
    const zone = ev.currentTarget;
    zone.classList.remove('bg-blue-50/50', 'ring-2', 'ring-blue-300', 'ring-inset'); 

    const orderId = ev.dataTransfer.getData("text");
    const newStatus = zone.dataset.status;

    // 1. Actualización Optimista (UI inmediata)
    const card = document.querySelector(`div[data-id="${orderId}"]`);
    if(card) {
        zone.appendChild(card); 
        // Opcional: Actualizar contadores visuales aquí manualmente para mayor velocidad percibida
    }

    // 2. Guardado en Firebase
    await safeFirestoreOperation(async () => {
        const batch = db_firestore.batch();
        const ref = db_firestore.collection('assignments').doc(orderId);
        
        const updateData = { 
            customStatus: newStatus, 
            lastModified: new Date().toISOString(),
            schemaVersion: CONFIG.DB_VERSION 
        };

        if (newStatus === 'Completada') {
            updateData.completedDate = new Date().toISOString();
        }

        batch.set(ref, updateData, { merge: true });

        // Registrar en historial
        const hRef = db_firestore.collection('history').doc();
        batch.set(hRef, {
            orderId: orderId,
            change: `Movido a ${newStatus} (Kanban)`,
            user: usuarioActual.displayName,
            timestamp: new Date().toISOString()
        });

        await batch.commit();
    }, 'Moviendo...', null); // Null para no mostrar alerta invasiva por cada movimiento
}

// --- Actualizar Dropdown de Filtro ---
function updateKanbanDropdown() {
    const sel = document.getElementById('kanbanDesignerFilter');
    if(sel) {
        // Reutilizamos la lista global de diseñadores
        sel.innerHTML = '<option value="">Todos los Diseñadores</option>' + 
        designerList.map(d => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
    }
}

// ======================================================
// ===== 18. SISTEMA DE CHAT Y MENCIONES (COLLAB) =====
// ======================================================

// NOTA: Se eliminó 'let unsubscribeChat = null;' aquí porque ya está declarada arriba.

// 1. Cargar comentarios de una orden
function loadOrderComments(orderId) {
    const chatContainer = document.getElementById('chatHistory');
    if(!chatContainer) return;
    
    chatContainer.innerHTML = '<div class="flex justify-center pt-4"><div class="spinner"></div></div>';
    
    // CRÍTICO: Desconectar listener anterior
    if (unsubscribeChat) {
        unsubscribeChat();
        unsubscribeChat = null;
    }

    // Escuchar subcolección 'comments' de la orden
    const commentsRef = db_firestore.collection('assignments').doc(orderId).collection('comments').orderBy('timestamp', 'asc');

    unsubscribeChat = commentsRef.onSnapshot(snapshot => {
        chatContainer.innerHTML = '';
        
        if (snapshot.empty) {
            // Si no hay chat, mostrar la nota original del Excel si existe
            const order = allOrders.find(o => o.orderId === orderId);
            if(order && order.notes) {
                renderSystemMessage(`Nota del Excel: "${order.notes}"`);
            } else {
                chatContainer.innerHTML = '<p class="text-center text-slate-300 italic text-xs mt-4">No hay comentarios aún. ¡Inicia la conversación!</p>';
            }
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const isMe = usuarioActual && (data.userEmail === usuarioActual.email);
            renderMessage(data, isMe, chatContainer);
        });

        // Scroll automático al fondo
        chatContainer.scrollTop = chatContainer.scrollHeight;
    });
}

// 2. Renderizar un mensaje individual
function renderMessage(data, isMe, container) {
    const div = document.createElement('div');
    div.className = `chat-bubble ${isMe ? 'me' : 'other'}`;
    
    // Resaltar menciones
    let formattedText = escapeHTML(data.text).replace(/@(\w+)/g, '<span class="mention-tag">@$1</span>');
    formattedText = formattedText.replace(/\n/g, '<br>');

    div.innerHTML = `
        ${!isMe ? `<div class="font-bold text-[10px] text-blue-600 dark:text-blue-400 mb-0.5">${escapeHTML(data.userName)}</div>` : ''}
        <div class="text-sm">${formattedText}</div>
        <div class="chat-meta">
            <span>${new Date(data.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            <span>${new Date(data.timestamp).toLocaleDateString()}</span>
        </div>
    `;
    container.appendChild(div);
}

function renderSystemMessage(text) {
    const div = document.createElement('div');
    div.className = "text-center text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 rounded py-1 px-2 mx-auto w-fit mb-3 border border-slate-200 dark:border-slate-600";
    div.textContent = text;
    document.getElementById('chatHistory').appendChild(div);
}

// 3. Enviar Comentario + Notificar Mención
async function sendComment() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    
    if (!text || !currentEditingOrderId || !usuarioActual) return;

    // UI optimista
    input.value = ''; 
    input.style.height = 'auto'; 
    document.getElementById('mentionDropdown').classList.add('hidden');

    try {
        // Guardar comentario
        await db_firestore.collection('assignments').doc(currentEditingOrderId).collection('comments').add({
            text: text,
            userId: usuarioActual.uid,
            userName: usuarioActual.displayName || 'Usuario',
            userEmail: usuarioActual.email,
            timestamp: new Date().toISOString()
        });
        
        // Actualizar fecha de modificación de la orden para que se sepa que hubo actividad
        db_firestore.collection('assignments').doc(currentEditingOrderId).update({
            lastModified: new Date().toISOString()
        });

        // --- DETECCIÓN DE MENCIONES ---
        // Regex mejorada para capturar nombres compuestos simples
        const mentionRegex = /@([a-zA-Z0-9\s]+?)(?=\s|$)/g;
        const mentions = text.match(mentionRegex);

        if (mentions) {
            mentions.forEach(m => {
                const nameMentioned = m.substring(1).trim(); // Quitar el @
                
                let targetEmail = null;
                // Buscar email del diseñador mencionado en el mapa de memoria
                firebaseDesignersMap.forEach(dData => {
                    // Comparamos ignorando mayúsculas/minúsculas
                    if (dData.name.toLowerCase().includes(nameMentioned.toLowerCase())) {
                        targetEmail = dData.email;
                    }
                });

                // Si encontramos email y no soy yo mismo, notificar
                if (targetEmail && targetEmail.toLowerCase() !== usuarioActual.email.toLowerCase()) {
                    createNotification(
                        targetEmail,
                        'mention',
                        'Te mencionaron',
                        `${usuarioActual.displayName} te mencionó en una orden`,
                        currentEditingOrderId
                    );
                }
            });
        }

    } catch (e) {
        console.error(e);
        showCustomAlert('Error enviando mensaje', 'error');
    }
}

// 4. Manejo del Input (Auto-resize y Dropdown de Menciones)
function handleChatInput(textarea) {
    // Auto-resize
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight) + 'px';

    // Lógica de Mención
    const val = textarea.value;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPos);
    const lastAt = textBeforeCursor.lastIndexOf('@');
    
    const dropdown = document.getElementById('mentionDropdown');

    if (lastAt !== -1) {
        // Verificar texto después del @
        const query = textBeforeCursor.substring(lastAt + 1).toLowerCase();
        
        // Si hay un espacio y el query es corto, quizás ya terminó la mención
        // Pero permitimos espacios para nombres como "Ana Maria"
        if (query.length < 20) {
            const matches = designerList.filter(d => d.toLowerCase().includes(query));

            if (matches.length > 0) {
                showMentionDropdown(matches, lastAt);
            } else {
                dropdown.classList.add('hidden');
            }
            return;
        }
    }
    dropdown.classList.add('hidden');
}

function showMentionDropdown(matches, atIndex) {
    const dropdown = document.getElementById('mentionDropdown');
    dropdown.innerHTML = '';
    
    matches.forEach(name => {
        const item = document.createElement('div');
        item.className = 'mention-item p-2 hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer text-xs border-b border-slate-50 dark:border-slate-600 last:border-0 dark:text-slate-200';
        item.textContent = name;
        item.onclick = () => selectMention(name, atIndex);
        dropdown.appendChild(item);
    });

    dropdown.classList.remove('hidden');
}

function selectMention(name, atIndex) {
    const textarea = document.getElementById('chatInput');
    const val = textarea.value;
    const before = val.substring(0, atIndex);
    
    // Reemplazar lo que se estaba escribiendo con el nombre completo + espacio
    textarea.value = `${before}@${name} `;
    
    document.getElementById('mentionDropdown').classList.add('hidden');
    textarea.focus();
}

function insertEmoji(emoji) {
    const input = document.getElementById('chatInput');
    input.value += emoji;
    input.focus();
}

// Enviar con Enter (sin Shift)
document.getElementById('chatInput')?.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendComment();
    }
});

// ======================================================
// ===== 19. FUNCIONES GLOBALES (BUGS #3 & #8 FIX) =====
// ======================================================

// --- Navegación de Tabla ---
window.changePage = (p) => { 
    if(typeof currentPage !== 'undefined') { currentPage = p; updateTable(); }
};

window.changeRowsPerPage = () => { 
    const el = document.getElementById('rowsPerPage');
    if(el) { rowsPerPage = parseInt(el.value); currentPage = 1; updateTable(); }
};

// --- Filtros ---
window.setFilter = (f) => { 
    currentFilter = f; currentPage = 1; updateTable(); 
};

window.setDateFilter = (f) => {
    currentDateFilter = f; currentFilter = 'all'; currentPage = 1; updateTable();
};

window.sortTable = (k) => { 
    if(typeof sortConfig !== 'undefined') {
        sortConfig.direction = (sortConfig.key === k && sortConfig.direction === 'asc') ? 'desc' : 'asc'; 
        sortConfig.key = k; 
        if(typeof filteredCache !== 'undefined') filteredCache.key = null; 
        updateTable(); 
    }
};

window.clearAllFilters = () => { 
    currentSearch = ''; currentClientFilter = ''; currentStyleFilter = ''; 
    currentTeamFilter = ''; currentDepartamentoFilter = ''; currentDesignerFilter = ''; 
    currentCustomStatusFilter = ''; currentFilter = 'all'; currentDateFilter = 'all';
    currentDateFrom = ''; currentDateTo = '';
    
    document.querySelectorAll('.filter-select, .filter-input').forEach(el => el.value = '');
    const searchInput = document.getElementById('searchInput');
    if(searchInput) searchInput.value = '';
    
    if(typeof filteredCache !== 'undefined') filteredCache.key = null; 
    currentPage = 1; 
    updateTable();
};

// BUG #3 FIX: Llenado de Dropdowns con opción Default para Departamento
window.populateFilterDropdowns = () => {
    const populate = (id, key) => {
        const sel = document.getElementById(id);
        if(!sel) return;
        const currentVal = sel.value;
        const options = [...new Set(allOrders.map(o => o[key]).filter(Boolean))].sort();
        
        let defaultOpt = '<option value="">Todos</option>';
        // Solución: Agregar opción específica para ver solo Arte si se desea
        if (id === 'departamentoFilter') defaultOpt += '<option value="P_Art">Solo P_Art</option>';
        
        sel.innerHTML = defaultOpt + options.map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('');
        sel.value = currentVal;
    };
    populate('clientFilter', 'cliente');
    populate('styleFilter', 'estilo');
    populate('teamFilter', 'teamName');
    populate('departamentoFilter', 'departamento');
    if (typeof updateAllDesignerDropdowns === 'function') updateAllDesignerDropdowns();
}

window.updateAllDesignerDropdowns = () => {
    const html = '<option value="">Todos</option>' + designerList.map(d => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
    if(document.getElementById('designerFilter')) document.getElementById('designerFilter').innerHTML = html;
    
    const modalHtml = '<option value="">Sin asignar</option>' + designerList.map(d => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
    if(document.getElementById('modalDesigner')) document.getElementById('modalDesigner').innerHTML = modalHtml;
    if(document.getElementById('multiModalDesigner')) document.getElementById('multiModalDesigner').innerHTML = modalHtml;
    
    const compareHtml = '<option value="">Seleccionar...</option>' + designerList.map(d => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
    if(document.getElementById('compareDesignerSelect')) document.getElementById('compareDesignerSelect').innerHTML = compareHtml;
}

// --- Selección Masiva ---
window.toggleOrderSelection = (id) => { 
    if (selectedOrders.has(id)) selectedOrders.delete(id); 
    else selectedOrders.add(id); 
    updateTable(); 
};

window.toggleSelectAll = () => { 
    const c = document.getElementById('selectAll');
    if(c && typeof paginatedOrders !== 'undefined') {
        paginatedOrders.forEach(o => c.checked ? selectedOrders.add(o.orderId) : selectedOrders.delete(o.orderId)); 
        updateTable(); 
    }
};

window.clearSelection = () => { 
    selectedOrders.clear(); 
    updateTable(); 
};

// --- Acciones de UI ---
window.toggleNotifications = () => { 
    const drop = document.getElementById('notificationDropdown');
    if(drop) drop.classList.toggle('hidden'); 
};

// BUG #8 FIX: Eliminación de Órdenes del Plan Semanal
window.removeOrderFromPlan = async (planEntryId, orderCode) => {
    if (userRole !== 'admin') return showCustomAlert('Acceso denegado', 'error');
    showConfirmModal(`¿Eliminar ${orderCode} del plan?`, async () => {
        await safeFirestoreOperation(
            () => db_firestore.collection('weeklyPlan').doc(planEntryId).delete(), 
            'Eliminando...', 
            'Orden removida del plan'
        );
        // El listener de Firebase actualizará la vista automáticamente
    });
};

window.resetApp = () => {
    if (userRole !== 'admin') {
        return showCustomAlert('Acceso Denegado: Se requieren permisos de Administrador.', 'error');
    }

    showConfirmModal("¿Subir nuevo archivo? Se perderán los datos no guardados.", () => {
        document.getElementById('appMainContainer').style.display = 'none';
        document.getElementById('mainNavigation').style.display = 'none';
        document.getElementById('uploadSection').style.display = 'block';
        
        allOrders = []; 
        isExcelLoaded = false;
        
        document.getElementById('fileInput').value = ''; 
        document.getElementById('fileName').textContent = '';
        
        desconectarDatosDeFirebase();
        if(typeof destroyAllCharts === 'function') destroyAllCharts();
    });
};

window.showConfirmModal = (msg, cb) => {
    document.getElementById('confirmModalMessage').textContent = msg;
    const btn = document.getElementById('confirmModalConfirm');
    
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', () => { 
        cb(); 
        closeTopModal(); 
    });
    
    openModalById('confirmModal');
};

// ======================================================
// ===== 20. MODO OSCURO (LOGIC & PERSISTENCE) =====
// ======================================================

window.toggleTheme = () => {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    } else {
        html.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }
    updateThemeIcon();
};

function updateThemeIcon() {
    const icon = document.getElementById('themeIcon');
    if (icon) {
        const isDark = document.documentElement.classList.contains('dark');
        icon.className = isDark ? 'fa-solid fa-sun text-yellow-400' : 'fa-solid fa-moon text-slate-400';
    }
}

function initTheme() {
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    updateThemeIcon();
}

// ======================================================
// ===== 21. HELPERS VISUALES Y UI (MISSING PARTS) =====
// ======================================================

// --- Renderizado de Badges (Corrige Bug #9) ---
function getStatusBadge(order) {
    const base = "px-3 py-1 rounded-full text-xs font-medium inline-flex items-center justify-center shadow-sm whitespace-nowrap";
    
    if (order.isVeryLate) {
        return `<div class="flex flex-col items-start gap-1"><span class="${base} bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800">MUY ATRASADA</span><span class="text-[10px] font-bold text-red-600 dark:text-red-400 ml-1"><i class="fa-solid fa-clock"></i> ${order.daysLate} días</span></div>`;
    }
    if (order.isLate) {
        return `<div class="flex flex-col items-start gap-1"><span class="${base} bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-800">Atrasada</span><span class="text-[10px] font-bold text-orange-600 dark:text-orange-400 ml-1"><i class="fa-regular fa-clock"></i> ${order.daysLate} días</span></div>`;
    }
    if (order.isAboutToExpire) {
        return `<span class="${base} bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800">Por Vencer</span>`;
    }
    return `<span class="${base} bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800">A Tiempo</span>`;
}

function getCustomStatusBadge(status) {
    const base = "px-3 py-1 rounded-full text-xs font-medium border inline-block min-w-[90px] text-center shadow-sm";
    const safeStatus = escapeHTML(status || 'Sin estado');
    
    if (status === 'Completada') return `<span class="${base} bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-600">${safeStatus}</span>`;
    if (status === 'Bandeja') return `<span class="${base} bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800">${safeStatus}</span>`;
    if (status === 'Producción') return `<span class="${base} bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800">${safeStatus}</span>`;
    if (status === 'Auditoría') return `<span class="${base} bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800">${safeStatus}</span>`;
    
    return `<span class="text-slate-400 text-xs italic pl-2">${safeStatus}</span>`;
}

// --- Paginación (Corrige Bug #7) ---
function renderPagination() {
    const totalPages = Math.ceil(getFilteredOrders().length / rowsPerPage);
    const c = document.getElementById('paginationControls');
    if (!c) return;
    
    let h = `<button onclick="changePage(${currentPage-1})" ${currentPage===1?'disabled':''} class="w-8 h-8 flex items-center justify-center border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-600 dark:text-slate-300 transition-colors"><i class="fa-solid fa-chevron-left text-[10px]"></i></button>`;
    
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    
    for (let i = start; i <= end; i++) {
        h += `<button onclick="changePage(${i})" class="w-8 h-8 flex items-center justify-center border rounded-lg text-xs font-medium transition-colors ${i === currentPage ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900 border-slate-800 dark:border-white shadow-sm' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'}">${i}</button>`;
    }
    
    h += `<button onclick="changePage(${currentPage+1})" ${currentPage>=totalPages?'disabled':''} class="w-8 h-8 flex items-center justify-center border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-600 dark:text-slate-300 transition-colors"><i class="fa-solid fa-chevron-right text-[10px]"></i></button>`;
    c.innerHTML = h;
}

// --- Dropdowns Dinámicos (Corrige Bug #9) ---
function populateFilterDropdowns() {
    const populate = (id, key) => {
        const sel = document.getElementById(id);
        if(!sel) return;
        const currentVal = sel.value;
        const options = [...new Set(allOrders.map(o => o[key]).filter(Boolean))].sort();
        sel.innerHTML = '<option value="">Todos</option>' + options.map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('');
        sel.value = currentVal;
    };
    populate('clientFilter', 'cliente');
    populate('styleFilter', 'estilo');
    populate('teamFilter', 'teamName');
    populate('departamentoFilter', 'departamento');
    updateAllDesignerDropdowns();
}

function updateAllDesignerDropdowns() {
    const html = '<option value="">Todos</option>' + designerList.map(d => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
    if(document.getElementById('designerFilter')) document.getElementById('designerFilter').innerHTML = html;
    
    const modalHtml = '<option value="">Sin asignar</option>' + designerList.map(d => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
    if(document.getElementById('modalDesigner')) document.getElementById('modalDesigner').innerHTML = modalHtml;
    if(document.getElementById('multiModalDesigner')) document.getElementById('multiModalDesigner').innerHTML = modalHtml;
    
    const compareHtml = '<option value="">Seleccionar...</option>' + designerList.map(d => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
    if(document.getElementById('compareDesignerSelect')) document.getElementById('compareDesignerSelect').innerHTML = compareHtml;
}