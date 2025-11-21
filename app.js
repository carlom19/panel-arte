// ======================================================
// ===== 1. CONFIGURACIÓN Y VARIABLES GLOBALES =====
// ======================================================

// --- Firebase Config ---
const firebaseConfig = {
    apiKey: "AIzaSyAX9jZYnVSGaXdM06I0LTBvbvDpNulMPpk",
    authDomain: "panel-arte.firebaseapp.com",
    projectId: "panel-arte",
    storageBucket: "panel-arte.firebasestorage.app",
    messagingSenderId: "236381043860",
    appId: "1:236381043860:web:f6a9c2cb211dd9161d0881"
};

if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} else if (typeof firebase === 'undefined') {
    console.error("Error: El SDK de Firebase no se ha cargado.");
}

const db_firestore = firebase.firestore(); 

// --- Configuración Global (SPRINT 3 - Centralizada) ---
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
    EXCLUDED_DESIGNER: 'Magdali Fernandez',
    DB_VERSION: 1,
    PAGINATION_DEFAULT: 50
};

// --- Variables de Estado ---
let allOrders = []; 
let selectedOrders = new Set();
let usuarioActual = null; 
let isExcelLoaded = false; 

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

// Caché de Filtrado (SPRINT 1)
let filteredCache = { key: null, results: [], timestamp: 0 };

// Variables de Edición y Batch
let currentEditingOrderId = null;
let designerList = []; 
let needsRecalculation = true; 
let autoCompleteBatchWrites = []; 
let autoCompletedOrderIds = new Set(); 

// Suscripciones de Firebase
let unsubscribeAssignments = null;
let unsubscribeHistory = null;
let unsubscribeChildOrders = null;
let unsubscribeDesigners = null;
let unsubscribeWeeklyPlan = null;

// Mapas de Datos en Memoria
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
// ===== 2. GESTOR DE MODALES (FIX #5 - Z-INDEX DINÁMICO) =====
// ======================================================

const modalStack = []; 

function openModalById(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // FIX #5: Z-Index Dinámico para soportar modales apilados correctamente
    const baseZIndex = 2000;
    modal.style.zIndex = baseZIndex + (modalStack.length * 10);

    // Confirmaciones siempre encima de todo
    if (modalId === 'confirmModal') {
        modal.style.zIndex = parseInt(modal.style.zIndex) + 1000;
    }

    modal.classList.add('active');
    modalStack.push(modalId);
    document.body.classList.add('modal-open');

    // Accesibilidad: Focus Trap (Sprint 3)
    const firstInput = modal.querySelector('input, select, textarea');
    if (firstInput) {
        setTimeout(() => firstInput.focus(), 100); 
    } else {
        const confirmBtn = modal.querySelector('button.bg-red-600, button.bg-blue-600');
        if (confirmBtn) setTimeout(() => confirmBtn.focus(), 100);
    }
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

// Listeners Globales UI
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalStack.length > 0) closeTopModal();
});

// Alias para compatibilidad con HTML
window.closeModal = () => closeTopModal();
window.closeConfirmModal = () => closeTopModal();
window.closeMultiModal = () => closeTopModal();
window.closeAddChildModal = () => closeTopModal();
window.closeDesignerManager = () => closeTopModal();
window.closeCompareModals = () => closeAllModals();
window.closeWeeklyReportModal = () => closeTopModal();

// ======================================================
// ===== 3. UTILIDADES Y MANEJO DE ERRORES (SPRINT 2) =====
// ======================================================

// Operación Segura con Timeout y Manejo de Errores
async function safeFirestoreOperation(operation, loadingMsg = 'Procesando...', successMsg = null) {
    showLoading(loadingMsg);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 10000));

    try {
        await Promise.race([operation(), timeoutPromise]);
        if (successMsg) showCustomAlert(successMsg, 'success');
        return true;
    } catch (error) {
        console.error("Error Seguro:", error);
        let userMsg = 'Ocurrió un error inesperado.';
        if (error.message === 'TIMEOUT') userMsg = 'La operación tardó demasiado. Revisa tu conexión.';
        else if (error.code === 'permission-denied') userMsg = 'No tienes permisos para realizar esta acción.';
        else if (error.code === 'unavailable') userMsg = 'Servicio no disponible (offline).';
        else userMsg = `Error: ${error.message}`;
        
        showCustomAlert(userMsg, 'error');
        return false;
    } finally {
        hideLoading();
    }
}

function showCustomAlert(message, type = 'info') {
    const alertDiv = document.getElementById('customAlert');
    if(!alertDiv) return;
    let borderClass = type === 'error' ? 'border-l-4 border-red-500' : type === 'success' ? 'border-l-4 border-green-500' : 'border-l-4 border-blue-500';
    let icon = type === 'error' ? 'fa-circle-xmark text-red-500' : type === 'success' ? 'fa-circle-check text-green-500' : 'fa-circle-info text-blue-500';
    
    alertDiv.className = `fixed top-5 right-5 z-[3000] max-w-sm w-full bg-white shadow-2xl rounded-xl pointer-events-auto transform transition-all duration-300 ring-1 ring-black/5 overflow-hidden ${borderClass}`;
    alertDiv.innerHTML = `<div class="p-4 flex items-start"><div class="flex-shrink-0"><i class="fa-solid ${icon} text-xl"></i></div><div class="ml-3 w-0 flex-1 pt-0.5"><p class="text-sm font-medium text-slate-900">${type.toUpperCase()}</p><p class="mt-1 text-xs text-slate-500">${escapeHTML(message)}</p></div><div class="ml-4 flex flex-shrink-0"><button onclick="document.getElementById('customAlert').style.display='none'" class="text-slate-400 hover:text-slate-500"><i class="fa-solid fa-xmark"></i></button></div></div>`;
    alertDiv.style.display = 'block';
    if (window.alertTimeout) clearTimeout(window.alertTimeout);
    window.alertTimeout = setTimeout(() => { alertDiv.style.display = 'none'; }, 4000);
}

function showLoading(msg='Cargando...') {
    if (document.getElementById('loadingOverlay')) return;
    const o = document.createElement('div'); o.id = 'loadingOverlay'; o.className = 'loading-overlay'; 
    o.innerHTML = `<div class="spinner"></div><p class="text-xs font-medium text-slate-600 mt-2">${escapeHTML(msg)}</p>`;
    document.body.appendChild(o);
}
function hideLoading() { const o = document.getElementById('loadingOverlay'); if(o) o.remove(); }

let debounceTimer;
function debounce(func, delay) {
    return function() { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => func.apply(this, arguments), delay); }
}

function preventDefaults(e){ e.preventDefault(); e.stopPropagation(); }
function escapeHTML(str) { return !str ? '' : String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function formatDate(d) { return d ? d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'; }
function getWeekIdentifierString(d) {
    const date = new Date(d.getTime()); date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    var week1 = new Date(date.getFullYear(), 0, 4);
    return `${date.getFullYear()}-W${String(1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)).padStart(2, '0')}`;
}

// ======================================================
// ===== 4. INICIALIZACIÓN Y AUTH =====
// ======================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('App v6.4 Loaded (Optimized & Fixed)');
    
    const btnLogin = document.getElementById('loginButton');
    if(btnLogin) btnLogin.addEventListener('click', iniciarLoginConGoogle);
    
    const btnLogout = document.getElementById('logoutNavBtn');
    if(btnLogout) btnLogout.addEventListener('click', iniciarLogout);

    firebase.auth().onAuthStateChanged((user) => {
        const login = document.getElementById('loginSection'), upload = document.getElementById('uploadSection'), main = document.getElementById('appMainContainer'), nav = document.getElementById('mainNavigation');
        if (user) {
            usuarioActual = user;
            if(document.getElementById('navUserName')) document.getElementById('navUserName').textContent = user.displayName;
            login.style.display = 'none';
            if (!isExcelLoaded) {
                upload.style.display = 'block'; main.style.display = 'none'; nav.style.display = 'none'; main.classList.remove('main-content-shifted');
            } else {
                upload.style.display = 'none'; main.style.display = 'block'; nav.style.display = 'flex'; main.classList.add('main-content-shifted');
            }
            conectarDatosDeFirebase();
        } else {
            desconectarDatosDeFirebase(); usuarioActual = null; isExcelLoaded = false;
            login.style.display = 'flex'; upload.style.display = 'none'; main.style.display = 'none'; nav.style.display = 'none'; main.classList.remove('main-content-shifted');
        }
    });

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

    // Delegación de Eventos (FIX #3) - Manejo centralizado
    const delegate = (id, sel, cb) => { const el = document.getElementById(id); if(el) el.addEventListener('click', e => { const t = e.target.closest(sel); if(t) cb(t, e); }); };
    
    delegate('designerManagerList', '.btn-delete-designer', (btn) => deleteDesigner(btn.dataset.id, btn.dataset.name));
    
    delegate('metricsSidebarList', '.filter-btn', (btn) => {
        document.querySelectorAll('#metricsSidebarList .filter-btn').forEach(b => b.classList.remove('active', 'bg-blue-50', 'border-blue-200'));
        btn.classList.add('active', 'bg-blue-50', 'border-blue-200');
        generateDesignerMetrics(btn.dataset.designer);
    });
    
    delegate('childOrdersList', '.btn-delete-child', (btn, e) => { e.stopPropagation(); deleteChildOrder(btn.dataset.childId, btn.dataset.childCode); });
    
    delegate('view-workPlanContent', '.btn-remove-from-plan', (btn, e) => { e.stopPropagation(); removeOrderFromPlan(btn.dataset.planEntryId, btn.dataset.orderCode); });
});

