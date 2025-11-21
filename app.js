// ======================================================
// ===== CONFIGURACIÓN DE FIREBASE =====
// ======================================================
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

// ======================================================
// ===== VARIABLES GLOBALES =====
// ======================================================
let allOrders = []; 
let selectedOrders = new Set();
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
let currentEditingOrderId = null;
let isExcelLoaded = false; 
let currentPage = 1;
let rowsPerPage = 50;
let paginatedOrders = [];
let usuarioActual = null; 
const db_firestore = firebase.firestore(); 

let unsubscribeAssignments = null;
let unsubscribeHistory = null;
let unsubscribeChildOrders = null;
let unsubscribeDesigners = null;
let unsubscribeWeeklyPlan = null;

let firebaseAssignmentsMap = new Map();
let firebaseHistoryMap = new Map();
let firebaseChildOrdersMap = new Map();
let firebaseDesignersMap = new Map(); 
let firebaseWeeklyPlanMap = new Map();

let designerList = []; 
let needsRecalculation = true; 
const EXCLUDE_DESIGNER_NAME = 'Magdali Fernandez'; 
const DB_SCHEMA_VERSION = 1; 
let autoCompleteBatchWrites = []; 
let autoCompletedOrderIds = new Set(); 

// Gráficos
let designerDoughnutChart = null;
let designerBarChart = null;
let deptLoadPieChart = null;
let deptLoadBarChart = null;
let compareChart = null;
let currentCompareDesigner1 = '';

// ======================================================
// ===== SISTEMA DE NAVEGACIÓN (ROUTER) =====
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
        const detailText = document.getElementById('metricsDetail').innerText;
        if(detailText && detailText.includes('Selecciona')) {
            const firstBtn = document.querySelector('#metricsSidebarList .filter-btn');
            if(firstBtn) firstBtn.click();
        }
    } else if (viewId === 'departmentMetricsView') generateDepartmentMetrics();

    // Limpiar gráficos si no estamos en métricas
    if (viewId !== 'designerMetricsView' && viewId !== 'departmentMetricsView') destroyAllCharts();
}

// ======================================================
// ===== UTILIDADES =====
// ======================================================
function safeAddEventListener(id, event, handler) {
    const element = document.getElementById(id);
    if (element) element.addEventListener(event, handler);
}

let debounceTimer;
function debounce(func, delay) {
    return function() { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => func.apply(this, arguments), delay); }
}

