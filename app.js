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

if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
} else {
    console.error("Error: El SDK de Firebase no se ha cargado correctamente.");
}

// ======================================================
// ===== VARIABLES GLOBALES =====
// ======================================================

// --- Estado de la App ---
let allOrders = []; 
let selectedOrders = new Set();
let currentFilter = 'all';
let currentSearch = '';
// Filtros
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

// --- Paginación ---
let currentPage = 1;
let rowsPerPage = 50;
let paginatedOrders = [];

// --- Firebase ---
let usuarioActual = null; 
const db_firestore = firebase.firestore(); 
// Listeners
let unsubscribeAssignments = null;
let unsubscribeHistory = null;
let unsubscribeChildOrders = null;
let unsubscribeDesigners = null;
let unsubscribeWeeklyPlan = null;

// --- Mapas de Datos (Caché) ---
let firebaseAssignmentsMap = new Map();
let firebaseHistoryMap = new Map();
let firebaseChildOrdersMap = new Map();
let firebaseDesignersMap = new Map(); 
let firebaseWeeklyPlanMap = new Map();

// --- Listas y Config ---
let designerList = []; 
let needsRecalculation = true; 
const EXCLUDE_DESIGNER_NAME = 'Magdali Fernandez'; 
const DB_SCHEMA_VERSION = 1; 
let autoCompleteBatchWrites = []; 
let autoCompletedOrderIds = new Set(); 

// --- Gráficos ---
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

    // 1. Ocultar todas las vistas principales
    document.querySelectorAll('.main-view').forEach(el => el.style.display = 'none');
    
    // 2. Mostrar la vista seleccionada
    const target = document.getElementById(viewId);
    if (target) {
        target.style.display = 'block';
        // Scroll al top al cambiar de vista
        window.scrollTo(0, 0);
    }

    // 3. Actualizar estado visual del Sidebar
    document.querySelectorAll('.nav-item').forEach(btn => {
        // Resetear estilos base
        btn.classList.remove('bg-slate-800', 'text-white', 'shadow-md', 'border-l-4', 'border-blue-500');
        btn.classList.add('text-slate-400');
        
        // Resetear iconos
        const icon = btn.querySelector('i');
        if(icon) icon.classList.remove('text-blue-400', 'text-orange-400', 'text-purple-400', 'text-green-400');
    });

    const activeBtn = document.getElementById('nav-' + viewId);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-400');
        activeBtn.classList.add('bg-slate-800', 'text-white', 'shadow-md');
        
        // Colorear icono según la sección para feedback visual
        const icon = activeBtn.querySelector('i');
        if (viewId === 'dashboard' && icon) icon.classList.add('text-blue-400');
        if (viewId === 'workPlanView' && icon) icon.classList.add('text-orange-400');
        if (viewId === 'designerMetricsView' && icon) icon.classList.add('text-purple-400');
        if (viewId === 'departmentMetricsView' && icon) icon.classList.add('text-green-400');
    }

    // 4. Ejecutar lógica específica de la vista
    if (viewId === 'dashboard') {
        updateDashboard();
    } else if (viewId === 'workPlanView') {
        generateWorkPlan();
    } else if (viewId === 'designerMetricsView') {
        populateMetricsSidebar();
        // Seleccionar el primer diseñador si no hay nadie seleccionado
        if(document.getElementById('metricsDetail').innerHTML.includes('Selecciona')) {
            const firstBtn = document.querySelector('#metricsSidebarList .filter-btn');
            if(firstBtn) firstBtn.click();
        }
    } else if (viewId === 'departmentMetricsView') {
        generateDepartmentMetrics();
    }

    // 5. Limpieza de recursos (Gráficos)
    if (viewId !== 'designerMetricsView' && viewId !== 'departmentMetricsView') {
        destroyAllCharts();
    }
}

// ======================================================
// ===== UTILIDADES Y EVENT LISTENERS =====
// ======================================================

function safeAddEventListener(id, event, handler) {
    const element = document.getElementById(id);
    if (element) element.addEventListener(event, handler);
}

let debounceTimer;
function debounce(func, delay) {
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(context, args), delay);
    }
}

function preventDefaults(e){ e.preventDefault(); e.stopPropagation(); }

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showCustomAlert(message, type = 'info') {
    const alertDiv = document.getElementById('customAlert');
    if(!alertDiv) return;
    
    let borderClass = type === 'error' ? 'border-l-4 border-red-500' : type === 'success' ? 'border-l-4 border-green-500' : 'border-l-4 border-blue-500';
    let iconColor = type === 'error' ? 'text-red-500' : type === 'success' ? 'text-green-500' : 'text-blue-500';
    let icon = type === 'error' ? 'fa-circle-xmark' : type === 'success' ? 'fa-circle-check' : 'fa-circle-info';
    
    alertDiv.className = `fixed top-5 right-5 z-[3000] max-w-sm w-full bg-white shadow-2xl rounded-xl pointer-events-auto transform transition-all duration-300 ring-1 ring-black/5 overflow-hidden ${borderClass}`;
    
    alertDiv.innerHTML = `
        <div class="p-4">
            <div class="flex items-start">
                <div class="flex-shrink-0">
                    <i class="fa-solid ${icon} ${iconColor} text-xl"></i>
                </div>
                <div class="ml-3 w-0 flex-1 pt-0.5">
                    <p class="text-sm font-medium text-slate-900">${type === 'error' ? 'Error' : type === 'success' ? 'Éxito' : 'Información'}</p>
                    <p class="mt-1 text-xs text-slate-500">${escapeHTML(message)}</p>
                </div>
                <div class="ml-4 flex flex-shrink-0">
                    <button type="button" onclick="document.getElementById('customAlert').style.display='none'" class="inline-flex rounded-md bg-white text-slate-400 hover:text-slate-500 focus:outline-none">
                        <span class="sr-only">Cerrar</span>
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
        </div>`;
        
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
    } else {
        btn.disabled = false; btn.innerHTML = btn.dataset.originalText || originalText;
    }
}

