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
// Inicializa Firebase
firebase.initializeApp(firebaseConfig);

// Configuración de Tailwind (para gráficos)
tailwind.config = {
    theme: {
        extend: {
            fontFamily: { sans: ['Inter', 'sans-serif'] },
            colors: {
                'chart-bandeja': '#F59E0B',
                'chart-produccion': '#8B5CF6',
                'chart-auditoria': '#3B82F6',
                'chart-completada': '#10B981',
                'chart-sin-estado': '#6B7280',
            }
        },
    },
}

// ======================================================
// ===== VARIABLES GLOBALES =====
// ======================================================

// --- Variables de Estado de la App ---
let allOrders = []; 
let selectedOrders = new Set();
let currentFilter = 'all';
let currentDateFilter = 'all';
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

// --- Variables de Paginación ---
let currentPage = 1;
let rowsPerPage = 50;
let paginatedOrders = [];

// --- Variables de Firebase ---
let usuarioActual = null; 
const db_firestore = firebase.firestore(); 

// --- Variables de Limpieza de Listeners ---
let unsubscribeAssignments = null;
let unsubscribeHistory = null;
let unsubscribeChildOrders = null;
let unsubscribeDesigners = null;
let unsubscribeWeeklyPlan = null;

// --- Mapas de Datos de Firebase (Caché en tiempo real) ---
let firebaseAssignmentsMap = new Map();
let firebaseHistoryMap = new Map();
let firebaseChildOrdersMap = new Map();
let firebaseDesignersMap = new Map(); 
let firebaseWeeklyPlanMap = new Map();

// --- Variables de Lista y Estado ---
let designerList = []; 
const CUSTOM_STATUS_OPTIONS = ['Bandeja', 'Producción', 'Auditoría', 'Completada'];
let needsRecalculation = true; 

// --- Configuración Global ---
const EXCLUDE_DESIGNER_NAME = 'Magdali Fernandez'; 
const DB_SCHEMA_VERSION = 1; 

// --- Variables para Batch de Auto-Completado ---
let autoCompleteBatchWrites = []; 
let autoCompletedOrderIds = new Set(); 

// --- Instancias de Gráficos ---
let designerDoughnutChart = null;
let designerBarChart = null;
let designerActivityChart = null; 
let currentDesignerTableFilter = { search: '', cliente: '', estado: '', fechaDesde: '', fechaHasta: '' };
let compareChart = null;
let deptLoadPieChart = null;
let deptLoadBarChart = null;
let deptProductivityChart = null;
let currentWorkPlanWeek = '';
let currentCompareDesigner1 = '';

// ======================================================
// ===== PERSISTENCIA DE DATOS (Caché Local) =====
// ======================================================

const STORAGE_KEY_DATA = 'panelArte_Data_v5';
const STORAGE_KEY_FILE = 'panelArte_FileName';

function saveLocalData() {
    try {
        localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(allOrders));
        const fileName = document.getElementById('fileName').textContent;
        localStorage.setItem(STORAGE_KEY_FILE, fileName);
        console.log("💾 Datos guardados en memoria local.");
    } catch (e) {
        console.warn("No se pudo guardar en local:", e);
    }
}

function loadLocalData() {
    const cachedData = localStorage.getItem(STORAGE_KEY_DATA);
    const cachedFile = localStorage.getItem(STORAGE_KEY_FILE);

    if (cachedData) {
        try {
            console.log("📂 Cargando datos desde memoria local...");
            const parsed = JSON.parse(cachedData);
            
            allOrders = parsed.map(o => ({
                ...o,
                fechaDespacho: o.fechaDespacho ? new Date(o.fechaDespacho) : null
            }));

            document.getElementById('fileName').textContent = cachedFile || 'Datos Recuperados';
            isExcelLoaded = true;
            return true;
        } catch (e) {
            console.error("Error al leer caché:", e);
            return false;
        }
    }
    return false;
}

function clearLocalData() {
    localStorage.removeItem(STORAGE_KEY_DATA);
    localStorage.removeItem(STORAGE_KEY_FILE);
    console.log("🗑️ Memoria local borrada.");
}

// ======================================================
// ===== FUNCIONES AUXILIARES DE SEGURIDAD Y UX =====
// ======================================================

function safeAddEventListener(id, event, handler) {
    const element = document.getElementById(id);
    if (element) {
        element.addEventListener(event, handler);
    }
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
    let bgClass = type === 'error' ? 'bg-red-100 border-red-500 text-red-800' : type === 'success' ? 'bg-green-100 border-green-500 text-green-800' : 'bg-blue-100 border-blue-500 text-blue-800';
    let icon = type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
    
    alertDiv.className = `fixed top-5 right-5 z-[2000] max-w-sm w-full shadow-2xl rounded-lg border-l-4 p-4 transform transition-all duration-300 ${bgClass}`;
    alertDiv.innerHTML = `<div class="flex justify-between items-start"><div class="flex gap-3"><span class="text-xl">${icon}</span><div><strong class="font-bold block text-sm">${type.toUpperCase()}</strong><span class="block text-sm mt-1">${escapeHTML(message)}</span></div></div><button onclick="document.getElementById('customAlert').style.display='none'" class="text-lg opacity-50 hover:opacity-100 ml-4">&times;</button></div>`;
    alertDiv.style.display = 'block';
    if (window.alertTimeout) clearTimeout(window.alertTimeout);
    window.alertTimeout = setTimeout(() => { alertDiv.style.display = 'none'; }, type === 'error' ? 10000 : 5000);
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
    overlay.innerHTML = `<div class="spinner"></div><p>${escapeHTML(message)}</p>`;
    document.body.appendChild(overlay);
}
function hideLoading() { const overlay = document.getElementById('loadingOverlay'); if (overlay) overlay.remove(); }

function checkAndCloseModalStack() {
    const activeModals = document.querySelectorAll('.modal.active');
    if (activeModals.length === 0) document.body.classList.remove('modal-open');
}

// === MODAL DE CONFIRMACIÓN ===
let confirmCallback = null;
let isStrictConfirm = false;

