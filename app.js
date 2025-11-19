/* ====================================================== */
/* ===== ESTILOS CSS - Estilo Salient (SaaS Moderno) ===== */
/* ====================================================== */

/* --- 1. Control de Modales (Animaciones Suaves) --- */
body.modal-open { overflow: hidden; }

.modal { 
    display: flex; 
    opacity: 0; 
    pointer-events: none; 
    transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1); /* Curva de animación estilo iOS */
    position: fixed; 
    inset: 0; 
    z-index: 1000; 
    align-items: center; 
    justify-content: center;
    /* El fondo oscuro se maneja con clases de Tailwind (bg-slate-900/50) */
}

.modal.active { 
    opacity: 1; 
    pointer-events: auto; 
}

.modal-content { 
    transform: scale(0.98) translateY(10px); 
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); 
    max-height: 90vh; 
    overflow-y: auto; 
    width: 100%;
    margin: auto;
    /* Scrollbar fino para el contenido del modal */
    scrollbar-width: thin;
}

.modal.active .modal-content { 
    transform: scale(1) translateY(0); 
}

/* --- 2. Barra de Selección Múltiple (Efecto Flotante) --- */
.multi-select-bar {
    position: fixed;
    bottom: 2rem; 
    left: 50%;
    transform: translateX(-50%) translateY(200%); /* Oculto abajo */
    opacity: 0;
    pointer-events: none; 
    transition: all 0.5s cubic-bezier(0.19, 1, 0.22, 1); /* Animación de entrada elástica */
    z-index: 50;
}

.multi-select-bar.active {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
    pointer-events: auto; 
}

/* --- 3. Tablas Estilo Salient (Personalización Fina) --- */
/* Separamos los bordes para permitir bordes redondeados en las filas */
table.data-table {
    border-collapse: separate; 
    border-spacing: 0; 
}

table.data-table th {
    background-color: #F8FAFC; /* slate-50 */
    color: #475569; /* slate-600 */
    font-weight: 600;
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #E2E8F0; /* slate-200 */
    white-space: nowrap;
}

table.data-table td {
    border-bottom: 1px solid #F1F5F9; /* slate-100 */
    vertical-align: middle;
    color: #334155; /* slate-700 */
    transition: background-color 0.1s;
}

/* Hover suave en las filas */
table.data-table tr:hover td {
    background-color: #F8FAFC; /* slate-50 */
}

/* Badge Styles (Etiquetas de estado) */
.status-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.625rem;
    border-radius: 9999px;
    font-size: 0.7rem;
    font-weight: 600;
    line-height: 1;
}

/* --- 4. Utilerías de Animación --- */
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.fade-in { animation: fadeIn 0.3s ease-out forwards; }

/* --- 5. Spinner de Carga --- */
.spinner {
    border: 3px solid #E2E8F0; 
    border-top: 3px solid #2563EB; /* Azul primario */
    border-radius: 50%;
    width: 32px; height: 32px; 
    animation: spin 0.8s linear infinite; 
    margin: 0 auto 1rem;
}
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

.loading-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(255,255,255,0.8); 
    backdrop-filter: blur(4px); /* Efecto borroso de fondo */
    display: flex; align-items: center;
    justify-content: center; z-index: 9999; flex-direction: column;
}
.loading-overlay p {
    color: #1e293b; font-weight: 500; margin-top: 10px;
}

/* --- 6. Scrollbars Modernos (Webkit) --- */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #94A3B8; }