function showLoading(message = 'Cargando...') {
    if (document.getElementById('loadingOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'loadingOverlay'; overlay.className = 'loading-overlay'; 
    overlay.innerHTML = `<div class="spinner"></div><p class="text-xs font-medium text-slate-600 mt-2">${escapeHTML(message)}</p>`;
    document.body.appendChild(overlay);
}
function hideLoading() { const overlay = document.getElementById('loadingOverlay'); if (overlay) overlay.remove(); }

function checkAndCloseModalStack() {
    const activeModals = document.querySelectorAll('.modal.active');
    if (activeModals.length === 0) document.body.classList.remove('modal-open');
}

// --- Inicialización ---
document.addEventListener('DOMContentLoaded', (event) => {
    console.log('DOM cargado. Inicializando App v6.0...');
    
    safeAddEventListener('loginButton', 'click', iniciarLoginConGoogle);
    safeAddEventListener('logoutButton', 'click', iniciarLogout);
    safeAddEventListener('logoutNavBtn', 'click', iniciarLogout); // Nuevo botón sidebar

    firebase.auth().onAuthStateChanged((user) => {
        const loginSection = document.getElementById('loginSection');
        const uploadSection = document.getElementById('uploadSection');
        const appMainContainer = document.getElementById('appMainContainer');
        const nav = document.getElementById('mainNavigation');

        if (user) {
            usuarioActual = user;
            document.getElementById('userName').textContent = usuarioActual.displayName || 'Usuario';
            document.getElementById('navUserName').textContent = usuarioActual.displayName || 'Usuario';
            
            loginSection.style.display = 'none';
            
            if (!isExcelLoaded) {
                // Estado: Logueado pero sin Excel
                uploadSection.style.display = 'block';
                appMainContainer.style.display = 'none'; // Ocultar vistas
                nav.style.display = 'none'; // Ocultar sidebar
                nav.style.transform = 'translateX(-100%)';
                appMainContainer.style.marginLeft = '0';
            } else {
                // Estado: Logueado y Excel cargado (Recarga o similar)
                uploadSection.style.display = 'none';
                appMainContainer.style.display = 'block';
                nav.style.display = 'flex';
                nav.style.transform = 'translateX(0)';
                appMainContainer.style.marginLeft = '16rem'; // w-64
            }
            conectarDatosDeFirebase();

        } else {
            desconectarDatosDeFirebase();
            usuarioActual = null;
            isExcelLoaded = false;

            // Estado: Desconectado
            loginSection.style.display = 'flex';
            uploadSection.style.display = 'none';
            appMainContainer.style.display = 'none';
            nav.style.display = 'none';
            appMainContainer.style.marginLeft = '0';
        }
    });

    // Filtros y Búsqueda
    safeAddEventListener('searchInput', 'input', debounce((e) => { 
        currentSearch = e.target.value; currentPage = 1; updateTable(); 
    }, 300)); 
    
    const filters = ['clientFilter', 'styleFilter', 'teamFilter', 'departamentoFilter', 'designerFilter', 'customStatusFilter', 'dateFrom', 'dateTo'];
    filters.forEach(id => {
        safeAddEventListener(id, 'change', debounce((e) => {
            if(id === 'clientFilter') currentClientFilter = e.target.value;
            if(id === 'styleFilter') currentStyleFilter = e.target.value;
            if(id === 'teamFilter') currentTeamFilter = e.target.value;
            if(id === 'departamentoFilter') currentDepartamentoFilter = e.target.value;
            if(id === 'designerFilter') currentDesignerFilter = e.target.value;
            if(id === 'customStatusFilter') currentCustomStatusFilter = e.target.value;
            if(id === 'dateFrom') currentDateFrom = e.target.value;
            if(id === 'dateTo') currentDateTo = e.target.value;
            currentPage = 1; updateTable();
        }, 150));
    });

    // Drag & Drop
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    if (dropZone && fileInput) {
        ['dragenter','dragover','dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, preventDefaults, false));
        dropZone.addEventListener('dragenter', () => dropZone.classList.add('border-blue-500', 'bg-blue-50'), false);
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-blue-500', 'bg-blue-50'), false);
        dropZone.addEventListener('drop', (e) => {
            dropZone.classList.remove('border-blue-500', 'bg-blue-50');
            handleDrop(e);
        }, false);
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileSelect);
    }

    // Delegación de eventos para listas dinámicas
    const safeClickDelegate = (id, selector, callback) => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('click', (e) => {
            const target = e.target.closest(selector);
            if(target) callback(target, e);
        });
    };

    safeClickDelegate('designerManagerList', '.btn-delete-designer', (btn) => deleteDesigner(btn.dataset.id, btn.dataset.name));
    safeClickDelegate('metricsSidebarList', '.filter-btn', (btn) => {
        // UX selección visual
        document.querySelectorAll('#metricsSidebarList .filter-btn').forEach(b => b.classList.remove('active', 'bg-blue-50', 'border-blue-200'));
        btn.classList.add('active', 'bg-blue-50', 'border-blue-200');
        generateDesignerMetrics(btn.dataset.designer);
    });
    safeClickDelegate('childOrdersList', '.btn-delete-child', (btn, e) => { e.stopPropagation(); deleteChildOrder(btn.dataset.childId, btn.dataset.childCode); });
    safeClickDelegate('view-workPlanContent', '.btn-remove-from-plan', (btn, e) => { e.stopPropagation(); removeOrderFromPlan(btn.dataset.planEntryId, btn.dataset.orderCode); });

    // Atajos de teclado
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeConfirmModal();
            document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
            document.body.classList.remove('modal-open');
        }
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault(); 
            if (document.getElementById('assignModal').classList.contains('active')) saveAssignment();
            else if (document.getElementById('multiAssignModal').classList.contains('active')) saveMultiAssignment();
        }
    });
});

// ======================================================
// ===== FUNCIONES DE FIREBASE =====
// ======================================================

function iniciarLoginConGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider).catch((error) => showCustomAlert(error.message, 'error'));
}

function iniciarLogout() {
    firebase.auth().signOut().then(() => {
        document.getElementById('mainNavigation').style.transform = 'translateX(-100%)'; // Ocultar sidebar
        document.getElementById('appMainContainer').style.marginLeft = '0';
    });
}