function showConfirmModal(message, onConfirmCallback, strict = false) {
    document.getElementById('confirmModalMessage').textContent = message;
    confirmCallback = onConfirmCallback;
    isStrictConfirm = strict;
    
    const strictContainer = document.getElementById('confirmStrictContainer');
    const confirmBtn = document.getElementById('confirmModalConfirm');
    const input = document.getElementById('confirmStrictInput');
    
    if (strict) {
        strictContainer.classList.remove('hidden');
        input.value = '';
        confirmBtn.disabled = true;
        confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        strictContainer.classList.add('hidden');
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    
    document.getElementById('confirmModal').classList.add('active');
    document.body.classList.add('modal-open');
    
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    newConfirmBtn.addEventListener('click', () => {
        if (confirmCallback) confirmCallback();
        closeConfirmModal();
    }, { once: true });
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
    checkAndCloseModalStack(); 
    confirmCallback = null;
    const strictInput = document.getElementById('confirmStrictInput');
    if (strictInput) strictInput.value = ''; 
}

function checkStrictInput() {
    if (!isStrictConfirm) return;
    const input = document.getElementById('confirmStrictInput');
    const btn = document.getElementById('confirmModalConfirm');
    if (input.value.toUpperCase() === 'CONFIRMAR') {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
    } else {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
    }
}

function openLegendModal() {
    document.getElementById('legendModal').classList.add('active');
}

// ======================================================
// ===== FUNCIONES DE INICIALIZACIÓN =====
// ======================================================

document.addEventListener('DOMContentLoaded', (event) => {
    console.log('DOM cargado. Inicializando App v5.2 (Final Fix)...');
    
    safeAddEventListener('loginButton', 'click', iniciarLoginConGoogle);
    safeAddEventListener('logoutButton', 'click', iniciarLogout);

    firebase.auth().onAuthStateChanged((user) => {
        const loginSection = document.getElementById('loginSection');
        const uploadSection = document.getElementById('uploadSection');
        const dashboard = document.getElementById('dashboard');

        if (user) {
            usuarioActual = user;
            document.getElementById('userName').textContent = usuarioActual.displayName;
            
            loginSection.style.display = 'none';
            
            if (loadLocalData()) {
                uploadSection.style.display = 'none';
                dashboard.style.display = 'block';
                needsRecalculation = true;
                recalculateChildPieces();
                updateDashboard();
                generateSummary();
            } else {
                uploadSection.style.display = 'block';
                dashboard.style.display = 'none';
            }
            
            conectarDatosDeFirebase();

        } else {
            desconectarDatosDeFirebase();
            
            usuarioActual = null;
            isExcelLoaded = false;
            allOrders = []; 
            console.log("Usuario desconectado.");

            loginSection.style.display = 'block';
            uploadSection.style.display = 'none';
            dashboard.style.display = 'none';
        }
    });

    safeAddEventListener('searchInput', 'input', debounce((e) => { 
        currentSearch = e.target.value; 
        currentPage = 1; 
        updateTable(); 
    }, 300)); 
    
    const filters = [
        'clientFilter', 'styleFilter', 'teamFilter', 'departamentoFilter', 
        'designerFilter', 'customStatusFilter', 'dateFrom', 'dateTo'
    ];

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
            
            currentPage = 1; 
            updateTable();
        }, 150));
    });

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    
    if (dropZone && fileInput) {
        ['dragenter','dragover','dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, preventDefaults, false));
        dropZone.addEventListener('dragenter', () => dropZone.classList.add('border-blue-500', 'bg-gray-100'), false);
        dropZone.addEventListener('dragover', () => dropZone.classList.add('border-blue-500', 'bg-gray-100'), false);
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-blue-500', 'bg-gray-100'), false);
        dropZone.addEventListener('drop', (e) => {
            dropZone.classList.remove('border-blue-500', 'bg-gray-100');
            handleDrop(e);
        }, false);
        
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileSelect);
    }

    const designerManagerList = document.getElementById('designerManagerList');
    if(designerManagerList) {
        designerManagerList.addEventListener('click', function(e) {
            const deleteButton = e.target.closest('.btn-delete-designer');
            if (deleteButton) {
                const name = deleteButton.dataset.name;
                const docId = deleteButton.dataset.id; 
                if (name && docId) deleteDesigner(docId, name);
            }
        });
    }

    const metricsSidebarList = document.getElementById('metricsSidebarList');
    if(metricsSidebarList) {
        metricsSidebarList.addEventListener('click', function(e) {
            const metricsButton = e.target.closest('.filter-btn'); 
            if (metricsButton) {
                const name = metricsButton.dataset.designer;
                if (name) generateDesignerMetrics(name);
            }
        });
    }

    const childOrdersList = document.getElementById('childOrdersList');
    if(childOrdersList) {
        childOrdersList.addEventListener('click', function(e) {
             const deleteButton = e.target.closest('.btn-delete-child');
             if(deleteButton) {
                e.stopPropagation(); 
                const childId = deleteButton.dataset.childId;
                const childCode = deleteButton.dataset.childCode;
                if (childId && childCode) deleteChildOrder(childId, childCode);
             }
        });
    }
    
    const viewWorkPlanContent = document.getElementById('view-workPlanContent');
    if(viewWorkPlanContent) {
        viewWorkPlanContent.addEventListener('click', function(e) {
             const removeButton = e.target.closest('.btn-remove-from-plan');
             if(removeButton) {
                e.stopPropagation();
                const planEntryId = removeButton.dataset.planEntryId;
                const orderCode = removeButton.dataset.orderCode;
                if (planEntryId) removeOrderFromPlan(planEntryId, orderCode);
             }
        });
    }

    // --- CORRECCIÓN DEL BUG DE ESCAPE ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // 1. Modales (Seguro cerrarlos siempre)
            closeModal(); 
            closeMultiModal(); 
            closeWeeklyReportModal();
            closeDesignerManager(); 
            closeConfirmModal(); 
            closeCompareModals(); 
            closeAddChildModal();
            
            const legend = document.getElementById('legendModal');
            if(legend) legend.classList.remove('active');

            // 2. Vistas Secundarias (SOLO cerrarlas si están visibles)
            // Esto evita forzar el dashboard si estás en el Login
            const wp = document.getElementById('workPlanView');
            if(wp && wp.style.display === 'block') hideWorkPlanView();

            const dm = document.getElementById('designerMetricsView');
            if(dm && dm.style.display === 'block') hideMetricsView();

            const dpm = document.getElementById('departmentMetricsView');
            if(dpm && dpm.style.display === 'block') hideDepartmentMetrics();
        }
        
        if (e.ctrlKey && e.key === 's') {
            const assignModal = document.getElementById('assignModal');
            if (assignModal && assignModal.classList.contains('active')) {
                e.preventDefault(); saveAssignment();
            }
        }
    });

    console.log("App lista.");
});

// ======================================================
// ===== FUNCIONES DE FIREBASE (NÚCLEO) =====
// ======================================================

function iniciarLoginConGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider).catch((error) => {
        showCustomAlert(`Error de autenticación: ${error.message}`, 'error');
        logToFirestore('auth:login', error);
    });
}

function iniciarLogout() {
    firebase.auth().signOut();
}

function conectarDatosDeFirebase() {
    if (!usuarioActual) return;
    
    const dbStatus = document.getElementById('dbStatus');
    if(dbStatus) {
        dbStatus.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-xs"></i> Conectando...';
        dbStatus.className = "ml-3 font-medium text-yellow-600";
    }
    
    unsubscribeAssignments = db_firestore.collection('assignments').onSnapshot((snapshot) => {
        firebaseAssignmentsMap.clear();
        snapshot.forEach((doc) => firebaseAssignmentsMap.set(doc.id, doc.data()));
        if(isExcelLoaded) mergeYActualizar(); 
        if(dbStatus) {
            dbStatus.textContent = '● Conectado';
            dbStatus.className = "ml-3 font-medium text-green-600";
        }
    }, (e) => { console.error("Error assignments:", e); logToFirestore('firebase:assignments', e); });

    unsubscribeHistory = db_firestore.collection('history').onSnapshot((snapshot) => {
        firebaseHistoryMap.clear();
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (!firebaseHistoryMap.has(data.orderId)) firebaseHistoryMap.set(data.orderId, []);
            firebaseHistoryMap.get(data.orderId).push(data);
        });
    }, (e) => logToFirestore('firebase:history', e));

    unsubscribeChildOrders = db_firestore.collection('childOrders').onSnapshot((snapshot) => {
        firebaseChildOrdersMap.clear();
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (!firebaseChildOrdersMap.has(data.parentOrderId)) firebaseChildOrdersMap.set(data.parentOrderId, []);
            firebaseChildOrdersMap.get(data.parentOrderId).push(data);
        });
        needsRecalculation = true;
        if(isExcelLoaded) mergeYActualizar();
    }, (e) => logToFirestore('firebase:childOrders', e));
    
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
    }, (e) => logToFirestore('firebase:designers', e));

    unsubscribeWeeklyPlan = db_firestore.collection('weeklyPlan').onSnapshot((snapshot) => {
        firebaseWeeklyPlanMap.clear();
        snapshot.forEach((doc) => {
            const data = doc.data();
            const weekId = data.weekIdentifier;
            if (!firebaseWeeklyPlanMap.has(weekId)) firebaseWeeklyPlanMap.set(weekId, []);
            firebaseWeeklyPlanMap.get(weekId).push(data);
        });
        const workPlanView = document.getElementById('workPlanView');
        if (workPlanView && workPlanView.style.display === 'block') generateWorkPlan();
    }, (e) => logToFirestore('firebase:weeklyPlan', e));
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
            order.designer = '';
            order.customStatus = '';
            order.receivedDate = '';
            order.notes = '';
            order.completedDate = null;
        }

        if (fbData && 
            (fbData.customStatus === 'Bandeja' || fbData.customStatus === 'Producción' || fbData.customStatus === 'Auditoría') &&
            order.departamento !== 'P_Art' && 
            order.departamento !== 'Sin Departamento') 
        {
            if (fbData.customStatus !== 'Completada' && !autoCompletedOrderIds.has(order.orderId)) {
                order.customStatus = 'Completada';
                const newCompletedDate = new Date().toISOString();
                order.completedDate = newCompletedDate;
                autoCompleteBatchWrites.push({
                    orderId: order.orderId,
                    data: { customStatus: 'Completada', completedDate: newCompletedDate, lastModified: new Date().toISOString(), schemaVersion: DB_SCHEMA_VERSION },
                    history: [`Estado automático: ${fbData.customStatus} → Completada (movido a ${order.departamento})`]
                });
                autoCompletedOrderIds.add(order.orderId);
            }
        }
    }
    
    updateDashboard();
    if (autoCompleteBatchWrites.length > 0) {
        ejecutarAutoCompleteBatch();
    }
}

// ======================================================
// ===== FUNCIONES CRUD =====
// ======================================================

async function ejecutarAutoCompleteBatch() {
    if (!usuarioActual || autoCompleteBatchWrites.length === 0) return;
    if (autoCompleteBatchWrites.length > 400) autoCompleteBatchWrites = autoCompleteBatchWrites.slice(0, 400);
    
    const batch = db_firestore.batch();
    const user = usuarioActual.displayName || usuarioActual.email;
    
    autoCompleteBatchWrites.forEach(write => {
        const assignmentRef = db_firestore.collection('assignments').doc(write.orderId);
        batch.set(assignmentRef, write.data, { merge: true });
        write.history.forEach(change => {
            const historyRef = db_firestore.collection('history').doc();
            batch.set(historyRef, { orderId: write.orderId, change: change, user: user, timestamp: new Date().toISOString(), schemaVersion: DB_SCHEMA_VERSION });
        });
    });

    try {
        await batch.commit();
        showCustomAlert(`Se auto-completaron ${autoCompleteBatchWrites.length} órdenes.`, 'success');
        autoCompleteBatchWrites = [];
    } catch (error) { console.error("Error batch:", error); logToFirestore('batch:autocomplete', error); }
}

async function saveAssignmentToDB_Firestore(orderId, dataToSave, historyChanges = []) {
    if (!usuarioActual) throw new Error("No estás autenticado.");
    const assignmentRef = db_firestore.collection('assignments').doc(orderId);
    const batch = db_firestore.batch();

    dataToSave.lastModified = new Date().toISOString();
    if (dataToSave.designer === undefined) dataToSave.designer = '';
    dataToSave.schemaVersion = DB_SCHEMA_VERSION; 
    batch.set(assignmentRef, dataToSave, { merge: true });

    if (historyChanges.length > 0) {
        const user = usuarioActual.displayName || usuarioActual.email;
        historyChanges.forEach(change => {
            const historyRef = db_firestore.collection('history').doc();
            batch.set(historyRef, { orderId: orderId, change: change, user: user, timestamp: new Date().toISOString(), schemaVersion: DB_SCHEMA_VERSION });
        });
    }
    return await batch.commit();
}

async function saveChildOrderToDB(childOrder) {
    childOrder.schemaVersion = DB_SCHEMA_VERSION;
    return await db_firestore.collection('childOrders').doc(childOrder.childOrderId).set(childOrder);
}

async function deleteChildOrderFromDB(childOrderId) {
    return await db_firestore.collection('childOrders').doc(childOrderId).delete();
}