function iniciarLoginConGoogle() { 
    firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => showCustomAlert(e.message, 'error')); 
}

function iniciarLogout() { 
    firebase.auth().signOut().then(() => { 
        document.getElementById('mainNavigation').style.transform = 'translateX(-100%)';
        document.getElementById('appMainContainer').classList.remove('main-content-shifted');
    }); 
}
// ======================================================
// ===== 5. LÓGICA DE DATOS (FIREBASE LISTENERS) =====
// ======================================================

function conectarDatosDeFirebase() {
    if (!usuarioActual) return;
    const navDbStatus = document.getElementById('navDbStatus'); 

    const setStatus = (connected) => {
        if(navDbStatus) {
            navDbStatus.innerHTML = connected 
            ? `<span class="w-1.5 h-1.5 rounded-full bg-green-500"></span> Conectado`
            : `<span class="w-1.5 h-1.5 rounded-full bg-yellow-500"></span> Conectando...`;
        }
    };

    setStatus(false);
    
    // 1. Asignaciones
    unsubscribeAssignments = db_firestore.collection('assignments').onSnapshot(s => {
        firebaseAssignmentsMap.clear();
        s.forEach(d => firebaseAssignmentsMap.set(d.id, d.data()));
        if(isExcelLoaded) mergeYActualizar(); 
        setStatus(true);
    });

    // 2. Historial
    unsubscribeHistory = db_firestore.collection('history').onSnapshot(s => {
        firebaseHistoryMap.clear();
        s.forEach(d => { 
            const v = d.data(); 
            if(!firebaseHistoryMap.has(v.orderId)) firebaseHistoryMap.set(v.orderId, []); 
            firebaseHistoryMap.get(v.orderId).push(v); 
        });
    });

    // 3. Órdenes Hijas
    unsubscribeChildOrders = db_firestore.collection('childOrders').onSnapshot(s => {
        firebaseChildOrdersMap.clear();
        s.forEach(d => { 
            const v = d.data(); 
            if(!firebaseChildOrdersMap.has(v.parentOrderId)) firebaseChildOrdersMap.set(v.parentOrderId, []); 
            firebaseChildOrdersMap.get(v.parentOrderId).push(v); 
        });
        needsRecalculation = true; 
        if(isExcelLoaded) mergeYActualizar();
    });
    
    // 4. Diseñadores
    unsubscribeDesigners = db_firestore.collection('designers').orderBy('name').onSnapshot(s => {
        firebaseDesignersMap.clear(); 
        let newDesignerList = [];
        s.forEach(d => { 
            const v = d.data(); 
            firebaseDesignersMap.set(d.id, v); 
            newDesignerList.push(v.name); 
        });
        designerList = newDesignerList;
        updateAllDesignerDropdowns(); // Se definirá en Parte 3
        populateDesignerManagerModal(); // Se definirá en Parte 3
        if(isExcelLoaded && document.getElementById('dashboard').style.display === 'block') updateDashboard();
    });

    // 5. Plan Semanal
    unsubscribeWeeklyPlan = db_firestore.collection('weeklyPlan').onSnapshot(s => {
        firebaseWeeklyPlanMap.clear();
        s.forEach(d => { 
            const v = d.data(); 
            if(!firebaseWeeklyPlanMap.has(v.weekIdentifier)) firebaseWeeklyPlanMap.set(v.weekIdentifier, []); 
            firebaseWeeklyPlanMap.get(v.weekIdentifier).push(v); 
        });
        if(document.getElementById('workPlanView').style.display === 'block') generateWorkPlan();
    });
}

function desconectarDatosDeFirebase() {
    if(unsubscribeAssignments) unsubscribeAssignments();
    if(unsubscribeHistory) unsubscribeHistory();
    if(unsubscribeChildOrders) unsubscribeChildOrders();
    if(unsubscribeDesigners) unsubscribeDesigners();
    if(unsubscribeWeeklyPlan) unsubscribeWeeklyPlan();
    autoCompletedOrderIds.clear();
}

// Fusión de Datos (Excel + Firebase)
function mergeYActualizar() {
    if (!isExcelLoaded) return;
    recalculateChildPieces(); 
    autoCompleteBatchWrites = []; 
    
    // FIX #2: Invalidar caché porque los datos cambiaron
    filteredCache.key = null;

    for (let i = 0; i < allOrders.length; i++) {
        const o = allOrders[i];
        const fb = firebaseAssignmentsMap.get(o.orderId);
        
        if (fb) {
            o.designer = fb.designer || '';
            o.customStatus = fb.customStatus || '';
            o.receivedDate = fb.receivedDate || '';
            o.notes = fb.notes || '';
            o.completedDate = fb.completedDate || null;
        } else {
            o.designer = ''; o.customStatus = ''; o.receivedDate = ''; o.notes = ''; o.completedDate = null;
        }

        // FIX #4: Lógica de Auto-Completado corregida (Evita duplicados)
        if (fb && o.departamento !== CONFIG.DEPARTMENTS.ART && o.departamento !== CONFIG.DEPARTMENTS.NONE) {
            if (fb.customStatus !== CONFIG.STATUS.COMPLETED && !autoCompletedOrderIds.has(o.orderId)) {
                autoCompleteBatchWrites.push({
                    orderId: o.orderId,
                    displayCode: o.codigoContrato,
                    data: { customStatus: CONFIG.STATUS.COMPLETED, completedDate: new Date().toISOString(), lastModified: new Date().toISOString(), schemaVersion: CONFIG.DB_VERSION },
                    history: [`Salio de Arte (en ${o.departamento}) → Completada`]
                });
                autoCompletedOrderIds.add(o.orderId); // <--- CRÍTICO: Registramos para no volver a agregar
            }
        }
    }
    
    if (document.getElementById('dashboard').style.display === 'block') updateDashboard();
    
    // Solicitar confirmación al usuario (Sprint 3)
    if (autoCompleteBatchWrites.length > 0) confirmAutoCompleteBatch();
}

function recalculateChildPieces() {
    if (!needsRecalculation) return;
    let cache = new Map();
    firebaseChildOrdersMap.forEach((l, p) => cache.set(p, l.reduce((s, c) => s + (c.cantidad || 0), 0)));
    allOrders.forEach(o => o.childPieces = cache.get(o.orderId) || 0);
    needsRecalculation = false;
}

// ======================================================
// ===== 6. PARSER EXCEL (CORE) =====
// ======================================================

function handleFiles(files){ if(files.length){ document.getElementById('fileName').textContent = files[0].name; processFile(files[0]); } }