/* --- 7. Overrides para Tabla Responsiva (Mobile Cards) --- */
/* En móviles, transformamos la tabla en tarjetas individuales */
@media (max-width: 768px) {
    table.data-table, .data-table thead, .data-table tbody, .data-table th, .data-table td, .data-table tr { 
        display: block; 
    }
    /* Ocultar cabecera original */
    .data-table thead tr { position: absolute; top: -9999px; left: -9999px; }
    
    /* Estilo de tarjeta para la fila */
    .data-table tr { 
        margin-bottom: 1rem; 
        border: 1px solid #E2E8F0; 
        border-radius: 1rem; 
        background: white;
        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
        padding: 0.5rem;
    }
    
    .data-table td { 
        border: none;
        border-bottom: 1px solid #F1F5F9; 
        position: relative;
        padding-left: 40% !important; /* Espacio para la etiqueta */
        text-align: right;
        min-height: 30px;
        font-size: 0.875rem;
    }
    
    .data-table td:last-child { border-bottom: none; }
    
    /* Pseudo-elemento para la etiqueta del dato (data-label) */
    .data-table td:before { 
        position: absolute; top: 12px; left: 12px; width: 35%; 
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        font-weight: 600; color: #64748B; text-align: left;
        content: attr(data-label); 
        font-size: 0.75rem;
        text-transform: uppercase;
    }
    
    /* Ajuste especial para el checkbox en móvil */
    .data-table td:first-child { 
        padding-left: 1rem !important; 
        text-align: left; 
        background: #F8FAFC; 
        border-radius: 0.5rem; 
        margin-bottom: 0.5rem;
    }
    .data-table td:first-child:before { display: none; }
}// ======================================================
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
        btn.innerHTML = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Guardando...`;
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

// === MODAL DE CONFIRMACIÓN MEJORADO ===
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
    
    // Clonar botón para eliminar listeners previos
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
    document.getElementById('confirmStrictInput').value = ''; 
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
    console.log('DOM cargado. Inicializando App v5.2 (Final UX - Corregido)...');
    
    safeAddEventListener('loginButton', 'click', iniciarLoginConGoogle);
    safeAddEventListener('logoutButton', 'click', iniciarLogout);

    firebase.auth().onAuthStateChanged((user) => {
        const loginSection = document.getElementById('loginSection');
        const uploadSection = document.getElementById('uploadSection');
        const dashboard = document.getElementById('dashboard');

        if (user) {
            usuarioActual = user;
            console.log("Usuario conectado:", usuarioActual.displayName);
            document.getElementById('userName').textContent = usuarioActual.displayName;
            
            loginSection.style.display = 'none';
            if (!isExcelLoaded) {
                uploadSection.style.display = 'block'; 
            } else {
                dashboard.style.display = 'block'; 
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

    // --- EVENTO KEYDOWN (ESCAPE) ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // 1. Prioridad: Cerrar modales críticos, alertas y confirmaciones
            closeConfirmModal();
            const legendModal = document.getElementById('legendModal');
            if (legendModal) legendModal.classList.remove('active');

            // 2. Solo gestionamos el cierre de vistas si el Excel ya fue cargado
            if (isExcelLoaded) {
                closeModal(); 
                closeMultiModal(); 
                closeWeeklyReportModal();
                closeDesignerManager();
                closeAddChildModal();
                
                // Cierre inteligente de vistas
                const compareModal = document.getElementById('compareModal');
                if (compareModal && compareModal.classList.contains('active')) closeCompareModals();

                const workPlan = document.getElementById('workPlanView');
                if (workPlan && workPlan.style.display !== 'none') hideWorkPlanView();

                const metricsView = document.getElementById('designerMetricsView');
                if (metricsView && metricsView.style.display !== 'none') hideMetricsView();

                const deptView = document.getElementById('departmentMetricsView');
                if (deptView && deptView.style.display !== 'none') hideDepartmentMetrics();
            }
        }
        
        // Atajo Guardar (Ctrl+S)
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault(); 
            const assignModal = document.getElementById('assignModal');
            const multiAssignModal = document.getElementById('multiAssignModal');
            
            if (assignModal && assignModal.classList.contains('active')) {
                saveAssignment();
            } else if (multiAssignModal && multiAssignModal.classList.contains('active')) {
                saveMultiAssignment();
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
            order.designer = ''; order.customStatus = ''; order.receivedDate = ''; order.notes = ''; order.completedDate = null;
        }

        // Lógica de Auto-Completado
        if (fbData && 
            (fbData.customStatus === 'Bandeja' || fbData.customStatus === 'Producción' || fbData.customStatus === 'Auditoría') &&
            order.departamento !== 'P_Art' && order.departamento !== 'Sin Departamento') 
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
    if (autoCompleteBatchWrites.length > 0) ejecutarAutoCompleteBatch();
}

// ======================================================
// ===== FUNCIONES CRUD DE FIREBASE =====
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
    const childRef = db_firestore.collection('childOrders').doc(childOrder.childOrderId);
    return await childRef.set(childOrder);
}

async function deleteChildOrderFromDB(childOrderId) {
    const childRef = db_firestore.collection('childOrders').doc(childOrderId);
    return await childRef.delete();
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
        await db_firestore.collection('designers').add({ 
            name: name, email: email, createdAt: new Date().toISOString(), schemaVersion: DB_SCHEMA_VERSION 
        });
        nameInput.value = ''; emailInput.value = '';
        showCustomAlert(`Usuario "${name}" agregado correctamente.`, 'success');
    } catch (error) { showCustomAlert(`Error al agregar: ${error.message}`, 'error'); logToFirestore('designer:add', error); }
}

async function deleteDesigner(docId, name) {
    if (!firebaseDesignersMap.has(docId)) {
        showCustomAlert('El diseñador no existe.', 'error');
        return;
    }

    const ordersToUpdate = allOrders.filter(o => o.designer === name && o.departamento === 'P_Art');
    let message = `¿Eliminar a "${name}"?`;
    let strict = false;
    
    if (ordersToUpdate.length > 0) {
        message += `\n⚠️ TIENE ${ordersToUpdate.length} ÓRDENES ASIGNADAS.\nPara confirmar, escribe "CONFIRMAR".`;
        strict = true;
    }

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
                    chunk.forEach(oid => {
                        const docRef = db_firestore.collection('assignments').doc(oid);
                        batch.update(docRef, { designer: '' });
                    });
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
        planEntryId: planEntryId,
        orderId: order.orderId,
        weekIdentifier: weekIdentifier,
        designer: order.designer,
        planStatus: 'Pendiente', 
        addedAt: new Date().toISOString(),
        cliente: order.cliente,
        codigoContrato: order.codigoContrato,
        estilo: order.estilo,
        fechaDespacho: order.fechaDespacho ? new Date(order.fechaDespacho).toISOString() : null,
        cantidad: order.cantidad,
        childPieces: order.childPieces,
        isLate: order.isLate,
        isAboutToExpire: order.isAboutToExpire,
        schemaVersion: DB_SCHEMA_VERSION
    };
    await planRef.set(planEntry);
    return true; 
}

async function removeOrderFromWorkPlanDB(planEntryId) {
    const planRef = db_firestore.collection('weeklyPlan').doc(planEntryId);
    return await planRef.delete();
}

async function logToFirestore(context, error) {
    if (!usuarioActual) return;
    const errorMessage = (error instanceof Error) ? error.message : String(error);
    try {
        await db_firestore.collection('logs').add({
            timestamp: new Date().toISOString(),
            user: usuarioActual.displayName || usuarioActual.email,
            context: context,
            message: errorMessage,
            severity: 'ERROR'
        });
    } catch (e) {
        console.error("Fallo al loguear error:", e);
    }
}

// ======================================================
// ===== LÓGICA DE MANEJO DE EXCEL =====
// ======================================================

function handleDrop(e){ const dt = e.dataTransfer; handleFiles(dt.files); }
function handleFileSelect(e){ handleFiles(e.target.files); }

// --- FUNCIÓN CORREGIDA PARA EVITAR ERROR NULL ---
function handleFiles(files){
    if (!files || files.length === 0) return;
    const file = files[0];
    
    // Verificación de seguridad para actualizar el nombre del archivo
    const fileNameElement = document.getElementById('fileName');
    if (fileNameElement) {
        fileNameElement.textContent = file.name;
    }
    
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
        let currentClient = ""; let currentContrato = ""; let currentStyle = ""; let currentTeam = "";
        
        autoCompleteBatchWrites = [];

        for (const row of rows) {
            if (!row || row.length === 0 || row.every(c => c === "" || c === null)) continue;
            const lowerRow = row.slice(0, 4).map(c => String(c).toLowerCase());
            if (lowerRow.some(c => c.includes('total') || c.includes('subtotal') || c.includes('grand'))) continue;

            if (colIndices.fecha >= 0 && row[colIndices.fecha] !== "" && row[colIndices.fecha] !== null) {
                const rawFecha = row[colIndices.fecha];
                let deliveryDate = null;
                if (typeof rawFecha === 'number') {
                    deliveryDate = new Date((rawFecha - 25569) * 86400 * 1000);
                } else {
                    const d = new Date(rawFecha);
                    if (!isNaN(d)) deliveryDate = d;
                }
                if (deliveryDate && !isNaN(deliveryDate)) {
                    deliveryDate = new Date(Date.UTC(deliveryDate.getFullYear(), deliveryDate.getMonth(), deliveryDate.getDate()));
                    currentDate = deliveryDate;
                }
            }
            if (colIndices.cliente >= 0 && row[colIndices.cliente]) currentClient = String(row[colIndices.cliente]).trim();
            if (colIndices.codigo >= 0 && row[colIndices.codigo]) currentContrato = String(row[colIndices.codigo]).trim();
            if (colIndices.estilo >= 0 && row[colIndices.estilo]) currentStyle = String(row[colIndices.estilo]).trim();
            if (colIndices.team >= 0 && row[colIndices.team]) currentTeam = String(row[colIndices.team]).trim();

            if (!currentClient || !currentContrato) continue;

            let orderCantidad = 0;
            let orderDepartamento = "";
            
            for (let i = departmentIndices.length - 1; i >= 0; i--) {
                const col = departmentIndices[i];
                const rawValue = row[col.index];
                if (rawValue !== "" && rawValue !== null) {
                    const n = Number(String(rawValue).replace(/,|\s/g, ''));
                    if (!isNaN(n) && n > 0) { orderCantidad = n; orderDepartamento = col.name; break; }
                }
            }
            if (orderCantidad <= 0) { orderCantidad = 0; orderDepartamento = "Sin Departamento"; }

            const fechaDespacho = currentDate ? new Date(currentDate) : null;
            const orderId = `${currentClient}_${currentContrato}_${fechaDespacho ? fechaDespacho.getTime() : 'nodate'}_${currentStyle}`;

            const today = new Date(); today.setHours(0,0,0,0);
            let daysLate = 0;
            const isLate = fechaDespacho && fechaDespacho < today;
            if (isLate) {
                const diffTime = today.getTime() - fechaDespacho.getTime();
                daysLate = Math.ceil(diffTime / (1000*60*60*24));
            }
            const isVeryLate = daysLate > 7;
            const isAboutToExpire = fechaDespacho && !isLate && ((fechaDespacho.getTime() - today.getTime()) / (1000*60*60*24)) <= 2;
            
            const fbData = firebaseAssignmentsMap.get(orderId);
            let currentStatus = fbData ? fbData.customStatus : '';
            let currentCompletedDate = fbData ? fbData.completedDate : null;

            if (fbData && (fbData.customStatus === 'Bandeja' || fbData.customStatus === 'Producción' || fbData.customStatus === 'Auditoría') && orderDepartamento !== 'P_Art' && orderDepartamento !== 'Sin Departamento') {
                if (fbData.customStatus !== 'Completada' && !autoCompletedOrderIds.has(orderId)) {
                    currentStatus = 'Completada';
                    currentCompletedDate = new Date().toISOString();
                    autoCompleteBatchWrites.push({
                        orderId: orderId,
                        data: { customStatus: 'Completada', completedDate: currentCompletedDate, lastModified: new Date().toISOString(), schemaVersion: DB_SCHEMA_VERSION },
                        history: [`Estado automático: ${fbData.customStatus} → Completada (movido a ${orderDepartamento})`]
                    });
                    autoCompletedOrderIds.add(orderId);
                }
            }

            processedOrders.push({
                orderId, fechaDespacho, cliente: currentClient, codigoContrato: currentContrato,
                estilo: currentStyle, teamName: currentTeam, departamento: orderDepartamento,
                cantidad: orderCantidad, childPieces: 0, isLate, daysLate, isVeryLate, isAboutToExpire,
                designer: fbData ? fbData.designer : '', customStatus: currentStatus,
                receivedDate: fbData ? fbData.receivedDate : '', notes: fbData ? fbData.notes : '',
                completedDate: currentCompletedDate
            });
        }

        allOrders = processedOrders;
        isExcelLoaded = true; 
        console.log(`✅ Órdenes procesadas del Excel: ${allOrders.length}`);
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
// ===== LÓGICA DE ÓRDENES HIJAS =====
// ======================================================

async function recalculateChildPieces() {
    if (!needsRecalculation) return;
    let tempChildPiecesCache = new Map();
    firebaseChildOrdersMap.forEach((childList, parentId) => {
        const totalPieces = childList.reduce((sum, child) => sum + (child.cantidad || 0), 0);
        tempChildPiecesCache.set(parentId, totalPieces);
    });
    for (const order of allOrders) {
        order.childPieces = tempChildPiecesCache.get(order.orderId) || 0;
    }
    needsRecalculation = false;
}

function openAddChildModal() {
    if (!currentEditingOrderId) return;
    const parentOrder = allOrders.find(o => o.orderId === currentEditingOrderId);
    if (!parentOrder) return;
    
    document.getElementById('parentOrderInfo').textContent = `Padre: ${parentOrder.codigoContrato} - ${parentOrder.cliente}`;
    document.getElementById('childOrderCode').value = parentOrder.codigoContrato + '-';
    document.getElementById('childOrderNumber').value = '';
    document.getElementById('childPieces').value = '';
    document.getElementById('childDeliveryDate').value = '';
    document.getElementById('childNotes').value = '';
    
    document.getElementById('addChildModal').classList.add('active');
    document.body.classList.add('modal-open');
}

function updateChildOrderCode() {
    const parentOrder = allOrders.find(o => o.orderId === currentEditingOrderId);
    if (!parentOrder) return;
    
    const childNumber = document.getElementById('childOrderNumber').value;
    document.getElementById('childOrderCode').value = `${parentOrder.codigoContrato}-${childNumber ? childNumber : ''}`;
}

async function saveChildOrder() {
    try {
        if (!currentEditingOrderId) return;
        
        const childNumber = document.getElementById('childOrderNumber').value;
        const childPieces = parseInt(document.getElementById('childPieces').value);
        const childDeliveryDate = document.getElementById('childDeliveryDate').value;
        const childNotes = document.getElementById('childNotes').value;
        
        if (!childNumber || childNumber < 1) { showCustomAlert('Ingresa un número válido.', 'error'); return; }
        if (!childPieces || childPieces < 1) { showCustomAlert('Ingresa la cantidad.', 'error'); return; }
        
        const parentOrder = allOrders.find(o => o.orderId === currentEditingOrderId);
        
        const childCode = `${parentOrder.codigoContrato}-${childNumber}`;
        const deliveryDate = childDeliveryDate ? new Date(childDeliveryDate + 'T00:00:00Z') 
            : (parentOrder.fechaDespacho ? new Date(parentOrder.fechaDespacho) : new Date());

        const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const childOrder = {
            childOrderId: `${parentOrder.orderId}_child_${uniqueSuffix}`,
            parentOrderId: parentOrder.orderId,
            childCode: childCode,
            cliente: parentOrder.cliente,
            estilo: parentOrder.estilo,
            teamName: parentOrder.teamName,
            designer: parentOrder.designer,
            customStatus: parentOrder.customStatus,
            fechaDespacho: deliveryDate,
            cantidad: childPieces,
            notes: childNotes,
            createdAt: new Date().toISOString()
        };
        
        await saveChildOrderToDB(childOrder);
        await saveAssignmentToDB_Firestore(parentOrder.orderId, {}, [`Orden hija creada: ${childCode}`]);

        closeAddChildModal();
        showCustomAlert(`Orden hija ${childCode} creada.`, 'success');
    } catch (error) { console.error('Error en saveChildOrder:', error); showCustomAlert(`Error: ${error.message}`, 'error'); logToFirestore('child:save', error); }
}

async function deleteChildOrder(childOrderId, childCode) {
    showConfirmModal(`¿Eliminar orden hija ${childCode}?`, async () => {
        try {
            await deleteChildOrderFromDB(childOrderId);
            await saveAssignmentToDB_Firestore(currentEditingOrderId, {}, [`Orden hija eliminada: ${childCode}`]);
        } catch (e) { showCustomAlert(e.message, 'error'); }
    });
}

function closeAddChildModal() {
    document.getElementById('addChildModal').classList.remove('active');
    checkAndCloseModalStack(); 
}

async function loadChildOrders() {
    try {
        if (!currentEditingOrderId) return;
        const childOrders = firebaseChildOrdersMap.get(currentEditingOrderId) || [];
        
        document.getElementById('childOrderCount').textContent = childOrders.length;
        const list = document.getElementById('childOrdersList');
        
        if (childOrders.length === 0) { list.innerHTML = '<p class="text-gray-400 text-xs text-center">Sin órdenes hijas</p>'; return; }
        
        list.innerHTML = childOrders.map(child => {
            const date = child.fechaDespacho ? new Date(child.fechaDespacho) : null;
            const isLate = date && date < new Date().setHours(0,0,0,0);
            return `<div class="bg-white p-2 rounded border text-xs mb-1 flex justify-between items-center">
                <div>
                    <strong class="text-blue-600">${escapeHTML(child.childCode)}</strong><br>
                    <span class="${isLate?'text-red-600':'text-green-600'}">${child.cantidad} pzs - ${date ? formatDate(date) : '-'}</span>
                </div>
                <button class="btn-delete-child text-red-600 hover:text-red-800 px-2" data-child-id="${child.childOrderId}" data-child-code="${child.childCode}">✕</button>
            </div>`;
        }).join('');
    } catch (e) { console.error(e); }
}

// ======================================================
// ===== LÓGICA DE ASIGNACIÓN =====
// ======================================================

window.openAssignModal = async function(orderId) {
    currentEditingOrderId = orderId;
    const order = allOrders.find(o => o.orderId === orderId);
    if (!order) return;
    
    document.getElementById('detailCliente').textContent = order.cliente || '-';
    document.getElementById('detailCodigo').textContent = order.codigoContrato || '-';
    document.getElementById('detailEstilo').textContent = order.estilo || '-';
    document.getElementById('detailDepartamento').textContent = order.departamento || '-';
    document.getElementById('detailFecha').textContent = formatDate(order.fechaDespacho);
    
    const totalPieces = (order.cantidad || 0) + (order.childPieces || 0);
    document.getElementById('detailPiezas').textContent = `${order.cantidad.toLocaleString()} (+${order.childPieces} hijas) = ${totalPieces.toLocaleString()} pzs`;
    
    document.getElementById('modalDesigner').value = order.designer || '';
    document.getElementById('modalStatus').value = order.customStatus || '';
    document.getElementById('modalReceivedDate').value = order.receivedDate || '';
    document.getElementById('modalNotes').value = order.notes || '';
    
    const isPArt = order.departamento === 'P_Art';
    document.getElementById('modalDesigner').disabled = !isPArt;
    document.getElementById('modalStatus').disabled = !isPArt;
    document.getElementById('addChildOrderBtn').disabled = !isPArt;

    const history = firebaseHistoryMap.get(orderId) || [];
    document.getElementById('modalHistory').innerHTML = history.length 
        ? history.map(h => `<div class="text-xs border-b py-1"><span class="text-gray-500">${new Date(h.timestamp).toLocaleDateString()}</span> - ${escapeHTML(h.change)}</div>`).join('') 
        : '<p class="text-gray-400 text-xs text-center">Sin historial</p>';
    
    await loadChildOrders();
    document.getElementById('assignModal').classList.add('active');
    document.body.classList.add('modal-open');
}

window.closeModal = function() {
    document.getElementById('assignModal').classList.remove('active');
    checkAndCloseModalStack(); 
    currentEditingOrderId = null;
}

async function asignarmeAmi() {
    if (!usuarioActual) return;
    document.getElementById('modalDesigner').value = usuarioActual.displayName;
}

window.saveAssignment = async function() {
    if (!currentEditingOrderId) return;
    setButtonLoading('saveAssignmentButton', true);
    
    try {
        const order = allOrders.find(o => o.orderId === currentEditingOrderId);
        const newDesigner = document.getElementById('modalDesigner').value;
        const newStatus = document.getElementById('modalStatus').value;
        const newReceivedDate = document.getElementById('modalReceivedDate').value;
        const newNotes = document.getElementById('modalNotes').value;

        if (newReceivedDate && !/^\d{4}-\d{2}-\d{2}$/.test(newReceivedDate)) {
            showCustomAlert('Formato de fecha inválido (YYYY-MM-DD).', 'error');
            return;
        }

        let changes = [];
        let dataToSave = {};

        if (order.designer !== newDesigner) { changes.push(`Diseñador: ${order.designer} -> ${newDesigner}`); dataToSave.designer = newDesigner; }
        if (order.customStatus !== newStatus) { 
            changes.push(`Estado: ${order.customStatus} -> ${newStatus}`); 
            dataToSave.customStatus = newStatus;
            if(newStatus === 'Completada') dataToSave.completedDate = new Date().toISOString();
        }
        if (order.receivedDate !== newReceivedDate) { changes.push(`Fecha: ${newReceivedDate}`); dataToSave.receivedDate = newReceivedDate; }
        if (order.notes !== newNotes) { changes.push(`Notas actualizadas`); dataToSave.notes = newNotes; }

        if (changes.length > 0) {
            await saveAssignmentToDB_Firestore(currentEditingOrderId, dataToSave, changes);
            showCustomAlert('Guardado.', 'success');
            closeModal();
        } else { showCustomAlert('Sin cambios.', 'info'); }
    } catch (e) { showCustomAlert(e.message, 'error'); logToFirestore('saveAssignment', e); } finally { setButtonLoading('saveAssignmentButton', false); }
}

function openMultiAssignModal() {
    if (selectedOrders.size === 0) return;
    document.getElementById('multiModalCount').textContent = selectedOrders.size;
    document.getElementById('multiAssignModal').classList.add('active');
    document.body.classList.add('modal-open');
}
function closeMultiModal() {
    document.getElementById('multiAssignModal').classList.remove('active');
    checkAndCloseModalStack(); 
}

async function saveMultiAssignment() {
    if (selectedOrders.size === 0) return;
    setButtonLoading('saveMultiAssignmentButton', true);

    try {
        const newDesigner = document.getElementById('multiModalDesigner').value;
        const newStatus = document.getElementById('multiModalStatus').value;
        const newDate = document.getElementById('multiModalReceivedDate').value;
        const newNotes = document.getElementById('multiModalNotes').value;

        const batch = db_firestore.batch();
        let count = 0;

        selectedOrders.forEach(orderId => {
            const order = allOrders.find(o => o.orderId === orderId);
            if(order && order.departamento === 'P_Art') {
                const ref = db_firestore.collection('assignments').doc(orderId);
                let update = { schemaVersion: DB_SCHEMA_VERSION };
                if(newDesigner) update.designer = newDesigner;
                if(newStatus) update.customStatus = newStatus;
                if(newDate) update.receivedDate = newDate;
                if(newNotes) update.notes = (order.notes ? order.notes + '\n' : '') + newNotes; // Append note
                
                batch.set(ref, update, { merge: true });
                count++;
            }
        });

        if(count > 0) await batch.commit();
        closeMultiModal();
        clearSelection();
        showCustomAlert(`${count} órdenes actualizadas.`, 'success');
    } catch (e) { showCustomAlert(e.message, 'error'); logToFirestore('saveMulti', e); } finally { setButtonLoading('saveMultiAssignmentButton', false); }
}
// ======================================================
// ===== LÓGICA DE UI (GENERAL) =====
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
    
    if (sidebarList.innerHTML === '') sidebarList.innerHTML = '<p class="text-gray-500 text-center text-sm">No hay diseñadores con órdenes activas</p>';
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
    if(selectAllCheckbox) {
        const pArtOrdersOnPage = paginatedOrders.filter(o => o.departamento === 'P_Art');
        
        if (pArtOrdersOnPage.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.disabled = true; 
        } else {
            selectAllCheckbox.disabled = false;
            const allSelected = pArtOrdersOnPage.every(order => selectedOrders.has(order.orderId));
            const someSelected = pArtOrdersOnPage.some(order => selectedOrders.has(order.orderId));
            
            selectAllCheckbox.checked = allSelected;
            selectAllCheckbox.indeterminate = !allSelected && someSelected;
        }
    }
}

function getWeekIdentifierString(d) {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    var week1 = new Date(date.getFullYear(), 0, 4);
    var week = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function addSelectedToWorkPlan() {
    if (selectedOrders.size === 0) return;
    const weekIdentifier = getWeekIdentifierString(new Date());
    let addedCount = 0;
    for (const orderId of selectedOrders) {
        const order = allOrders.find(o => o.orderId === orderId);
        if (order && order.departamento === 'P_Art' && order.designer) {
            if (await addOrderToWorkPlanDB(order, weekIdentifier)) addedCount++;
        }
    }
    showCustomAlert(`Se agregaron ${addedCount} órdenes al plan ${weekIdentifier}.`, 'success');
    clearSelection();
}

function setupPagination(filteredOrders) {
    const totalItems = filteredOrders.length;
    const totalPages = Math.ceil(totalItems / rowsPerPage);
    if (currentPage > totalPages) currentPage = totalPages || 1;
    if (currentPage < 1) currentPage = 1;
    const start = (currentPage - 1) * rowsPerPage;
    paginatedOrders = filteredOrders.slice(start, start + rowsPerPage);
    document.getElementById('currentPage').textContent = currentPage;
    document.getElementById('totalPages').textContent = totalPages || 1;
    renderPaginationControls(totalPages);
}

function renderPaginationControls(totalPages) {
    const controlsDiv = document.getElementById('paginationControls');
    if (!controlsDiv) return;
    let html = `<button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>&laquo;</button>`;
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) { html += `<button onclick="changePage(${i})" class="${i === currentPage ? 'active' : ''}">${i}</button>`; }
    html += `<button onclick="changePage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>&raquo;</button>`;
    controlsDiv.innerHTML = html;
}
window.changePage = function(page) { currentPage = page; updateTable(); }
window.changeRowsPerPage = function() { rowsPerPage = parseInt(document.getElementById('rowsPerPage').value); currentPage = 1; updateTable(); }