function conectarDatosDeFirebase() {
    if (!usuarioActual) return;
    const dbStatus = document.getElementById('dbStatus'); // En header
    const navDbStatus = document.getElementById('navDbStatus'); // En sidebar

    const setStatus = (connected) => {
        const html = connected 
            ? `<span class="w-1.5 h-1.5 rounded-full bg-green-500"></span> Conectado`
            : `<span class="w-1.5 h-1.5 rounded-full bg-yellow-500"></span> Conectando...`;
        if(dbStatus) dbStatus.innerHTML = html;
        if(navDbStatus) navDbStatus.innerHTML = html;
    };

    setStatus(false);
    
    unsubscribeAssignments = db_firestore.collection('assignments').onSnapshot((snapshot) => {
        firebaseAssignmentsMap.clear();
        snapshot.forEach((doc) => firebaseAssignmentsMap.set(doc.id, doc.data()));
        if(isExcelLoaded) mergeYActualizar(); 
        setStatus(true);
    });

    unsubscribeHistory = db_firestore.collection('history').onSnapshot((snapshot) => {
        firebaseHistoryMap.clear();
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (!firebaseHistoryMap.has(data.orderId)) firebaseHistoryMap.set(data.orderId, []);
            firebaseHistoryMap.get(data.orderId).push(data);
        });
    });

    unsubscribeChildOrders = db_firestore.collection('childOrders').onSnapshot((snapshot) => {
        firebaseChildOrdersMap.clear();
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (!firebaseChildOrdersMap.has(data.parentOrderId)) firebaseChildOrdersMap.set(data.parentOrderId, []);
            firebaseChildOrdersMap.get(data.parentOrderId).push(data);
        });
        needsRecalculation = true;
        if(isExcelLoaded) mergeYActualizar();
    });
    
    unsubscribeDesigners = db_firestore.collection('designers').orderBy('name').onSnapshot((snapshot) => {
        firebaseDesignersMap.clear();
        let newDesignerList = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            firebaseDesignersMap.set(doc.id, data);
            newDesignerList.push(data.name);
        });
        designerList = newDesignerList; 
        updateAllDesignerDropdowns();
        populateDesignerManagerModal();
        if(isExcelLoaded) generateWorkloadReport();
    });

    unsubscribeWeeklyPlan = db_firestore.collection('weeklyPlan').onSnapshot((snapshot) => {
        firebaseWeeklyPlanMap.clear();
        snapshot.forEach((doc) => {
            const data = doc.data();
            const weekId = data.weekIdentifier;
            if (!firebaseWeeklyPlanMap.has(weekId)) firebaseWeeklyPlanMap.set(weekId, []);
            firebaseWeeklyPlanMap.get(weekId).push(data);
        });
        // Si estamos viendo el plan, refrescar
        const workPlanView = document.getElementById('workPlanView');
        if (workPlanView && workPlanView.style.display === 'block') generateWorkPlan();
    });
}

function desconectarDatosDeFirebase() {
    if (unsubscribeAssignments) unsubscribeAssignments();
    if (unsubscribeHistory) unsubscribeHistory();
    if (unsubscribeChildOrders) unsubscribeChildOrders();
    if (unsubscribeDesigners) unsubscribeDesigners();
    if (unsubscribeWeeklyPlan) unsubscribeWeeklyPlan();
    autoCompletedOrderIds.clear();
}

function mergeYActualizar() {
    if (!isExcelLoaded) return;
    recalculateChildPieces(); 
    autoCompleteBatchWrites = []; 

    for (let i = 0; i < allOrders.length; i++) {
        const order = allOrders[i];
        const fbData = firebaseAssignmentsMap.get(order.orderId);
        
        if (fbData) {
            order.designer = fbData.designer || '';
            order.customStatus = fbData.customStatus || '';
            order.receivedDate = fbData.receivedDate || '';
            order.notes = fbData.notes || '';
            order.completedDate = fbData.completedDate || null;
        } else {
            order.designer = ''; order.customStatus = ''; order.receivedDate = ''; order.notes = ''; order.completedDate = null;
        }

        // AUTO-COMPLETADO: Si salió de P_Art y no está completada
        if (fbData && order.departamento !== 'P_Art' && order.departamento !== 'Sin Departamento') {
            if (fbData.customStatus !== 'Completada' && !autoCompletedOrderIds.has(order.orderId)) {
                order.customStatus = 'Completada';
                const newCompletedDate = new Date().toISOString();
                order.completedDate = newCompletedDate;
                
                autoCompleteBatchWrites.push({
                    orderId: order.orderId,
                    data: { 
                        customStatus: 'Completada', 
                        completedDate: newCompletedDate, 
                        lastModified: new Date().toISOString(), 
                        schemaVersion: DB_SCHEMA_VERSION 
                    },
                    history: [`Salio de Arte (ahora en ${order.departamento}) → Completada automáticamente`]
                });
                autoCompletedOrderIds.add(order.orderId);
            }
        }
    }
    
    if (document.getElementById('dashboard').style.display === 'block') updateDashboard();
    if (autoCompleteBatchWrites.length > 0) ejecutarAutoCompleteBatch();
}

async function ejecutarAutoCompleteBatch() {
    if (!usuarioActual || autoCompleteBatchWrites.length === 0) return;
    if (autoCompleteBatchWrites.length > 400) autoCompleteBatchWrites = autoCompleteBatchWrites.slice(0, 400);
    
    const batch = db_firestore.batch();
    const user = usuarioActual.displayName || usuarioActual.email;
    
    autoCompleteBatchWrites.forEach(write => {
        const assignmentRef = db_firestore.collection('assignments').doc(write.orderId);
        batch.set(assignmentRef, write.data, { merge: true });
        // Historial
        const historyRef = db_firestore.collection('history').doc();
        batch.set(historyRef, { orderId: write.orderId, change: write.history[0], user: user, timestamp: new Date().toISOString(), schemaVersion: DB_SCHEMA_VERSION });
    });

    try {
        await batch.commit();
        showCustomAlert(`Se auto-completaron ${autoCompleteBatchWrites.length} órdenes.`, 'success');
        autoCompleteBatchWrites = [];
    } catch (error) { console.error("Error batch:", error); }
}

// --- CRUD Básico ---
async function saveAssignmentToDB_Firestore(orderId, dataToSave, historyChanges = []) {
    if (!usuarioActual) throw new Error("No autenticado");
    const batch = db_firestore.batch();
    const assignRef = db_firestore.collection('assignments').doc(orderId);
    
    dataToSave.lastModified = new Date().toISOString();
    dataToSave.schemaVersion = DB_SCHEMA_VERSION;
    batch.set(assignRef, dataToSave, { merge: true });

    historyChanges.forEach(change => {
        const hRef = db_firestore.collection('history').doc();
        batch.set(hRef, { orderId, change, user: usuarioActual.displayName, timestamp: new Date().toISOString(), schemaVersion: DB_SCHEMA_VERSION });
    });
    return await batch.commit();
}

async function addDesigner() {
    const name = document.getElementById('newDesignerName').value.trim();
    const email = document.getElementById('newDesignerEmail').value.trim().toLowerCase();
    if (!name || !email) return showCustomAlert('Datos incompletos', 'error');
    
    try {
        await db_firestore.collection('designers').add({ name, email, createdAt: new Date().toISOString() });
        document.getElementById('newDesignerName').value = '';
        document.getElementById('newDesignerEmail').value = '';
        showCustomAlert('Diseñador agregado', 'success');
    } catch (e) { showCustomAlert(e.message, 'error'); }
}

async function deleteDesigner(docId, name) {
    showConfirmModal(`¿Eliminar a ${name}?`, async () => {
        try {
            await db_firestore.collection('designers').doc(docId).delete();
            showCustomAlert('Diseñador eliminado', 'success');
        } catch (e) { showCustomAlert(e.message, 'error'); }
    });
}