async function processFile(file) {
    showLoading('Procesando Excel...');
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheetName = workbook.SheetNames.find(n => /working\s*pro[c]{1,2}ess/i.test(n));
        if (!sheetName) throw new Error('No se encontró "Working Process"');
        
        const arr = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
        let hIdx = -1;
        // Búsqueda inteligente de encabezados
        for (let i = 0; i < Math.min(arr.length, 15); i++) {
            const r = arr[i].map(c => String(c).toLowerCase());
            if (r.some(c => c.includes('fecha')) && r.some(c => c.includes('cliente'))) { hIdx = i; break; }
        }
        if (hIdx === -1) throw new Error('Encabezados no encontrados');
        
        const headers = arr[hIdx].map(h => String(h).trim().toLowerCase());
        const rows = arr.slice(hIdx + 1);
        
        // Mapeo dinámico de columnas
        const cols = {
            fecha: headers.findIndex(h => h.includes('fecha')),
            cliente: headers.findIndex(h => h.includes('cliente')),
            codigo: headers.findIndex(h => h.includes('codigo') || h.includes('contrato')),
            estilo: headers.findIndex(h => h.includes('estilo')),
            team: headers.findIndex(h => h.includes('team'))
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
        headers.forEach((h, i) => { const m = depts.find(d => d.p.test(h)); if (m) deptCols.push({ idx: i, name: m.n }); });

        let processed = [];
        
        for (const r of rows) {
            if (!r || r.every(c => !c)) continue;
            
            // Extracción segura de datos
            let currDate = null;
            if (cols.fecha >= 0 && r[cols.fecha]) { const v = r[cols.fecha]; currDate = typeof v === 'number' ? new Date((v - 25569) * 86400000) : new Date(v); }
            
            const cCli = cols.cliente >= 0 ? String(r[cols.cliente]).trim() : "";
            const cCod = cols.codigo >= 0 ? String(r[cols.codigo]).trim() : "";
            if (!cCli || !cCod) continue;

            const cSty = cols.estilo >= 0 ? String(r[cols.estilo]).trim() : "";
            const cTeam = cols.team >= 0 ? String(r[cols.team]).trim() : "";

            // Determinar departamento y cantidad
            let qty = 0, dept = CONFIG.DEPARTMENTS.NONE;
            for (let i = deptCols.length - 1; i >= 0; i--) {
                const val = r[deptCols[i].idx];
                if (val) { 
                    const n = Number(String(val).replace(/,|\s/g, '')); 
                    if (n > 0) { qty = n; dept = deptCols[i].name; break; } 
                }
            }

            const fd = currDate ? new Date(currDate.getFullYear(), currDate.getMonth(), currDate.getDate()) : null;
            const oid = `${cCli}_${cCod}_${fd ? fd.getTime() : 'nodate'}_${cSty}`;
            const fb = firebaseAssignmentsMap.get(oid); // Datos previos de Firebase si existen

            const today = new Date(); today.setHours(0,0,0,0);
            const dl = (fd && fd < today) ? Math.ceil((today - fd) / 86400000) : 0;

            processed.push({
                orderId: oid, fechaDespacho: fd, cliente: cCli, codigoContrato: cCod, estilo: cSty, teamName: cTeam,
                departamento: dept, cantidad: qty, childPieces: 0,
                isLate: fd && fd < today, isVeryLate: dl > 7, isAboutToExpire: fd && !dl && ((fd - today) / 86400000) <= 2,
                designer: fb ? fb.designer : '', customStatus: fb ? fb.customStatus : '', 
                receivedDate: fb ? fb.receivedDate : '', notes: fb ? fb.notes : '', completedDate: fb ? fb.completedDate : null
            });
        }

        allOrders = processed; isExcelLoaded = true; needsRecalculation = true;
        recalculateChildPieces();
        mergeYActualizar(); // Aplicar lógica de fusión y auto-completado

        // UI Reset
        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('appMainContainer').style.display = 'block';
        document.getElementById('appMainContainer').classList.add('main-content-shifted');
        document.getElementById('mainNavigation').style.display = 'flex';
        document.getElementById('mainNavigation').style.transform = 'translateX(0)';
        navigateTo('dashboard'); // Se definirá en Parte 3

    } catch (e) { showCustomAlert('Error: ' + e.message, 'error'); console.error(e); } 
    finally { hideLoading(); }
}

// ======================================================
// ===== 7. FILTRADO OPTIMIZADO (SPRINT 1 - CACHÉ) =====
// ======================================================

function getFilteredOrders() {
    // 1. Generar clave única de filtros
    const currentFilterKey = JSON.stringify({
        s: currentSearch.trim().toLowerCase(),
        c: currentClientFilter, d: currentDepartamentoFilter, des: currentDesignerFilter, st: currentCustomStatusFilter,
        f: currentFilter, df: currentDateFrom, dt: currentDateTo, sort: sortConfig
    });

    // 2. Verificar Caché (TTL: 2 seg)
    const now = Date.now();
    if (filteredCache.key === currentFilterKey && (now - filteredCache.timestamp < 2000)) {
        return filteredCache.results;
    }

    // 3. Filtrar
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
    else res = res.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART); // Por defecto P_Art
    
    if (currentDesignerFilter) res = res.filter(o => o.designer === currentDesignerFilter);
    if (currentCustomStatusFilter) res = res.filter(o => o.customStatus === currentCustomStatusFilter);
    
    if (currentFilter === 'late') res = res.filter(o => o.isLate);
    else if (currentFilter === 'veryLate') res = res.filter(o => o.isVeryLate);
    else if (currentFilter === 'aboutToExpire') res = res.filter(o => o.isAboutToExpire);
    
    if(currentDateFrom) res = res.filter(o => o.fechaDespacho && o.fechaDespacho >= new Date(currentDateFrom));
    if(currentDateTo) res = res.filter(o => o.fechaDespacho && o.fechaDespacho <= new Date(currentDateTo));

    // Ordenar
    res.sort((a, b) => {
        let va = a[sortConfig.key], vb = b[sortConfig.key];
        if (sortConfig.key === 'date') { va = a.fechaDespacho ? a.fechaDespacho.getTime() : 0; vb = b.fechaDespacho ? b.fechaDespacho.getTime() : 0; }
        if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
        return (va < vb ? -1 : 1) * (sortConfig.direction === 'asc' ? 1 : -1);
    });
    
    // 4. Guardar Caché
    filteredCache = { key: currentFilterKey, results: res, timestamp: now };
    return res;
}

// ======================================================
// ===== 8. OPERACIONES BATCH & PLAN (SPRINT 2 - BLINDADAS) =====
// ======================================================

// Confirmar Auto-Completado
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
            
            // Ya está en el Set, pero aseguramos
            autoCompletedOrderIds.add(w.orderId);
        });

        await batch.commit();
        autoCompleteBatchWrites = []; // Limpiar cola
        return true;
    }, 'Sincronizando estados...', 'Estados actualizados correctamente.');
    
    document.body.classList.remove('processing-batch');
}

// Carga Masiva al Plan (Blindada)
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
            generateWorkPlan(); // Definido en Parte 3
            return true;
        }, `Cargando urgentes...`, `¡Éxito! ${urgents.length} órdenes agregadas.`);
    });
};

// Agregar Selección al Plan (Blindada)
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
        clearSelection(); // Definido en Parte 3
        if(document.getElementById('workPlanView').style.display === 'block') generateWorkPlan();
        return true;
    }, 'Agregando al plan...', `${selectedOrders.size} órdenes procesadas.`);
};
// ======================================================
// ===== 9. SISTEMA DE NAVEGACIÓN (ROUTER) =====
// ======================================================