async function updateDashboard() {
    if (!isExcelLoaded) return;
    if (needsRecalculation) recalculateChildPieces();
    const artOrders = allOrders.filter(o => o.departamento === 'P_Art');
    const stats = calculateStats(artOrders);
    updateStats(stats); updateAlerts(stats); populateFilterDropdowns(); updateTable(); generateReports();
}

function calculateStats(orders) {
    const today = new Date(); today.setHours(0,0,0,0);
    const weekEnd = new Date(today); weekEnd.setDate(today.getDate()+7);
    return {
        total: orders.length,
        totalPieces: orders.reduce((s, o) => s + (o.cantidad||0) + (o.childPieces||0), 0),
        late: orders.filter(o => o.isLate).length,
        veryLate: orders.filter(o => o.isVeryLate).length,
        aboutToExpire: orders.filter(o => o.isAboutToExpire).length,
        onTime: orders.filter(o => !o.isLate && !o.isAboutToExpire).length,
        thisWeek: orders.filter(o => o.fechaDespacho && o.fechaDespacho >= today && o.fechaDespacho <= weekEnd).length
    };
}

function updateStats(stats) {
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statTotalPieces').textContent = stats.totalPieces.toLocaleString();
    document.getElementById('statLate').textContent = stats.late;
    document.getElementById('statExpiring').textContent = stats.aboutToExpire;
    document.getElementById('statOnTime').textContent = stats.onTime;
    document.getElementById('statThisWeek').textContent = stats.thisWeek;
}