// ======================================================
// ===== PROCESAMIENTO DE EXCEL =====
// ======================================================

function handleDrop(e){ const dt = e.dataTransfer; handleFiles(dt.files); }
function handleFileSelect(e){ handleFiles(e.target.files); }
function handleFiles(files){
    if (!files || files.length === 0) return;
    document.getElementById('fileName').textContent = files[0].name;
    processFile(files[0]);
}

async function processFile(file) {
    showLoading('Procesando Excel...');
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheetName = workbook.SheetNames.find(n => /working\s*pro[c]{1,2}ess/i.test(n));
        if (!sheetName) throw new Error('No se encontró "Working Process"');
        
        const worksheet = workbook.Sheets[sheetName];
        const arr = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

        let headerIndex = -1;
        for (let i = 0; i < Math.min(arr.length, 12); i++) {
            const row = arr[i].map(c => String(c).toLowerCase());
            if (row.some(c => c.includes('fecha')) && row.some(c => c.includes('cliente'))) { headerIndex = i; break; }
        }
        if (headerIndex === -1) throw new Error('No se encontraron encabezados');
        
        const headers = arr[headerIndex].map(h => String(h).trim().toLowerCase());
        const rows = arr.slice(headerIndex + 1);

        const col = {
            fecha: headers.findIndex(h => h.includes('fecha')),
            cliente: headers.findIndex(h => h.includes('cliente')),
            codigo: headers.findIndex(h => h.includes('codigo') || h.includes('contrato')),
            estilo: headers.findIndex(h => h.includes('estilo')),
            team: headers.findIndex(h => h.includes('team')),
        };

        const departmentPatterns = [
            { pattern: /p[_\s]*art/i, name: 'P_Art' }, 
            { pattern: /p[_\s]*order[_\s]*entry/i, name: 'P_Order_Entry' },
            { pattern: /p[_\s]*printing/i, name: 'P_Printing' },
            { pattern: /p[_\s]*press/i, name: 'P_Press' },
            { pattern: /p[_\s]*cut/i, name: 'P_Cut' },
            { pattern: /p[_\s]*sew/i, name: 'P_Sew' },
            { pattern: /p[_\s]*packing/i, name: 'P_Packing' },
            { pattern: /p[_\s]*shipping/i, name: 'P_Shipping' }
        ];
        
        // Optimización: Pre-mapeo de índices de departamentos
        const deptIndices = [];
        headers.forEach((h, i) => {
            const match = departmentPatterns.find(d => d.pattern.test(h));
            if (match) deptIndices.push({ index: i, name: match.name });
        });

        let processed = [];
        let currentDate = null;
        let currentClient = "", currentContrato = "", currentStyle = "", currentTeam = "";
        autoCompleteBatchWrites = [];

        for (const row of rows) {
            if (!row || row.every(c => !c)) continue;
            
            // Fecha cascada
            if (col.fecha >= 0 && row[col.fecha]) {
                const raw = row[col.fecha];
                if (typeof raw === 'number') currentDate = new Date((raw - 25569) * 86400000);
                else if (!isNaN(Date.parse(raw))) currentDate = new Date(raw);
            }
            
            if (col.cliente >= 0 && row[col.cliente]) currentClient = String(row[col.cliente]).trim();
            if (col.codigo >= 0 && row[col.codigo]) currentContrato = String(row[col.codigo]).trim();
            if (col.estilo >= 0 && row[col.estilo]) currentStyle = String(row[col.estilo]).trim();
            if (col.team >= 0 && row[col.team]) currentTeam = String(row[col.team]).trim();

            if (!currentClient || !currentContrato) continue;

            // Detectar departamento y cantidad
            let qty = 0, dept = "Sin Departamento";
            for (let i = deptIndices.length - 1; i >= 0; i--) {
                const val = row[deptIndices[i].index];
                if (val) {
                    const n = Number(String(val).replace(/,|\s/g, ''));
                    if (n > 0) { qty = n; dept = deptIndices[i].name; break; }
                }
            }
            if (qty <= 0) dept = "Sin Departamento";

            // ID y Fechas
            const fDespacho = currentDate ? new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()) : null;
            const orderId = `${currentClient}_${currentContrato}_${fDespacho ? fDespacho.getTime() : 'nodate'}_${currentStyle}`;
            
            const today = new Date(); today.setHours(0,0,0,0);
            let daysLate = 0;
            if (fDespacho && fDespacho < today) daysLate = Math.ceil((today - fDespacho) / 86400000);
            
            // Estado Firebase
            const fbData = firebaseAssignmentsMap.get(orderId);
            let status = fbData ? fbData.customStatus : '';
            let compDate = fbData ? fbData.completedDate : null;

            // Lógica Auto-Completado
            if (fbData && dept !== 'P_Art' && dept !== 'Sin Departamento') {
                if (status !== 'Completada' && !autoCompletedOrderIds.has(orderId)) {
                    status = 'Completada';
                    compDate = new Date().toISOString();
                    autoCompleteBatchWrites.push({
                        orderId: orderId,
                        data: { customStatus: 'Completada', completedDate: compDate, lastModified: compDate },
                        history: [`Salio de Arte (ahora en ${dept}) → Completada automáticamente`]
                    });
                    autoCompletedOrderIds.add(orderId);
                }
            }

            processed.push({
                orderId, fechaDespacho: fDespacho, cliente: currentClient, codigoContrato: currentContrato,
                estilo: currentStyle, teamName: currentTeam, departamento: dept, cantidad: qty,
                childPieces: 0, isLate: fDespacho && fDespacho < today, daysLate,
                isVeryLate: daysLate > 7, isAboutToExpire: fDespacho && !daysLate && ((fDespacho - today)/86400000) <= 2,
                designer: fbData ? fbData.designer : '', customStatus: status,
                receivedDate: fbData ? fbData.receivedDate : '', notes: fbData ? fbData.notes : '', completedDate: compDate
            });
        }

        allOrders = processed;
        isExcelLoaded = true; 
        needsRecalculation = true; 
        recalculateChildPieces();
        
        if (autoCompleteBatchWrites.length > 0) await ejecutarAutoCompleteBatch();

        // UI SWITCH -> Mostrar App y Sidebar
        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('appMainContainer').style.display = 'block';
        document.getElementById('appMainContainer').style.marginLeft = '16rem';
        
        const nav = document.getElementById('mainNavigation');
        nav.style.display = 'flex';
        nav.style.transform = 'translateX(0)';

        navigateTo('dashboard'); // Ir al inicio

    } catch (error) {
        showCustomAlert('Error: ' + error.message, 'error');
        console.error(error);
    } finally { hideLoading(); }
}