function navigateTo(viewId) {
    if (!isExcelLoaded) return;

    // Ocultar todas las vistas
    document.querySelectorAll('.main-view').forEach(el => el.style.display = 'none');
    const target = document.getElementById(viewId);
    if (target) {
        target.style.display = 'block';
        window.scrollTo(0, 0);
    }

    // Actualizar Sidebar
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active-nav', 'bg-slate-800', 'text-white', 'shadow-md');
        btn.classList.add('text-slate-400');
        const icon = btn.querySelector('i');
        if(icon) icon.className = icon.className.replace(/text-\w+-400/g, '').trim();
    });

    const activeBtn = document.getElementById('nav-' + viewId);
    if (activeBtn) {
        activeBtn.classList.add('active-nav', 'bg-slate-800', 'text-white', 'shadow-md');
        activeBtn.classList.remove('text-slate-400');
        const icon = activeBtn.querySelector('i');
        if (icon) {
            if (viewId === 'dashboard') icon.classList.add('text-blue-400');
            if (viewId === 'workPlanView') icon.classList.add('text-orange-400');
            if (viewId === 'designerMetricsView') icon.classList.add('text-purple-400');
            if (viewId === 'departmentMetricsView') icon.classList.add('text-green-400');
        }
    }

    // Inicializar vista específica
    if (viewId === 'dashboard') updateDashboard();
    else if (viewId === 'workPlanView') generateWorkPlan();
    else if (viewId === 'designerMetricsView') {
        populateMetricsSidebar();
        // Auto-seleccionar el primero si no hay nadie seleccionado (Lazy Load Fix)
        const detailText = document.getElementById('metricsDetail').innerText;
        if(detailText && detailText.includes('Selecciona')) {
            const firstBtn = document.querySelector('#metricsSidebarList .filter-btn');
            if(firstBtn) firstBtn.click();
        }
    } else if (viewId === 'departmentMetricsView') generateDepartmentMetrics();
    
    // Limpiar gráficos para ahorrar memoria
    if (viewId !== 'designerMetricsView' && viewId !== 'departmentMetricsView') destroyAllCharts();
}

// ======================================================
// ===== 10. RENDERIZADO UI (DASHBOARD & TABLAS) =====
// ======================================================

function updateDashboard() {
    if (!isExcelLoaded) return;
    if (needsRecalculation) recalculateChildPieces();
    
    // Usamos CONFIG global (Sprint 3)
    const artOrders = allOrders.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART);
    const stats = calculateStats(artOrders);
    
    // Stats Cards
    document.getElementById('statTotal').textContent = artOrders.length;
    document.getElementById('statTotalPieces').textContent = artOrders.reduce((s, o) => s + o.cantidad + o.childPieces, 0).toLocaleString();
    document.getElementById('statLate').textContent = stats.late;
    document.getElementById('statExpiring').textContent = stats.aboutToExpire;
    document.getElementById('statOnTime').textContent = stats.onTime;
    
    const thisWeekCount = artOrders.filter(o => {
        if (!o.fechaDespacho) return false;
        const today = new Date(); today.setHours(0,0,0,0);
        const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
        return o.fechaDespacho >= today && o.fechaDespacho <= nextWeek;
    }).length;
    document.getElementById('statThisWeek').textContent = thisWeekCount;
    
    updateAlerts(stats);
    updateWidgets(artOrders);
    populateFilterDropdowns();
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
    const totalAlerts = stats.veryLate + stats.aboutToExpire + stats.late;
    const badge = document.getElementById('notificationBadge');
    const list = document.getElementById('notificationList');
    
    if (!badge || !list) return;
    
    if (totalAlerts > 0) {
        badge.textContent = totalAlerts > 99 ? '99+' : totalAlerts;
        badge.classList.remove('hidden'); badge.classList.add('flex');
    } else {
        badge.classList.add('hidden'); badge.classList.remove('flex');
    }

    let html = '';
    if (stats.veryLate > 0) {
        html += `<div onclick="setFilter('veryLate'); toggleNotifications();" class="p-3 hover:bg-red-50 cursor-pointer border-b border-slate-50 group transition"><p class="text-xs font-bold text-slate-700 group-hover:text-red-600">Muy Atrasadas (>7 días)</p><p class="text-[10px] text-slate-500">${stats.veryLate} órdenes críticas</p></div>`;
    }
    if (stats.aboutToExpire > 0) {
        html += `<div onclick="setFilter('aboutToExpire'); toggleNotifications();" class="p-3 hover:bg-yellow-50 cursor-pointer border-b border-slate-50 group transition"><p class="text-xs font-bold text-slate-700 group-hover:text-yellow-600">Por Vencer (≤2 días)</p><p class="text-[10px] text-slate-500">${stats.aboutToExpire} atenciones necesarias</p></div>`;
    }
    list.innerHTML = html || '<div class="p-4 text-center text-[10px] text-slate-400 italic">Sin alertas pendientes</div>';
}