function updateAlerts(stats) {
    const div = document.getElementById('alerts');
    div.innerHTML = '';
    if (stats.veryLate > 0) div.innerHTML += `<div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 shadow-sm rounded-r"><strong>URGENTE:</strong> ${stats.veryLate} muy atrasadas.</div>`;
    else if (stats.aboutToExpire > 0) div.innerHTML += `<div class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4 shadow-sm rounded-r"><strong>ATENCIÓN:</strong> ${stats.aboutToExpire} vencen pronto.</div>`;
}

function updateTable() {
    const filtered = getFilteredOrders();
    const body = document.getElementById('tableBody');
    
    setupPagination(filtered);
    
    document.getElementById('resultCount').textContent = filtered.length;
    document.getElementById('totalCount').textContent = allOrders.length;
    document.getElementById('resultPieces').textContent = filtered.reduce((s,o)=>s+(o.cantidad||0)+(o.childPieces||0),0).toLocaleString();

    if (paginatedOrders.length === 0) {
        body.innerHTML = `
            <tr>
                <td colspan="14" class="text-center py-12">
                    <div class="flex flex-col items-center justify-center text-gray-400">
                        <i class="fa-solid fa-magnifying-glass text-4xl mb-4 text-gray-300"></i>
                        <p class="text-lg font-medium">No se encontraron órdenes</p>
                        <p class="text-sm">Intenta ajustar los filtros o la búsqueda.</p>
                        <button onclick="clearAllFilters()" class="mt-4 text-blue-600 hover:underline font-medium">Limpiar filtros</button>
                    </div>
                </td>
            </tr>`;
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
function formatDate(date) {
    return date ? date.toLocaleDateString('es-ES', { timeZone: 'UTC' }) : '-';
}
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

// === NUEVA FUNCIONALIDAD: Exportar a Excel ===
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
                <h3 class="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <i class="fa-solid fa-chart-line text-blue-600"></i> Resumen General
                </h3>
                <p class="text-xs text-gray-500 mt-1">Actualizado: ${new Date().toLocaleTimeString()}</p>
            </div>
            <div class="flex gap-8">
                <div class="text-center">
                    <div class="text-2xl font-bold text-blue-600">${stats.total}</div>
                    <div class="text-xs text-gray-500 uppercase font-bold tracking-wide">Órdenes</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-purple-600">${stats.totalPieces.toLocaleString()}</div>
                    <div class="text-xs text-gray-500 uppercase font-bold tracking-wide">Piezas</div>
                </div>
            </div>
        </div>`;
}

function generateWorkloadReport() {
    const designerStats = {};
    designerList.forEach(d => designerStats[d] = { orders: 0, pieces: 0 });
    let total = 0;
    allOrders.forEach(o => {
        if (o.departamento === 'P_Art' && o.designer && designerStats[o.designer]) {
            const p = (o.cantidad||0) + (o.childPieces||0);
            designerStats[o.designer].orders++;
            designerStats[o.designer].pieces += p;
            if (o.designer !== EXCLUDE_DESIGNER_NAME) total += p;
        }
    });
    document.getElementById('workloadTotal').textContent = `${total.toLocaleString()} pzs`;
    const html = designerList.map(d => {
        const s = designerStats[d];
        const isEx = d === EXCLUDE_DESIGNER_NAME;
        const pct = (total > 0 && !isEx) ? ((s.pieces/total)*100).toFixed(1) : 0;
        return `
        <div class="mb-3">
            <div class="flex justify-between text-sm mb-1">
                <span class="font-medium text-gray-700">${d}</span>
                <span class="text-gray-600">${s.pieces.toLocaleString()} (${isEx?'-':pct+'%'})</span>
            </div>
            <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full bg-blue-500 rounded-full" style="width:${isEx?0:pct}%"></div>
            </div>
        </div>`;
    }).join('');
    document.getElementById('workloadList').innerHTML = html;
}

function generateReports() {
    generateWorkloadReport();
    const clients = {};
    allOrders.forEach(o => { if(o.cliente) clients[o.cliente] = (clients[o.cliente]||0)+1; });
    const top = Object.entries(clients).sort((a,b)=>b[1]-a[1]).slice(0,10);
    document.getElementById('clientReport').innerHTML = top.map(([c,n], i) => `
        <div class="flex justify-between items-center border-b border-gray-100 py-2 last:border-0">
            <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-gray-400 w-4">${i+1}</span>
                <span class="text-sm text-gray-700 truncate max-w-[150px]" title="${c}">${c}</span>
            </div>
            <strong class="text-sm text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">${n}</strong>
        </div>`).join('');
}

function openWeeklyReportModal() {
    document.getElementById('weeklyReportModal').classList.add('active');
    document.body.classList.add('modal-open');
}
function closeWeeklyReportModal() {
    document.getElementById('weeklyReportModal').classList.remove('active');
    checkAndCloseModalStack();
}

function destroyAllCharts() {
    if (designerDoughnutChart) { designerDoughnutChart.destroy(); designerDoughnutChart = null; }
    if (designerBarChart) { designerBarChart.destroy(); designerBarChart = null; }
    if (designerActivityChart) { designerActivityChart.destroy(); designerActivityChart = null; }
    if (deptLoadPieChart) { deptLoadPieChart.destroy(); deptLoadPieChart = null; }
    if (deptLoadBarChart) { deptLoadBarChart.destroy(); deptLoadBarChart = null; }
    if (deptProductivityChart) { deptProductivityChart.destroy(); deptProductivityChart = null; }
    if (compareChart) { compareChart.destroy(); compareChart = null; }
}

function showMetricsView() {
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('designerMetricsView').style.display = 'block';
    populateMetricsSidebar();
}
function hideMetricsView() {
    document.getElementById('designerMetricsView').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    destroyAllCharts(); 
}

function showDepartmentMetrics() {
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('departmentMetricsView').style.display = 'block';
    generateDepartmentMetrics();
}
function hideDepartmentMetrics() {
    document.getElementById('departmentMetricsView').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    destroyAllCharts(); 
}

function openCompareModal(name1) {
    currentCompareDesigner1 = name1;
    document.getElementById('compareDesigner1Name').textContent = name1;
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
    const name2 = document.getElementById('compareDesignerSelect').value;
    if(!name2) return;
    generateCompareReport(currentCompareDesigner1, name2);
}

function resetApp() {
    showConfirmModal("¿Subir nuevo Excel? Se limpiarán los datos locales.", () => {
        allOrders = []; isExcelLoaded = false;
        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('uploadSection').style.display = 'block';
        document.getElementById('fileInput').value = '';
        document.getElementById('fileName').textContent = '';
        desconectarDatosDeFirebase(); 
    });
}

function showWorkPlanView() {
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('workPlanView').style.display = 'block';
    generateWorkPlan(); 
}
function hideWorkPlanView() {
    document.getElementById('workPlanView').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
}

function getWeekDateRange(year, week) {
    const d = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 1 - day); 
    const startDate = new Date(d);
    const endDate = new Date(d);
    endDate.setUTCDate(endDate.getUTCDate() + 6); 
    return { startDate, endDate };
}

function generateWeeklyReport() {
    const spinner = document.getElementById('weeklyReportSpinner');
    const contentDiv = document.getElementById('weeklyReportContent');
    spinner.style.display = 'block'; contentDiv.innerHTML = ''; 

    setTimeout(() => {
        try {
            const weekValue = document.getElementById('weekSelector').value;
            if (!weekValue) { contentDiv.innerHTML = '<p class="text-center py-4 text-gray-500">Por favor, selecciona una semana.</p>'; spinner.style.display = 'none'; return; }
            
            const [year, week] = weekValue.split('-W').map(Number);
            const { startDate, endDate } = getWeekDateRange(year, week);
            endDate.setUTCHours(23, 59, 59, 999);

            const filteredOrders = allOrders.filter(order => {
                if (!order.receivedDate) return false;
                const receivedDate = new Date(order.receivedDate + 'T00:00:00Z'); // ✅ CORRECCIÓN: Agregar UTC
                return receivedDate >= startDate && receivedDate <= endDate;
            });

            let reportHTML = `<h4 class="text-lg font-semibold text-gray-800 mt-4 mb-4 border-b pb-2">Semana: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}</h4><div class="table-container border rounded-lg overflow-hidden mt-4 max-h-96 overflow-y-auto"><table id="weeklyReportTable" class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-50"><tr><th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Diseñador</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Piezas</th></tr></thead><tbody class="bg-white divide-y divide-gray-200">`;

            if (filteredOrders.length > 0) {
                filteredOrders.sort((a,b) => new Date(a.receivedDate) - new Date(b.receivedDate));
                let totalPieces = 0;
                filteredOrders.forEach(order => {
                    const p = (order.cantidad || 0) + (order.childPieces || 0);
                    totalPieces += p;
                    reportHTML += `<tr><td class="px-4 py-2 text-sm">${new Date(order.receivedDate + 'T00:00:00Z').toLocaleDateString()}</td><td class="px-4 py-2 text-sm font-medium">${escapeHTML(order.cliente)}</td><td class="px-4 py-2 text-sm text-gray-500">${escapeHTML(order.codigoContrato)}</td><td class="px-4 py-2 text-sm">${escapeHTML(order.designer) || '-'}</td><td class="px-4 py-2 text-sm font-bold text-gray-800">${p.toLocaleString()}</td></tr>`;
                });
                reportHTML += `<tr class="bg-gray-100 font-bold"><td colspan="4" class="px-4 py-2 text-right">Total:</td><td class="px-4 py-2">${totalPieces.toLocaleString()}</td></tr>`;
            } else { reportHTML += '<tr><td colspan="5" class="text-center py-12 text-gray-400"><i class="fa-regular fa-folder-open text-2xl mb-2 block"></i>No hay órdenes recibidas esta semana.</td></tr>'; }
            reportHTML += `</tbody></table></div>`;
            contentDiv.innerHTML = reportHTML;
        } catch (e) { console.error(e); contentDiv.innerHTML = '<p class="text-red-500">Error generando reporte.</p>'; }
        finally { spinner.style.display = 'none'; }
    }, 50);
}