async function addDesigner() {
    const nameInput = document.getElementById('newDesignerName');
    const emailInput = document.getElementById('newDesignerEmail');
    const name = nameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();

    if (!name || !email) { showCustomAlert('Por favor, ingresa nombre y correo.', 'error'); return; }
    const emailRegex = /^[a-zA-Z0-9._-]+@fitwellus\.com$/;
    if (!emailRegex.test(email)) { showCustomAlert('Formato de correo inválido. Debe ser: usuario@fitwellus.com', 'error'); return; }

    let emailExists = false;
    firebaseDesignersMap.forEach(data => { if (data.email === email) emailExists = true; });
    if (emailExists) { showCustomAlert('Este correo ya está registrado.', 'error'); return; }

    try {
        await db_firestore.collection('designers').add({ name: name, email: email, createdAt: new Date().toISOString(), schemaVersion: DB_SCHEMA_VERSION });
        nameInput.value = ''; emailInput.value = '';
        showCustomAlert(`Usuario "${name}" agregado correctamente.`, 'success');
    } catch (error) { showCustomAlert(`Error al agregar: ${error.message}`, 'error'); logToFirestore('designer:add', error); }
}

async function deleteDesigner(docId, name) {
    if (!firebaseDesignersMap.has(docId)) { showCustomAlert('El diseñador no existe.', 'error'); return; }
    const ordersToUpdate = allOrders.filter(o => o.designer === name && o.departamento === 'P_Art');
    let message = `¿Eliminar a "${name}"?`;
    let strict = false;
    if (ordersToUpdate.length > 0) { message += `\n⚠️ TIENE ${ordersToUpdate.length} ÓRDENES ASIGNADAS.\nPara confirmar, escribe "CONFIRMAR".`; strict = true; }

    showConfirmModal(message, async () => {
        try {
            showLoading('Eliminando...');
            await db_firestore.collection('designers').doc(docId).delete();
            if (ordersToUpdate.length > 0) {
                const orderIds = ordersToUpdate.map(o => o.orderId);
                const BATCH_SIZE = 450;
                for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
                    const batch = db_firestore.batch();
                    const chunk = orderIds.slice(i, i + BATCH_SIZE);
                    chunk.forEach(oid => { const docRef = db_firestore.collection('assignments').doc(oid); batch.update(docRef, { designer: '' }); });
                    await batch.commit();
                }
            }
            showCustomAlert('Diseñador eliminado.', 'success');
        } catch (error) { showCustomAlert(error.message, 'error'); logToFirestore('designer:delete', error); } finally { hideLoading(); }
    }, strict);
}

async function addOrderToWorkPlanDB(order, weekIdentifier) {
    const planEntryId = `${order.orderId}_${weekIdentifier}`;
    const planRef = db_firestore.collection('weeklyPlan').doc(planEntryId);
    const doc = await planRef.get();
    if (doc.exists) return false; 

    const planEntry = {
        planEntryId: planEntryId, orderId: order.orderId, weekIdentifier: weekIdentifier, designer: order.designer,
        planStatus: 'Pendiente', addedAt: new Date().toISOString(), cliente: order.cliente, codigoContrato: order.codigoContrato,
        estilo: order.estilo, fechaDespacho: order.fechaDespacho ? new Date(order.fechaDespacho).toISOString() : null,
        cantidad: order.cantidad, childPieces: order.childPieces, isLate: order.isLate, isAboutToExpire: order.isAboutToExpire,
        schemaVersion: DB_SCHEMA_VERSION
    };
    await planRef.set(planEntry); return true; 
}

async function removeOrderFromWorkPlanDB(planEntryId) {
    return await db_firestore.collection('weeklyPlan').doc(planEntryId).delete();
}

async function logToFirestore(context, error) {
    if (!usuarioActual) return;
    const errorMessage = (error instanceof Error) ? error.message : String(error);
    try { await db_firestore.collection('logs').add({ timestamp: new Date().toISOString(), user: usuarioActual.displayName || usuarioActual.email, context: context, message: errorMessage, severity: 'ERROR' }); } catch (e) { console.error("Fallo al loguear error:", e); }
}

// ======================================================
// ===== LÓGICA DE MANEJO DE EXCEL =====
// ======================================================

function handleDrop(e){ const dt = e.dataTransfer; handleFiles(dt.files); }
function handleFileSelect(e){ handleFiles(e.target.files); }
function handleFiles(files){
    if (!files || files.length === 0) return;
    const file = files[0];
    document.getElementById('fileName').textContent = file.name;
    processFile(file);
}