function updateWidgets(artOrders) {
    // Top Clientes
    const clientCounts = {};
    artOrders.forEach(o => clientCounts[o.cliente] = (clientCounts[o.cliente] || 0) + 1);
    const topClients = Object.entries(clientCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    document.getElementById('clientReport').innerHTML = topClients.map(([c, n], i) => `
        <div class="flex justify-between py-1.5 border-b border-slate-50 last:border-0 text-xs">
            <span class="text-slate-600 truncate w-32" title="${c}">${i+1}. ${c}</span>
            <span class="font-bold text-blue-600 bg-blue-50 px-2 rounded-full">${n}</span>
        </div>`).join('');

    // Carga de Trabajo
    const workload = {};
    let totalWorkload = 0;
    artOrders.forEach(o => {
        if (o.designer) {
            const pieces = o.cantidad + o.childPieces;
            workload[o.designer] = (workload[o.designer] || 0) + pieces;
            if (o.designer !== CONFIG.EXCLUDED_DESIGNER) totalWorkload += pieces;
        }
    });
    
    document.getElementById('workloadTotal').textContent = totalWorkload.toLocaleString() + ' pzs';
    document.getElementById('workloadList').innerHTML = Object.entries(workload)
        .sort((a, b) => b[1] - a[1])
        .map(([designer, pieces]) => {
            const pct = (totalWorkload > 0 && designer !== CONFIG.EXCLUDED_DESIGNER) ? ((pieces / totalWorkload) * 100).toFixed(1) : 0;
            return `
            <div class="mb-2">
                <div class="flex justify-between text-xs mb-0.5"><span class="text-slate-700 font-medium truncate w-24">${designer}</span><span class="text-slate-500">${pieces.toLocaleString()} (${pct}%)</span></div>
                <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-blue-500 rounded-full" style="width: ${designer === CONFIG.EXCLUDED_DESIGNER ? 0 : pct}%"></div></div>
            </div>`;
        }).join('');
}

function updateTable() {
    // Sprint 1: Usamos getFilteredOrders (con caché)
    const filtered = getFilteredOrders();
    const start = (currentPage - 1) * rowsPerPage;
    paginatedOrders = filtered.slice(start, start + rowsPerPage);
    
    document.getElementById('resultCount').textContent = filtered.length;
    document.getElementById('resultPieces').textContent = filtered.reduce((s, o) => s + o.cantidad + o.childPieces, 0).toLocaleString();

    const tbody = document.getElementById('tableBody');
    if (paginatedOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="14" class="text-center py-12 text-slate-400 italic">No se encontraron órdenes.</td></tr>`;
    } else {
        tbody.innerHTML = paginatedOrders.map(order => {
            const rowClass = order.isVeryLate ? 'bg-red-50/40' : order.isLate ? 'bg-orange-50/40' : order.isAboutToExpire ? 'bg-yellow-50/40' : '';
            const statusBadge = getStatusBadge(order);
            const internalBadge = getCustomStatusBadge(order.customStatus);
            const hasChild = order.childPieces > 0 ? `<span class="ml-1 text-[9px] bg-blue-100 text-blue-700 px-1.5 rounded-full font-bold">+${order.childPieces}</span>` : '';
            const isArt = order.departamento === CONFIG.DEPARTMENTS.ART;

            return `
            <tr class="${rowClass} hover:bg-blue-50 transition-colors cursor-pointer border-b border-slate-50 last:border-b-0" onclick="openAssignModal('${order.orderId}')">
                <td class="px-3 py-2.5 text-center" onclick="event.stopPropagation()">
                    ${isArt ? `<input type="checkbox" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4" onchange="toggleOrderSelection('${order.orderId}')" ${selectedOrders.has(order.orderId) ? 'checked' : ''}>` : ''}
                </td>
                <td class="px-3 py-2.5" data-label="Estado">${statusBadge}</td>
                <td class="px-3 py-2.5 font-medium text-slate-700 whitespace-nowrap" data-label="Fecha">${formatDate(order.fechaDespacho)}</td>
                <td class="px-3 py-2.5 font-medium text-slate-900 truncate max-w-[140px]" title="${escapeHTML(order.cliente)}">${escapeHTML(order.cliente)}</td>
                <td class="px-3 py-2.5 text-slate-500 font-mono text-xs">${escapeHTML(order.codigoContrato)}</td>
                <td class="px-3 py-2.5 text-slate-600 truncate max-w-[120px]" title="${escapeHTML(order.estilo)}">${escapeHTML(order.estilo)}</td>
                <td class="px-3 py-2.5 hidden lg:table-cell text-slate-500 text-[11px]">${escapeHTML(order.teamName)}</td>
                <td class="px-3 py-2.5 hidden md:table-cell"><span class="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">${escapeHTML(order.departamento)}</span></td>
                <td class="px-3 py-2.5">${order.designer ? `<span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md text-[11px] font-bold border border-indigo-100 whitespace-nowrap">${escapeHTML(order.designer)}</span>` : '<span class="text-slate-300 italic text-[11px]">--</span>'}</td>
                <td class="px-3 py-2.5">${internalBadge}</td>
                <td class="px-3 py-2.5 hidden lg:table-cell text-slate-500 text-xs">${order.receivedDate ? formatDate(new Date(order.receivedDate + 'T00:00:00')) : '-'}</td>
                <td class="px-3 py-2.5 font-bold text-slate-700 flex items-center justify-end gap-1">${order.cantidad.toLocaleString()} ${hasChild}</td>
                <td class="px-3 py-2.5 text-center">${order.notes ? '<i class="fa-solid fa-note-sticky text-yellow-400 text-sm" title="Ver notas"></i>' : ''}</td>
                <td class="px-3 py-2.5 text-right"><i class="fa-solid fa-chevron-right text-slate-300 text-[10px]"></i></td>
            </tr>`;
        }).join('');
    }
    
    // UI Helpers
    const sa = document.getElementById('selectAll');
    if (sa) {
        const allChecked = paginatedOrders.length > 0 && paginatedOrders.every(o => selectedOrders.has(o.orderId));
        sa.checked = allChecked;
        sa.indeterminate = !allChecked && paginatedOrders.some(o => selectedOrders.has(o.orderId));
    }
    
    const bar = document.getElementById('multiSelectBar');
    if (selectedOrders.size > 0) {
        bar.style.opacity = '1'; bar.style.transform = 'translateX(-50%) translateY(0)'; bar.style.pointerEvents = 'auto';
        document.getElementById('selectedCount').textContent = selectedOrders.size;
    } else {
        bar.style.opacity = '0'; bar.style.transform = 'translateX(-50%) translateY(20px)'; bar.style.pointerEvents = 'none';
    }
    
    renderPagination();
}

function renderPagination() {
    const totalPages = Math.ceil(getFilteredOrders().length / rowsPerPage);
    const c = document.getElementById('paginationControls');
    if (!c) return;
    
    let h = `<button onclick="changePage(${currentPage-1})" ${currentPage===1?'disabled':''} class="w-8 h-8 flex items-center justify-center border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 text-slate-600"><i class="fa-solid fa-chevron-left text-[10px]"></i></button>`;
    
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    
    for (let i = start; i <= end; i++) {
        h += `<button onclick="changePage(${i})" class="w-8 h-8 flex items-center justify-center border rounded-lg text-xs font-medium transition-colors ${i === currentPage ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}">${i}</button>`;
    }
    
    h += `<button onclick="changePage(${currentPage+1})" ${currentPage>=totalPages?'disabled':''} class="w-8 h-8 flex items-center justify-center border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 text-slate-600"><i class="fa-solid fa-chevron-right text-[10px]"></i></button>`;
    c.innerHTML = h;
}

// Helpers de Estado
function getStatusBadge(order) {
    if (order.isVeryLate) return `<span class="status-badge bg-red-100 text-red-700 ring-1 ring-red-600/10">MUY ATRASADA</span>`;
    if (order.isLate) return `<span class="status-badge bg-orange-100 text-orange-700 ring-1 ring-orange-600/10">ATRASADA</span>`;
    if (order.isAboutToExpire) return `<span class="status-badge bg-yellow-100 text-yellow-800 ring-1 ring-yellow-600/20">URGENTE</span>`;
    return `<span class="status-badge bg-green-100 text-green-700 ring-1 ring-green-600/20">A TIEMPO</span>`;
}

function getCustomStatusBadge(status) {
    const map = {
        [CONFIG.STATUS.TRAY]: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        [CONFIG.STATUS.PROD]: 'bg-purple-50 text-purple-700 border-purple-200',
        [CONFIG.STATUS.AUDIT]: 'bg-blue-50 text-blue-700 border-blue-200',
        [CONFIG.STATUS.COMPLETED]: 'bg-slate-100 text-slate-600 border-slate-200'
    };
    return status ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold border ${map[status] || 'bg-gray-50 text-gray-600'}">${status}</span>` : '-';
}

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

// Window Exposed Functions for HTML Listeners
window.changePage = (p) => { currentPage = p; updateTable(); };
window.changeRowsPerPage = () => { rowsPerPage = parseInt(document.getElementById('rowsPerPage').value); currentPage = 1; updateTable(); };
window.setFilter = (f) => { currentFilter = f; currentPage = 1; updateTable(); };
// FIX #2: Invalidar caché al ordenar
window.sortTable = (k) => { sortConfig.direction = (sortConfig.key === k && sortConfig.direction === 'asc') ? 'desc' : 'asc'; sortConfig.key = k; filteredCache.key = null; updateTable(); };
window.clearAllFilters = () => { 
    currentSearch = ''; currentClientFilter = ''; currentStyleFilter = ''; currentTeamFilter = ''; currentDepartamentoFilter = ''; 
    currentDesignerFilter = ''; currentCustomStatusFilter = ''; currentFilter = 'all'; currentDateFrom = ''; currentDateTo = '';
    document.querySelectorAll('.filter-select, .filter-input').forEach(el => el.value = '');
    document.getElementById('searchInput').value = '';
    filteredCache.key = null; // Limpiar caché
    currentPage = 1; updateTable();
};
window.toggleOrderSelection = (id) => { if (selectedOrders.has(id)) selectedOrders.delete(id); else selectedOrders.add(id); updateTable(); };
window.toggleSelectAll = () => { const c = document.getElementById('selectAll').checked; paginatedOrders.forEach(o => c ? selectedOrders.add(o.orderId) : selectedOrders.delete(o.orderId)); updateTable(); };
window.clearSelection = () => { selectedOrders.clear(); updateTable(); };
window.toggleNotifications = () => { document.getElementById('notificationDropdown').classList.toggle('hidden'); };

// ======================================================
// ===== 11. MODALES Y ACCIONES (SPRINT 2 - BLINDADOS) =====
// ======================================================

// 1. Asignación Individual
window.openAssignModal = async (id) => {
    currentEditingOrderId = id;
    const o = allOrders.find(x => x.orderId === id);
    if (!o) return;

    document.getElementById('detailCliente').textContent = o.cliente;
    document.getElementById('detailCodigo').textContent = o.codigoContrato;
    document.getElementById('detailEstilo').textContent = o.estilo;
    document.getElementById('detailFecha').textContent = formatDate(o.fechaDespacho);
    document.getElementById('detailPiezas').textContent = `${o.cantidad.toLocaleString()} (+${o.childPieces}) = ${(o.cantidad + o.childPieces).toLocaleString()}`;
    
    document.getElementById('modalDesigner').value = o.designer || '';
    document.getElementById('modalStatus').value = o.customStatus || '';
    document.getElementById('modalReceivedDate').value = o.receivedDate || '';
    document.getElementById('modalNotes').value = o.notes || '';
    
    const h = firebaseHistoryMap.get(id) || [];
    document.getElementById('modalHistory').innerHTML = h.length ? h.reverse().map(x => `
        <div class="border-b border-slate-100 pb-2 last:border-0 mb-2">
            <div class="flex justify-between items-center text-[10px] text-slate-400 mb-0.5"><span>${new Date(x.timestamp).toLocaleString()}</span><span>${escapeHTML(x.user)}</span></div>
            <div class="text-xs text-slate-600">${escapeHTML(x.change)}</div>
        </div>`).join('') : '<p class="text-slate-400 italic text-xs text-center py-4">Sin historial.</p>';

    await loadChildOrders();
    openModalById('assignModal');
};

window.saveAssignment = async () => {
    if (!currentEditingOrderId) return;
    const o = allOrders.find(x => x.orderId === currentEditingOrderId);
    const des = document.getElementById('modalDesigner').value;
    const stat = document.getElementById('modalStatus').value;
    const rd = document.getElementById('modalReceivedDate').value;
    const not = document.getElementById('modalNotes').value;
    
    const changes = []; const data = {};
    if(o.designer !== des) { changes.push(`Diseñador: ${o.designer || 'N/A'} -> ${des}`); data.designer = des; }
    if(o.customStatus !== stat) { changes.push(`Estado: ${o.customStatus || 'N/A'} -> ${stat}`); data.customStatus = stat; if(stat === CONFIG.STATUS.COMPLETED) data.completedDate = new Date().toISOString(); }
    if(o.receivedDate !== rd) { changes.push(`Fecha Rx: ${rd}`); data.receivedDate = rd; }
    if(o.notes !== not) { changes.push('Notas actualizadas'); data.notes = not; }
    
    if(changes.length === 0) return showCustomAlert('No hubo cambios', 'info');

    // SPRINT 2: Operación Segura
    const ok = await safeFirestoreOperation(async () => {
        const batch = db_firestore.batch();
        batch.set(db_firestore.collection('assignments').doc(currentEditingOrderId), { ...data, lastModified: new Date().toISOString(), schemaVersion: CONFIG.DB_VERSION }, { merge: true });
        changes.forEach(c => batch.set(db_firestore.collection('history').doc(), { orderId: currentEditingOrderId, change: c, user: usuarioActual.displayName, timestamp: new Date().toISOString() }));
        await batch.commit();
    }, 'Guardando cambios...', 'Cambios guardados');

    if(ok) closeTopModal();
};

// 2. Órdenes Hijas
window.loadChildOrders = async () => {
    const list = document.getElementById('childOrdersList');
    const children = firebaseChildOrdersMap.get(currentEditingOrderId) || [];
    document.getElementById('childOrderCount').textContent = children.length;
    list.innerHTML = children.map(c => `<div class="flex justify-between items-center bg-white p-2 rounded border border-slate-200 shadow-sm text-xs"><div><strong class="text-blue-600 block">${escapeHTML(c.childCode)}</strong><span class="text-slate-500">${c.cantidad} pzs • ${c.fechaDespacho ? formatDate(new Date(c.fechaDespacho.seconds*1000)) : '-'}</span></div><button class="btn-delete-child text-red-400 hover:text-red-600 p-1" data-child-id="${c.childOrderId}" data-child-code="${c.childCode}"><i class="fa-solid fa-trash"></i></button></div>`).join('') || '<p class="text-slate-400 italic text-xs p-2 text-center">No hay órdenes hijas.</p>';
};

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
        await db_firestore.collection('childOrders').doc(`${o.orderId}_child_${Date.now()}`).set({
            childOrderId: `${o.orderId}_child_${Date.now()}`, parentOrderId: o.orderId, childCode: `${o.codigoContrato}-${num}`,
            cantidad: pcs, fechaDespacho: date ? new Date(date) : (o.fechaDespacho || null), createdAt: new Date().toISOString(), schemaVersion: CONFIG.DB_VERSION
        });
    }, 'Creando orden hija...', 'Orden hija creada');
    
    if(ok) closeTopModal();
};