function preventDefaults(e){ e.preventDefault(); e.stopPropagation(); }
function escapeHTML(str) { return !str ? '' : String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

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

function setButtonLoading(buttonId, isLoading, originalText = 'Guardar') {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    if (isLoading) {
        btn.dataset.originalText = btn.innerHTML; btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Guardando...`;
    } else { btn.disabled = false; btn.innerHTML = btn.dataset.originalText || originalText; }
}

function showLoading(msg='Cargando...') {
    if (document.getElementById('loadingOverlay')) return;
    const o = document.createElement('div'); o.id = 'loadingOverlay'; o.className = 'loading-overlay'; 
    o.innerHTML = `<div class="spinner"></div><p class="text-xs font-medium text-slate-600 mt-2">${escapeHTML(msg)}</p>`;
    document.body.appendChild(o);
}
function hideLoading() { const o = document.getElementById('loadingOverlay'); if(o) o.remove(); }

function checkAndCloseModalStack() {
    if (document.querySelectorAll('.modal.active').length === 0) document.body.classList.remove('modal-open');
}

// ======================================================
// ===== INICIALIZACIÓN =====
// ======================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('App v6.1 Loaded');
    safeAddEventListener('loginButton', 'click', iniciarLoginConGoogle);
    safeAddEventListener('logoutButton', 'click', iniciarLogout);
    safeAddEventListener('logoutNavBtn', 'click', iniciarLogout); 

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

    safeAddEventListener('searchInput', 'input', debounce((e) => { currentSearch = e.target.value; currentPage = 1; updateTable(); }, 300));
    ['clientFilter', 'styleFilter', 'teamFilter', 'departamentoFilter', 'designerFilter', 'customStatusFilter', 'dateFrom', 'dateTo'].forEach(id => {
        safeAddEventListener(id, 'change', debounce((e) => {
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

    // Delegados
    const delegate = (id, sel, cb) => { const el = document.getElementById(id); if(el) el.addEventListener('click', e => { const t = e.target.closest(sel); if(t) cb(t, e); }); };
    delegate('designerManagerList', '.btn-delete-designer', (btn) => deleteDesigner(btn.dataset.id, btn.dataset.name));
    delegate('metricsSidebarList', '.filter-btn', (btn) => {
        document.querySelectorAll('#metricsSidebarList .filter-btn').forEach(b => b.classList.remove('active', 'bg-blue-50', 'border-blue-200'));
        btn.classList.add('active', 'bg-blue-50', 'border-blue-200');
        generateDesignerMetrics(btn.dataset.designer);
    });
    delegate('childOrdersList', '.btn-delete-child', (btn, e) => { e.stopPropagation(); deleteChildOrder(btn.dataset.childId, btn.dataset.childCode); });
    delegate('view-workPlanContent', '.btn-remove-from-plan', (btn, e) => { e.stopPropagation(); removeOrderFromPlan(btn.dataset.planEntryId, btn.dataset.orderCode); });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { closeConfirmModal(); document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active')); document.body.classList.remove('modal-open'); }
    });
});
// ======================================================
// ===== 6. LÓGICA DE FIREBASE (DATA LAYER) =====
// ======================================================
function iniciarLoginConGoogle() { 
    firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => showCustomAlert(e.message, 'error')); 
}

function iniciarLogout() { 
    firebase.auth().signOut().then(() => { 
        document.getElementById('mainNavigation').style.transform = 'translateX(-100%)';
        document.getElementById('appMainContainer').classList.remove('main-content-shifted');
    }); 
}

function conectarDatosDeFirebase() {
    if (!usuarioActual) return;
    const navDbStatus = document.getElementById('navDbStatus'); 

    const setStatus = (connected) => {
        const html = connected 
            ? `<span class="w-1.5 h-1.5 rounded-full bg-green-500"></span> Conectado`
            : `<span class="w-1.5 h-1.5 rounded-full bg-yellow-500"></span> Conectando...`;
        if(navDbStatus) navDbStatus.innerHTML = html;
    };

    setStatus(false);
    
    unsubscribeAssignments = db_firestore.collection('assignments').onSnapshot(s => {
        firebaseAssignmentsMap.clear();
        s.forEach(d => firebaseAssignmentsMap.set(d.id, d.data()));
        if(isExcelLoaded) mergeYActualizar(); 
        setStatus(true);
    });

    unsubscribeHistory = db_firestore.collection('history').onSnapshot(s => {
        firebaseHistoryMap.clear();
        s.forEach(d => { 
            const v = d.data(); 
            if(!firebaseHistoryMap.has(v.orderId)) firebaseHistoryMap.set(v.orderId, []); 
            firebaseHistoryMap.get(v.orderId).push(v); 
        });
    });

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
    
    unsubscribeDesigners = db_firestore.collection('designers').orderBy('name').onSnapshot(s => {
        firebaseDesignersMap.clear(); let newDesignerList = [];
        s.forEach(d => { 
            const v = d.data(); 
            firebaseDesignersMap.set(d.id, v); 
            newDesignerList.push(v.name); 
        });
        designerList = newDesignerList;
        updateAllDesignerDropdowns();
        populateDesignerManagerModal();
        if(isExcelLoaded && document.getElementById('dashboard').style.display === 'block') updateDashboard();
    });

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

function mergeYActualizar() {
    if (!isExcelLoaded) return;
    recalculateChildPieces(); 
    autoCompleteBatchWrites = []; 

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

        // Lógica de Auto-Completado
        if (fb && o.departamento !== 'P_Art' && o.departamento !== 'Sin Departamento') {
            if (fb.customStatus !== 'Completada' && !autoCompletedOrderIds.has(o.orderId)) {
                o.customStatus = 'Completada';
                const d = new Date().toISOString();
                o.completedDate = d;
                
                autoCompleteBatchWrites.push({
                    orderId: o.orderId,
                    data: { customStatus: 'Completada', completedDate: d, lastModified: d, schemaVersion: DB_SCHEMA_VERSION },
                    history: [`Salio de Arte (en ${o.departamento}) → Completada`]
                });
                autoCompletedOrderIds.add(o.orderId);
            }
        }
    }
    
    if (document.getElementById('dashboard').style.display === 'block') updateDashboard();
    if (autoCompleteBatchWrites.length > 0) ejecutarAutoCompleteBatch();
}

async function ejecutarAutoCompleteBatch() {
    if (!usuarioActual || autoCompleteBatchWrites.length === 0) return;
    const batch = db_firestore.batch();
    const user = usuarioActual.displayName;
    
    autoCompleteBatchWrites.slice(0, 400).forEach(w => {
        const ref = db_firestore.collection('assignments').doc(w.orderId);
        batch.set(ref, w.data, { merge: true });
        
        const hRef = db_firestore.collection('history').doc();
        batch.set(hRef, { orderId: w.orderId, change: w.history[0], user, timestamp: new Date().toISOString() });
    });

    try {
        await batch.commit();
        showCustomAlert(`${autoCompleteBatchWrites.length} órdenes auto-completadas`, 'success');
        autoCompleteBatchWrites = [];
    } catch (e) { console.error("Error batch:", e); }
}

// ======================================================
// ===== 7. CRUD (OPERACIONES BASE DE DATOS) =====
// ======================================================

async function saveAssignmentToDB_Firestore(id, data, changes) {
    if (!usuarioActual) throw new Error("No autenticado");
    const batch = db_firestore.batch();
    batch.set(db_firestore.collection('assignments').doc(id), { ...data, lastModified: new Date().toISOString(), schemaVersion: DB_SCHEMA_VERSION }, { merge: true });
    changes.forEach(c => batch.set(db_firestore.collection('history').doc(), { orderId: id, change: c, user: usuarioActual.displayName, timestamp: new Date().toISOString() }));
    return await batch.commit();
}

async function addDesigner() {
    const name = document.getElementById('newDesignerName').value.trim();
    const email = document.getElementById('newDesignerEmail').value.trim().toLowerCase();
    if(!name || !email) return showCustomAlert('Datos incompletos', 'error');
    
    try {
        await db_firestore.collection('designers').add({ name, email, createdAt: new Date().toISOString() });
        document.getElementById('newDesignerName').value = '';
        document.getElementById('newDesignerEmail').value = '';
        showCustomAlert('Diseñador agregado', 'success');
    } catch (e) { showCustomAlert(e.message, 'error'); }
}

async function deleteDesigner(id, name) {
    showConfirmModal(`¿Eliminar a ${name}?`, async () => {
        try {
            await db_firestore.collection('designers').doc(id).delete();
            showCustomAlert('Eliminado', 'success');
        } catch (e) { showCustomAlert(e.message, 'error'); }
    });
}

async function saveChildOrderToDB(child) {
    child.schemaVersion = DB_SCHEMA_VERSION;
    return await db_firestore.collection('childOrders').doc(child.childOrderId).set(child);
}

async function deleteChildOrderFromDB(id) {
    return await db_firestore.collection('childOrders').doc(id).delete();
}

async function addOrderToWorkPlanDB(o, wid) {
    const pid = `${o.orderId}_${wid}`;
    const snap = await db_firestore.collection('weeklyPlan').doc(pid).get();
    if(snap.exists) return false;
    await db_firestore.collection('weeklyPlan').doc(pid).set({
        planEntryId: pid, orderId: o.orderId, weekIdentifier: wid, designer: o.designer,
        cliente: o.cliente, codigoContrato: o.codigoContrato, estilo: o.estilo,
        fechaDespacho: o.fechaDespacho ? o.fechaDespacho.toISOString() : null,
        cantidad: o.cantidad, childPieces: o.childPieces, isLate: o.isLate, isAboutToExpire: o.isAboutToExpire,
        addedAt: new Date().toISOString(), schemaVersion: DB_SCHEMA_VERSION
    });
    return true;
}

async function removeOrderFromWorkPlanDB(id) {
    return await db_firestore.collection('weeklyPlan').doc(id).delete();
}

// ======================================================
// ===== 8. PARSER EXCEL (CORE) =====
// ======================================================

function handleFiles(files){ if(files.length){ document.getElementById('fileName').textContent = files[0].name; processFile(files[0]); } }
function handleFileSelect(e){ handleFiles(e.target.files); }
function handleDrop(e){ const dt = e.dataTransfer; handleFiles(dt.files); }

async function processFile(file) {
    showLoading('Procesando Excel...');
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheetName = workbook.SheetNames.find(n => /working\s*pro[c]{1,2}ess/i.test(n));
        if (!sheetName) throw new Error('No se encontró "Working Process"');
        
        const arr = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
        let hIdx = -1;
        for (let i = 0; i < Math.min(arr.length, 15); i++) {
            const r = arr[i].map(c => String(c).toLowerCase());
            if (r.some(c => c.includes('fecha')) && r.some(c => c.includes('cliente'))) { hIdx = i; break; }
        }
        if (hIdx === -1) throw new Error('Encabezados no encontrados');
        
        const headers = arr[hIdx].map(h => String(h).trim().toLowerCase());
        const rows = arr.slice(hIdx + 1);
        const cols = {
            fecha: headers.findIndex(h => h.includes('fecha')),
            cliente: headers.findIndex(h => h.includes('cliente')),
            codigo: headers.findIndex(h => h.includes('codigo') || h.includes('contrato')),
            estilo: headers.findIndex(h => h.includes('estilo')),
            team: headers.findIndex(h => h.includes('team'))
        };
        const depts = [
            { p: /p[_\s]*art/i, n: 'P_Art' }, { p: /p[_\s]*sew/i, n: 'P_Sew' },
            { p: /p[_\s]*cut/i, n: 'P_Cut' }, { p: /p[_\s]*print/i, n: 'P_Printing' },
            { p: /p[_\s]*press/i, n: 'P_Press' }, { p: /p[_\s]*ship/i, n: 'P_Shipping' }
        ];
        const deptCols = [];
        headers.forEach((h, i) => { const m = depts.find(d => d.p.test(h)); if (m) deptCols.push({ idx: i, name: m.n }); });

        let processed = [];
        let currDate = null, cCli = "", cCod = "", cSty = "", cTeam = "";
        autoCompleteBatchWrites = [];

        for (const r of rows) {
            if (!r || r.every(c => !c)) continue;
            
            if (cols.fecha >= 0 && r[cols.fecha]) { const v = r[cols.fecha]; currDate = typeof v === 'number' ? new Date((v - 25569) * 86400000) : new Date(v); }
            if (cols.cliente >= 0 && r[cols.cliente]) cCli = String(r[cols.cliente]).trim();
            if (cols.codigo >= 0 && r[cols.codigo]) cCod = String(r[cols.codigo]).trim();
            if (cols.estilo >= 0 && r[cols.estilo]) cSty = String(r[cols.estilo]).trim();
            if (cols.team >= 0 && r[cols.team]) cTeam = String(r[cols.team]).trim();
            if (!cCli || !cCod) continue;

            let qty = 0, dept = "Sin Departamento";
            for (let i = deptCols.length - 1; i >= 0; i--) {
                const val = r[deptCols[i].idx];
                if (val) { const n = Number(String(val).replace(/,|\s/g, '')); if (n > 0) { qty = n; dept = deptCols[i].name; break; } }
            }
            if (qty <= 0) dept = "Sin Departamento";

            const fd = currDate ? new Date(currDate.getFullYear(), currDate.getMonth(), currDate.getDate()) : null;
            const oid = `${cCli}_${cCod}_${fd ? fd.getTime() : 'nodate'}_${cSty}`;
            const fb = firebaseAssignmentsMap.get(oid);
            let st = fb ? fb.customStatus : '', cd = fb ? fb.completedDate : null;

            if (fb && dept !== 'P_Art' && dept !== 'Sin Departamento' && st !== 'Completada' && !autoCompletedOrderIds.has(oid)) {
                st = 'Completada'; cd = new Date().toISOString();
                autoCompleteBatchWrites.push({ orderId: oid, data: { customStatus: 'Completada', completedDate: cd }, history: [`Auto-completada (en ${dept})`] });
                autoCompletedOrderIds.add(oid);
            }

            const today = new Date(); today.setHours(0,0,0,0);
            const dl = (fd && fd < today) ? Math.ceil((today - fd) / 86400000) : 0;

            processed.push({
                orderId: oid, fechaDespacho: fd, cliente: cCli, codigoContrato: cCod, estilo: cSty, teamName: cTeam,
                departamento: dept, cantidad: qty, childPieces: 0,
                isLate: fd && fd < today, isVeryLate: dl > 7, isAboutToExpire: fd && !dl && ((fd - today) / 86400000) <= 2,
                designer: fb ? fb.designer : '', customStatus: st, receivedDate: fb ? fb.receivedDate : '', notes: fb ? fb.notes : '', completedDate: cd
            });
        }

        allOrders = processed; isExcelLoaded = true; needsRecalculation = true;
        recalculateChildPieces();
        if (autoCompleteBatchWrites.length > 0) await ejecutarAutoCompleteBatch();

        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('appMainContainer').style.display = 'block';
        document.getElementById('appMainContainer').classList.add('main-content-shifted');
        document.getElementById('mainNavigation').style.display = 'flex';
        document.getElementById('mainNavigation').style.transform = 'translateX(0)';
        navigateTo('dashboard');

    } catch (e) { showCustomAlert('Error: ' + e.message, 'error'); console.error(e); } 
    finally { hideLoading(); }
}

async function recalculateChildPieces() {
    if (!needsRecalculation) return;
    let cache = new Map();
    firebaseChildOrdersMap.forEach((l, p) => cache.set(p, l.reduce((s, c) => s + (c.cantidad || 0), 0)));
    allOrders.forEach(o => o.childPieces = cache.get(o.orderId) || 0);
    needsRecalculation = false;
}
// ======================================================
// ===== 9. RENDERIZADO UI (DASHBOARD) =====
// ======================================================
function updateDashboard() {
    if (!isExcelLoaded) return;
    if (needsRecalculation) recalculateChildPieces();
    
    const artOrders = allOrders.filter(o => o.departamento === 'P_Art');
    const stats = calculateStats(artOrders);
    
    // Actualizar Tarjetas de Estadísticas
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
    
    // Actualizar Alertas
    updateAlerts(stats);

    // Widget: Top Clientes
    const clientCounts = {};
    artOrders.forEach(o => clientCounts[o.cliente] = (clientCounts[o.cliente] || 0) + 1);
    const topClients = Object.entries(clientCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    
    document.getElementById('clientReport').innerHTML = topClients.map(([c, n], i) => `
        <div class="flex justify-between py-1.5 border-b border-slate-50 last:border-0 text-xs">
            <span class="text-slate-600 truncate w-32" title="${c}">${i+1}. ${c}</span>
            <span class="font-bold text-blue-600 bg-blue-50 px-2 rounded-full">${n}</span>
        </div>`).join('');

    // Widget: Carga de Trabajo
    const workload = {};
    let totalWorkload = 0;
    artOrders.forEach(o => {
        if (o.designer) {
            const pieces = o.cantidad + o.childPieces;
            workload[o.designer] = (workload[o.designer] || 0) + pieces;
            if (o.designer !== EXCLUDE_DESIGNER_NAME) totalWorkload += pieces;
        }
    });
    
    document.getElementById('workloadTotal').textContent = totalWorkload.toLocaleString() + ' pzs';
    document.getElementById('workloadList').innerHTML = Object.entries(workload)
        .sort((a, b) => b[1] - a[1])
        .map(([designer, pieces]) => {
            const pct = (totalWorkload > 0 && designer !== EXCLUDE_DESIGNER_NAME) ? ((pieces / totalWorkload) * 100).toFixed(1) : 0;
            return `
            <div class="mb-2">
                <div class="flex justify-between text-xs mb-0.5">
                    <span class="text-slate-700 font-medium truncate w-24">${designer}</span>
                    <span class="text-slate-500">${pieces.toLocaleString()} (${pct}%)</span>
                </div>
                <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full bg-blue-500 rounded-full" style="width: ${designer === EXCLUDE_DESIGNER_NAME ? 0 : pct}%"></div>
                </div>
            </div>`;
        }).join('');

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
        html += `<div onclick="setFilter('veryLate'); toggleNotifications();" class="p-3 hover:bg-red-50 cursor-pointer border-b border-slate-50 group transition">
            <p class="text-xs font-bold text-slate-700 group-hover:text-red-600">Muy Atrasadas (>7 días)</p>
            <p class="text-[10px] text-slate-500">${stats.veryLate} órdenes críticas</p>
        </div>`;
    }
    if (stats.aboutToExpire > 0) {
        html += `<div onclick="setFilter('aboutToExpire'); toggleNotifications();" class="p-3 hover:bg-yellow-50 cursor-pointer border-b border-slate-50 group transition">
            <p class="text-xs font-bold text-slate-700 group-hover:text-yellow-600">Por Vencer (≤2 días)</p>
            <p class="text-[10px] text-slate-500">${stats.aboutToExpire} atenciones necesarias</p>
        </div>`;
    }
    
    list.innerHTML = html || '<div class="p-4 text-center text-[10px] text-slate-400 italic">Sin alertas pendientes</div>';
}

function toggleNotifications() {
    const dd = document.getElementById('notificationDropdown');
    if (dd) dd.classList.toggle('hidden');
}

function updateTable() {
    const filtered = getFilteredOrders();
    const start = (currentPage - 1) * rowsPerPage;
    paginatedOrders = filtered.slice(start, start + rowsPerPage);
    
    document.getElementById('resultCount').textContent = filtered.length;
    document.getElementById('resultPieces').textContent = filtered.reduce((s, o) => s + o.cantidad + o.childPieces, 0).toLocaleString();

    const tbody = document.getElementById('tableBody');
    if (paginatedOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="14" class="text-center py-12 text-slate-400 italic">No se encontraron órdenes con los filtros actuales.</td></tr>`;
    } else {
        tbody.innerHTML = paginatedOrders.map(order => {
            const rowClass = order.isVeryLate ? 'bg-red-50/40' : order.isLate ? 'bg-orange-50/40' : order.isAboutToExpire ? 'bg-yellow-50/40' : '';
            const statusBadge = getStatusBadge(order);
            const internalBadge = getCustomStatusBadge(order.customStatus);
            const hasChild = order.childPieces > 0 ? `<span class="ml-1 text-[9px] bg-blue-100 text-blue-700 px-1.5 rounded-full font-bold" title="${order.childPieces} piezas en hijas">+${order.childPieces}</span>` : '';
            
            return `
            <tr class="${rowClass} hover:bg-blue-50 transition-colors cursor-pointer border-b border-slate-50 last:border-b-0" onclick="openAssignModal('${order.orderId}')">
                <td class="px-3 py-2.5 text-center" onclick="event.stopPropagation()">
                    ${order.departamento === 'P_Art' ? `<input type="checkbox" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4" data-order-id="${order.orderId}" onchange="toggleOrderSelection('${order.orderId}')" ${selectedOrders.has(order.orderId) ? 'checked' : ''}>` : ''}
                </td>
                <td class="px-3 py-2.5" data-label="Estado">${statusBadge}</td>
                <td class="px-3 py-2.5 font-medium text-slate-700 whitespace-nowrap" data-label="Fecha">${formatDate(order.fechaDespacho)}</td>
                <td class="px-3 py-2.5 font-medium text-slate-900 truncate max-w-[140px]" data-label="Cliente" title="${escapeHTML(order.cliente)}">${escapeHTML(order.cliente)}</td>
                <td class="px-3 py-2.5 text-slate-500 font-mono text-xs" data-label="Código">${escapeHTML(order.codigoContrato)}</td>
                <td class="px-3 py-2.5 text-slate-600 truncate max-w-[120px]" data-label="Estilo" title="${escapeHTML(order.estilo)}">${escapeHTML(order.estilo)}</td>
                <td class="px-3 py-2.5 hidden lg:table-cell text-slate-500 text-[11px]" data-label="Team">${escapeHTML(order.teamName)}</td>
                <td class="px-3 py-2.5 hidden md:table-cell" data-label="Depto"><span class="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">${escapeHTML(order.departamento)}</span></td>
                <td class="px-3 py-2.5" data-label="Diseñador">
                    ${order.designer ? `<span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md text-[11px] font-bold border border-indigo-100 whitespace-nowrap">${escapeHTML(order.designer)}</span>` : '<span class="text-slate-300 italic text-[11px]">--</span>'}
                </td>
                <td class="px-3 py-2.5" data-label="Estado Int.">${internalBadge}</td>
                <td class="px-3 py-2.5 hidden lg:table-cell text-slate-500 text-xs" data-label="Recibida">${order.receivedDate ? formatDate(new Date(order.receivedDate + 'T00:00:00')) : '-'}</td>
                <td class="px-3 py-2.5 font-bold text-slate-700 flex items-center justify-end gap-1" data-label="Cant.">${order.cantidad.toLocaleString()} ${hasChild}</td>
                <td class="px-3 py-2.5 text-center" data-label="Notas">${order.notes ? '<i class="fa-solid fa-note-sticky text-yellow-400 text-sm" title="Ver notas"></i>' : ''}</td>
                <td class="px-3 py-2.5 text-right"><i class="fa-solid fa-chevron-right text-slate-300 text-[10px]"></i></td>
            </tr>`;
        }).join('');
    }
    
    // Actualizar Checkbox "Seleccionar Todo"
    const allChecked = paginatedOrders.length > 0 && paginatedOrders.every(o => selectedOrders.has(o.orderId));
    const sa = document.getElementById('selectAll');
    if (sa) {
        sa.checked = allChecked;
        sa.indeterminate = !allChecked && paginatedOrders.some(o => selectedOrders.has(o.orderId));
    }
    
    // Barra Flotante de Selección
    const bar = document.getElementById('multiSelectBar');
    if (selectedOrders.size > 0) {
        bar.style.opacity = '1'; 
        bar.style.transform = 'translateX(-50%) translateY(0)'; 
        bar.style.pointerEvents = 'auto';
        document.getElementById('selectedCount').textContent = selectedOrders.size;
    } else {
        bar.style.opacity = '0'; 
        bar.style.transform = 'translateX(-50%) translateY(20px)'; 
        bar.style.pointerEvents = 'none';
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

// Funciones globales para paginación (necesarias para onclick en HTML)
window.changePage = (p) => { currentPage = p; updateTable(); };
window.changeRowsPerPage = () => { rowsPerPage = parseInt(document.getElementById('rowsPerPage').value); currentPage = 1; updateTable(); };

function getFilteredOrders() {
    let res = allOrders;
    const s = currentSearch.toLowerCase();
    if (s) {
        res = res.filter(o => 
            (o.cliente || '').toLowerCase().includes(s) || 
            (o.codigoContrato || '').toLowerCase().includes(s) || 
            (o.estilo || '').toLowerCase().includes(s) || 
            (o.designer || '').toLowerCase().includes(s)
        );
    }
    
    if (currentClientFilter) res = res.filter(o => o.cliente === currentClientFilter);
    if (currentDepartamentoFilter) res = res.filter(o => o.departamento === currentDepartamentoFilter);
    else res = res.filter(o => o.departamento === 'P_Art'); // Por defecto solo P_Art en la tabla
    
    if (currentDesignerFilter) res = res.filter(o => o.designer === currentDesignerFilter);
    if (currentCustomStatusFilter) res = res.filter(o => o.customStatus === currentCustomStatusFilter);
    
    if (currentFilter === 'late') res = res.filter(o => o.isLate);
    else if (currentFilter === 'veryLate') res = res.filter(o => o.isVeryLate);
    else if (currentFilter === 'aboutToExpire') res = res.filter(o => o.isAboutToExpire);
    
    if(currentDateFrom) res = res.filter(o => o.fechaDespacho && o.fechaDespacho >= new Date(currentDateFrom));
    if(currentDateTo) res = res.filter(o => o.fechaDespacho && o.fechaDespacho <= new Date(currentDateTo));

    // Ordenamiento
    res.sort((a, b) => {
        let va = a[sortConfig.key], vb = b[sortConfig.key];
        if (sortConfig.key === 'date') { va = a.fechaDespacho ? a.fechaDespacho.getTime() : 0; vb = b.fechaDespacho ? b.fechaDespacho.getTime() : 0; }
        if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
        return (va < vb ? -1 : 1) * (sortConfig.direction === 'asc' ? 1 : -1);
    });
    
    return res;
}

// Helpers Visuales
function getStatusBadge(order) {
    if (order.isVeryLate) return `<span class="status-badge bg-red-100 text-red-700 ring-1 ring-red-600/10">MUY ATRASADA</span>`;
    if (order.isLate) return `<span class="status-badge bg-orange-100 text-orange-700 ring-1 ring-orange-600/10">ATRASADA</span>`;
    if (order.isAboutToExpire) return `<span class="status-badge bg-yellow-100 text-yellow-800 ring-1 ring-yellow-600/20">URGENTE</span>`;
    return `<span class="status-badge bg-green-100 text-green-700 ring-1 ring-green-600/20">A TIEMPO</span>`;
}

function getCustomStatusBadge(status) {
    const map = {
        'Bandeja': 'bg-yellow-50 text-yellow-700 border-yellow-200',
        'Producción': 'bg-purple-50 text-purple-700 border-purple-200',
        'Auditoría': 'bg-blue-50 text-blue-700 border-blue-200',
        'Completada': 'bg-slate-100 text-slate-600 border-slate-200'
    };
    return status ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold border ${map[status] || 'bg-gray-50 text-gray-600'}">${status}</span>` : '-';
}

function formatDate(d) { return d ? d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'; }

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

// Funciones Globales de UI
window.setFilter = (f) => { currentFilter = f; currentPage = 1; updateTable(); };
window.sortTable = (k) => { sortConfig.direction = (sortConfig.key === k && sortConfig.direction === 'asc') ? 'desc' : 'asc'; sortConfig.key = k; updateTable(); };
window.clearAllFilters = () => { 
    currentSearch = ''; currentClientFilter = ''; currentStyleFilter = ''; currentTeamFilter = ''; currentDepartamentoFilter = ''; 
    currentDesignerFilter = ''; currentCustomStatusFilter = ''; currentFilter = 'all'; currentDateFrom = ''; currentDateTo = '';
    document.querySelectorAll('.filter-select, .filter-input').forEach(el => el.value = '');
    document.getElementById('searchInput').value = '';
    currentPage = 1; updateTable();
};

// ======================================================
// ===== 10. INTERACCIÓN Y MODALES =====
// ======================================================
window.toggleOrderSelection = (id) => { if (selectedOrders.has(id)) selectedOrders.delete(id); else selectedOrders.add(id); updateTable(); };
window.toggleSelectAll = () => { const c = document.getElementById('selectAll').checked; paginatedOrders.forEach(o => c ? selectedOrders.add(o.orderId) : selectedOrders.delete(o.orderId)); updateTable(); };
window.clearSelection = () => { selectedOrders.clear(); updateTable(); };

// Modal de Asignación
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
    
    // Render Historial
    const h = firebaseHistoryMap.get(id) || [];
    document.getElementById('modalHistory').innerHTML = h.length ? h.reverse().map(x => `
        <div class="border-b border-slate-100 pb-2 last:border-0 mb-2">
            <div class="flex justify-between items-center text-[10px] text-slate-400 mb-0.5">
                <span>${new Date(x.timestamp).toLocaleString()}</span>
                <span>${escapeHTML(x.user)}</span>
            </div>
            <div class="text-xs text-slate-600">${escapeHTML(x.change)}</div>
        </div>
    `).join('') : '<p class="text-slate-400 italic text-xs text-center py-4">Sin historial registrado.</p>';

    await loadChildOrders();
    document.getElementById('assignModal').classList.add('active');
    document.body.classList.add('modal-open');
};

window.closeModal = () => { 
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); 
    document.body.classList.remove('modal-open'); 
};

window.saveAssignment = async () => {
    if (!currentEditingOrderId) return;
    setButtonLoading('saveAssignmentButton', true);
    try {
        const o = allOrders.find(x => x.orderId === currentEditingOrderId);
        const des = document.getElementById('modalDesigner').value;
        const stat = document.getElementById('modalStatus').value;
        const rd = document.getElementById('modalReceivedDate').value;
        const not = document.getElementById('modalNotes').value;
        
        const changes = [];
        const data = {};
        
        if(o.designer !== des) { changes.push(`Diseñador: ${o.designer || 'N/A'} -> ${des}`); data.designer = des; }
        if(o.customStatus !== stat) { 
            changes.push(`Estado: ${o.customStatus || 'N/A'} -> ${stat}`); 
            data.customStatus = stat; 
            if(stat === 'Completada') data.completedDate = new Date().toISOString();
        }
        if(o.receivedDate !== rd) { changes.push(`Fecha Rx: ${rd}`); data.receivedDate = rd; }
        if(o.notes !== not) { changes.push('Notas actualizadas'); data.notes = not; }
        
        if(changes.length > 0) {
            await saveAssignmentToDB_Firestore(currentEditingOrderId, data, changes);
            showCustomAlert('Cambios guardados correctamente', 'success');
            closeModal();
        } else { showCustomAlert('No se detectaron cambios', 'info'); }
    } catch (e) { showCustomAlert(e.message, 'error'); } 
    finally { setButtonLoading('saveAssignmentButton', false); }
};

// Órdenes Hijas
window.loadChildOrders = async () => {
    const list = document.getElementById('childOrdersList');
    if (!currentEditingOrderId) return;
    const children = firebaseChildOrdersMap.get(currentEditingOrderId) || [];
    document.getElementById('childOrderCount').textContent = children.length;
    
    list.innerHTML = children.map(c => `
        <div class="flex justify-between items-center bg-white p-2 rounded border border-slate-200 shadow-sm text-xs">
            <div>
                <strong class="text-blue-600 block">${escapeHTML(c.childCode)}</strong>
                <span class="text-slate-500">${c.cantidad} pzs • ${c.fechaDespacho ? formatDate(new Date(c.fechaDespacho.seconds*1000)) : '-'}</span>
            </div>
            <button class="btn-delete-child text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50" data-child-id="${c.childOrderId}" data-child-code="${c.childCode}"><i class="fa-solid fa-trash"></i></button>
        </div>`
    ).join('') || '<p class="text-slate-400 italic text-xs p-2 text-center">No hay órdenes hijas.</p>';
};

window.openAddChildModal = () => {
    if (!currentEditingOrderId) return;
    const o = allOrders.find(x => x.orderId === currentEditingOrderId);
    document.getElementById('parentOrderInfo').textContent = `${o.cliente} - ${o.estilo}`;
    document.getElementById('childOrderCode').value = o.codigoContrato + '-';
    document.getElementById('childOrderNumber').value = '';
    document.getElementById('childPieces').value = '';
    document.getElementById('addChildModal').classList.add('active');
    document.body.classList.add('modal-open');
};

window.updateChildOrderCode = () => {
    const o = allOrders.find(x => x.orderId === currentEditingOrderId);
    if(o) document.getElementById('childOrderCode').value = `${o.codigoContrato}-${document.getElementById('childOrderNumber').value}`;
};

window.saveChildOrder = async () => {
    try {
        const o = allOrders.find(x => x.orderId === currentEditingOrderId);
        const num = document.getElementById('childOrderNumber').value;
        const pcs = parseInt(document.getElementById('childPieces').value);
        const date = document.getElementById('childDeliveryDate').value;
        
        if (!num || !pcs) return showCustomAlert('Faltan número o piezas', 'error');
        
        const child = {
            childOrderId: `${o.orderId}_child_${Date.now()}`,
            parentOrderId: o.orderId,
            childCode: `${o.codigoContrato}-${num}`,
            cantidad: pcs,
            fechaDespacho: date ? new Date(date) : (o.fechaDespacho || null),
            createdAt: new Date().toISOString()
        };
        
        await saveChildOrderToDB(child);
        document.getElementById('addChildModal').classList.remove('active');
        showCustomAlert('Orden hija creada con éxito', 'success');
    } catch (e) { showCustomAlert(e.message, 'error'); }
};

window.closeAddChildModal = () => { document.getElementById('addChildModal').classList.remove('active'); };

// Asignación Múltiple
window.openMultiAssignModal = () => { 
    if (selectedOrders.size === 0) return showCustomAlert('Selecciona al menos una orden', 'info');
    document.getElementById('multiModalCount').textContent = selectedOrders.size;
    document.getElementById('multiAssignModal').classList.add('active');
};
window.closeMultiModal = () => { document.getElementById('multiAssignModal').classList.remove('active'); };

window.saveMultiAssignment = async () => {
    if (selectedOrders.size === 0) return;
    setButtonLoading('saveMultiAssignmentButton', true);
    try {
        const d = document.getElementById('multiModalDesigner').value;
        const s = document.getElementById('multiModalStatus').value;
        const r = document.getElementById('multiModalReceivedDate').value;
        const n = document.getElementById('multiModalNotes').value;
        
        const batch = db_firestore.batch();
        let count = 0;
        
        selectedOrders.forEach(id => {
            const ref = db_firestore.collection('assignments').doc(id);
            const data = { schemaVersion: DB_SCHEMA_VERSION };
            if (d) data.designer = d;
            if (s) data.customStatus = s;
            if (r) data.receivedDate = r;
            if (n) data.notes = n; // Nota: esto sobrescribe, idealmente concatenar si se lee primero
            
            if (Object.keys(data).length > 1) {
                batch.set(ref, data, { merge: true });
                count++;
            }
        });
        
        if (count > 0) await batch.commit();
        closeMultiModal();
        clearSelection();
        showCustomAlert(`${count} órdenes actualizadas`, 'success');
    } catch (e) { showCustomAlert(e.message, 'error'); } 
    finally { setButtonLoading('saveMultiAssignmentButton', false); }
};

// Gestión de Diseñadores
window.openDesignerManager = () => { populateDesignerManagerModal(); document.getElementById('designerManagerModal').classList.add('active'); };
window.closeDesignerManager = () => { document.getElementById('designerManagerModal').classList.remove('active'); };

function populateDesignerManagerModal() {
    const l = document.getElementById('designerManagerList');
    l.innerHTML = '';
    if (firebaseDesignersMap.size === 0) { l.innerHTML = '<p class="text-center text-slate-400 text-xs py-4">No hay diseñadores registrados.</p>'; return; }
    
    firebaseDesignersMap.forEach((d, id) => {
        l.innerHTML += `
            <div class="flex justify-between items-center p-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 rounded transition">
                <div>
                    <div class="font-bold text-slate-800 text-xs">${escapeHTML(d.name)}</div>
                    <div class="text-[10px] text-slate-400">${escapeHTML(d.email)}</div>
                </div>
                <button class="btn-delete-designer text-red-500 hover:text-red-700 text-[10px] font-bold px-2 py-1 rounded bg-red-50 hover:bg-red-100 transition" data-name="${escapeHTML(d.name)}" data-id="${id}">Eliminar</button>
            </div>`;
    });
}

// Comparación
window.openCompareModal = (name) => {
    currentCompareDesigner1 = name;
    document.getElementById('compareDesigner1Name').textContent = name;
    // Rellenar select excluyendo al actual
    const sel = document.getElementById('compareDesignerSelect');
    const others = designerList.filter(d => d !== name);
    sel.innerHTML = '<option value="">Selecciona contra quién...</option>' + others.map(d => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
    
    document.getElementById('selectCompareModal').classList.add('active');
};
window.closeCompareModals = () => { 
    document.getElementById('selectCompareModal').classList.remove('active'); 
    document.getElementById('compareModal').classList.remove('active'); 
};
window.startComparison = () => {
    const n2 = document.getElementById('compareDesignerSelect').value;
    if (!n2) return;
    
    const art = allOrders.filter(o => o.departamento === 'P_Art');
    const s1 = calculateStats(art.filter(o => o.designer === currentCompareDesigner1));
    const s2 = calculateStats(art.filter(o => o.designer === n2));
    
    // Tabla Comparativa
    document.getElementById('compareTableContainer').innerHTML = `
        <table class="min-w-full text-xs mt-4 border rounded hidden lg:table">
            <thead class="bg-slate-50 font-bold text-slate-600">
                <tr><th class="p-2 text-left">Métrica</th><th class="p-2 text-center">${currentCompareDesigner1}</th><th class="p-2 text-center">${n2}</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
                <tr><td class="p-2">Total Órdenes</td><td class="p-2 text-center font-bold">${s1.total}</td><td class="p-2 text-center font-bold">${s2.total}</td></tr>
                <tr><td class="p-2">A Tiempo</td><td class="p-2 text-center text-green-600 font-bold">${s1.onTime}</td><td class="p-2 text-center text-green-600 font-bold">${s2.onTime}</td></tr>
                <tr><td class="p-2">Atrasadas</td><td class="p-2 text-center text-red-600 font-bold">${s1.late}</td><td class="p-2 text-center text-red-600 font-bold">${s2.late}</td></tr>
            </tbody>
        </table>`;

    // Gráfico Comparativo
    if (compareChart) compareChart.destroy();
    compareChart = new Chart(document.getElementById('compareChartCanvas').getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Total', 'A Tiempo', 'Atrasadas'],
            datasets: [
                { label: currentCompareDesigner1, data: [s1.total, s1.onTime, s1.late], backgroundColor: '#3b82f6' },
                { label: n2, data: [s2.total, s2.onTime, s2.late], backgroundColor: '#f59e0b' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });

    document.getElementById('selectCompareModal').classList.remove('active');
    document.getElementById('compareModal').classList.add('active');
};

// ======================================================
// ===== 11. PLAN SEMANAL =====
// ======================================================
function getWeekIdentifierString(d) {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    var week1 = new Date(date.getFullYear(), 0, 4);
    return `${date.getFullYear()}-W${String(1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)).padStart(2, '0')}`;
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
            container.innerHTML = `<div class="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50"><i class="fa-regular fa-calendar-xmark text-3xl text-slate-300 mb-2"></i><p class="text-slate-400 font-medium">El plan para la semana ${weekIdentifier} está vacío.</p></div>`;
            document.getElementById('view-workPlanSummary').textContent = "0 órdenes";
            return;
        }

        let totalPzs = 0;
        let doneCount = 0;

        // Ordenar visualmente: Completadas al final
        planData.sort((a, b) => {
            const oa = allOrders.find(x => x.orderId === a.orderId);
            const ob = allOrders.find(x => x.orderId === b.orderId);
            const da = oa && oa.customStatus === 'Completada';
            const db = ob && ob.customStatus === 'Completada';
            
            if (da && !db) return 1;
            if (!da && db) return -1;
            // Si igual estado, priorizar atrasadas
            return (a.isLate === b.isLate) ? 0 : a.isLate ? -1 : 1;
        });

        let html = `<div class="bg-white rounded-lg shadow border border-slate-200 overflow-hidden"><table class="min-w-full divide-y divide-slate-200 text-xs">
            <thead class="bg-slate-50 font-bold text-slate-500 uppercase tracking-wider"><tr><th class="px-4 py-3 text-left">Estado</th><th class="px-4 py-3 text-left">Orden</th><th class="px-4 py-3 text-left">Diseñador</th><th class="px-4 py-3 text-left">Entrega</th><th class="px-4 py-3 text-right">Piezas</th><th class="px-4 py-3"></th></tr></thead>
            <tbody class="divide-y divide-slate-100">`;

        planData.forEach(item => {
            // Buscar estado "en vivo"
            const liveOrder = allOrders.find(o => o.orderId === item.orderId);
            const isCompleted = liveOrder && liveOrder.customStatus === 'Completada';
            const pzs = (item.cantidad || 0) + (item.childPieces || 0);
            totalPzs += pzs;
            if (isCompleted) doneCount++;

            let badge = '';
            let rowClasses = 'transition ';

            if (isCompleted) {
                badge = `<span class="bg-slate-600 text-white px-2 py-1 rounded font-bold flex items-center gap-1 w-fit shadow-sm"><i class="fa-solid fa-check"></i> LISTO</span>`;
                rowClasses += 'bg-slate-50 opacity-60 grayscale';
            } else if (item.isLate) {
                badge = `<span class="bg-red-100 text-red-700 px-2 py-1 rounded font-bold border border-red-200">ATRASADA</span>`;
                rowClasses += 'hover:bg-red-50';
            } else if (item.isAboutToExpire) {
                badge = `<span class="bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-bold border border-yellow-200">URGENTE</span>`;
                rowClasses += 'hover:bg-yellow-50';
            } else {
                badge = `<span class="bg-blue-50 text-blue-700 px-2 py-1 rounded font-bold border border-blue-100">En Proceso</span>`;
                rowClasses += 'hover:bg-slate-50';
            }

            html += `<tr class="${rowClasses}">
                <td class="px-4 py-3">${badge}</td>
                <td class="px-4 py-3">
                    <div class="font-bold text-slate-800 text-sm">${escapeHTML(item.cliente)}</div>
                    <div class="text-slate-500 text-[11px]">${escapeHTML(item.codigoContrato)} - ${escapeHTML(item.estilo)}</div>
                </td>
                <td class="px-4 py-3 font-medium text-slate-700">${escapeHTML(item.designer || 'Sin asignar')}</td>
                <td class="px-4 py-3 text-slate-600">${item.fechaDespacho ? new Date(item.fechaDespacho).toLocaleDateString() : '-'}</td>
                <td class="px-4 py-3 text-right font-bold text-slate-800">${pzs.toLocaleString()}</td>
                <td class="px-4 py-3 text-right">
                    <button class="btn-remove-from-plan text-red-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition" data-plan-entry-id="${item.planEntryId}" data-order-code="${item.codigoContrato}" title="Quitar del plan"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
        
        // Barra de Progreso
        const progress = planData.length > 0 ? Math.round((doneCount / planData.length) * 100) : 0;
        html = `<div class="mb-6 bg-white border border-blue-100 p-4 rounded-xl shadow-sm flex items-center justify-between gap-6">
            <div class="flex-1">
                <div class="flex justify-between mb-2">
                    <span class="font-bold text-slate-700 text-xs uppercase tracking-wide">Progreso Semanal</span>
                    <span class="font-bold text-blue-600 text-xs">${progress}%</span>
                </div>
                <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div class="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-700 ease-out" style="width: ${progress}%"></div>
                </div>
            </div>
            <div class="text-right">
                <div class="text-2xl font-bold text-slate-800 leading-none">${doneCount}/${planData.length}</div>
                <div class="text-[10px] text-slate-400 font-bold uppercase mt-1">Órdenes Completadas</div>
            </div>
        </div>` + html;

        container.innerHTML = html;
        document.getElementById('view-workPlanSummary').textContent = `${planData.length} órdenes | ${totalPzs.toLocaleString()} pzs`;
    }, 50);
}

window.addSelectedToWorkPlan = async () => {
    if (selectedOrders.size === 0) return showCustomAlert('Selecciona órdenes primero', 'info');
    const wid = getWeekIdentifierString(new Date());
    let c = 0;
    for (let id of selectedOrders) {
        const o = allOrders.find(x => x.orderId === id);
        if (o && o.departamento === 'P_Art' && o.designer) {
            if (await addOrderToWorkPlanDB(o, wid)) c++;
        }
    }
    showCustomAlert(`${c} órdenes agregadas al plan ${wid}`, 'success');
    clearSelection();
};

window.loadUrgentOrdersToPlan = async () => {
    const wid = document.getElementById('view-workPlanWeekSelector').value;
    if (!wid) return showCustomAlert('Selecciona una semana primero', 'error');
    
    const urgents = allOrders.filter(o => o.departamento === 'P_Art' && (o.isLate || o.isAboutToExpire));
    if (urgents.length === 0) return showCustomAlert('No hay órdenes urgentes pendientes', 'info');
    
    const batch = db_firestore.batch();
    let count = 0;
    urgents.slice(0, 400).forEach(o => {
        const id = `${o.orderId}_${wid}`;
        const ref = db_firestore.collection('weeklyPlan').doc(id);
        batch.set(ref, {
            planEntryId: id, orderId: o.orderId, weekIdentifier: wid, designer: o.designer,
            cliente: o.cliente, codigoContrato: o.codigoContrato, estilo: o.estilo,
            fechaDespacho: o.fechaDespacho ? o.fechaDespacho.toISOString() : null,
            cantidad: o.cantidad, childPieces: o.childPieces, isLate: o.isLate, isAboutToExpire: o.isAboutToExpire,
            addedAt: new Date().toISOString(), schemaVersion: DB_SCHEMA_VERSION
        }, { merge: true });
        count++;
    });
    
    await batch.commit();
    showCustomAlert(`${count} órdenes urgentes cargadas al plan`, 'success');
    generateWorkPlan(); // Refrescar vista
};

window.removeOrderFromPlan = async (id, code) => {
    if (!confirm(`¿Quitar orden ${code} del plan?`)) return;
    await removeOrderFromWorkPlanDB(id);
    showCustomAlert('Orden quitada del plan', 'success');
};

// ======================================================
// ===== 12. METRICAS Y EXPORTACIÓN =====
// ======================================================

function destroyAllCharts() {
    if (designerDoughnutChart) { designerDoughnutChart.destroy(); designerDoughnutChart = null; }
    if (designerBarChart) { designerBarChart.destroy(); designerBarChart = null; }
    if (deptLoadPieChart) { deptLoadPieChart.destroy(); deptLoadPieChart = null; }
    if (deptLoadBarChart) { deptLoadBarChart.destroy(); deptLoadBarChart = null; }
    if (compareChart) { compareChart.destroy(); compareChart = null; }
}

function populateMetricsSidebar() {
    const list = document.getElementById('metricsSidebarList');
    list.innerHTML = '';
    
    const counts = {};
    allOrders.filter(o => o.departamento === 'P_Art').forEach(o => {
        const d = o.designer || 'Sin asignar';
        counts[d] = (counts[d] || 0) + 1;
    });
    
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn w-full text-left px-4 py-3 text-xs font-medium text-slate-600 hover:bg-blue-50 rounded-lg flex justify-between items-center transition group border border-transparent hover:border-blue-100 mb-1';
        btn.dataset.designer = name;
        btn.innerHTML = `<span class="truncate">${escapeHTML(name)}</span><span class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold group-hover:bg-blue-100 group-hover:text-blue-600 text-[10px]">${count}</span>`;
        list.appendChild(btn);
    });
}

window.generateDesignerMetrics = (name) => {
    const content = document.getElementById('metricsDetail');
    const safeName = escapeHTML(name);
    
    // Skeleton
    content.innerHTML = `
        <div class="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
            <div>
                <h2 class="text-2xl font-bold text-slate-800">${safeName}</h2>
                <p class="text-xs text-slate-500 mt-1">Reporte individual de desempeño y carga actual</p>
            </div>
            <div class="flex gap-2">
                 <button class="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 flex items-center gap-2 transition" onclick="exportDesignerMetricsPDF('${safeName.replace(/'/g, "\\'")}')"><i class="fa-solid fa-file-pdf text-red-500"></i> PDF</button>
                 <button class="px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 flex items-center gap-2 transition" onclick="openCompareModal('${safeName.replace(/'/g, "\\'")}')"><i class="fa-solid fa-scale-balanced"></i> Comparar</button>
            </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm h-64 relative">
                <canvas id="designerDoughnutChartCanvas"></canvas>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm h-64 relative">
                <canvas id="designerBarChartCanvas"></canvas>
            </div>
        </div>
        <div id="designerOrdersTableContainer"></div>`;

    const orders = allOrders.filter(x => x.departamento === 'P_Art' && (name === 'Sin asignar' ? !x.designer : x.designer === name));
    
    // Datos Gráficos
    const statusMap = { 'Bandeja':0, 'Producción':0, 'Auditoría':0, 'Completada':0, 'Sin estado':0 };
    orders.forEach(x => { const s = x.customStatus || 'Sin estado'; if(statusMap[s]!==undefined) statusMap[s]++; else statusMap['Sin estado']++; });
    
    // Chart 1: Dona Estado
    if (designerDoughnutChart) designerDoughnutChart.destroy();
    const ctx1 = document.getElementById('designerDoughnutChartCanvas').getContext('2d');
    designerDoughnutChart = new Chart(ctx1, {
        type: 'doughnut',
        data: { 
            labels: Object.keys(statusMap), 
            datasets: [{ 
                data: Object.values(statusMap), 
                backgroundColor: ['#fbbf24', '#a78bfa', '#60a5fa', '#10b981', '#9ca3af'],
                borderWidth: 0
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { position: 'right', labels: { font: { size: 11, family: "'Inter', sans-serif" }, boxWidth: 12 } },
                title: { display: true, text: 'Distribución por Estado', align: 'start', font: { size: 12, weight: 'bold' } }
            },
            cutout: '65%'
        }
    });

    // Chart 2: Barras (Fake example: top clientes del diseñador)
    const clients = {};
    orders.forEach(o => clients[o.cliente] = (clients[o.cliente] || 0) + 1);
    const topC = Object.entries(clients).sort((a,b)=>b[1]-a[1]).slice(0,5);
    
    if (designerBarChart) designerBarChart.destroy();
    const ctx2 = document.getElementById('designerBarChartCanvas').getContext('2d');
    designerBarChart = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: topC.map(x=>x[0]),
            datasets: [{ label: 'Órdenes', data: topC.map(x=>x[1]), backgroundColor: '#3b82f6', borderRadius: 4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, title: { display: true, text: 'Top Clientes', align: 'start', font: { size: 12, weight: 'bold' } } },
            scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false }, ticks: { font: { size: 10 } } } }
        }
    });
    
    // Tabla Detalle
    const tableDiv = document.getElementById('designerOrdersTableContainer');
    tableDiv.innerHTML = `
        <h3 class="font-bold text-sm text-slate-700 mb-3">Detalle de Órdenes Activas</h3>
        <div class="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
            <table class="min-w-full divide-y divide-slate-200 text-xs">
                <thead class="bg-slate-50 text-slate-500 font-bold uppercase">
                    <tr><th class="px-4 py-3 text-left">Cliente</th><th class="px-4 py-3 text-left">Estilo</th><th class="px-4 py-3 text-left">Estado</th><th class="px-4 py-3 text-right">Piezas</th></tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                    ${orders.length ? orders.map(x => `
                        <tr class="hover:bg-slate-50 transition">
                            <td class="px-4 py-2.5 font-medium text-slate-800">${escapeHTML(x.cliente)}</td>
                            <td class="px-4 py-2.5 text-slate-500">${escapeHTML(x.estilo)}</td>
                            <td class="px-4 py-2.5">${getCustomStatusBadge(x.customStatus)}</td>
                            <td class="px-4 py-2.5 text-right font-bold text-blue-600">${x.cantidad.toLocaleString()}</td>
                        </tr>`).join('') : '<tr><td colspan="4" class="p-4 text-center text-slate-400">Sin datos</td></tr>'}
                </tbody>
            </table>
        </div>`;
};