async function processFile(file) {
    showLoading('Procesando archivo Excel...');
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheetName = workbook.SheetNames.find(n => /working\s*pro[c]{1,2}ess/i.test(n));

        if (!sheetName) throw new Error('No se encontró la pestaña "Working Process".');
        
        const worksheet = workbook.Sheets[sheetName];
        const arr = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

        let headerIndex = -1;
        for (let i = 0; i < Math.min(arr.length, 12); i++) {
            const row = arr[i].map(c => String(c).toLowerCase());
            if (row.some(c => c.includes('fecha')) && row.some(c => c.includes('cliente'))) { headerIndex = i; break; }
        }
        if (headerIndex === -1) throw new Error('No se pudo detectar la fila de encabezados.');
        
        const headers = arr[headerIndex].map(h => String(h).trim().replace(/,/g, '').toLowerCase());
        const rows = arr.slice(headerIndex + 1);

        const colIndices = {
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
            { pattern: /p[_\s]*r[_\s]*to[_\s]*sew/i, name: 'P_R_to_Sew' },
            { pattern: /p[_\s]*sew/i, name: 'P_Sew' },
            { pattern: /sum[_\s]*of[_\s]*twill/i, name: 'Sum of TWILL' },
            { pattern: /p[_\s]*packing/i, name: 'P_Packing' },
            { pattern: /p[_\s]*shipping/i, name: 'P_Shipping' }
        ];

        const departmentIndices = [];
        headers.forEach((header, index) => {
            const matched = departmentPatterns.find(dept => dept.pattern.test(header));
            if (matched) departmentIndices.push({ index: index, name: matched.name });
        });
        
        let processedOrders = []; 
        let currentDate = null;
        let curCli="", curCod="", curSty="", curTeam="";
        
        autoCompleteBatchWrites = [];

        for (const row of rows) {
            if (!row || row.length === 0 || row.every(c => c === "" || c === null)) continue;
            const lowerRow = row.slice(0, 4).map(c => String(c).toLowerCase());
            if (lowerRow.some(c => c.includes('total') || c.includes('subtotal') || c.includes('grand'))) continue;

            if (colIndices.fecha >= 0 && row[colIndices.fecha] !== "" && row[colIndices.fecha] !== null) {
                const rawFecha = row[colIndices.fecha];
                let deliveryDate = null;
                if (typeof rawFecha === 'number') { deliveryDate = new Date((rawFecha - 25569) * 86400 * 1000); } 
                else { const d = new Date(rawFecha); if (!isNaN(d)) deliveryDate = d; }
                if (deliveryDate && !isNaN(deliveryDate)) { currentDate = new Date(Date.UTC(deliveryDate.getFullYear(), deliveryDate.getMonth(), deliveryDate.getDate())); }
            }
            if (colIndices.cliente >= 0 && row[colIndices.cliente]) curCli = String(row[colIndices.cliente]).trim();
            if (colIndices.codigo >= 0 && row[colIndices.codigo]) curCod = String(row[colIndices.codigo]).trim();
            if (colIndices.estilo >= 0 && row[colIndices.estilo]) curSty = String(row[colIndices.estilo]).trim();
            if (colIndices.team >= 0 && row[colIndices.team]) curTeam = String(row[colIndices.team]).trim();

            if (!curCli || !curCod) continue;

            let cant = 0; let dept = "";
            for (let i = departmentIndices.length - 1; i >= 0; i--) {
                const col = departmentIndices[i];
                const rawValue = row[col.index];
                if (rawValue !== "" && rawValue !== null) {
                    const n = Number(String(rawValue).replace(/,|\s/g, ''));
                    if (!isNaN(n) && n > 0) { cant = n; dept = col.name; break; }
                }
            }
            if (cant <= 0) { cant = 0; dept = "Sin Departamento"; }

            const fd = currentDate ? new Date(currentDate) : null;
            const oid = `${curCli}_${curCod}_${fd ? fd.getTime() : 'nodate'}_${curSty}`;

            const today = new Date(); today.setHours(0,0,0,0);
            let dl = 0;
            const isLate = fd && fd < today;
            if (isLate) dl = Math.ceil((today.getTime() - fd.getTime()) / (1000*60*60*24));
            
            const fb = firebaseAssignmentsMap.get(oid);
            let st = fb ? fb.customStatus : '';
            let cd = fb ? fb.completedDate : null;

            if (fb && (['Bandeja','Producción','Auditoría'].includes(fb.customStatus)) && dept !== 'P_Art' && dept !== 'Sin Departamento') {
                if (fb.customStatus !== 'Completada' && !autoCompletedOrderIds.has(oid)) {
                    st = 'Completada'; cd = new Date().toISOString();
                    autoCompleteBatchWrites.push({
                        orderId: oid,
                        data: { customStatus: 'Completada', completedDate: cd, lastModified: cd, schemaVersion: DB_SCHEMA_VERSION },
                        history: [`Estado automático: ${fb.customStatus} → Completada (movido a ${dept})`]
                    });
                    autoCompletedOrderIds.add(oid);
                }
            }

            processedOrders.push({
                orderId: oid, fechaDespacho: fd, cliente: curCli, codigoContrato: curCod,
                estilo: curSty, teamName: curTeam, departamento: dept,
                cantidad: cant, childPieces: 0, isLate, daysLate: dl, isVeryLate: dl > 7, isAboutToExpire: fd && !isLate && ((fd.getTime() - today.getTime()) / 86400000) <= 2,
                designer: fb ? fb.designer : '', customStatus: st,
                receivedDate: fb ? fb.receivedDate : '', notes: fb ? fb.notes : '', completedDate: cd
            });
        }

        allOrders = processedOrders;
        isExcelLoaded = true; 
        saveLocalData(); // Persistir
        
        needsRecalculation = true; 
        recalculateChildPieces(); 
        if (autoCompleteBatchWrites.length > 0) await ejecutarAutoCompleteBatch();

        await updateDashboard();
        generateSummary();

        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';

    } catch (error) {
        showCustomAlert('Error al procesar el archivo: ' + (error.message || error), 'error');
        console.error(error); document.getElementById('fileInput').value = ''; logToFirestore('file:process', error);
    } finally { hideLoading(); }
}

// ======================================================
// ===== UI Y FILTROS =====
// ======================================================

function updateAllDesignerDropdowns() {
    const optionsHTML = '<option value="">Todos</option>' + designerList.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('');
    const modalOptionsHTML = '<option value="">Sin asignar</option>' + designerList.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('');
    
    const designerFilter = document.getElementById('designerFilter');
    if (designerFilter) { designerFilter.innerHTML = optionsHTML; designerFilter.value = currentDesignerFilter; }
    
    const modalDesigner = document.getElementById('modalDesigner');
    if (modalDesigner) modalDesigner.innerHTML = modalOptionsHTML;
    
    const multiModalDesigner = document.getElementById('multiModalDesigner');
    if (multiModalDesigner) multiModalDesigner.innerHTML = modalOptionsHTML;
    
    const compareSelect = document.getElementById('compareDesignerSelect');
    if (compareSelect && currentCompareDesigner1) {
        const others = designerList.filter(d => d !== currentCompareDesigner1);
        compareSelect.innerHTML = '<option value="">Selecciona uno...</option>' + others.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('');
    }
}

function populateMetricsSidebar() {
    const sidebarList = document.getElementById('metricsSidebarList');
    if (!sidebarList) return;
    sidebarList.innerHTML = '';
    
    const unassignedCount = allOrders.filter(o => o.departamento === 'P_Art' && !o.designer).length;
    if (unassignedCount > 0) {
        sidebarList.innerHTML += `<button class="filter-btn" data-designer="Sin asignar" id="btn-metric-Sin-asignar"><span>Sin asignar</span><span class="bg-gray-200 px-2 py-1 rounded text-xs font-bold">${unassignedCount}</span></button>`;
    }
    
    designerList.forEach(name => {
        const safeId = name.replace(/[^a-zA-Z0-9]/g, '-');
        const count = allOrders.filter(o => o.departamento === 'P_Art' && o.designer === name).length;
        if (count > 0) {
            sidebarList.innerHTML += `<button class="filter-btn" data-designer="${escapeHTML(name)}" id="btn-metric-${safeId}"><span>${escapeHTML(name)}</span><span class="bg-gray-200 px-2 py-1 rounded text-xs font-bold">${count}</span></button>`;
        }
    });
}