window.deleteChildOrder = async (id, code) => {
    showConfirmModal(`¿Eliminar hija ${code}?`, async () => {
        await safeFirestoreOperation(() => db_firestore.collection('childOrders').doc(id).delete(), 'Eliminando...', 'Hija eliminada');
        loadChildOrders();
    });
};

// 3. Asignación Múltiple
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

    const ok = await safeFirestoreOperation(async () => {
        const batch = db_firestore.batch();
        let c = 0;
        selectedOrders.forEach(id => {
            const data = { schemaVersion: CONFIG.DB_VERSION };
            if (d) data.designer = d; if (s) data.customStatus = s; if (r) data.receivedDate = r; if (n) data.notes = n;
            if (Object.keys(data).length > 1) { batch.set(db_firestore.collection('assignments').doc(id), data, { merge: true }); c++; }
        });
        if(c>0) await batch.commit();
    }, 'Aplicando cambios masivos...', 'Órdenes actualizadas');

    if(ok) { closeTopModal(); clearSelection(); }
};

// 4. Diseñadores
window.openDesignerManager = () => { populateDesignerManagerModal(); openModalById('designerManagerModal'); };
function populateDesignerManagerModal() {
    const l = document.getElementById('designerManagerList');
    l.innerHTML = firebaseDesignersMap.size === 0 ? '<p class="text-center text-slate-400 text-xs py-4">Sin datos.</p>' : '';
    firebaseDesignersMap.forEach((d, id) => {
        l.innerHTML += `<div class="flex justify-between items-center p-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 rounded transition"><div><div class="font-bold text-slate-800 text-xs">${escapeHTML(d.name)}</div><div class="text-[10px] text-slate-400">${escapeHTML(d.email)}</div></div><button class="btn-delete-designer text-red-500 hover:text-red-700 text-[10px] font-bold px-2 py-1" data-name="${escapeHTML(d.name)}" data-id="${id}">Eliminar</button></div>`;
    });
}
window.addDesigner = async () => {
    const name = document.getElementById('newDesignerName').value.trim();
    const email = document.getElementById('newDesignerEmail').value.trim().toLowerCase();
    if(!name || !email) return showCustomAlert('Datos faltantes', 'error');
    const ok = await safeFirestoreOperation(() => db_firestore.collection('designers').add({ name, email, createdAt: new Date().toISOString() }), 'Agregando...', 'Diseñador agregado');
    if(ok) { document.getElementById('newDesignerName').value = ''; document.getElementById('newDesignerEmail').value = ''; populateDesignerManagerModal(); }
};
window.deleteDesigner = (id, name) => {
    showConfirmModal(`¿Eliminar a ${name}?`, async () => await safeFirestoreOperation(() => db_firestore.collection('designers').doc(id).delete(), 'Eliminando...', 'Eliminado'));
};