async function generateDesignerMetrics(designerName) {
    const contentDiv = document.getElementById('metricsDetail');
    contentDiv.innerHTML = '<div class="spinner"></div><p class="text-center mt-4 text-gray-500">Cargando métricas...</p>';
    
    destroyAllCharts(); 
    currentDesignerTableFilter = { search: '', cliente: '', estado: '', fechaDesde: '', fechaHasta: '' };
    
    document.querySelectorAll('#metricsSidebarList .filter-btn').forEach(btn => btn.classList.remove('active'));
    const safeId = designerName.replace(/[^a-zA-Z0-9]/g, '-');
    const btn = document.getElementById(`btn-metric-${safeId}`);
    if(btn) btn.classList.add('active');

    const isUnassigned = designerName === 'Sin asignar';
    const designerOrders = allOrders.filter(o => o.departamento === 'P_Art' && (isUnassigned ? !o.designer : o.designer === designerName));
    
    setTimeout(() => {
        const safeName = escapeHTML(designerName);
        contentDiv.innerHTML = `
            <div class="flex justify-between items-center mb-6 border-b pb-4">
                <h2 class="text-2xl font-bold text-gray-800">${safeName}</h2>
                <div class="flex gap-2">
                    <button class="px-3 py-2 bg-green-600 text-white rounded shadow text-sm hover:bg-green-700 transition" onclick="exportDesignerMetricsPDF('${safeName.replace(/'/g, "\\'")}')"><i class="fa-solid fa-file-pdf mr-1"></i> PDF</button>
                    <button class="px-3 py-2 bg-white border rounded shadow text-sm hover:bg-gray-50 transition" onclick="openCompareModal('${safeName.replace(/'/g, "\\'")}')"><i class="fa-solid fa-scale-balanced mr-1"></i> Comparar</button>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div class="chart-container h-64 bg-white p-4 rounded-lg shadow-sm border border-gray-100 relative">
                    <canvas id="designerDoughnutChartCanvas"></canvas>
                </div>
                <div class="chart-container h-64 bg-white p-4 rounded-lg shadow-sm border border-gray-100 relative">
                    <canvas id="designerBarChartCanvas"></canvas>
                </div>
            </div>
            <div id="designerOrdersTableContainer" class="mt-6"></div>
        `;
        renderDesignerOrdersTable(designerName);
        initDesignerCharts(designerOrders);
    }, 100);
}