function populateDesignerManagerModal() {
    const listDiv = document.getElementById('designerManagerList');
    if (!listDiv) return;
    listDiv.innerHTML = '';
    if (firebaseDesignersMap.size === 0) { listDiv.innerHTML = '<p class="text-gray-500 text-center">No hay diseñadores</p>'; return; }
    
    firebaseDesignersMap.forEach((data, docId) => {
        listDiv.innerHTML += `<div class="flex justify-between items-center p-3 border-b last:border-b-0 hover:bg-gray-50"><div class="leading-tight"><div class="font-medium text-gray-900">${escapeHTML(data.name)}</div><div class="text-xs text-gray-500">${escapeHTML(data.email || 'Sin correo')}</div></div><button class="btn-delete-designer text-red-600 hover:text-red-800 text-sm font-medium px-2 py-1 rounded hover:bg-red-50" data-name="${escapeHTML(data.name)}" data-id="${docId}">Eliminar</button></div>`;
    });
}

function openDesignerManager() {
    populateDesignerManagerModal(); 
    document.getElementById('designerManagerModal').classList.add('active');
    document.body.classList.add('modal-open');
}
function closeDesignerManager() {
    document.getElementById('designerManagerModal').classList.remove('active');
    checkAndCloseModalStack();
}

async function updateDashboard() {
    if (!isExcelLoaded) return;
    if (needsRecalculation) recalculateChildPieces();
    const artOrders = allOrders.filter(o => o.departamento === 'P_Art');
    const stats = calculateStats(artOrders);
    updateStats(stats); 
    updateAlerts(stats); 
    populateFilterDropdowns(); 
    updateTable(); 
    generateReports();
}