// ======================================================
// ===== 12. GRÁFICOS Y PLAN SEMANAL =====
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
    if (!weekInput.value) weekInput.value = getWeekIdentifierString(new Date());
    const weekIdentifier = weekInput.value;
    
    container.innerHTML = '<div class="spinner"></div>';
    setTimeout(() => {
        const planData = firebaseWeeklyPlanMap.get(weekIdentifier) || [];
        if (planData.length === 0) {
            container.innerHTML = `<div class="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50"><i class="fa-regular fa-calendar-xmark text-3xl text-slate-300 mb-2"></i><p class="text-slate-400 font-medium">Plan vacío.</p></div>`;
            document.getElementById('view-workPlanSummary').textContent = "0 órdenes";
            return;
        }

        let totalPzs = 0, doneCount = 0;
        planData.sort((a, b) => {
            const oa = allOrders.find(x => x.orderId === a.orderId);
            const da = oa && oa.customStatus === CONFIG.STATUS.COMPLETED;
            const db = allOrders.find(x => x.orderId === b.orderId) && allOrders.find(x => x.orderId === b.orderId).customStatus === CONFIG.STATUS.COMPLETED;
            if (da && !db) return 1; if (!da && db) return -1;
            return (a.isLate === b.isLate) ? 0 : a.isLate ? -1 : 1;
        });

        let html = `<div class="bg-white rounded-lg shadow border border-slate-200 overflow-hidden"><table class="min-w-full divide-y divide-slate-200 text-xs"><thead class="bg-slate-50 font-bold text-slate-500 uppercase"><tr><th class="px-4 py-3 text-left">Estado</th><th class="px-4 py-3 text-left">Orden</th><th class="px-4 py-3 text-left">Diseñador</th><th class="px-4 py-3 text-left">Entrega</th><th class="px-4 py-3 text-right">Piezas</th><th class="px-4 py-3"></th></tr></thead><tbody class="divide-y divide-slate-100">`;

        planData.forEach(item => {
            const liveOrder = allOrders.find(o => o.orderId === item.orderId);
            const isCompleted = liveOrder && liveOrder.customStatus === CONFIG.STATUS.COMPLETED;
            const pzs = (item.cantidad || 0) + (item.childPieces || 0);
            totalPzs += pzs; if (isCompleted) doneCount++;

            let badge = isCompleted ? `<span class="bg-slate-600 text-white px-2 py-1 rounded font-bold flex items-center gap-1 w-fit shadow-sm"><i class="fa-solid fa-check"></i> LISTO</span>` : item.isLate ? `<span class="bg-red-100 text-red-700 px-2 py-1 rounded font-bold border border-red-200">ATRASADA</span>` : `<span class="bg-blue-50 text-blue-700 px-2 py-1 rounded font-bold border border-blue-100">En Proceso</span>`;
            let rowClasses = isCompleted ? 'bg-slate-50 opacity-60 grayscale' : 'hover:bg-slate-50';

            html += `<tr class="${rowClasses}"><td class="px-4 py-3">${badge}</td><td class="px-4 py-3"><div class="font-bold text-slate-800 text-sm">${escapeHTML(item.cliente)}</div><div class="text-slate-500 text-[11px]">${escapeHTML(item.codigoContrato)} - ${escapeHTML(item.estilo)}</div></td><td class="px-4 py-3 font-medium text-slate-700">${escapeHTML(item.designer || 'Sin asignar')}</td><td class="px-4 py-3 text-slate-600">${item.fechaDespacho ? new Date(item.fechaDespacho).toLocaleDateString() : '-'}</td><td class="px-4 py-3 text-right font-bold text-slate-800">${pzs.toLocaleString()}</td><td class="px-4 py-3 text-right"><button class="btn-remove-from-plan text-red-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50" data-plan-entry-id="${item.planEntryId}" data-order-code="${item.codigoContrato}"><i class="fa-solid fa-trash"></i></button></td></tr>`;
        });
        html += `</tbody></table></div>`;
        const progress = planData.length > 0 ? Math.round((doneCount / planData.length) * 100) : 0;
        
        container.innerHTML = `<div class="mb-6 bg-white border border-blue-100 p-4 rounded-xl shadow-sm flex items-center justify-between gap-6"><div class="flex-1"><div class="flex justify-between mb-2"><span class="font-bold text-slate-700 text-xs uppercase">Progreso</span><span class="font-bold text-blue-600 text-xs">${progress}%</span></div><div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden"><div class="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-700" style="width: ${progress}%"></div></div></div><div class="text-right"><div class="text-2xl font-bold text-slate-800">${doneCount}/${planData.length}</div><div class="text-[10px] text-slate-400 font-bold uppercase mt-1">Completadas</div></div></div>` + html;
        document.getElementById('view-workPlanSummary').textContent = `${planData.length} órdenes | ${totalPzs.toLocaleString()} pzs`;
    }, 50);
}

window.removeOrderFromPlan = (id, code) => {
    showConfirmModal(`¿Quitar ${code} del plan?`, async () => {
        await safeFirestoreOperation(() => db_firestore.collection('weeklyPlan').doc(id).delete(), 'Quitando...', 'Orden removida');
        generateWorkPlan();
    });
};

function populateMetricsSidebar() {
    const list = document.getElementById('metricsSidebarList'); list.innerHTML = '';
    const counts = {};
    allOrders.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART).forEach(o => { const d = o.designer || 'Sin asignar'; counts[d] = (counts[d] || 0) + 1; });
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
        list.innerHTML += `<button class="filter-btn w-full text-left px-4 py-3 text-xs font-medium text-slate-600 hover:bg-blue-50 rounded-lg flex justify-between items-center mb-1 group" data-designer="${escapeHTML(name)}"><span class="truncate">${escapeHTML(name)}</span><span class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold group-hover:bg-blue-100 group-hover:text-blue-600 text-[10px]">${count}</span></button>`;
    });
}

window.generateDesignerMetrics = (name) => {
    const safeName = escapeHTML(name);
    document.getElementById('metricsDetail').innerHTML = `<div class="flex justify-between items-start mb-6 border-b border-slate-100 pb-4"><div><h2 class="text-2xl font-bold text-slate-800">${safeName}</h2><p class="text-xs text-slate-500 mt-1">Reporte individual</p></div><div class="flex gap-2"><button class="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 flex items-center gap-2" onclick="exportDesignerMetricsPDF('${safeName.replace(/'/g, "\\'")}')"><i class="fa-solid fa-file-pdf text-red-500"></i> PDF</button><button class="px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 flex items-center gap-2" onclick="openCompareModal('${safeName.replace(/'/g, "\\'")}')"><i class="fa-solid fa-scale-balanced"></i> Comparar</button></div></div><div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8"><div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm h-64 relative"><canvas id="designerDoughnutChartCanvas"></canvas></div><div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm h-64 relative"><canvas id="designerBarChartCanvas"></canvas></div></div><div id="designerOrdersTableContainer"></div>`;

    const orders = allOrders.filter(x => x.departamento === CONFIG.DEPARTMENTS.ART && (name === 'Sin asignar' ? !x.designer : x.designer === name));
    const statusMap = { [CONFIG.STATUS.TRAY]:0, [CONFIG.STATUS.PROD]:0, [CONFIG.STATUS.AUDIT]:0, [CONFIG.STATUS.COMPLETED]:0, 'Sin estado':0 };
    orders.forEach(x => { const s = x.customStatus || 'Sin estado'; if(statusMap[s]!==undefined) statusMap[s]++; else statusMap['Sin estado']++; });
    
    if (designerDoughnutChart) designerDoughnutChart.destroy();
    designerDoughnutChart = new Chart(document.getElementById('designerDoughnutChartCanvas').getContext('2d'), {
        type: 'doughnut', data: { labels: Object.keys(statusMap), datasets: [{ data: Object.values(statusMap), backgroundColor: ['#fbbf24', '#a78bfa', '#60a5fa', '#10b981', '#9ca3af'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } } } }
    });

    const clients = {}; orders.forEach(o => clients[o.cliente] = (clients[o.cliente] || 0) + 1);
    const topC = Object.entries(clients).sort((a,b)=>b[1]-a[1]).slice(0,5);
    
    if (designerBarChart) designerBarChart.destroy();
    designerBarChart = new Chart(document.getElementById('designerBarChartCanvas').getContext('2d'), {
        type: 'bar', data: { labels: topC.map(x=>x[0]), datasets: [{ label: 'Órdenes', data: topC.map(x=>x[1]), backgroundColor: '#3b82f6', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false }, ticks: { font: { size: 9 } } } } }
    });
    
    document.getElementById('designerOrdersTableContainer').innerHTML = `<h3 class="font-bold text-sm text-slate-700 mb-3">Detalle</h3><div class="overflow-hidden rounded-xl border border-slate-200 shadow-sm"><table class="min-w-full divide-y divide-slate-200 text-xs"><thead class="bg-slate-50 text-slate-500 font-bold uppercase"><tr><th class="px-4 py-3 text-left">Cliente</th><th class="px-4 py-3 text-left">Estilo</th><th class="px-4 py-3 text-left">Estado</th><th class="px-4 py-3 text-right">Piezas</th></tr></thead><tbody class="divide-y divide-slate-100 bg-white">${orders.length ? orders.map(x => `<tr><td class="px-4 py-2.5 font-medium">${escapeHTML(x.cliente)}</td><td class="px-4 py-2.5 text-slate-500">${escapeHTML(x.estilo)}</td><td class="px-4 py-2.5">${getCustomStatusBadge(x.customStatus)}</td><td class="px-4 py-2.5 text-right font-bold text-blue-600">${x.cantidad.toLocaleString()}</td></tr>`).join('') : '<tr><td colspan="4" class="p-4 text-center text-slate-400">Sin datos</td></tr>'}</tbody></table></div>`;
};