async function recalculateChildPieces() {
    if (!needsRecalculation) return;
    let cache = new Map();
    firebaseChildOrdersMap.forEach((list, parentId) => {
        cache.set(parentId, list.reduce((s, c) => s + (c.cantidad || 0), 0));
    });
    allOrders.forEach(o => o.childPieces = cache.get(o.orderId) || 0);
    needsRecalculation = false;
}

// ======================================================
// ===== UI: DASHBOARD & TABLA =====
// ======================================================

function updateDashboard() {
    if (!isExcelLoaded) return;
    if (needsRecalculation) recalculateChildPieces();
    
    const artOrders = allOrders.filter(o => o.departamento === 'P_Art');
    
    // Stats
    const totalPzs = artOrders.reduce((s, o) => s + o.cantidad + o.childPieces, 0);
    document.getElementById('statTotal').textContent = artOrders.length;
    document.getElementById('statTotalPieces').textContent = totalPzs.toLocaleString();
    document.getElementById('statLate').textContent = artOrders.filter(o => o.isLate).length;
    document.getElementById('statExpiring').textContent = artOrders.filter(o => o.isAboutToExpire).length;
    document.getElementById('statOnTime').textContent = artOrders.filter(o => !o.isLate && !o.isAboutToExpire).length;
    
    // Top Clients
    const clients = {};
    artOrders.forEach(o => clients[o.cliente] = (clients[o.cliente]||0)+1);
    const top = Object.entries(clients).sort((a,b)=>b[1]-a[1]).slice(0,10);
    document.getElementById('clientReport').innerHTML = top.map(([c,n],i) => `
        <div class="flex justify-between py-1.5 border-b border-slate-50 last:border-0 text-xs">
            <span class="text-slate-600 truncate w-32" title="${c}">${i+1}. ${c}</span>
            <span class="font-bold text-blue-600 bg-blue-50 px-2 rounded-full">${n}</span>
        </div>`).join('');

    populateFilterDropdowns();
    updateTable();
}