function updateTable() {
    const filtered = getFilteredOrders();
    const body = document.getElementById('tableBody');
    
    setupPagination(filtered);
    
    document.getElementById('resultCount').textContent = filtered.length;
    document.getElementById('totalCount').textContent = allOrders.length;
    document.getElementById('resultPieces').textContent = filtered.reduce((s,o)=>s+(o.cantidad||0)+(o.childPieces||0),0).toLocaleString();

    if (paginatedOrders.length === 0) {
        body.innerHTML = `<tr><td colspan="14" class="text-center py-12"><div class="flex flex-col items-center justify-center text-gray-400"><i class="fa-solid fa-magnifying-glass text-4xl mb-4 text-gray-300"></i><p class="text-lg font-medium">No se encontraron órdenes</p><p class="text-sm">Intenta ajustar los filtros o la búsqueda.</p><button onclick="clearAllFilters()" class="mt-4 text-blue-600 hover:underline font-medium">Limpiar filtros</button></div></td></tr>`;
    } else {
        body.innerHTML = paginatedOrders.map(order => {
            const hasChildren = order.childPieces > 0;
            const rowClass = order.isVeryLate ? 'very-late' : order.isLate ? 'late' : order.isAboutToExpire ? 'expiring' : '';
            const receivedDateStr = order.receivedDate ? order.receivedDate.split('-').reverse().join('/') : '-';

            return `
            <tr class="${rowClass} cursor-pointer transition-colors hover:bg-blue-50" onclick="openAssignModal('${order.orderId}')">
                <td class="px-6 py-4" data-label="Seleccionar" onclick="event.stopPropagation()">
                    ${order.departamento === 'P_Art' ? `<input type="checkbox" class="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" data-order-id="${order.orderId}" onchange="toggleOrderSelection('${order.orderId}')">` : ''}
                </td>
                <td class="px-6 py-4 whitespace-nowrap" data-label="Estado">${getStatusBadge(order)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900" data-label="Fecha">${formatDate(order.fechaDespacho)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium" data-label="Cliente" title="${escapeHTML(order.cliente)}">${escapeHTML(order.cliente)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-label="Código">${escapeHTML(order.codigoContrato)}${hasChildren ? '<span class="ml-1 text-blue-600 text-xs font-bold">(Hijas)</span>' : ''}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-label="Estilo" title="${escapeHTML(order.estilo)}">${escapeHTML(order.estilo)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-label="Team">${escapeHTML(order.teamName)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-xs" data-label="Depto"><span class="bg-gray-100 px-2 py-1 rounded border">${escapeHTML(order.departamento)}</span></td>
                <td class="px-6 py-4 whitespace-nowrap text-sm" data-label="Diseñador">${order.designer ? `<span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">${escapeHTML(order.designer)}</span>` : '<span class="text-gray-400 text-xs italic">Sin asignar</span>'}</td>
                <td class="px-6 py-4 whitespace-nowrap" data-label="Estado Orden">${getCustomStatusBadge(order.customStatus)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-label="Recibida">${receivedDateStr}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600" data-label="Cant.">${(order.cantidad||0).toLocaleString()}</td>
                <td class="px-6 py-4 text-center" data-label="Notas">${order.notes ? '📝' : '-'}</td>
                <td class="px-6 py-4 text-sm" data-label="Acción"><button class="text-blue-600 hover:underline font-medium">Editar</button></td>
            </tr>`;
        }).join('');
    }
    updateCheckboxes();
}

function getFilteredOrders() {
    let res = allOrders;
    if (currentSearch) {
        const s = currentSearch.toLowerCase();
        res = res.filter(o => (o.cliente||'').toLowerCase().includes(s) || (o.codigoContrato||'').toLowerCase().includes(s) || (o.estilo||'').toLowerCase().includes(s) || (o.designer||'').toLowerCase().includes(s));
    }
    if (currentClientFilter) res = res.filter(o => o.cliente === currentClientFilter);
    if (currentStyleFilter) res = res.filter(o => o.estilo === currentStyleFilter);
    if (currentTeamFilter) res = res.filter(o => o.teamName === currentTeamFilter);
    
    if (currentDepartamentoFilter) res = res.filter(o => o.departamento === currentDepartamentoFilter);
    else res = res.filter(o => o.departamento === 'P_Art'); 
    
    if (currentDesignerFilter) res = res.filter(o => o.designer === currentDesignerFilter);
    if (currentCustomStatusFilter) res = res.filter(o => o.customStatus === currentCustomStatusFilter);
    if (currentDateFrom) res = res.filter(o => o.fechaDespacho && o.fechaDespacho >= new Date(currentDateFrom + 'T00:00:00'));
    if (currentDateTo) res = res.filter(o => o.fechaDespacho && o.fechaDespacho <= new Date(currentDateTo + 'T23:59:59'));
    
    if (currentFilter === 'late') res = res.filter(o => o.isLate);
    else if (currentFilter === 'veryLate') res = res.filter(o => o.isVeryLate);
    else if (currentFilter === 'aboutToExpire') res = res.filter(o => o.isAboutToExpire);
    
    if (sortConfig.key) {
        res.sort((a,b) => {
            let va = a[sortConfig.key], vb = b[sortConfig.key];
            if (sortConfig.key === 'date') { va = a.fechaDespacho?.getTime()||0; vb = b.fechaDespacho?.getTime()||0; }
            if (sortConfig.key === 'status') { va = a.isVeryLate?4:a.isLate?3:a.isAboutToExpire?2:1; vb = b.isVeryLate?4:b.isLate?3:b.isAboutToExpire?2:1; }
            return (va < vb ? -1 : 1) * (sortConfig.direction === 'asc' ? 1 : -1);
        });
    }
    return res;
}

function getStatusBadge(order) {
    if (order.isVeryLate) return `<span class="bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs font-bold border border-red-200">MUY ATRASADA</span>`;
    if (order.isLate) return `<span class="bg-orange-100 text-orange-800 px-2 py-0.5 rounded text-xs font-bold border border-orange-200">ATRASADA</span>`;
    if (order.isAboutToExpire) return `<span class="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs font-bold border border-yellow-200">URGENTE</span>`;
    return `<span class="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-medium border border-green-200">A TIEMPO</span>`;
}

function getCustomStatusBadge(status) {
    const map = { 'Bandeja': 'bg-yellow-100 text-yellow-800', 'Producción': 'bg-purple-100 text-purple-800', 'Auditoría': 'bg-blue-100 text-blue-800', 'Completada': 'bg-gray-100 text-gray-600' };
    return status ? `<span class="${map[status] || 'bg-gray-100'} px-2 py-0.5 rounded text-xs font-bold border border-gray-200">${status}</span>` : '-';
}

function formatDate(date) { return date ? date.toLocaleDateString('es-ES', { timeZone: 'UTC' }) : '-'; }

function populateFilterDropdowns() {
    const populate = (id, key) => {
        const sel = document.getElementById(id);
        if(!sel) return;
        const opts = [...new Set(allOrders.map(o=>o[key]).filter(Boolean))].sort();
        sel.innerHTML = '<option value="">Todos</option>' + opts.map(o=>`<option value="${escapeHTML(o)}">${escapeHTML(o)}</option>`).join('');
        if (id==='clientFilter') sel.value = currentClientFilter; 
    };
    populate('clientFilter', 'cliente');
    populate('styleFilter', 'estilo');
    populate('teamFilter', 'teamName');
    populate('departamentoFilter', 'departamento');
    updateAllDesignerDropdowns();
}

function clearAllFilters() {
    currentSearch = '';
    currentClientFilter = '';
    currentStyleFilter = '';
    currentTeamFilter = '';
    currentDepartamentoFilter = ''; 
    currentDesignerFilter = '';
    currentCustomStatusFilter = '';
    currentDateFrom = '';
    currentDateTo = '';
    currentFilter = 'all';

    document.querySelectorAll('.filter-item select, .filter-item input').forEach(el => {
        el.value = '';
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';

    currentPage = 1;
    updateTable();
}

function setFilter(f) { currentFilter = f; currentPage = 1; updateDashboard(); }
function sortTable(k) { 
    sortConfig.direction = (sortConfig.key === k && sortConfig.direction === 'asc') ? 'desc' : 'asc';
    sortConfig.key = k; 
    updateTable(); 
}

function exportTableToExcel() {
    if (allOrders.length === 0) { showCustomAlert('No hay datos para exportar.', 'error'); return; }
    
    const filtered = getFilteredOrders();
    const dataToExport = filtered.map(o => ({
        "Cliente": o.cliente,
        "Código": o.codigoContrato,
        "Estilo": o.estilo,
        "Departamento": o.departamento,
        "Fecha Despacho": o.fechaDespacho ? o.fechaDespacho.toLocaleDateString() : '',
        "Diseñador": o.designer,
        "Estado Interno": o.customStatus,
        "Fecha Recibido": o.receivedDate,
        "Cantidad": o.cantidad,
        "Notas": o.notes
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ordenes Filtradas");
    XLSX.writeFile(wb, `Reporte_Panel_Arte_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function generateSummary() {
    const summaryBox = document.getElementById('summaryBox');
    if (!summaryBox) return;
    
    const stats = calculateStats(allOrders.filter(o => o.departamento === 'P_Art'));
    summaryBox.innerHTML = `
        <div class="flex justify-between items-center">
            <div>
                <h3 class="text-lg font-bold text-gray-800 flex items-center gap-2"><i class="fa-solid fa-chart-line text-blue-600"></i> Resumen General</h3>
                <p class="text-xs text-gray-500 mt-1">Actualizado: ${new Date().toLocaleTimeString()}</p>
            </div>
            <div class="flex gap-8">
                <div class="text-center"><div class="text-2xl font-bold text-blue-600">${stats.total}</div><div class="text-xs text-gray-500 uppercase font-bold tracking-wide">Órdenes</div></div>
                <div class="text-center"><div class="text-2xl font-bold text-purple-600">${stats.totalPieces.toLocaleString()}</div><div class="text-xs text-gray-500 uppercase font-bold tracking-wide">Piezas</div></div>
            </div>
        </div>`;
}

function generateWorkloadReport() {
    const s = {};
    designerList.forEach(d => s[d] = { c: 0, p: 0 });
    let t = 0;
    allOrders.forEach(o => {
        if (o.departamento === 'P_Art' && o.designer && s[o.designer]) {
            const p = (o.cantidad||0) + (o.childPieces||0);
            s[o.designer].c++; s[o.designer].p += p;
            if (o.designer !== EXCLUDE_DESIGNER_NAME) t += p;
        }
    });
    document.getElementById('workloadTotal').textContent = `${t.toLocaleString()} pzs`;
    const html = designerList.map(d => {
        const v = s[d];
        const pct = (t > 0 && d !== EXCLUDE_DESIGNER_NAME) ? ((v.p / t) * 100).toFixed(1) : 0;
        return `
        <div class="mb-3">
            <div class="flex justify-between text-sm mb-1">
                <span class="font-medium text-gray-700">${d}</span><span class="text-gray-600">${v.p.toLocaleString()} (${d===EXCLUDE_DESIGNER_NAME?'-':pct+'%'})</span>
            </div>
            <div class="h-2 bg-gray-100 rounded-full overflow-hidden"><div class="h-full bg-blue-500 rounded-full" style="width:${d===EXCLUDE_DESIGNER_NAME?0:pct}%"></div></div>
        </div>`;
    }).join('');
    document.getElementById('workloadList').innerHTML = html;
}

function generateReports() {
    generateWorkloadReport();
    const c = {};
    allOrders.forEach(o => { if(o.cliente) c[o.cliente] = (c[o.cliente]||0)+1; });
    const t = Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,10);
    document.getElementById('clientReport').innerHTML = t.map(([k,v], i) => `<div class="flex justify-between items-center border-b border-gray-100 py-2 last:border-0"><div class="flex items-center gap-2"><span class="text-xs font-bold text-gray-400 w-4">${i+1}</span><span class="text-sm text-gray-700 truncate max-w-[150px]" title="${k}">${k}</span></div><strong class="text-sm text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">${v}</strong></div>`).join('');
}

function openWeeklyReportModal() {
    document.getElementById('weeklyReportModal').classList.add('active');
    document.body.classList.add('modal-open');
}
function closeWeeklyReportModal() {
    document.getElementById('weeklyReportModal').classList.remove('active');
    checkAndCloseModalStack();
}
function destroyAllCharts() { if(designerDoughnutChart){designerDoughnutChart.destroy();designerDoughnutChart=null;} if(designerBarChart){designerBarChart.destroy();designerBarChart=null;} if(deptLoadPieChart){deptLoadPieChart.destroy();deptLoadPieChart=null;} if(deptLoadBarChart){deptLoadBarChart.destroy();deptLoadBarChart=null;} if(compareChart){compareChart.destroy();compareChart=null;} }

function showMetricsView() {
    document.getElementById('dashboard').style.display='none';
    document.getElementById('designerMetricsView').style.display='block';
    populateMetricsSidebar();
}
function hideMetricsView() {
    document.getElementById('designerMetricsView').style.display='none';
    document.getElementById('dashboard').style.display='block';
    destroyAllCharts();
}

function showDepartmentMetrics() {
    document.getElementById('dashboard').style.display='none';
    document.getElementById('departmentMetricsView').style.display='block';
    generateDepartmentMetrics();
}
function hideDepartmentMetrics() {
    document.getElementById('departmentMetricsView').style.display='none';
    document.getElementById('dashboard').style.display='block';
    destroyAllCharts();
}

function openCompareModal(n) {
    currentCompareDesigner1=n;
    document.getElementById('compareDesigner1Name').textContent=n;
    updateAllDesignerDropdowns();
    document.getElementById('selectCompareModal').classList.add('active');
    document.body.classList.add('modal-open');
}
function closeCompareModals() {
    document.getElementById('selectCompareModal').classList.remove('active');
    document.getElementById('compareModal').classList.remove('active');
    checkAndCloseModalStack();
    destroyAllCharts();
}

function startComparison() {
    const n2=document.getElementById('compareDesignerSelect').value;
    if(!n2) return;
    generateCompareReport(currentCompareDesigner1, n2);
}

function resetApp() {
    showConfirmModal("¿Subir nuevo Excel? Esto borrará los datos actuales.", () => {
        allOrders = [];
        isExcelLoaded = false;
        clearLocalData(); 
        
        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('uploadSection').style.display = 'block';
        document.getElementById('fileInput').value = '';
        document.getElementById('fileName').textContent = '';
        
        desconectarDatosDeFirebase();
    });
}

function showWorkPlanView() {
    document.getElementById('dashboard').style.display='none';
    document.getElementById('workPlanView').style.display='block';
    generateWorkPlan();
}
function hideWorkPlanView() {
    document.getElementById('workPlanView').style.display='none';
    document.getElementById('dashboard').style.display='block';
}

function openAddChildModal() {
    if(!currentEditingOrderId) return;
    const p=allOrders.find(o=>o.orderId===currentEditingOrderId);
    if(!p) return;
    document.getElementById('parentOrderInfo').textContent=`Padre: ${p.codigoContrato} - ${p.cliente}`;
    document.getElementById('childOrderCode').value=p.codigoContrato+'-';
    document.getElementById('childOrderNumber').value='';
    document.getElementById('childPieces').value='';
    document.getElementById('childDeliveryDate').value='';
    document.getElementById('childNotes').value='';
    document.getElementById('addChildModal').classList.add('active');
    document.body.classList.add('modal-open');
}

function updateChildOrderCode() {
    const p=allOrders.find(o=>o.orderId===currentEditingOrderId);
    if(!p) return;
    const n=document.getElementById('childOrderNumber').value;
    document.getElementById('childOrderCode').value=`${p.codigoContrato}-${n?n:''}`;
}

function closeAddChildModal() {
    document.getElementById('addChildModal').classList.remove('active');
    checkAndCloseModalStack();
}

function toggleOrderSelection(orderId) {
    if (selectedOrders.has(orderId)) selectedOrders.delete(orderId); else selectedOrders.add(orderId);
    updateMultiSelectBar(); updateCheckboxes();
}

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAll');
    const ordersOnPage = paginatedOrders.filter(o => o.departamento === 'P_Art').map(o => o.orderId);
    if (selectAllCheckbox.checked) ordersOnPage.forEach(id => selectedOrders.add(id));
    else ordersOnPage.forEach(id => selectedOrders.delete(id));
    updateMultiSelectBar(); updateCheckboxes();
}

function clearSelection() {
    selectedOrders.clear(); updateMultiSelectBar(); updateCheckboxes();
}

function updateMultiSelectBar() {
    const bar = document.getElementById('multiSelectBar');
    const count = document.getElementById('selectedCount');
    const pageCount = paginatedOrders.filter(o => selectedOrders.has(o.orderId)).length;
    if (selectedOrders.size > 0) {
        bar.classList.add('active'); 
        count.innerHTML = `${selectedOrders.size} <span class="text-xs font-normal text-gray-500">(${pageCount} en esta pág)</span>`;
    } else { bar.classList.remove('active'); }
}

function updateCheckboxes() {
    const checkboxes = document.querySelectorAll('tbody input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
        const orderId = checkbox.dataset.orderId;
        if (orderId) checkbox.checked = selectedOrders.has(orderId);
    });
    const selectAllCheckbox = document.getElementById('selectAll');
    const pArtOrdersOnPage = paginatedOrders.filter(o => o.departamento === 'P_Art');
    const allOnPageSelected = pArtOrdersOnPage.length > 0 && pArtOrdersOnPage.every(order => selectedOrders.has(order.orderId));
    if(selectAllCheckbox) {
        selectAllCheckbox.checked = allOnPageSelected;
        selectAllCheckbox.indeterminate = !allOnPageSelected && pArtOrdersOnPage.some(order => selectedOrders.has(order.orderId));
    }
}