// FIX #6: Gráficos de Métricas Globales (Restaurados)
window.generateDepartmentMetrics = () => {
    // 1. Calcular Datos Globales
    const activeOrders = allOrders.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART);
    const totalLoad = activeOrders.reduce((s,o) => s + o.cantidad + o.childPieces, 0);
    const activeDesigners = [...new Set(activeOrders.map(o => o.designer).filter(Boolean))].length;

    // 2. Renderizar HTML Base
    document.getElementById('departmentMetricsContent').innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                <p class="text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">Total Activas</p>
                <p class="text-3xl font-bold text-slate-900">${activeOrders.length}</p>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                <p class="text-[10px] font-bold uppercase tracking-wider text-purple-500 mb-1">Carga Total (Pzs)</p>
                <p class="text-3xl font-bold text-slate-900">${totalLoad.toLocaleString()}</p>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                <p class="text-[10px] font-bold uppercase tracking-wider text-green-500 mb-1">Diseñadores Activos</p>
                <p class="text-3xl font-bold text-slate-900">${activeDesigners}</p>
            </div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 h-80 relative">
                <h4 class="font-bold text-sm text-slate-700 mb-4">Estado Global</h4>
                <div class="h-60"><canvas id="deptLoadPieChartCanvas"></canvas></div>
            </div>
            <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 h-80 relative">
                <h4 class="font-bold text-sm text-slate-700 mb-4">Carga por Diseñador (Top 10)</h4>
                <div class="h-60"><canvas id="deptLoadBarChartCanvas"></canvas></div>
            </div>
        </div>`;

    // 3. Generar Gráfico de Pastel (Estados)
    const statusMap = { [CONFIG.STATUS.TRAY]:0, [CONFIG.STATUS.PROD]:0, [CONFIG.STATUS.AUDIT]:0, [CONFIG.STATUS.COMPLETED]:0, 'Sin estado':0 };
    activeOrders.forEach(x => { const s = x.customStatus || 'Sin estado'; if(statusMap[s]!==undefined) statusMap[s]++; else statusMap['Sin estado']++; });

    if (deptLoadPieChart) deptLoadPieChart.destroy();
    deptLoadPieChart = new Chart(document.getElementById('deptLoadPieChartCanvas').getContext('2d'), {
        type: 'pie',
        data: { labels: Object.keys(statusMap), datasets: [{ data: Object.values(statusMap), backgroundColor: ['#fbbf24', '#a78bfa', '#60a5fa', '#10b981', '#9ca3af'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } }
    });

    // 4. Generar Gráfico de Barras (Carga Top 10)
    const loadMap = {};
    activeOrders.forEach(o => { if(o.designer && o.designer !== CONFIG.EXCLUDED_DESIGNER) loadMap[o.designer] = (loadMap[o.designer] || 0) + o.cantidad; });
    const sortedLoad = Object.entries(loadMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
    
    if (deptLoadBarChart) deptLoadBarChart.destroy();
    deptLoadBarChart = new Chart(document.getElementById('deptLoadBarChartCanvas').getContext('2d'), {
        type: 'bar',
        data: { labels: sortedLoad.map(x => x[0]), datasets: [{ label: 'Piezas', data: sortedLoad.map(x => x[1]), backgroundColor: '#3b82f6', borderRadius: 4 }] },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: { legend: { display: false } }, 
            scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 45, minRotation: 45, font: { size: 9 } } }, y: { beginAtZero: true, grid: { borderDash: [2, 4] } } }
        }
    });
};

// ======================================================
// ===== 13. EXPORTACIÓN Y UTILS UI =====
// ======================================================

window.openCompareModal = (name) => {
    currentCompareDesigner1 = name;
    document.getElementById('compareDesigner1Name').textContent = name;
    const sel = document.getElementById('compareDesignerSelect');
    sel.innerHTML = '<option value="">Selecciona...</option>' + designerList.filter(d => d !== name).map(d => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
    openModalById('selectCompareModal');
};

window.startComparison = () => {
    const n2 = document.getElementById('compareDesignerSelect').value;
    if (!n2) return;
    const art = allOrders.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART);
    const s1 = calculateStats(art.filter(o => o.designer === currentCompareDesigner1));
    const s2 = calculateStats(art.filter(o => o.designer === n2));
    
    if (compareChart) compareChart.destroy();
    compareChart = new Chart(document.getElementById('compareChartCanvas').getContext('2d'), {
        type: 'bar',
        data: { labels: ['Total', 'A Tiempo', 'Atrasadas'], datasets: [{ label: currentCompareDesigner1, data: [s1.total, s1.onTime, s1.late], backgroundColor: '#3b82f6' }, { label: n2, data: [s2.total, s2.onTime, s2.late], backgroundColor: '#f59e0b' }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
    
    document.getElementById('selectCompareModal').classList.remove('active');
    openModalById('compareModal');
};

// FIX #9: Exportación a PDF para Diseñadores
window.exportDesignerMetricsPDF = (name) => {
    if (typeof window.jspdf === 'undefined') return showCustomAlert('Error: Librería PDF no cargada', 'error');
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(16); doc.text(`Reporte de Desempeño: ${name}`, 14, 15);
    doc.setFontSize(10); doc.text(`Generado: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 22);
    
    const orders = allOrders.filter(x => x.departamento === CONFIG.DEPARTMENTS.ART && (name === 'Sin asignar' ? !x.designer : x.designer === name));
    const body = orders.map(x => [x.cliente.substring(0, 20), x.codigoContrato, x.estilo.substring(0, 20), x.customStatus || '-', x.cantidad.toLocaleString()]);
    
    doc.autoTable({ 
        head: [['Cliente', 'Contrato', 'Estilo', 'Estado', 'Pzs']], 
        body: body, 
        startY: 30,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235] },
        alternateRowStyles: { fillColor: [248, 250, 252] }
    });
    
    const finalY = doc.lastAutoTable.finalY + 10;
    const totalPzs = orders.reduce((s,o) => s+o.cantidad, 0);
    doc.setFontSize(10);
    doc.text(`Total Órdenes: ${orders.length} | Total Piezas: ${totalPzs.toLocaleString()}`, 14, finalY);
    doc.save(`Metricas_${name.replace(/\s+/g,'_')}.pdf`);
};

window.exportTableToExcel = () => {
    if (allOrders.length === 0) return showCustomAlert('No hay datos', 'error');
    const data = getFilteredOrders().map(o => ({
        "Cliente": o.cliente, "Código": o.codigoContrato, "Estilo": o.estilo, "Departamento": o.departamento,
        "Fecha Despacho": o.fechaDespacho ? o.fechaDespacho.toLocaleDateString() : '',
        "Diseñador": o.designer, "Estado Interno": o.customStatus, "Piezas": o.cantidad, "Notas": o.notes
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Reporte");
    XLSX.writeFile(wb, `Reporte_Panel_${new Date().toISOString().slice(0,10)}.xlsx`);
};

window.generateWeeklyReport = () => {
    const w = document.getElementById('weekSelector').value;
    if(!w) return;
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
    
    document.getElementById('weeklyReportContent').innerHTML = filtered.length ? `<h3 class="font-bold mb-2">Resultados: ${filtered.length} órdenes</h3><table id="weeklyReportTable" class="w-full text-xs border-collapse"><thead><tr class="bg-gray-100 text-left"><th class="p-2 border">Fecha</th><th class="p-2 border">Cliente</th><th class="p-2 border">Estilo</th><th class="p-2 border text-right">Pzs</th></tr></thead><tbody>${filtered.map(o => `<tr><td class="p-2 border">${o.receivedDate}</td><td class="p-2 border">${o.cliente}</td><td class="p-2 border">${o.estilo}</td><td class="p-2 border text-right">${o.cantidad}</td></tr>`).join('')}</tbody></table>` : '<p class="text-center text-gray-400 py-8">No hay órdenes recibidas en este periodo.</p>';
};

window.exportWeeklyReportAsPDF = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Reporte Semanal de Entradas", 14, 15);
    doc.autoTable({ html: '#weeklyReportTable', startY: 20, theme: 'grid', styles: { fontSize: 8 } });
    doc.save("reporte_semanal.pdf");
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
window.openWeeklyReportModal = () => openModalById('weeklyReportModal');

window.resetApp = () => {
    showConfirmModal("¿Subir nuevo archivo? Se perderán los datos no guardados.", () => {
        document.getElementById('appMainContainer').style.display = 'none';
        document.getElementById('mainNavigation').style.display = 'none';
        document.getElementById('uploadSection').style.display = 'block';
        allOrders = []; isExcelLoaded = false;
        document.getElementById('fileInput').value = ''; document.getElementById('fileName').textContent = '';
        desconectarDatosDeFirebase();
    });
};