function updateTable() {
    const filtered = getFilteredOrders();
    const start = (currentPage - 1) * rowsPerPage;
    paginatedOrders = filtered.slice(start, start + rowsPerPage);
    
    // Contadores
    document.getElementById('resultCount').textContent = filtered.length;
    document.getElementById('resultPieces').textContent = filtered.reduce((s,o)=>s+o.cantidad+o.childPieces,0).toLocaleString();

    // Render
    const tbody = document.getElementById('tableBody');
    if (paginatedOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="14" class="text-center py-8 text-slate-400 italic">No se encontraron órdenes.</td></tr>`;
    } else {
        tbody.innerHTML = paginatedOrders.map(order => {
            const rowClass = order.isVeryLate ? 'bg-red-50/50' : order.isLate ? 'bg-orange-50/50' : order.isAboutToExpire ? 'bg-yellow-50/50' : '';
            const statusBadge = getStatusBadge(order);
            const internalBadge = getCustomStatusBadge(order.customStatus);
            
            return `
            <tr class="${rowClass} hover:bg-blue-50 transition-colors cursor-pointer" onclick="openAssignModal('${order.orderId}')">
                <td class="px-3 py-2" onclick="event.stopPropagation()">
                    ${order.departamento === 'P_Art' ? `<input type="checkbox" class="rounded border-slate-300 text-blue-600" data-id="${order.orderId}" onchange="toggleOrderSelection('${order.orderId}')" ${selectedOrders.has(order.orderId)?'checked':''}>` : ''}
                </td>
                <td class="px-3 py-2" data-label="Estado">${statusBadge}</td>
                <td class="px-3 py-2 font-medium text-slate-700" data-label="Fecha">${formatDate(order.fechaDespacho)}</td>
                <td class="px-3 py-2 font-medium text-slate-900 truncate max-w-[150px]" data-label="Cliente" title="${escapeHTML(order.cliente)}">${escapeHTML(order.cliente)}</td>
                <td class="px-3 py-2 text-slate-500" data-label="Código">${escapeHTML(order.codigoContrato)}</td>
                <td class="px-3 py-2 text-slate-500 truncate max-w-[120px]" data-label="Estilo" title="${escapeHTML(order.estilo)}">${escapeHTML(order.estilo)}</td>
                <td class="px-3 py-2 hidden lg:table-cell text-slate-500" data-label="Team">${escapeHTML(order.teamName)}</td>
                <td class="px-3 py-2 hidden md:table-cell" data-label="Depto"><span class="text-[10px] uppercase font-bold text-slate-400 border border-slate-200 px-1 rounded">${escapeHTML(order.departamento)}</span></td>
                <td class="px-3 py-2" data-label="Diseñador">
                    ${order.designer ? `<span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md text-[11px] font-bold border border-indigo-100">${escapeHTML(order.designer)}</span>` : '<span class="text-slate-300 italic text-[11px]">--</span>'}
                </td>
                <td class="px-3 py-2" data-label="Estado Int.">${internalBadge}</td>
                <td class="px-3 py-2 hidden lg:table-cell text-slate-500" data-label="Recibida">${order.receivedDate || '-'}</td>
                <td class="px-3 py-2 font-bold text-slate-700" data-label="Cant.">${order.cantidad.toLocaleString()}</td>
                <td class="px-3 py-2 text-center" data-label="Notas">${order.notes ? '<i class="fa-solid fa-note-sticky text-yellow-400"></i>' : ''}</td>
                <td class="px-3 py-2 text-right"><i class="fa-solid fa-chevron-right text-slate-300 text-[10px]"></i></td>
            </tr>`;
        }).join('');
    }
    
    // Checkboxes globales
    const allChecked = paginatedOrders.length > 0 && paginatedOrders.every(o => selectedOrders.has(o.orderId));
    const selectAll = document.getElementById('selectAll');
    if(selectAll) selectAll.checked = allChecked;
    
    // Barra flotante
    const bar = document.getElementById('multiSelectBar');
    if (selectedOrders.size > 0) {
        bar.style.opacity = '1'; bar.style.transform = 'translateX(-50%) translateY(0)'; bar.style.pointerEvents = 'auto';
        document.getElementById('selectedCount').textContent = selectedOrders.size;
    } else {
        bar.style.opacity = '0'; bar.style.transform = 'translateX(-50%) translateY(20px)'; bar.style.pointerEvents = 'none';
    }
}

// Filtros Helper
function getFilteredOrders() {
    let res = allOrders;
    const s = currentSearch.toLowerCase();
    if(s) res = res.filter(o => (o.cliente||'').toLowerCase().includes(s) || (o.codigoContrato||'').toLowerCase().includes(s) || (o.estilo||'').toLowerCase().includes(s) || (o.designer||'').toLowerCase().includes(s));
    
    if(currentClientFilter) res = res.filter(o => o.cliente === currentClientFilter);
    if(currentDepartamentoFilter) res = res.filter(o => o.departamento === currentDepartamentoFilter);
    else res = res.filter(o => o.departamento === 'P_Art'); // Default P_Art
    
    if(currentDesignerFilter) res = res.filter(o => o.designer === currentDesignerFilter);
    if(currentCustomStatusFilter) res = res.filter(o => o.customStatus === currentCustomStatusFilter);
    if(currentFilter === 'late') res = res.filter(o => o.isLate);
    if(currentFilter === 'veryLate') res = res.filter(o => o.isVeryLate);
    if(currentFilter === 'aboutToExpire') res = res.filter(o => o.isAboutToExpire);
    
    // Sort
    res.sort((a,b) => {
        let va = a[sortConfig.key], vb = b[sortConfig.key];
        if(sortConfig.key === 'date') { va = a.fechaDespacho?.getTime()||0; vb = b.fechaDespacho?.getTime()||0; }
        return (va < vb ? -1 : 1) * (sortConfig.direction === 'asc' ? 1 : -1);
    });
    return res;
}

// --- Helpers Visuales ---
function getStatusBadge(order) {
    if (order.isVeryLate) return `<span class="status-badge bg-red-100 text-red-700 ring-1 ring-red-600/10">MUY ATRASADA</span>`;
    if (order.isLate) return `<span class="status-badge bg-orange-100 text-orange-700 ring-1 ring-orange-600/10">ATRASADA</span>`;
    if (order.isAboutToExpire) return `<span class="status-badge bg-yellow-100 text-yellow-800 ring-1 ring-yellow-600/20">URGENTE</span>`;
    return `<span class="status-badge bg-green-100 text-green-700 ring-1 ring-green-600/20">A TIEMPO</span>`;
}
function getCustomStatusBadge(status) {
    const cls = { 
        'Bandeja': 'bg-yellow-50 text-yellow-700 border-yellow-200', 
        'Producción': 'bg-purple-50 text-purple-700 border-purple-200', 
        'Auditoría': 'bg-blue-50 text-blue-700 border-blue-200', 
        'Completada': 'bg-slate-100 text-slate-600 border-slate-200' 
    };
    return status ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold border ${cls[status]||'bg-gray-50'}">${status}</span>` : '-';
}
function formatDate(d) { return d ? d.toLocaleDateString('es-ES', {day:'2-digit', month:'2-digit'}) : '-'; }

function populateFilterDropdowns() {
    const fill = (id, key) => {
        const sel = document.getElementById(id);
        const opts = [...new Set(allOrders.map(o=>o[key]).filter(Boolean))].sort();
        sel.innerHTML = '<option value="">Todos</option>' + opts.map(v=>`<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('');
    };
    fill('clientFilter', 'cliente');
    fill('styleFilter', 'estilo');
    fill('teamFilter', 'teamName');
    fill('departamentoFilter', 'departamento');
    updateAllDesignerDropdowns();
}
function updateAllDesignerDropdowns() {
    const html = '<option value="">Todos</option>' + designerList.map(d=>`<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
    document.getElementById('designerFilter').innerHTML = html;
    document.getElementById('modalDesigner').innerHTML = '<option value="">Sin asignar</option>' + designerList.map(d=>`<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
    document.getElementById('multiModalDesigner').innerHTML = '<option value="">Sin asignar</option>' + designerList.map(d=>`<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
}

// ======================================================
// ===== SELECCIÓN Y ASIGNACIÓN =====
// ======================================================
function toggleOrderSelection(id) {
    if(selectedOrders.has(id)) selectedOrders.delete(id); else selectedOrders.add(id);
    updateTable();
}
function toggleSelectAll() {
    const visibleIds = paginatedOrders.map(o=>o.orderId);
    const all = document.getElementById('selectAll').checked;
    visibleIds.forEach(id => all ? selectedOrders.add(id) : selectedOrders.delete(id));
    updateTable();
}
function clearSelection() { selectedOrders.clear(); updateTable(); }

// Modal Editar
async function openAssignModal(id) {
    currentEditingOrderId = id;
    const o = allOrders.find(x => x.orderId === id);
    if(!o) return;

    document.getElementById('detailCliente').textContent = o.cliente;
    document.getElementById('detailCodigo').textContent = o.codigoContrato;
    document.getElementById('detailEstilo').textContent = o.estilo;
    document.getElementById('detailFecha').textContent = formatDate(o.fechaDespacho);
    document.getElementById('detailPiezas').textContent = (o.cantidad + o.childPieces).toLocaleString();
    
    document.getElementById('modalDesigner').value = o.designer || '';
    document.getElementById('modalStatus').value = o.customStatus || '';
    document.getElementById('modalReceivedDate').value = o.receivedDate || '';
    document.getElementById('modalNotes').value = o.notes || '';
    
    // Historial
    const h = firebaseHistoryMap.get(id) || [];
    document.getElementById('modalHistory').innerHTML = h.map(x => 
        `<div class="border-b border-slate-100 pb-1 last:border-0">
            <span class="font-bold text-slate-700">${new Date(x.timestamp).toLocaleDateString()}</span> 
            <span class="text-slate-500">${escapeHTML(x.change)}</span>
         </div>`
    ).join('') || '<p class="text-slate-400 italic">Sin historial</p>';

    // Hijas
    const children = firebaseChildOrdersMap.get(id) || [];
    document.getElementById('childOrderCount').textContent = children.length;
    document.getElementById('childOrdersList').innerHTML = children.map(c => 
        `<div class="flex justify-between items-center bg-white p-1.5 rounded border border-slate-100 text-[10px]">
            <span><strong class="text-blue-600">${c.childCode}</strong> (${c.cantidad} pzs)</span>
            <button class="btn-delete-child text-red-400 hover:text-red-600" data-child-id="${c.childOrderId}" data-child-code="${c.childCode}">✕</button>
        </div>`
    ).join('') || '<p class="text-slate-400 italic text-[10px] p-1">Sin hijas</p>';
    
    document.getElementById('assignModal').classList.add('active');
    document.body.classList.add('modal-open');
}

function closeModal() { 
    document.querySelectorAll('.modal').forEach(m=>m.classList.remove('active')); 
    document.body.classList.remove('modal-open'); 
}

async function saveAssignment() {
    if (!currentEditingOrderId) return;
    setButtonLoading('saveAssignmentButton', true);
    try {
        const o = allOrders.find(x => x.orderId === currentEditingOrderId);
        const designer = document.getElementById('modalDesigner').value;
        const status = document.getElementById('modalStatus').value;
        const rDate = document.getElementById('modalReceivedDate').value;
        const notes = document.getElementById('modalNotes').value;
        
        const changes = [];
        const data = {};
        
        if(o.designer !== designer) { changes.push(`Diseñador: ${designer}`); data.designer = designer; }
        if(o.customStatus !== status) { changes.push(`Estado: ${status}`); data.customStatus = status; if(status==='Completada') data.completedDate = new Date().toISOString(); }
        if(o.receivedDate !== rDate) { changes.push(`Fecha Rx: ${rDate}`); data.receivedDate = rDate; }
        if(o.notes !== notes) { changes.push('Notas actualizadas'); data.notes = notes; }
        
        if(changes.length > 0) {
            await saveAssignmentToDB_Firestore(currentEditingOrderId, data, changes);
            showCustomAlert('Orden actualizada', 'success');
            closeModal();
        } else { showCustomAlert('Sin cambios', 'info'); }
    } catch(e) { showCustomAlert(e.message, 'error'); } 
    finally { setButtonLoading('saveAssignmentButton', false); }
}

// ======================================================
// ===== PLAN SEMANAL (MEJORADO) =====
// ======================================================

function generateWorkPlan() {
    const container = document.getElementById('view-workPlanContent');
    const weekInput = document.getElementById('view-workPlanWeekSelector');
    
    if (!weekInput.value) weekInput.value = getWeekIdentifierString(new Date());
    const weekIdentifier = weekInput.value;
    
    container.innerHTML = '<div class="spinner"></div>';

    setTimeout(() => {
        const planData = firebaseWeeklyPlanMap.get(weekIdentifier) || [];
        
        if (planData.length === 0) {
            container.innerHTML = `<div class="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50"><p class="text-slate-400 font-medium">Plan vacío para ${weekIdentifier}</p></div>`;
            document.getElementById('view-workPlanSummary').textContent = "0 órdenes";
            return;
        }

        let totalPzs = 0;
        let doneCount = 0;

        // Ordenar: Completadas al final, luego por prioridad
        planData.sort((a, b) => {
            const oA = allOrders.find(o => o.orderId === a.orderId);
            const oB = allOrders.find(o => o.orderId === b.orderId);
            const doneA = oA && oA.customStatus === 'Completada';
            const doneB = oB && oB.customStatus === 'Completada';
            
            if (doneA && !doneB) return 1;
            if (!doneA && doneB) return -1;
            return (a.isLate === b.isLate) ? 0 : a.isLate ? -1 : 1;
        });

        let html = `<div class="bg-white rounded-lg shadow border border-slate-200 overflow-hidden"><table class="min-w-full divide-y divide-slate-200 text-xs">
            <thead class="bg-slate-50 font-bold text-slate-500 uppercase"><tr><th class="px-4 py-3 text-left">Estado</th><th class="px-4 py-3 text-left">Orden</th><th class="px-4 py-3 text-left">Diseñador</th><th class="px-4 py-3 text-left">Entrega</th><th class="px-4 py-3 text-right">Piezas</th><th class="px-4 py-3"></th></tr></thead>
            <tbody class="divide-y divide-slate-100">`;

        planData.forEach(item => {
            const liveOrder = allOrders.find(o => o.orderId === item.orderId);
            const isCompleted = liveOrder && liveOrder.customStatus === 'Completada';
            const pzs = (item.cantidad||0) + (item.childPieces||0);
            totalPzs += pzs;
            if(isCompleted) doneCount++;

            let badge = '', rowClass = '';
            if(isCompleted) {
                badge = `<span class="bg-slate-600 text-white px-2 py-1 rounded font-bold flex items-center gap-1 w-fit"><i class="fa-solid fa-check"></i> LISTO</span>`;
                rowClass = 'bg-slate-50 opacity-60 grayscale';
            } else if(item.isLate) {
                badge = `<span class="bg-red-100 text-red-700 px-2 py-1 rounded font-bold border border-red-200">ATRASADA</span>`;
            } else if(item.isAboutToExpire) {
                badge = `<span class="bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-bold border border-yellow-200">URGENTE</span>`;
            } else {
                badge = `<span class="bg-blue-50 text-blue-700 px-2 py-1 rounded font-bold border border-blue-100">En Proceso</span>`;
            }

            html += `<tr class="${rowClass} hover:bg-slate-50 transition">
                <td class="px-4 py-3">${badge}</td>
                <td class="px-4 py-3">
                    <div class="font-bold text-slate-800">${escapeHTML(item.cliente)}</div>
                    <div class="text-slate-500">${escapeHTML(item.codigoContrato)} - ${escapeHTML(item.estilo)}</div>
                </td>
                <td class="px-4 py-3">${escapeHTML(item.designer || 'Sin asignar')}</td>
                <td class="px-4 py-3 text-slate-600">${item.fechaDespacho ? new Date(item.fechaDespacho).toLocaleDateString() : '-'}</td>
                <td class="px-4 py-3 text-right font-bold text-slate-700">${pzs.toLocaleString()}</td>
                <td class="px-4 py-3 text-right">
                    <button class="btn-remove-from-plan text-red-400 hover:text-red-600 p-1" data-plan-entry-id="${item.planEntryId}" data-order-code="${item.codigoContrato}"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
        
        const progress = Math.round((doneCount / planData.length) * 100) || 0;
        html = `<div class="mb-4 bg-blue-50 border border-blue-100 p-3 rounded-lg flex items-center justify-between">
            <div class="flex items-center gap-3 w-full">
                <span class="font-bold text-blue-800 text-xs whitespace-nowrap">${progress}% Completado</span>
                <div class="w-full bg-blue-200 rounded-full h-2"><div class="bg-blue-600 h-2 rounded-full transition-all duration-500" style="width: ${progress}%"></div></div>
            </div>
        </div>` + html;

        container.innerHTML = html;
        document.getElementById('view-workPlanSummary').textContent = `${planData.length} órdenes | ${totalPzs.toLocaleString()} pzs`;
    }, 50);
}

// ======================================================
// ===== GRÁFICOS Y MÉTRICAS (Placeholder Lógica) =====
// ======================================================
// Estas funciones se mantienen similares, solo se aseguran de 
// renderizar en los nuevos contenedores ID.

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
    
    Object.entries(counts).sort((a,b) => b[1] - a[1]).forEach(([name, count]) => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn w-full text-left px-3 py-2 text-xs font-medium text-slate-600 hover:bg-blue-50 rounded-lg flex justify-between items-center transition group';
        btn.dataset.designer = name;
        btn.innerHTML = `<span>${escapeHTML(name)}</span> <span class="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-bold group-hover:bg-blue-100 group-hover:text-blue-600">${count}</span>`;
        list.appendChild(btn);
    });
}

function generateDesignerMetrics(name) {
    const content = document.getElementById('metricsDetail');
    const safeName = escapeHTML(name);
    
    content.innerHTML = `
        <div class="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
            <div>
                <h2 class="text-xl font-bold text-slate-800">${safeName}</h2>
                <p class="text-xs text-slate-500">Reporte individual de desempeño</p>
            </div>
            <div class="flex gap-2">
                 <button class="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50" onclick="exportDesignerMetricsPDF('${safeName.replace(/'/g, "\\'")}')"><i class="fa-solid fa-file-pdf mr-1"></i> PDF</button>
                 <button class="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100" onclick="openCompareModal('${safeName.replace(/'/g, "\\'")}')">Comparar</button>
            </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div class="h-56"><canvas id="designerDoughnutChartCanvas"></canvas></div>
            <div class="h-56"><canvas id="designerBarChartCanvas"></canvas></div>
        </div>
        <div id="designerOrdersTableContainer"></div>`;

    const orders = allOrders.filter(o => o.departamento === 'P_Art' && (name === 'Sin asignar' ? !o.designer : o.designer === name));
    
    // Gráficos
    const statusMap = {};
    orders.forEach(o => statusMap[o.customStatus||'Sin estado'] = (statusMap[o.customStatus||'Sin estado']||0)+1);
    
    const ctx1 = document.getElementById('designerDoughnutChartCanvas').getContext('2d');
    designerDoughnutChart = new Chart(ctx1, {
        type: 'doughnut',
        data: { labels: Object.keys(statusMap), datasets: [{ data: Object.values(statusMap), backgroundColor: ['#fbbf24','#a78bfa','#60a5fa','#34d399','#9ca3af'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 10 } } } } }
    });
    
    // Tabla Simple
    const tableDiv = document.getElementById('designerOrdersTableContainer');
    tableDiv.innerHTML = `
        <div class="overflow-hidden rounded-lg border border-slate-200">
            <table class="min-w-full divide-y divide-slate-200 text-xs">
                <thead class="bg-slate-50"><tr><th class="px-4 py-2 text-left">Cliente</th><th class="px-4 py-2">Estilo</th><th class="px-4 py-2 text-right">Pzs</th></tr></thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                    ${orders.map(o => `<tr><td class="px-4 py-2 font-medium">${escapeHTML(o.cliente)}</td><td class="px-4 py-2 text-slate-500">${escapeHTML(o.estilo)}</td><td class="px-4 py-2 text-right font-bold text-blue-600">${o.cantidad}</td></tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

function generateDepartmentMetrics() {
    const content = document.getElementById('departmentMetricsContent');
    const active = allOrders.filter(o => o.departamento === 'P_Art');
    const totalPzs = active.reduce((s,o) => s + o.cantidad, 0);
    const designers = [...new Set(active.map(o => o.designer).filter(Boolean))].length;
    
    content.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="bg-white p-5 rounded-xl shadow-sm border-l-4 border-blue-500">
                <p class="text-[10px] font-bold uppercase text-slate-400">Órdenes Activas</p>
                <p class="text-2xl font-bold text-slate-900 mt-1">${active.length}</p>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border-l-4 border-purple-500">
                <p class="text-[10px] font-bold uppercase text-slate-400">Carga Total (Piezas)</p>
                <p class="text-2xl font-bold text-slate-900 mt-1">${totalPzs.toLocaleString()}</p>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border-l-4 border-green-500">
                <p class="text-[10px] font-bold uppercase text-slate-400">Diseñadores Activos</p>
                <p class="text-2xl font-bold text-slate-900 mt-1">${designers}</p>
            </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-100 h-80">
                <h4 class="font-bold text-xs text-slate-700 mb-4">Distribución por Estado</h4>
                <div class="h-64"><canvas id="deptLoadPieChartCanvas"></canvas></div>
            </div>
            <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-100 h-80">
                <h4 class="font-bold text-xs text-slate-700 mb-4">Carga por Diseñador</h4>
                <div class="h-64"><canvas id="deptLoadBarChartCanvas"></canvas></div>
            </div>
        </div>`;

    const statusMap = {};
    active.forEach(o => statusMap[o.customStatus||'Sin estado'] = (statusMap[o.customStatus||'Sin estado']||0)+1);
    
    const ctx1 = document.getElementById('deptLoadPieChartCanvas').getContext('2d');
    deptLoadPieChart = new Chart(ctx1, {
        type: 'pie',
        data: { labels: Object.keys(statusMap), datasets: [{ data: Object.values(statusMap), backgroundColor: ['#fbbf24','#a78bfa','#60a5fa','#34d399','#9ca3af'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });

    const loadMap = {};
    active.forEach(o => { if(o.designer && o.designer !== EXCLUDE_DESIGNER_NAME) loadMap[o.designer] = (loadMap[o.designer]||0) + o.cantidad; });
    const sortedLoad = Object.entries(loadMap).sort((a,b) => b[1]-a[1]);
    
    const ctx2 = document.getElementById('deptLoadBarChartCanvas').getContext('2d');
    deptLoadBarChart = new Chart(ctx2, {
        type: 'bar',
        data: { labels: sortedLoad.map(x=>x[0]), datasets: [{ label: 'Piezas', data: sortedLoad.map(x=>x[1]), backgroundColor: '#3b82f6' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

// ======================================================
// ===== OTRAS UTILIDADES (EXPORT, PDF, RESET) =====
// ======================================================
function exportTableToExcel() {
    if (allOrders.length === 0) return showCustomAlert('Nada que exportar', 'error');
    const data = getFilteredOrders().map(o => ({
        Cliente: o.cliente, Código: o.codigoContrato, Estilo: o.estilo, 
        Depto: o.departamento, Fecha: o.fechaDespacho ? o.fechaDespacho.toLocaleDateString() : '',
        Diseñador: o.designer, Estado: o.customStatus, Cantidad: o.cantidad
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Datos");
    XLSX.writeFile(wb, `Reporte_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function resetApp() {
    showConfirmModal("¿Subir nuevo archivo? Se borrarán los datos locales.", () => {
        // Reset UI
        document.getElementById('appMainContainer').style.display = 'none';
        document.getElementById('uploadSection').style.display = 'block';
        document.getElementById('mainNavigation').style.display = 'none';
        document.getElementById('appMainContainer').style.marginLeft = '0';
        
        // Reset Data
        allOrders = []; isExcelLoaded = false;
        document.getElementById('fileInput').value = '';
        document.getElementById('fileName').textContent = '';
        desconectarDatosDeFirebase();
    });
}

// Fin de app.js