function renderDesignerOrdersTable(designerName) {
    const container = document.getElementById('designerOrdersTableContainer');
    if (!container) return;
    const isUnassigned = designerName === 'Sin asignar';
    let orders = allOrders.filter(o => (isUnassigned ? !o.designer : o.designer === designerName) && o.departamento === 'P_Art');
    
    let html = `<div class="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
        <table class="min-w-full divide-y divide-gray-200 text-sm">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-4 py-3 text-left font-semibold text-gray-600 uppercase text-xs">Estado</th>
                    <th class="px-4 py-3 text-left font-semibold text-gray-600 uppercase text-xs">Cliente</th>
                    <th class="px-4 py-3 text-left font-semibold text-gray-600 uppercase text-xs">Estilo</th>
                    <th class="px-4 py-3 text-left font-semibold text-gray-600 uppercase text-xs">Piezas</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">`;
            
    if (orders.length === 0) html += `<tr><td colspan="4" class="p-8 text-center text-gray-400">Sin órdenes activas</td></tr>`;
    else {
        orders.forEach(o => { 
            html += `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-4 py-2">${getStatusBadge(o)}</td>
                <td class="px-4 py-2 font-medium">${escapeHTML(o.cliente)}</td>
                <td class="px-4 py-2 text-gray-500">${escapeHTML(o.estilo)}</td>
                <td class="px-4 py-2 font-bold text-blue-600">${((o.cantidad||0)+(o.childPieces||0)).toLocaleString()}</td>
            </tr>`; 
        });
    }
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function initDesignerCharts(orders) {
    const statusCounts = { 'Bandeja': 0, 'Producción': 0, 'Auditoría': 0, 'Completada': 0, 'Sin estado': 0 };
    const piecesCounts = { 'Bandeja': 0, 'Producción': 0, 'Auditoría': 0, 'Completada': 0, 'Sin estado': 0 };
    orders.forEach(o => {
        const s = o.customStatus || 'Sin estado';
        const p = (o.cantidad||0) + (o.childPieces||0);
        if(statusCounts[s] !== undefined) { statusCounts[s]++; piecesCounts[s] += p; }
    });
    const colors = ['#F59E0B', '#8B5CF6', '#3B82F6', '#10B981', '#6B7280']; 
    
    if (designerDoughnutChart) { designerDoughnutChart.destroy(); designerDoughnutChart = null; }
    if (designerBarChart) { designerBarChart.destroy(); designerBarChart = null; }

    const ctx1 = document.getElementById('designerDoughnutChartCanvas')?.getContext('2d');
    if (ctx1) {
        designerDoughnutChart = new Chart(ctx1, {
            type: 'doughnut',
            data: { labels: Object.keys(statusCounts), datasets: [{ data: Object.values(statusCounts), backgroundColor: colors }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Órdenes por Estado' }, legend: { position: 'right' } } }
        });
    }
    const ctx2 = document.getElementById('designerBarChartCanvas')?.getContext('2d');
    if (ctx2) {
        designerBarChart = new Chart(ctx2, {
            type: 'bar',
            data: { labels: Object.keys(piecesCounts), datasets: [{ label: 'Piezas', data: Object.values(piecesCounts), backgroundColor: colors }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Carga de Piezas' }, legend: {display: false} }, scales: { y: { beginAtZero: true } } }
        });
    }
}

function generateCompareReport(name1, name2) {
    const pArt = allOrders.filter(o => o.departamento === 'P_Art');
    const o1 = pArt.filter(o => o.designer === name1);
    const o2 = pArt.filter(o => o.designer === name2);
    const s1 = calculateStats(o1);
    const s2 = calculateStats(o2);
    
    document.getElementById('compareTableContainer').innerHTML = `
        <table class="min-w-full divide-y divide-gray-200 mt-4 text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-4 py-3 font-bold text-gray-700">Métrica</th>
                    <th class="px-4 py-3 font-bold text-gray-700">${escapeHTML(name1)}</th>
                    <th class="px-4 py-3 font-bold text-gray-700">${escapeHTML(name2)}</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white">
                <tr><td class="px-4 py-3 text-gray-600">Total Órdenes</td><td class="px-4 py-3 text-center font-bold value-a">${s1.total}</td><td class="px-4 py-3 text-center font-bold value-b">${s2.total}</td></tr>
                <tr><td class="px-4 py-3 text-gray-600">Total Piezas</td><td class="px-4 py-3 text-center text-blue-600 font-bold value-a">${s1.totalPieces.toLocaleString()}</td><td class="px-4 py-3 text-center text-blue-600 font-bold value-b">${s2.totalPieces.toLocaleString()}</td></tr>
                <tr><td class="px-4 py-3 text-gray-600">Atrasadas</td><td class="px-4 py-3 text-center text-red-600 font-bold value-a">${s1.late}</td><td class="px-4 py-3 text-center text-red-600 font-bold value-b">${s2.late}</td></tr>
            </tbody>
        </table>`;
    
    const ctx = document.getElementById('compareChartCanvas').getContext('2d');
    if(compareChart) compareChart.destroy();
    compareChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: ['Total Piezas', 'Atrasadas'], datasets: [{ label: name1, data: [s1.totalPieces, s1.late], backgroundColor: 'rgba(59, 130, 246, 0.7)' }, { label: name2, data: [s2.totalPieces, s2.late], backgroundColor: 'rgba(245, 158, 11, 0.7)' }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
    document.getElementById('selectCompareModal').classList.remove('active');
    document.getElementById('compareModal').classList.add('active');
}

function exportWeeklyReportAsPDF() {
    try {
        const table = document.getElementById('weeklyReportTable');
        if (!table) { showCustomAlert('No hay datos para exportar.', 'error'); return; }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const weekText = document.getElementById('weekSelector').value;
        doc.text(`Reporte Semanal: ${weekText}`, 14, 15);
        doc.autoTable({ html: '#weeklyReportTable', startY: 20, theme: 'grid' });
        doc.save(`Reporte_${weekText}.pdf`);
    } catch (e) { console.error(e); showCustomAlert('Error al exportar PDF.', 'error'); }
}

function exportDesignerMetricsPDF(name) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.text(`Métricas: ${name}`, 14, 15);
        doc.setFontSize(10);
        doc.text(`Generado: ${new Date().toLocaleDateString()}`, 14, 22);
        const orders = allOrders.filter(o => o.designer === name && o.departamento === 'P_Art');
        const rows = orders.map(o => [o.cliente, o.codigoContrato, o.estilo, o.customStatus, (o.cantidad + o.childPieces).toLocaleString()]);
        doc.autoTable({ head: [['Cliente', 'Código', 'Estilo', 'Estado', 'Piezas']], body: rows, startY: 30 });
        doc.save(`Metricas_${name.replace(/\s/g,'_')}.pdf`);
    } catch (e) { console.error(e); showCustomAlert('Error exportando PDF.', 'error'); }
}

function generateDepartmentMetrics() {
    const contentDiv = document.getElementById('departmentMetricsContent');
    if (!contentDiv) return;
    destroyAllCharts(); 
    contentDiv.innerHTML = '<div class="spinner"></div><p class="text-center text-gray-500 mt-4">Calculando métricas globales...</p>';
    setTimeout(() => {
        const activeOrders = allOrders.filter(o => o.departamento === 'P_Art');
        const totalOrders = activeOrders.length;
        const totalPieces = activeOrders.reduce((sum, o) => sum + (o.cantidad || 0) + (o.childPieces || 0), 0);
        const statusCounts = { 'Bandeja': 0, 'Producción': 0, 'Auditoría': 0, 'Completada': 0, 'Sin estado': 0 };
        activeOrders.forEach(o => {
            const s = o.customStatus || 'Sin estado';
            if (statusCounts[s] !== undefined) statusCounts[s]++; else statusCounts['Sin estado']++;
        });
        const designerLoad = {};
        activeOrders.forEach(o => {
            if (o.designer && o.designer !== EXCLUDE_DESIGNER_NAME) {
                if (!designerLoad[o.designer]) designerLoad[o.designer] = 0;
                designerLoad[o.designer] += (o.cantidad || 0) + (o.childPieces || 0);
            }
        });

        contentDiv.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"><div class="bg-white p-6 rounded-lg shadow border-l-4 border-blue-600"><h3 class="text-gray-500 text-xs uppercase font-bold tracking-wider">Órdenes Activas</h3><p class="text-3xl font-bold text-gray-900 mt-2">${totalOrders}</p></div><div class="bg-white p-6 rounded-lg shadow border-l-4 border-purple-600"><h3 class="text-gray-500 text-xs uppercase font-bold tracking-wider">Piezas Totales</h3><p class="text-3xl font-bold text-gray-900 mt-2">${totalPieces.toLocaleString()}</p></div><div class="bg-white p-6 rounded-lg shadow border-l-4 border-green-600"><h3 class="text-gray-500 text-xs uppercase font-bold tracking-wider">Diseñadores Activos</h3><p class="text-3xl font-bold text-gray-900 mt-2">${Object.keys(designerLoad).length}</p></div></div><div class="grid grid-cols-1 lg:grid-cols-2 gap-6"><div class="bg-white p-4 rounded-lg shadow border border-gray-100"><h4 class="font-bold mb-4 text-gray-700">Distribución por Estado</h4><div class="h-64"><canvas id="deptLoadPieChartCanvas"></canvas></div></div><div class="bg-white p-4 rounded-lg shadow border border-gray-100"><h4 class="font-bold mb-4 text-gray-700">Carga por Diseñador (Piezas)</h4><div class="h-64"><canvas id="deptLoadBarChartCanvas"></canvas></div></div></div>`;

        const ctxPie = document.getElementById('deptLoadPieChartCanvas').getContext('2d');
        deptLoadPieChart = new Chart(ctxPie, {
            type: 'pie',
            data: { labels: Object.keys(statusCounts), datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#F59E0B', '#8B5CF6', '#3B82F6', '#10B981', '#9CA3AF'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
        });
        const ctxBar = document.getElementById('deptLoadBarChartCanvas').getContext('2d');
        const sortedDesigners = Object.entries(designerLoad).sort((a,b) => b[1] - a[1]);
        deptLoadBarChart = new Chart(ctxBar, {
            type: 'bar',
            data: { labels: sortedDesigners.map(d => d[0]), datasets: [{ label: 'Piezas Asignadas', data: sortedDesigners.map(d => d[1]), backgroundColor: '#3B82F6' }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } }
        });
    }, 100);
}

function generateWorkPlan() {
    const container = document.getElementById('view-workPlanContent');
    const weekInput = document.getElementById('view-workPlanWeekSelector');
    const summarySpan = document.getElementById('view-workPlanSummary');
    if (!weekInput.value) weekInput.value = getWeekIdentifierString(new Date());
    const weekIdentifier = weekInput.value;
    container.innerHTML = '<div class="spinner"></div>';

    const planData = firebaseWeeklyPlanMap.get(weekIdentifier) || [];

    setTimeout(() => {
        if (planData.length === 0) {
            container.innerHTML = `<div class="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300"><i class="fa-solid fa-calendar-xmark text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 mb-2 font-medium">El plan para la semana ${weekIdentifier} está vacío.</p><p class="text-xs text-gray-400">Usa el botón "Cargar Urgentes" o selecciona órdenes desde el Dashboard.</p></div>`;
            summarySpan.textContent = '0 órdenes'; return;
        }

        let totalPieces = 0;
        let html = `<div class="bg-white rounded-lg shadow overflow-hidden border border-gray-200"><table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-50"><tr><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prioridad</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente / Estilo</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Diseñador</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entrega</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Piezas</th><th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acción</th></tr></thead><tbody class="bg-white divide-y divide-gray-200">`;

        planData.sort((a, b) => (a.isLate === b.isLate) ? 0 : a.isLate ? -1 : 1);

        planData.forEach(item => {
            const pieces = (item.cantidad || 0) + (item.childPieces || 0);
            totalPieces += pieces;
            const statusBadge = item.isLate ? '<span class="bg-red-100 text-red-800 text-xs px-2 py-1 rounded font-bold">ATRASADA</span>' : item.isAboutToExpire ? '<span class="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded font-bold">URGENTE</span>' : '<span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Normal</span>';
            html += `<tr class="hover:bg-gray-50 transition"><td class="px-6 py-4 whitespace-nowrap">${statusBadge}</td><td class="px-6 py-4"><div class="text-sm font-medium text-gray-900">${escapeHTML(item.cliente)}</div><div class="text-xs text-gray-500">${escapeHTML(item.codigoContrato)} - ${escapeHTML(item.estilo)}</div></td><td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${escapeHTML(item.designer || 'Sin asignar')}</td><td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.fechaDespacho ? new Date(item.fechaDespacho).toLocaleDateString() : '-'}</td><td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-700">${pieces.toLocaleString()}</td><td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"><button class="text-red-600 hover:text-red-900 btn-remove-from-plan transition-colors" data-plan-entry-id="${item.planEntryId}" data-order-code="${item.codigoContrato}"><i class="fa-solid fa-trash"></i></button></td></tr>`;
        });
        html += `</tbody></table></div>`;
        container.innerHTML = html;
        summarySpan.textContent = `${planData.length} órdenes | ${totalPieces.toLocaleString()} piezas`;
    }, 50);
}

async function loadUrgentOrdersToPlan() {
    const weekInput = document.getElementById('view-workPlanWeekSelector');
    if (!weekInput.value) { showCustomAlert('Selecciona una semana primero.', 'error'); return; }
    const weekIdentifier = weekInput.value;
    const urgentOrders = allOrders.filter(o => o.departamento === 'P_Art' && (o.isLate || o.isAboutToExpire));
    if (urgentOrders.length === 0) { showCustomAlert('No hay órdenes urgentes o atrasadas en este momento.', 'info'); return; }
    
    const batch = db_firestore.batch(); 
    let batchCount = 0;
    const toProcess = urgentOrders.slice(0, 400);
    for (const order of toProcess) {
        const planEntryId = `${order.orderId}_${weekIdentifier}`;
        const ref = db_firestore.collection('weeklyPlan').doc(planEntryId);
        batch.set(ref, {
            planEntryId: planEntryId, orderId: order.orderId, weekIdentifier: weekIdentifier, designer: order.designer,
            planStatus: 'Pendiente', addedAt: new Date().toISOString(), cliente: order.cliente, codigoContrato: order.codigoContrato,
            estilo: order.estilo, fechaDespacho: order.fechaDespacho ? order.fechaDespacho.toISOString() : null,
            cantidad: order.cantidad, childPieces: order.childPieces, isLate: order.isLate, isAboutToExpire: order.isAboutToExpire,
            schemaVersion: DB_SCHEMA_VERSION
        }, { merge: true });
        batchCount++;
    }
    if (batchCount > 0) {
        try { await batch.commit(); showCustomAlert(`Se cargaron ${batchCount} órdenes urgentes al plan.`, 'success'); } 
        catch (e) { console.error(e); showCustomAlert('Error al cargar urgentes.', 'error'); }
    }
}

async function removeOrderFromPlan(planEntryId, orderCode) {
    if (!confirm(`¿Quitar la orden ${orderCode} del plan?`)) return;
    try { await removeOrderFromWorkPlanDB(planEntryId); showCustomAlert('Orden quitada del plan.', 'success'); } 
    catch (e) { showCustomAlert('Error al quitar orden.', 'error'); }
}