window.generateDepartmentMetrics = () => {
    const content = document.getElementById('departmentMetricsContent');
    const active = allOrders.filter(o => o.departamento === 'P_Art');
    const totalPzs = active.reduce((s, o) => s + o.cantidad + o.childPieces, 0);
    const activeDesigners = [...new Set(active.map(o => o.designer).filter(Boolean))].length;
    
    content.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                <p class="text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">Total Órdenes Activas</p>
                <p class="text-3xl font-bold text-slate-900">${active.length}</p>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                <p class="text-[10px] font-bold uppercase tracking-wider text-purple-500 mb-1">Carga Total (Piezas)</p>
                <p class="text-3xl font-bold text-slate-900">${totalPzs.toLocaleString()}</p>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                <p class="text-[10px] font-bold uppercase tracking-wider text-green-500 mb-1">Diseñadores con Trabajo</p>
                <p class="text-3xl font-bold text-slate-900">${activeDesigners}</p>
            </div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 h-80 relative">
                <h4 class="font-bold text-sm text-slate-700 mb-4">Distribución Global por Estado</h4>
                <div class="h-60"><canvas id="deptLoadPieChartCanvas"></canvas></div>
            </div>
            <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 h-80 relative">
                <h4 class="font-bold text-sm text-slate-700 mb-4">Carga por Diseñador (Top 10)</h4>
                <div class="h-60"><canvas id="deptLoadBarChartCanvas"></canvas></div>
            </div>
        </div>`;

    const statusMap = { 'Bandeja':0, 'Producción':0, 'Auditoría':0, 'Completada':0, 'Sin estado':0 };
    active.forEach(x => { const s = x.customStatus || 'Sin estado'; if(statusMap[s]!==undefined) statusMap[s]++; else statusMap['Sin estado']++; });
    
    if (deptLoadPieChart) deptLoadPieChart.destroy();
    deptLoadPieChart = new Chart(document.getElementById('deptLoadPieChartCanvas').getContext('2d'), {
        type: 'pie',
        data: { labels: Object.keys(statusMap), datasets: [{ data: Object.values(statusMap), backgroundColor: ['#fbbf24', '#a78bfa', '#60a5fa', '#10b981', '#9ca3af'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } }
    });

    const loadMap = {};
    active.forEach(o => { if(o.designer && o.designer !== EXCLUDE_DESIGNER_NAME) loadMap[o.designer] = (loadMap[o.designer] || 0) + o.cantidad; });
    const sortedLoad = Object.entries(loadMap).sort((a, b) => b[1] - a[1]).slice(0, 10); // Top 10
    
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

// Exportación y Utils Finales
window.openWeeklyReportModal = () => { document.getElementById('weeklyReportModal').classList.add('active'); document.body.classList.add('modal-open'); };
window.closeWeeklyReportModal = () => { document.getElementById('weeklyReportModal').classList.remove('active'); document.body.classList.remove('modal-open'); };

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
    
    document.getElementById('weeklyReportContent').innerHTML = filtered.length ? `
        <h3 class="font-bold mb-2">Resultados: ${filtered.length} órdenes</h3>
        <table id="weeklyReportTable" class="w-full text-xs border-collapse">
            <thead><tr class="bg-gray-100 text-left"><th class="p-2 border">Fecha</th><th class="p-2 border">Cliente</th><th class="p-2 border">Estilo</th><th class="p-2 border">Pzs</th></tr></thead>
            <tbody>${filtered.map(o => `<tr><td class="p-2 border">${o.receivedDate}</td><td class="p-2 border">${o.cliente}</td><td class="p-2 border">${o.estilo}</td><td class="p-2 border text-right">${o.cantidad}</td></tr>`).join('')}</tbody>
        </table>` : '<p class="text-center text-gray-400 py-8">No hay órdenes recibidas en este periodo.</p>';
};

window.exportWeeklyReportAsPDF = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Reporte Semanal de Entradas", 14, 15);
    doc.autoTable({ html: '#weeklyReportTable', startY: 20, theme: 'grid', styles: { fontSize: 8 } });
    doc.save("reporte_semanal.pdf");
};

window.exportDesignerMetricsPDF = (name) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text(`Reporte: ${name}`, 14, 15);
    doc.setFontSize(10); doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 22);
    
    const o = allOrders.filter(x => x.departamento === 'P_Art' && (name === 'Sin asignar' ? !x.designer : x.designer === name));
    const body = o.map(x => [x.cliente, x.codigoContrato, x.estilo, x.customStatus, x.cantidad]);
    
    doc.autoTable({ 
        head: [['Cliente', 'Contrato', 'Estilo', 'Estado', 'Piezas']], 
        body: body, 
        startY: 30,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [59, 130, 246] } 
    });
    doc.save(`Metricas_${name.replace(/\s/g,'_')}.pdf`);
};

window.exportTableToExcel = () => {
    if (allOrders.length === 0) return showCustomAlert('No hay datos cargados', 'error');
    const data = getFilteredOrders().map(o => ({
        "Cliente": o.cliente, "Código": o.codigoContrato, "Estilo": o.estilo, 
        "Departamento": o.departamento, "Fecha Despacho": o.fechaDespacho ? o.fechaDespacho.toLocaleDateString() : '',
        "Diseñador": o.designer, "Estado Interno": o.customStatus, "Piezas": o.cantidad, "Notas": o.notes
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte Panel Arte");
    XLSX.writeFile(wb, `Reporte_Panel_${new Date().toISOString().slice(0,10)}.xlsx`);
};

window.resetApp = () => {
    showConfirmModal("¿Subir nuevo archivo? Se perderán los datos en pantalla.", () => {
        // Ocultar Interfaz Principal
        document.getElementById('appMainContainer').style.display = 'none';
        document.getElementById('mainNavigation').style.display = 'none';
        document.getElementById('uploadSection').style.display = 'block';
        
        // Limpiar Variables
        allOrders = []; isExcelLoaded = false;
        document.getElementById('fileInput').value = '';
        document.getElementById('fileName').textContent = '';
        
        // Desconectar Listeners para evitar fugas de memoria
        desconectarDatosDeFirebase();
    });
};

window.openLegendModal = () => { document.getElementById('legendModal').classList.add('active'); document.body.classList.add('modal-open'); };
window.showConfirmModal = (msg, cb) => {
    document.getElementById('confirmModalMessage').textContent = msg;
    document.getElementById('confirmModal').classList.add('active');
    document.body.classList.add('modal-open');
    const btn = document.getElementById('confirmModalConfirm');
    const newBtn = btn.cloneNode(true); // Eliminar listeners viejos
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => { cb(); window.closeConfirmModal(); });
};
window.closeConfirmModal = () => { 
    document.getElementById('confirmModal').classList.remove('active'); 
    document.body.classList.remove('modal-open'); 
};
