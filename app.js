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
let currentPlanView = 'list'; 

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
let pendingRejection = null; 
let batchProcessing = false; 

// Suscripciones de Firebase
let unsubscribeAssignments = null;
let unsubscribeHistory = null;
let unsubscribeChildOrders = null;
let unsubscribeDesigners = null;
let unsubscribeWeeklyPlan = null;
let unsubscribeNotifications = null;
let unsubscribeChat = null;
let unsubscribeQualityLogs = null;

// Mapas de Datos
let masterOrdersMap = new Map();
let firebaseAssignmentsMap = new Map();
let firebaseHistoryMap = new Map();
let firebaseChildOrdersMap = new Map();
let firebaseDesignersMap = new Map(); 
let firebaseWeeklyPlanMap = new Map();
let firebaseQualityLogsMap = new Map();

// Gráficos
let designerDoughnutChart = null;
let designerBarChart = null;
let deptLoadPieChart = null;
let deptLoadBarChart = null;
let compareChart = null;
let qualityParetoChart = null;
let qualityDesignerChart = null;
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
    if (modalId === 'assignModal' && unsubscribeChat) {
        unsubscribeChat();
        unsubscribeChat = null;
    }
    if (modalStack.length === 0) document.body.classList.remove('modal-open');
}

function closeAllModals() {
    document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
    modalStack.length = 0;
    document.body.classList.remove('modal-open');
    if (unsubscribeChat) { unsubscribeChat(); unsubscribeChat = null; }
}

document.addEventListener('keydown', (e) => { 
    if (e.key === 'Escape' && modalStack.length > 0) closeTopModal(); 
});

window.closeModal = () => closeTopModal(); 
window.closeConfirmModal = () => closeTopModal(); 
window.closeMultiModal = () => closeTopModal(); 
window.closeAddChildModal = () => closeTopModal(); 
window.closeDesignerManager = () => closeTopModal(); 
window.closeCompareModals = () => closeAllModals(); 
window.closeWeeklyReportModal = () => closeTopModal(); 

// ======================================================
// ===== 3. UTILIDADES =====
// ======================================================

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
    
    // Actualizar gráficos activos
    const visibleView = document.querySelector('.main-view[style*="display: block"]');
    if (visibleView) {
        if (visibleView.id === 'designerMetricsView' && typeof generateDesignerMetrics === 'function') {
            const btn = document.querySelector('#metricsSidebarList .active');
            if (btn) generateDesignerMetrics(btn.dataset.designer);
        } else if (visibleView.id === 'departmentMetricsView' && typeof generateDepartmentMetrics === 'function') {
            generateDepartmentMetrics();
        } else if (visibleView.id === 'qualityView' && typeof updateQualityView === 'function') {
            updateQualityView();
        }
    }
};

function requireAdmin() {
    if (userRole !== 'admin') {
        showCustomAlert('Acceso denegado: Solo administradores.', 'error');
        return false;
    }
    return true;
}

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
function escapeHTML(str) { return !str ? '' : String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&gt;').replace(/"/g, '&quot;'); }
function formatDate(d) { return d ? d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'; }
function getWeekIdentifierString(d) { const date = new Date(d.getTime()); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7); var week1 = new Date(date.getFullYear(), 0, 4); return `${date.getFullYear()}-W${String(1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)).padStart(2, '0')}`; }
async function createNotification(recipientEmail, type, title, message, orderId) { try { await db_firestore.collection('notifications').add({ recipientEmail: recipientEmail.toLowerCase().trim(), type, title, message, orderId, read: false, timestamp: new Date().toISOString() }); } catch (e) { console.error("Error notify:", e); } }

// ======================================================
// ===== 4. INICIALIZACIÓN Y AUTH =====
// ======================================================

window.iniciarLoginConGoogle = () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider)
        .then((result) => { showCustomAlert(`Bienvenido, ${result.user.displayName}`, 'success'); })
        .catch((error) => { console.error("Error Login:", error); showCustomAlert(`Error de acceso: ${error.message}`, 'error'); });
};

window.iniciarLogout = () => {
    firebase.auth().signOut()
        .then(() => { showCustomAlert('Sesión cerrada.', 'info'); })
        .catch((error) => { console.error("Error Logout:", error); });
};

window.updateAllHeaders = (user, statusType = 'offline') => {
    const nameEls = document.querySelectorAll('[id="navUserName"]');
    const statusEls = document.querySelectorAll('[id="navDbStatus"]');
    const nameText = user ? (user.displayName || 'Usuario') : 'Usuario';
    nameEls.forEach(el => el.textContent = nameText);

    let statusHtml = '';
    if (statusType === 'connected') statusHtml = `<span class="w-1.5 h-1.5 rounded-full bg-green-500"></span> Conectado`;
    else if (statusType === 'syncing') statusHtml = `<span class="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span> Sincronizando...`;
    else statusHtml = `<span class="w-1.5 h-1.5 rounded-full bg-red-500"></span> Desconectado`;
    statusEls.forEach(el => el.innerHTML = statusHtml);
};

// --- INICIALIZACIÓN DEL DOM ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('App v7.5 Loaded (Fixed Roles)');

    initTheme(); 

    // Inicialización asíncrona de Sidebar
    setTimeout(() => {
        const sidebarBtn = document.getElementById('sidebarToggleBtn');
        if (localStorage.getItem('sidebarState') === 'collapsed') {
            document.body.classList.add('sidebar-collapsed');
        }
        if (sidebarBtn) {
            sidebarBtn.addEventListener('click', () => {
                document.body.classList.toggle('sidebar-collapsed');
                const isCollapsed = document.body.classList.contains('sidebar-collapsed');
                localStorage.setItem('sidebarState', isCollapsed ? 'collapsed' : 'expanded');
            });
        }
    }, 0);

    const btnLogin = document.getElementById('loginButton');
    if(btnLogin) btnLogin.addEventListener('click', window.iniciarLoginConGoogle);

    const btnLogout = document.getElementById('logoutNavBtn');
    if(btnLogout) btnLogout.addEventListener('click', window.iniciarLogout);

    // --- LISTENER DE AUTH Y ROLES ---
    firebase.auth().onAuthStateChanged((user) => {
        const login = document.getElementById('loginSection');
        const upload = document.getElementById('uploadSection');
        const main = document.getElementById('appMainContainer');
        const nav = document.getElementById('mainNavigation');

        if (user) {
            usuarioActual = user;
            window.updateAllHeaders(user, 'syncing'); 

            // 1. Obtener Rol y Configurar UI
            const userEmail = user.email.toLowerCase();
            db_firestore.collection('users').doc(userEmail).get().then((doc) => {
                if (doc.exists) {
                    userRole = doc.data().role || 'user';
                } else {
                    userRole = 'user';
                }
                
                // Aplicar permisos visuales (Ocultar menú a Auditores)
                applyRolePermissions(userRole);

            }).catch((err) => {
                console.warn("Error obteniendo rol:", err);
                userRole = 'user';
                applyRolePermissions('user');
            });

            login.style.display = 'none';
            if (!isExcelLoaded) {
                upload.style.display = 'block'; main.style.display = 'none'; nav.style.display = 'none'; main.classList.remove('main-content-shifted');
            } else {
                upload.style.display = 'block'; main.style.display = 'block'; nav.style.display = 'flex'; main.classList.add('main-content-shifted');
                setTimeout(() => { document.getElementById('mainNavigation').style.transform = 'translateX(0)'; }, 50);
            }
            conectarDatosDeFirebase();
        } else {
            desconectarDatosDeFirebase(); 
            usuarioActual = null; isExcelLoaded = false; userRole = 'user';
            window.updateAllHeaders(null, 'offline');
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
        dropZone.addEventListener('drop', (e) => { 
            dropZone.classList.remove('border-blue-500','bg-blue-50'); 
            handleFiles(e.dataTransfer.files); 
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleFiles(e.target.files);
            e.target.value = ''; 
        });
    }

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

// ✅ FUNCIÓN ÚNICA DE GESTIÓN DE PERMISOS
function applyRolePermissions(role) {
    // 1. Lista de todos los elementos de navegación
    const navIds = [
        'nav-dashboard', 'nav-kanbanView', 'nav-workPlanView', 
        'nav-qualityView', 'nav-designerMetricsView', 'nav-departmentMetricsView', 
        'nav-manageTeam', 'nav-adminRoles', 'nav-resetApp'
    ];

    // 2. Resetear visibilidad (mostrar todo por defecto)
    navIds.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'flex';
    });

    // 3. Aplicar restricciones según Rol
    if (role === 'auditor') {
        // El auditor NO puede ver estas vistas:
        const hideForAuditor = [
            'nav-dashboard', 'nav-workPlanView', 'nav-designerMetricsView', 
            'nav-departmentMetricsView', 'nav-manageTeam', 'nav-adminRoles', 'nav-resetApp'
        ];
        
        hideForAuditor.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.style.display = 'none';
        });

        // Redirección forzada si entra en Dashboard
        const currentView = document.querySelector('.main-view[style*="display: block"]');
        if (!currentView || currentView.id === 'dashboard') {
            navigateTo('kanbanView');
        }

    } else if (role === 'user') {
        // Usuario normal no ve paneles administrativos
        ['nav-manageTeam', 'nav-adminRoles', 'nav-resetApp'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.style.display = 'none';
        });
    }
}

// ======================================================
// ===== 5. LÓGICA DE DATOS (FIREBASE LISTENERS & SYNC) =====
// ======================================================

function conectarDatosDeFirebase() {
    if (!usuarioActual) return;

    const setStatus = (connected) => {
        if (typeof window.updateAllHeaders === 'function') {
            window.updateAllHeaders(usuarioActual, connected ? 'connected' : 'syncing');
        }
    };

    setStatus(false); 

    // Carga inicial de maestros + Listeners
    loadMasterOrders().then(() => {
        console.log("Datos maestros listos.");
        setupRealtimeListeners(setStatus);
    });
}

// A. CARGA DE DATOS MAESTROS (Excel subido previamente)
async function loadMasterOrders() {
    try {
        const snapshot = await db_firestore.collection('master_orders').get();

        masterOrdersMap.clear();
        snapshot.forEach(doc => {
            masterOrdersMap.set(doc.id, doc.data());
        });

        masterOrdersLoaded = true;
        isExcelLoaded = masterOrdersMap.size > 0; 

        if (masterOrdersMap.size > 0) {
            rebuildAllOrders(); 

            document.getElementById('uploadSection').style.display = 'none';
            document.getElementById('appMainContainer').style.display = 'block';
            document.getElementById('appMainContainer').classList.add('main-content-shifted');
            document.getElementById('mainNavigation').style.display = 'flex';
            setTimeout(() => document.getElementById('mainNavigation').style.transform = 'translateX(0)', 50);

            if (typeof navigateTo === 'function') navigateTo('dashboard');
        }

    } catch (e) {
        console.error("Error cargando master_orders:", e);
        showCustomAlert("Error cargando base de datos maestra.", "error");
    }
}

// ✅ CORRECCIÓN #2: Limpieza de listeners previos para evitar Memory Leaks
function setupRealtimeListeners(statusCallback) {

    // 1. Asignaciones
    if (unsubscribeAssignments) unsubscribeAssignments();
    unsubscribeAssignments = db_firestore.collection('assignments').onSnapshot(s => {
        firebaseAssignmentsMap.clear();
        s.forEach(d => firebaseAssignmentsMap.set(d.id, d.data()));
        if(masterOrdersLoaded) mergeYActualizar(); 
        statusCallback(true); 
    });

    // 2. Historial
    if (unsubscribeHistory) unsubscribeHistory();
    unsubscribeHistory = db_firestore.collection('history')
        .orderBy('timestamp', 'desc').limit(100) 
        .onSnapshot(s => {
            firebaseHistoryMap.clear();
            s.forEach(d => { 
                const v = d.data(); 
                if(!firebaseHistoryMap.has(v.orderId)) firebaseHistoryMap.set(v.orderId, []); 
                firebaseHistoryMap.get(v.orderId).push(v); 
            });
        });

    // 3. Órdenes Hijas
    if (unsubscribeChildOrders) unsubscribeChildOrders();
    unsubscribeChildOrders = db_firestore.collection('childOrders').onSnapshot(s => {
        firebaseChildOrdersMap.clear();
        s.forEach(d => { 
            const v = d.data(); 
            if(!firebaseChildOrdersMap.has(v.parentOrderId)) firebaseChildOrdersMap.set(v.parentOrderId, []); 
            firebaseChildOrdersMap.get(v.parentOrderId).push(v); 
        });
        needsRecalculation = true; 
        if(masterOrdersLoaded) mergeYActualizar();
    });

    // 4. Diseñadores
    if (unsubscribeDesigners) unsubscribeDesigners();
    unsubscribeDesigners = db_firestore.collection('designers').orderBy('name').onSnapshot(s => {
        firebaseDesignersMap.clear(); 
        let newDesignerList = [];
        s.forEach(d => { 
            const v = d.data(); 
            firebaseDesignersMap.set(d.id, v); 
            newDesignerList.push(v.name); 
            if (usuarioActual && v.email && v.email.toLowerCase() === usuarioActual.email.toLowerCase()) {
                currentDesignerName = v.name;
            }
        });
        designerList = newDesignerList;
        if(typeof updateAllDesignerDropdowns === 'function') updateAllDesignerDropdowns(); 
        if(typeof populateDesignerManagerModal === 'function') populateDesignerManagerModal(); 
        if(document.getElementById('dashboard').style.display === 'block') updateDashboard();
    });

    // 5. Plan Semanal
    if (unsubscribeWeeklyPlan) unsubscribeWeeklyPlan();
    unsubscribeWeeklyPlan = db_firestore.collection('weeklyPlan').onSnapshot(s => {
        firebaseWeeklyPlanMap.clear();
        s.forEach(d => { 
            const v = d.data(); 
            if(!firebaseWeeklyPlanMap.has(v.weekIdentifier)) firebaseWeeklyPlanMap.set(v.weekIdentifier, []); 
            firebaseWeeklyPlanMap.get(v.weekIdentifier).push(v); 
        });
        if(document.getElementById('workPlanView').style.display === 'block' && typeof generateWorkPlan === 'function') generateWorkPlan();
    });

    // 6. Notificaciones
    listenToMyNotifications();

    // 7. Logs de Calidad
    if (unsubscribeQualityLogs) unsubscribeQualityLogs();
    unsubscribeQualityLogs = db_firestore.collection('quality_logs')
        .orderBy('timestamp', 'desc').limit(300) 
        .onSnapshot(s => {
            firebaseQualityLogsMap.clear();
            s.forEach(d => firebaseQualityLogsMap.set(d.id, d.data()));
            if(document.getElementById('qualityView').style.display === 'block') {
                if(typeof updateQualityView === 'function') updateQualityView();
            }
        });
}

function desconectarDatosDeFirebase() {
    if(unsubscribeAssignments) unsubscribeAssignments();
    if(unsubscribeHistory) unsubscribeHistory();
    if(unsubscribeChildOrders) unsubscribeChildOrders();
    if(unsubscribeDesigners) unsubscribeDesigners();
    if(unsubscribeWeeklyPlan) unsubscribeWeeklyPlan();
    if(unsubscribeNotifications) unsubscribeNotifications();
    if(unsubscribeChat) unsubscribeChat();
    if(unsubscribeQualityLogs) unsubscribeQualityLogs();

    autoCompletedOrderIds.clear();
    masterOrdersLoaded = false;
}

// --- C. NOTIFICACIONES ---
function listenToMyNotifications() {
    if (!usuarioActual) return;
    const myEmail = usuarioActual.email.toLowerCase();

    // ✅ CORRECCIÓN #2: Limpieza también aquí
    if (unsubscribeNotifications) unsubscribeNotifications();

    unsubscribeNotifications = db_firestore.collection('notifications')
        .where('recipientEmail', '==', myEmail)
        .where('read', '==', false)
        .orderBy('timestamp', 'desc')
        .limit(20)
        .onSnapshot(snapshot => { 
            updateNotificationUI(snapshot.docs); 
        }, error => {
            console.log("Info notificaciones:", error.code); 
        });
}

function updateNotificationUI(docs) {
    const container = document.getElementById('notif-personal'); 
    if (!container) return;

    if (docs.length === 0) { 
        container.innerHTML = ''; 
        updateTotalBadge();
        return; 
    }

    let html = '';
    docs.forEach(doc => {
        const data = doc.data();
        let iconClass = data.type === 'mention' ? 'fa-at text-purple-500' : 'fa-user-tag text-blue-500';

        html += `
        <div onclick="handleNotificationClick('${doc.id}', '${data.orderId}')" class="p-3 hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700 transition relative group bg-white dark:bg-slate-800">
            <div class="flex gap-3">
                <div class="mt-1"><i class="fa-solid ${iconClass}"></i></div>
                <div>
                    <p class="text-xs font-bold text-slate-800 dark:text-white">${escapeHTML(data.title)}</p>
                    <p class="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2">${escapeHTML(data.message)}</p>
                    <p class="text-[9px] text-slate-300 mt-1">${new Date(data.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                </div>
            </div>
            <div class="absolute top-3 right-3 w-2 h-2 bg-blue-500 rounded-full" title="No leído"></div>
        </div>`;
    });

    container.innerHTML = html;
    updateTotalBadge();
}

function updateTotalBadge() {
    const pCount = document.getElementById('notif-personal')?.children.length || 0;
    const sCount = document.getElementById('notif-system')?.children.length || 0;
    const total = pCount + sCount;
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        if (total > 0) {
            badge.textContent = total > 9 ? '9+' : total;
            badge.classList.remove('hidden'); badge.classList.add('flex');
        } else {
            badge.classList.add('hidden'); badge.classList.remove('flex');
        }
    }
}

async function handleNotificationClick(notificationId, orderId) {
    db_firestore.collection('notifications').doc(notificationId).update({ read: true });
    if (orderId) await openAssignModal(orderId);
}

// --- D. PROCESAMIENTO Y FUSIÓN DE DATOS ---

function rebuildAllOrders() {
    let processed = [];
    masterOrdersMap.forEach((masterData) => {
        let fdLocal = masterData.fechaDespacho ? new Date(masterData.fechaDespacho) : null;
        const today = new Date(); today.setHours(0,0,0,0);
        const dl = (fdLocal && fdLocal < today) ? Math.ceil((today - fdLocal) / 86400000) : 0;

        processed.push({
            ...masterData, 
            fechaDespacho: fdLocal,
            isLate: fdLocal && fdLocal < today,
            isVeryLate: dl > 7,
            isAboutToExpire: fdLocal && !dl && ((fdLocal - today) / 86400000) <= 2,
            daysLate: dl,
            designer: '', customStatus: '', receivedDate: '', notes: '', completedDate: null, complexity: 'Media'
        });
    });
    allOrders = processed;
    mergeYActualizar(); 
}

function mergeYActualizar() {
    if (!masterOrdersLoaded) return;

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
            o.designer = fb.designer || '';
            o.customStatus = fb.customStatus || '';
            o.receivedDate = fb.receivedDate || '';
            o.notes = fb.notes || '';
            o.completedDate = fb.completedDate || null;
            o.complexity = fb.complexity || 'Media'; 
        } else {
            o.designer = ''; o.customStatus = ''; o.receivedDate = ''; o.notes = ''; o.completedDate = null; o.complexity = 'Media';
        }

        if (fb && o.departamento !== CONFIG.DEPARTMENTS.ART && o.departamento !== CONFIG.DEPARTMENTS.NONE) {
            if (fb.customStatus !== CONFIG.STATUS.COMPLETED && !autoCompletedOrderIds.has(o.orderId)) {
                autoCompleteBatchWrites.push({
                    orderId: o.orderId,
                    displayCode: o.codigoContrato,
                    data: { customStatus: CONFIG.STATUS.COMPLETED, completedDate: new Date().toISOString(), lastModified: new Date().toISOString(), schemaVersion: CONFIG.DB_VERSION },
                    history: [`Salio de Arte (en ${o.departamento}) → Completada`]
                });
                autoCompletedOrderIds.add(o.orderId);
            }
        }
    }

    if (document.getElementById('dashboard').style.display === 'block') {
        updateDashboard();
    }

    if (autoCompleteBatchWrites.length > 0) confirmAutoCompleteBatch();
}

function recalculateChildPieces() {
    let cache = new Map();
    firebaseChildOrdersMap.forEach((list, parentId) => {
        const sum = list.reduce((s, c) => s + (Number(c.cantidad) || 0), 0);
        cache.set(parentId, sum);
    });

    allOrders.forEach(o => {
        o.childPieces = cache.get(o.orderId) || 0;
    });
}

// ======================================================
// ===== 6. PARSER EXCEL & CLOUD UPLOAD =====
// ======================================================

function handleFiles(files) {
    if (files.length > 0) {
        document.getElementById('fileName').textContent = files[0].name;
        processAndUploadFile(files[0]);
    }
}

async function processAndUploadFile(file) {
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
                // Parseo básico de fechas
                if (typeof v === 'number') dObj = new Date((v - 25569) * 86400 * 1000);
                else { const parsed = new Date(v); if (!isNaN(parsed.getTime())) dObj = parsed; }
                if (dObj) currentDate = new Date(Date.UTC(dObj.getFullYear(), dObj.getMonth(), dObj.getDate()));
            }

            if (cols.cliente >= 0 && r[cols.cliente]) currentClient = String(r[cols.cliente]).trim();
            if (cols.codigo >= 0 && r[cols.codigo]) currentContrato = String(r[cols.codigo]).trim();
            if (cols.estilo >= 0 && r[cols.estilo]) currentStyle = String(r[cols.estilo]).trim();
            if (cols.team >= 0 && r[cols.team]) currentTeam = String(r[cols.team]).trim();

            if (!currentClient || !currentContrato) continue;

            // =========================================================================
            // ✅ LÓGICA CORREGIDA:
            // 1. Iniciamos en 'NONE' (Sin Departamento).
            // 2. Solo si hay cantidad > 0, cambiamos al departamento correspondiente.
            // 3. Si Arte es 0, se queda en NONE y sale de la vista.
            // =========================================================================
            let qty = 0; 
            let dept = CONFIG.DEPARTMENTS.NONE; 

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

            // --- OPTIMIZACIÓN DIFERENCIAL ---
            const existing = masterOrdersMap.get(oid);
            let hasChanges = true;
            if (existing) {
                if (existing.cantidad === qty && 
                    existing.departamento === dept && 
                    existing.fechaDespacho === fdISO &&
                    existing.teamName === currentTeam) {
                    hasChanges = false; 
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
                    lastModified: new Date().toISOString()
                });
            }
        }

        if (batchData.length === 0) {
            showCustomAlert('El archivo se analizó pero no hay cambios nuevos para subir.', 'success');
            hideLoading();
            return;
        }

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
    loadMasterOrders();
}

// ======================================================
// ===== 7. FILTRADO OPTIMIZADO (CORREGIDO) =====
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

    // 1. Búsqueda por Texto
    if (s) {
        res = res.filter(o => 
            (o.cliente || '').toLowerCase().includes(s) || 
            (o.codigoContrato || '').toLowerCase().includes(s) || 
            (o.estilo || '').toLowerCase().includes(s) || 
            (o.designer || '').toLowerCase().includes(s)
        );
    }

    // 2. Filtro Cliente
    if (currentClientFilter) res = res.filter(o => o.cliente === currentClientFilter);

    // 3. ✅ CORRECCIÓN #7: Lógica de Departamento BLINDADA
    if (currentDepartamentoFilter === 'ALL_DEPTS') {
        // Opción explícita "Ver Todos": No filtramos nada.
    } 
    else if (currentDepartamentoFilter) {
        // Usuario eligió un departamento específico -> Mostrar solo ese.
        res = res.filter(o => o.departamento === currentDepartamentoFilter);
    } 
    else {
        // POR DEFECTO: Mostrar SOLO Arte para no ensuciar la vista inicial.
        res = res.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART); 
    }

    // 4. Resto de filtros
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
        if (sortConfig.key === 'date') { 
            va = a.fechaDespacho ? a.fechaDespacho.getTime() : 0; 
            vb = b.fechaDespacho ? b.fechaDespacho.getTime() : 0; 
        }
        if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
        return (va < vb ? -1 : 1) * (sortConfig.direction === 'asc' ? 1 : -1);
    });

    filteredCache = { key: currentFilterKey, results: res, timestamp: now };
    return res;
}

// ======================================================
// ===== 8. OPERACIONES BATCH (CORREGIDAS) =====
// ======================================================

function confirmAutoCompleteBatch() {
    // ✅ CORRECCIÓN #3: Verificar si ya hay un proceso o si no hay datos
    if (batchProcessing || document.body.classList.contains('processing-batch') || autoCompleteBatchWrites.length === 0) return;

    const count = autoCompleteBatchWrites.length;
    const examples = autoCompleteBatchWrites.slice(0, 3).map(w => w.displayCode).join(', ');
    const message = `Se han detectado ${count} órdenes que salieron de Arte (Ej: ${examples}...). \n\n¿Marcar como 'Completada'?`;

    // ✅ BLOQUEO INMEDIATO Y CLONACIÓN
    batchProcessing = true;
    const batchToProcess = [...autoCompleteBatchWrites];
    autoCompleteBatchWrites = []; // Vaciar global inmediatamente

    showConfirmModal(message, async () => {
        await ejecutarAutoCompleteBatch(batchToProcess);
        batchProcessing = false; // Liberar flag al terminar
    });
}

// ✅ CORRECCIÓN #4: Chunking para límites de Firestore (Max 500 ops)
async function ejecutarAutoCompleteBatch(itemsParam) {
    const items = itemsParam || []; 
    if (!usuarioActual || items.length === 0) {
        batchProcessing = false;
        return;
    }

    document.body.classList.add('processing-batch');

    await safeFirestoreOperation(async () => {
        const CHUNK_SIZE = 450; // Margen de seguridad (límite real 500)
        const user = usuarioActual.displayName;
        let processedCount = 0;

        // Iterar por bloques
        for (let i = 0; i < items.length; i += CHUNK_SIZE) {
            const chunk = items.slice(i, i + CHUNK_SIZE);
            const batch = db_firestore.batch();

            chunk.forEach(w => {
                const ref = db_firestore.collection('assignments').doc(w.orderId);
                batch.set(ref, w.data, { merge: true });
                const hRef = db_firestore.collection('history').doc();
                batch.set(hRef, { orderId: w.orderId, change: w.history[0], user, timestamp: new Date().toISOString() });
                
                autoCompletedOrderIds.add(w.orderId);
            });

            await batch.commit(); 
            processedCount += chunk.length;
            showLoading(`Sincronizando... ${processedCount}/${items.length}`);
        }
        
        return true;
    }, 'Iniciando sincronización...', 'Estados actualizados correctamente.');

    document.body.classList.remove('processing-batch');
    batchProcessing = false;
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
// ===== 9. SISTEMA DE NAVEGACIÓN (ROUTER UI) =====
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
            icon.className = icon.className.replace(/text-(blue|pink|orange|purple|green|teal)-[0-9]+/g, '').trim();
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
            if (viewId === 'qualityView') icon.classList.add('text-teal-500'); 
        }
    }

    // 5. Inicializar lógica específica de la vista
    if (viewId === 'dashboard') {
        updateDashboard();
    } 
    else if (viewId === 'kanbanView') {
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
    else if (viewId === 'qualityView') {
        if (typeof updateQualityView === 'function') updateQualityView();
    }

    // 6. Limpieza de memoria (Gráficos)
    if (viewId !== 'designerMetricsView' && viewId !== 'departmentMetricsView' && viewId !== 'qualityView') {
        if (typeof destroyAllCharts === 'function') destroyAllCharts();
        if (qualityParetoChart) { qualityParetoChart.destroy(); qualityParetoChart = null; }
        if (qualityDesignerChart) { qualityDesignerChart.destroy(); qualityDesignerChart = null; }
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
    
    // ACTUALIZADO: Usa handleDrillDown en lugar de setFilter
    if (stats.veryLate > 0) {
        html += `
        <div onclick="handleDrillDown('late', 'veryLate', '⚠️ Muy Atrasadas'); toggleNotifications();" class="p-3 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer border-b border-slate-50 dark:border-slate-700 group transition flex gap-3 items-start bg-white dark:bg-slate-800">
            <div class="mt-1 text-red-500"><i class="fa-solid fa-circle-exclamation"></i></div>
            <div>
                <p class="text-xs font-bold text-slate-700 dark:text-slate-200 group-hover:text-red-600 dark:group-hover:text-red-400">Muy Atrasadas (>7 días)</p>
                <p class="text-[10px] text-slate-500 dark:text-slate-400">${stats.veryLate} órdenes requieren atención inmediata</p>
            </div>
        </div>`;
    }
    
    // ACTUALIZADO: Usa handleDrillDown en lugar de setFilter
    if (stats.aboutToExpire > 0) {
        html += `
        <div onclick="handleDrillDown('late', 'aboutToExpire', '⏳ Por Vencer'); toggleNotifications();" class="p-3 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 cursor-pointer border-b border-slate-50 dark:border-slate-700 group transition flex gap-3 items-start bg-white dark:bg-slate-800">
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
        // ACTUALIZADO: Clickeable con handleDrillDown
        clientReport.innerHTML = topClients.map(([c, n], i) => `
            <div onclick="handleDrillDown('client', '${escapeHTML(c)}', 'Cliente: ${escapeHTML(c)}')" 
                 class="flex justify-between py-2 border-b border-slate-50 dark:border-slate-700 last:border-0 text-xs hover:bg-blue-50 dark:hover:bg-slate-700 px-2 rounded transition cursor-pointer group">
                <span class="text-slate-600 dark:text-slate-300 truncate w-40 font-medium group-hover:text-blue-600 transition-colors" title="${c}">${i+1}. ${c}</span>
                <span class="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">${n}</span>
            </div>`).join('');
    }

    // 2. Carga de Trabajo
    const workload = {};
    let totalWorkload = 0;

    artOrders.forEach(o => {
        if (o.designer) {
            const pieces = (Number(o.cantidad) || 0) + (Number(o.childPieces) || 0);
            workload[o.designer] = (workload[o.designer] || 0) + pieces;

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

                // ACTUALIZADO: Clickeable con handleDrillDown
                return `
                <div onclick="handleDrillDown('designer', '${escapeHTML(designer)}', 'Diseñador: ${escapeHTML(designer)}')" 
                     class="mb-3 group cursor-pointer ${isExcluded ? 'opacity-50' : ''}">
                    <div class="flex justify-between text-xs mb-1 group-hover:text-blue-600 transition-colors">
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
// ===== 11. MODALES Y ACCIONES =====
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

    // Selector Complejidad
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

    // Limpieza de opción "Completada"
    for (let i = statusSelect.options.length - 1; i >= 0; i--) {
        if (statusSelect.options[i].value === 'Completada') statusSelect.remove(i);
    }

    // Valores Inputs
    statusSelect.value = (o.customStatus === 'Completada') ? 'Bandeja' : (o.customStatus || 'Bandeja');
    document.getElementById('modalReceivedDate').value = o.receivedDate || new Date().toISOString().split('T')[0];
    if(document.getElementById('modalComplexity')) document.getElementById('modalComplexity').value = o.complexity || 'Media';

    // Auto-Asignación
    const designerSelect = document.getElementById('modalDesigner');
    const container = designerSelect.parentNode;
    if(document.getElementById('btn-self-assign')) document.getElementById('btn-self-assign').remove();
    designerSelect.style.display = 'block';
    designerSelect.disabled = false;
    designerSelect.value = o.designer || '';

    // LÓGICA DE USUARIO / ADMIN PARA DISEÑADOR
    if (currentDesignerName && userRole !== 'admin') {
        if (o.designer && o.designer !== 'Sin asignar' && o.designer !== currentDesignerName) {
            designerSelect.style.display = 'none';
            const btn = document.createElement('button');
            btn.id = 'btn-self-assign';
            btn.className = 'w-full py-2 rounded-lg text-xs font-bold transition shadow-sm border flex items-center justify-center gap-2 mt-1 bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600';
            btn.innerHTML = `<i class="fa-solid fa-lock"></i> Asignado a: ${o.designer}`;
            btn.disabled = true;
            container.appendChild(btn);
        } else if (o.designer === currentDesignerName) {
            designerSelect.style.display = 'none';
            const btn = document.createElement('button');
            btn.id = 'btn-self-assign';
            btn.className = 'w-full py-2 rounded-lg text-xs font-bold transition shadow-sm border flex items-center justify-center gap-2 mt-1 bg-red-50 text-red-600 border-red-200 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
            btn.innerHTML = `<i class="fa-solid fa-user-xmark"></i> Liberar (Es mía)`;
            btn.onclick = () => { designerSelect.value = ''; saveAssignment(); };
            container.appendChild(btn);
        } else {
            designerSelect.style.display = 'none';
            const btn = document.createElement('button');
            btn.id = 'btn-self-assign';
            btn.className = 'w-full py-2 rounded-lg text-xs font-bold transition shadow-sm border flex items-center justify-center gap-2 mt-1 bg-green-50 text-green-600 border-green-200 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
            btn.innerHTML = `<i class="fa-solid fa-hand-point-up"></i> Tomar Orden`;
            btn.onclick = () => { designerSelect.value = currentDesignerName; saveAssignment(); };
            container.appendChild(btn);
        }
    }

    // Departamento Admin
    const deptSelect = document.getElementById('modalDepartamento');
    if (deptSelect) {
        deptSelect.value = o.departamento || 'Sin Departamento';
        const deptWrapper = document.getElementById('adminDeptWrapper');
        if (deptWrapper) deptWrapper.style.display = (userRole === 'admin') ? 'block' : 'none';
    }

    // Historial
    const histContainer = document.getElementById('modalHistory');
    histContainer.innerHTML = '<div class="flex justify-center p-4"><div class="spinner border-2 border-slate-200 border-t-blue-500 rounded-full w-6 h-6 animate-spin"></div></div>';

    db_firestore.collection('history')
        .where('orderId', '==', id)
        .orderBy('timestamp', 'desc')
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                histContainer.innerHTML = '<p class="text-slate-400 italic text-xs text-center py-4">Sin historial.</p>';
            } else {
                histContainer.innerHTML = snapshot.docs.map(doc => {
                    const x = doc.data();
                    return `<div class="border-b border-slate-100 dark:border-slate-700 pb-2 last:border-0 mb-2">
                        <div class="flex justify-between items-center text-[10px] text-slate-400 mb-0.5"><span>${new Date(x.timestamp).toLocaleString()}</span><span>${escapeHTML(x.user)}</span></div>
                        <div class="text-xs text-slate-600 dark:text-slate-300">${escapeHTML(x.change)}</div>
                    </div>`;
                }).join('');
            }
        })
        .catch(err => {
            console.error(err);
            histContainer.innerHTML = '<p class="text-red-400 text-xs text-center">Error cargando historial.</p>';
        });

    if (typeof loadOrderComments === 'function') loadOrderComments(id);
    await loadChildOrders();
    openModalById('assignModal');
};

window.saveAssignment = async () => {
    if (!currentEditingOrderId) return showCustomAlert('Error: ID no encontrado.', 'error');
    const o = allOrders.find(x => x.orderId === currentEditingOrderId);
    if (!o) return showCustomAlert('Error: Orden no encontrada en memoria.', 'error');

    const desName = document.getElementById('modalDesigner').value.trim();
    const stat = document.getElementById('modalStatus').value.trim();
    const rd = document.getElementById('modalReceivedDate').value;
    const comp = document.getElementById('modalComplexity') ? document.getElementById('modalComplexity').value : 'Media';
    const newDept = document.getElementById('modalDepartamento') ? document.getElementById('modalDepartamento').value : o.departamento;

    // Intercepción de Calidad
    if (o.customStatus === CONFIG.STATUS.AUDIT && (stat === CONFIG.STATUS.PROD || stat === CONFIG.STATUS.TRAY)) {
        window.pendingRejection = {
            orderId: currentEditingOrderId,
            newStatus: stat,
            designer: desName || o.designer, 
            prevStatus: o.customStatus
        };
        closeTopModal(); 
        setTimeout(() => openModalById('rejectionModal'), 200); 
        return; 
    }

    const changes = []; 
    const data = {};
    let desEmail = null;

    if (desName && desName !== 'Sin asignar') {
        firebaseDesignersMap.forEach(dData => { if (dData.name === desName) desEmail = dData.email; });
    }

    if((o.designer || '') !== desName) { 
        changes.push(`Diseñador: ${o.designer || 'N/A'} -> ${desName}`); 
        data.designer = desName; data.designerEmail = desEmail; 
        if (desEmail && usuarioActual && usuarioActual.email !== desEmail && typeof createNotification === 'function') {
            createNotification(desEmail, 'assign', 'Nueva Asignación', `${usuarioActual.displayName || 'Admin'} te asignó ${o.codigoContrato}`, currentEditingOrderId);
        }
    }

    if((o.customStatus || '') !== stat) { 
        changes.push(`Estado: ${o.customStatus || 'N/A'} -> ${stat}`); 
        data.customStatus = stat; 
        if(stat === CONFIG.STATUS.COMPLETED) { data.completedDate = new Date().toISOString(); } 
        else { data.completedDate = null; }
    }

    if((o.receivedDate || '') !== rd) { changes.push(`Fecha Rx: ${rd}`); data.receivedDate = rd; }
    if((o.complexity || 'Media') !== comp) { changes.push(`Complejidad: ${o.complexity || 'Media'} -> ${comp}`); data.complexity = comp; o.complexity = comp; }

    let deptChanged = false;
    if (newDept && newDept !== o.departamento) {
        changes.push(`Departamento: ${o.departamento} -> ${newDept}`);
        deptChanged = true;
        o.departamento = newDept; 
    }

    if(changes.length === 0) return showCustomAlert('No realizaste ningún cambio.', 'info');

    const ok = await safeFirestoreOperation(async () => {
        const batch = db_firestore.batch();
        
        if (Object.keys(data).length > 0) {
            const updatePayload = { ...data, lastModified: new Date().toISOString(), schemaVersion: CONFIG.DB_VERSION };
            batch.set(db_firestore.collection('assignments').doc(currentEditingOrderId), updatePayload, { merge: true });
        }

        if (deptChanged) {
            batch.update(db_firestore.collection('master_orders').doc(currentEditingOrderId), { 
                departamento: newDept,
                lastModified: new Date().toISOString()
            });
        }

        changes.forEach(c => {
            batch.set(db_firestore.collection('history').doc(), { orderId: currentEditingOrderId, change: c, user: usuarioActual.displayName || 'Usuario', timestamp: new Date().toISOString() });
        });
        
        await batch.commit();
        
        if (data.customStatus) o.customStatus = data.customStatus;
        if (data.designer !== undefined) o.designer = data.designer;
        if (data.completedDate !== undefined) o.completedDate = data.completedDate;
        
        if (deptChanged) {
            if (typeof filteredCache !== 'undefined') filteredCache.key = null;
        }

        updateTable(); 
    }, 'Guardando...', 'Orden actualizada');

    if(ok) closeTopModal();
};

// ✅ FUNCIÓN CORREGIDA PARA CALIDAD
window.confirmRejection = async () => {
    const category = document.getElementById('rejectCategory').value;
    const reason = document.getElementById('rejectReason').value.trim();

    if (!category || !reason) return showCustomAlert('Debes seleccionar categoría y detallar el error.', 'error');
    if (!window.pendingRejection) return showCustomAlert('Error de estado. Intenta de nuevo.', 'error');

    const { orderId, newStatus, designer, prevStatus } = window.pendingRejection;

    await safeFirestoreOperation(async () => {
        const batch = db_firestore.batch();
        
        // 1. Actualizar estado
        const orderRef = db_firestore.collection('assignments').doc(orderId);
        batch.set(orderRef, { customStatus: newStatus, lastModified: new Date().toISOString() }, { merge: true });

        // 2. Crear Log
        const logData = {
            orderId: orderId, designer: designer || 'Sin asignar', auditor: usuarioActual.displayName || 'Auditor',
            auditorEmail: usuarioActual.email, category: category, reason: reason, timestamp: new Date().toISOString(),
            statusFrom: prevStatus, statusTo: newStatus, week: getWeekIdentifierString(new Date())
        };
        const logRef = db_firestore.collection('quality_logs').doc();
        batch.set(logRef, logData);

        // 3. Crear Historial
        const histRef = db_firestore.collection('history').doc();
        batch.set(histRef, { orderId: orderId, change: `🛑 RECHAZADO (${category}): ${reason}`, user: usuarioActual.displayName, timestamp: new Date().toISOString() });

        await batch.commit();

        // Actualizar UI Localmente Inmediatamente
        document.getElementById('rejectCategory').value = '';
        document.getElementById('rejectReason').value = '';
        
        const localOrder = allOrders.find(o => o.orderId === orderId);
        if(localOrder) localOrder.customStatus = newStatus;
        
        firebaseQualityLogsMap.set(logRef.id, logData); // Agregar a memoria local

        return true;
    }, 'Registrando No Conformidad...', 'Orden rechazada y reportada.');

    window.pendingRejection = null;
    closeTopModal();
    
    // Forzar renderizado
    if(document.getElementById('qualityView').style.display === 'block') {
        if(typeof updateQualityView === 'function') updateQualityView();
    } else if (document.getElementById('kanbanView').style.display === 'block') {
        updateKanban();
    }
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
        const childId = `${o.orderId}_child_${Date.now()}`;
        await db_firestore.collection('childOrders').doc(childId).set({
            childOrderId: childId, parentOrderId: o.orderId, childCode: `${o.codigoContrato}-${num}`,
            cantidad: pcs, fechaDespacho: date ? new Date(date) : (o.fechaDespacho || null), createdAt: new Date().toISOString(), schemaVersion: CONFIG.DB_VERSION
        });
    }, 'Creando...', 'Orden hija creada');
    if(ok) closeTopModal();
};

window.deleteChildOrder = async (id, code) => {
    if (!requireAdmin()) return;
    showConfirmModal(`¿Eliminar ${code}?`, async () => { await safeFirestoreOperation(() => db_firestore.collection('childOrders').doc(id).delete(), 'Eliminando...', 'Eliminada'); });
};

window.openMultiAssignModal = () => { 
    if (selectedOrders.size === 0) return showCustomAlert('Selecciona órdenes', 'info');
    const multiSelect = document.getElementById('multiModalStatus');
    if(multiSelect) {
        for (let i = multiSelect.options.length - 1; i >= 0; i--) {
            if (multiSelect.options[i].value === 'Completada') multiSelect.remove(i);
        }
    }
    document.getElementById('multiModalCount').textContent = selectedOrders.size;
    openModalById('multiAssignModal');
};

window.saveMultiAssignment = async () => {
    if (selectedOrders.size === 0) return;
    const d = document.getElementById('multiModalDesigner').value;
    const s = document.getElementById('multiModalStatus').value;
    const r = document.getElementById('multiModalReceivedDate').value;
    const n = document.getElementById('multiModalNotes').value;
    let desEmail = null;
    if (d && d !== 'Sin asignar') { firebaseDesignersMap.forEach(dData => { if (dData.name === d) desEmail = dData.email; }); }

    const ok = await safeFirestoreOperation(async () => {
        const batch = db_firestore.batch();
        let c = 0;
        selectedOrders.forEach(id => {
            const data = { schemaVersion: CONFIG.DB_VERSION, lastModified: new Date().toISOString() };
            if (d) { data.designer = d; data.designerEmail = desEmail; }
            if (s) data.customStatus = s; if (r) data.receivedDate = r; if (n) data.notes = n; 
            if (Object.keys(data).length > 2) { batch.set(db_firestore.collection('assignments').doc(id), data, { merge: true }); c++; }
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
    if (!requireAdmin()) return;
    const name = document.getElementById('newDesignerName').value.trim();
    const email = document.getElementById('newDesignerEmail').value.trim().toLowerCase();
    if(!name || !email) return showCustomAlert('Datos incompletos', 'error');
    const ok = await safeFirestoreOperation(() => db_firestore.collection('designers').add({ name, email, createdAt: new Date().toISOString() }), 'Agregando...', 'Agregado');
    if(ok) { document.getElementById('newDesignerName').value = ''; document.getElementById('newDesignerEmail').value = ''; populateDesignerManagerModal(); }
};

window.deleteDesigner = (id, name) => {
    if (!requireAdmin()) return;
    showConfirmModal(`¿Eliminar a ${name}?`, async () => { await safeFirestoreOperation(() => db_firestore.collection('designers').doc(id).delete(), 'Eliminando...', 'Eliminado'); });
};

// ======================================================
// ===== 12. MÉTRICAS DE DISEÑADORES Y REPORTES =====
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
        designers[d].pieces += (Number(o.cantidad) || 0) + (Number(o.childPieces) || 0);
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

    const orders = allOrders.filter(o => 
        o.departamento === CONFIG.DEPARTMENTS.ART && 
        (designerName === 'Sin asignar' ? !o.designer : o.designer === designerName)
    );

    const totalPieces = orders.reduce((s, o) => s + (Number(o.cantidad)||0) + (Number(o.childPieces)||0), 0);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (designerDoughnutChart) { designerDoughnutChart.destroy(); designerDoughnutChart = null; }
    if (designerBarChart) { designerBarChart.destroy(); designerBarChart = null; }

    detail.innerHTML = `
        <div class="bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl p-6 text-white mb-6 shadow-lg">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <h2 class="text-2xl font-bold">${escapeHTML(designerName)}</h2>
                    <p class="text-blue-100 text-xs">Reporte de Productividad</p>
                </div>
                
                <div class="flex items-center gap-2 bg-white/10 p-2 rounded-lg backdrop-blur-sm border border-white/20">
                    <input type="month" id="reportMonthSelector" value="${currentMonth}" class="bg-white/90 text-slate-800 text-xs rounded border-0 py-1.5 px-2 focus:ring-2 focus:ring-blue-400 cursor-pointer">
                    <button onclick="exportMonthlyReport('${escapeHTML(designerName)}')" class="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow-sm flex items-center gap-2">
                        <i class="fa-solid fa-file-excel"></i> Descargar Reporte
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div class="bg-white/10 rounded-lg p-3 backdrop-blur-sm border border-white/10">
                    <div class="text-white/70 text-xs uppercase font-bold mb-1">Total Histórico</div>
                    <div class="text-3xl font-bold">${orders.length} <span class="text-sm font-normal text-blue-200">órdenes</span></div>
                </div>
                <div class="bg-white/10 rounded-lg p-3 backdrop-blur-sm border border-white/10">
                    <div class="text-white/70 text-xs uppercase font-bold mb-1">Total Piezas</div>
                    <div class="text-3xl font-bold">${totalPieces.toLocaleString()} <span class="text-sm font-normal text-blue-200">pzs</span></div>
                </div>
            </div>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow border border-slate-200 dark:border-slate-700">
                <h3 class="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 text-xs uppercase tracking-wide">
                    <i class="fa-solid fa-chart-pie text-blue-500"></i> Distribución de Estados
                </h3>
                <div class="relative h-64 w-full"><canvas id="designerDoughnutChart"></canvas></div>
            </div>
            <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow border border-slate-200 dark:border-slate-700">
                <h3 class="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 text-xs uppercase tracking-wide">
                    <i class="fa-solid fa-chart-bar text-green-500"></i> Eficiencia de Entrega
                </h3>
                <div class="relative h-64 w-full"><canvas id="designerBarChart"></canvas></div>
            </div>
        </div>
    `;

    setTimeout(() => {
        if (typeof Chart === 'undefined') return;
        const stats = calculateStats(orders);
        const statusCounts = {
            'Bandeja': orders.filter(o => o.customStatus === CONFIG.STATUS.TRAY).length,
            'Producción': orders.filter(o => o.customStatus === CONFIG.STATUS.PROD).length,
            'Auditoría': orders.filter(o => o.customStatus === CONFIG.STATUS.AUDIT).length,
            'Completada': orders.filter(o => o.customStatus === CONFIG.STATUS.COMPLETED).length
        };
        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#cbd5e1' : '#666';

        const ctx1 = document.getElementById('designerDoughnutChart');
        if (ctx1) {
            designerDoughnutChart = new Chart(ctx1, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(statusCounts),
                    datasets: [{
                        data: Object.values(statusCounts),
                        backgroundColor: ['#fbbf24', '#a855f7', '#3b82f6', '#10b981'],
                        borderColor: isDark ? '#1e293b' : '#fff',
                        borderWidth: 2
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textColor, font: { size: 10 }, boxWidth: 12 } } } }
            });
        }

        const ctx2 = document.getElementById('designerBarChart');
        if (ctx2) {
            designerBarChart = new Chart(ctx2, {
                type: 'bar',
                data: {
                    labels: ['A Tiempo', 'Atrasadas', 'Muy Atrasadas'],
                    datasets: [{
                        label: 'Órdenes',
                        data: [stats.onTime, stats.late - stats.veryLate, stats.veryLate],
                        backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                        borderRadius: 4
                    }]
                },
                options: { 
                    responsive: true, maintainAspectRatio: false, 
                    scales: { 
                        y: { beginAtZero: true, grid: { color: isDark ? '#334155' : '#e5e5e5' }, ticks: { color: textColor } },
                        x: { grid: { display: false }, ticks: { color: textColor } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }
    }, 100);
}

window.exportMonthlyReport = (designerName) => {
    const monthInput = document.getElementById('reportMonthSelector').value; 
    if (!monthInput) return showCustomAlert('Selecciona un mes válido', 'error');

    const getWeekNumber = (d) => {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
    };

    const reportData = allOrders.filter(o => {
        const matchDesigner = (designerName === 'Sin asignar' ? !o.designer : o.designer === designerName);
        if (!matchDesigner) return false;
        if (!o.receivedDate) return false;
        return o.receivedDate.startsWith(monthInput);
    });

    if (reportData.length === 0) {
        return showCustomAlert(`No hay órdenes registradas para ${designerName} en ${monthInput}`, 'info');
    }

    const excelData = reportData.map(o => {
        const dateObj = new Date(o.receivedDate + "T12:00:00");
        const weekNum = getWeekNumber(dateObj);
        const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'long' }).toUpperCase();

        return {
            "SEMANA #-": weekNum,
            "DIA": dayName,
            "FECHA DE LLEGADA": o.receivedDate || '-',
            "FECHA DE DESPACHO": o.fechaDespacho ? o.fechaDespacho.toLocaleDateString() : '-',
            "CLIENTE": o.cliente || '',
            "#- DE ORDEN": o.codigoContrato || '',
            "CANT. PIEZAS": (Number(o.cantidad) || 0) + (Number(o.childPieces) || 0),
            "CANT. MONTADA": "", 
            "PROOF": "", 
            "APROBACION": "", 
            "PRODUCCION": o.completedDate ? o.completedDate.split('T')[0] : ''
        };
    });

    if (typeof XLSX === 'undefined') return showCustomAlert('Librería Excel no cargada', 'error');

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();

    const wscols = [{wch: 10}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 25}, {wch: 15}, {wch: 12}, {wch: 12}, {wch: 10}, {wch: 15}, {wch: 15}];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Reporte Mensual");
    const fileName = `REPORTE_ARTE_${monthInput}_${designerName.toUpperCase().replace(/\s+/g, '_')}.xlsx`;
    XLSX.writeFile(wb, fileName);

    showCustomAlert('Reporte descargado correctamente', 'success');
};

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
        if (CONFIG.EXCLUDED_DESIGNERS.includes(designer)) return;

        // ✅ CÁLCULO DE LEAD TIME REAL (HISTORIAL)
        const history = firebaseHistoryMap.get(o.orderId) || [];
        
        if (history.length > 0) {
            const sortedHistory = [...history].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

            // Buscar primer asignación
            const startLog = sortedHistory.find(h => h.change.includes('Diseñador:') && !h.change.includes('-> Sin asignar'));
            
            // Buscar completado posterior
            const endLog = sortedHistory.find(h => 
                h.change.includes('-> Completada') && 
                (startLog ? new Date(h.timestamp) > new Date(startLog.timestamp) : true)
            );

            if (startLog && endLog) {
                const diffTime = new Date(endLog.timestamp) - new Date(startLog.timestamp);
                const diffDays = diffTime / (1000 * 60 * 60 * 24);

                if (!leadTimes[designer]) leadTimes[designer] = { totalDays: 0, count: 0 };
                leadTimes[designer].totalDays += diffDays;
                leadTimes[designer].count++;
            }
        }

        const comp = o.complexity || 'Media'; 
        if (complexityDist[comp] !== undefined) complexityDist[comp]++;

        const hasRework = history.some(h => {
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
                            <i class="fa-solid fa-stopwatch text-blue-500"></i> Lead Time Real
                        </h3>
                        <p class="text-[10px] text-slate-400">Tiempo promedio: Asignación ➔ Completada</p>
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
// ===== 14. GRÁFICOS Y PLAN SEMANAL (MEJORADO V2) =====
// ======================================================

function destroyAllCharts() {
    if (designerDoughnutChart) { designerDoughnutChart.destroy(); designerDoughnutChart = null; }
    if (designerBarChart) { designerBarChart.destroy(); designerBarChart = null; }
    if (deptLoadPieChart) { deptLoadPieChart.destroy(); deptLoadPieChart = null; }
    if (deptLoadBarChart) { deptLoadBarChart.destroy(); deptLoadBarChart = null; }
    if (compareChart) { compareChart.destroy(); compareChart = null; }
}

// Función auxiliar para cambiar vista
window.togglePlanView = (view) => {
    currentPlanView = view;
    generateWorkPlan(); // Re-renderizar
};

function generateWorkPlan() {
    const container = document.getElementById('view-workPlanContent');
    const weekInput = document.getElementById('view-workPlanWeekSelector');

    if (!weekInput) return;
    if (!weekInput.value) weekInput.value = getWeekIdentifierString(new Date());

    const weekIdentifier = weekInput.value;
    container.innerHTML = '<div class="spinner"></div>';

    setTimeout(() => {
        const planData = firebaseWeeklyPlanMap.get(weekIdentifier) || [];
        const summary = document.getElementById('view-workPlanSummary');
        if(summary) summary.textContent = `${planData.length} órdenes`;

        if (planData.length === 0) {
            container.innerHTML = `<div class="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <i class="fa-regular fa-calendar-xmark text-3xl text-slate-300 dark:text-slate-600 mb-2"></i>
                <p class="text-slate-400 font-medium">El plan para la semana ${weekIdentifier} está vacío.</p>
            </div>`;
            return;
        }

        // --- 1. CÁLCULO DE CARGA DE TRABAJO (WORKLOAD BAR) ---
        const workload = {};
        let maxLoad = 0;
        let doneCount = 0;

        planData.forEach(item => {
            const liveOrder = allOrders.find(x => x.orderId === item.orderId);
            const isCompleted = liveOrder && liveOrder.customStatus === CONFIG.STATUS.COMPLETED;
            if (isCompleted) doneCount++;

            const d = item.designer || 'Sin asignar';
            const pzs = (Number(item.cantidad) || 0) + (Number(item.childPieces) || 0);
            
            if (!workload[d]) workload[d] = { count: 0, pieces: 0 };
            workload[d].count++;
            workload[d].pieces += pzs;
            if (workload[d].pieces > maxLoad) maxLoad = workload[d].pieces;
        });

        const progressTotal = Math.round((doneCount / planData.length) * 100);

        // Renderizar Barra de Carga
        let workloadHtml = `
        <div class="mb-6 space-y-4">
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl shadow-sm flex items-center gap-4">
                <div class="flex-1">
                    <div class="flex justify-between mb-1">
                        <span class="font-bold text-slate-700 dark:text-slate-300 text-xs uppercase">Progreso de la Semana</span>
                        <span class="font-bold text-blue-600 dark:text-blue-400 text-xs">${progressTotal}%</span>
                    </div>
                    <div class="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                        <div class="bg-blue-600 h-2 rounded-full transition-all duration-500" style="width: ${progressTotal}%"></div>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="togglePlanView('list')" class="${currentPlanView === 'list' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'} px-3 py-1.5 rounded-lg text-xs font-bold transition"><i class="fa-solid fa-list"></i> Lista</button>
                    <button onclick="togglePlanView('calendar')" class="${currentPlanView === 'calendar' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'} px-3 py-1.5 rounded-lg text-xs font-bold transition"><i class="fa-solid fa-calendar-days"></i> Días</button>
                </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">`;
        
        Object.entries(workload).forEach(([name, data]) => {
            const percent = maxLoad > 0 ? Math.round((data.pieces / maxLoad) * 100) : 0;
            const color = percent > 80 ? 'bg-red-500' : percent > 50 ? 'bg-yellow-500' : 'bg-green-500';
            workloadHtml += `
                <div class="bg-slate-50 dark:bg-slate-700/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-600">
                    <div class="flex justify-between text-[10px] mb-1">
                        <span class="font-bold text-slate-700 dark:text-slate-200 truncate pr-2">${name}</span>
                        <span class="text-slate-500 font-mono">${data.pieces}p</span>
                    </div>
                    <div class="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-1.5">
                        <div class="${color} h-1.5 rounded-full" style="width: ${percent}%"></div>
                    </div>
                    <div class="text-[9px] text-slate-400 mt-0.5 text-right">${data.count} órds</div>
                </div>`;
        });
        workloadHtml += `</div></div>`;

        // --- 2. RENDERIZADO DE VISTAS (LISTA O CALENDARIO) ---
        let contentHtml = '';

        if (currentPlanView === 'list') {
            // === VISTA LISTA (CON QUICK EDIT) ===
            // Ordenar: Completadas al final, luego por fecha
            planData.sort((a, b) => {
                const oa = allOrders.find(x => x.orderId === a.orderId);
                const da = oa && oa.customStatus === CONFIG.STATUS.COMPLETED;
                const db = allOrders.find(x => x.orderId === b.orderId) && allOrders.find(x => x.orderId === b.orderId).customStatus === CONFIG.STATUS.COMPLETED;
                if (da && !db) return 1; if (!da && db) return -1;
                return new Date(a.fechaDespacho || 0) - new Date(b.fechaDespacho || 0);
            });

            contentHtml = `
            <div class="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table class="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-xs">
                    <thead class="bg-slate-50 dark:bg-slate-700 font-bold text-slate-500 dark:text-slate-300 uppercase">
                        <tr>
                            <th class="px-4 py-3 text-left">Estado</th>
                            <th class="px-4 py-3 text-left">Orden</th>
                            <th class="px-4 py-3 text-left">Diseñador (Edición Rápida)</th>
                            <th class="px-4 py-3 text-left">Entrega</th>
                            <th class="px-4 py-3 text-right">Piezas</th>
                            <th class="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">`;

            planData.forEach(item => {
                const liveOrder = allOrders.find(o => o.orderId === item.orderId);
                const isCompleted = liveOrder && liveOrder.customStatus === CONFIG.STATUS.COMPLETED;
                const pzs = (Number(item.cantidad) || 0) + (Number(item.childPieces) || 0);
                
                // Generar dropdown de diseñadores
                const currentDes = item.designer || '';
                const designerOptions = ['<option value="">Sin asignar</option>', ...designerList.map(d => 
                    `<option value="${escapeHTML(d)}" ${d === currentDes ? 'selected' : ''}>${escapeHTML(d)}</option>`
                )].join('');

                const designerSelect = isCompleted ? 
                    `<span class="text-slate-400 font-medium">${currentDes}</span>` :
                    `<select onchange="quickUpdatePlanDesigner('${item.orderId}', this.value)" 
                        class="bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:ring-0 text-xs font-bold text-slate-700 dark:text-slate-200 py-1 pl-0 pr-8 cursor-pointer transition-colors w-full max-w-[150px]">
                        ${designerOptions}
                    </select>`;

                let badge = isCompleted ? `<span class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200 text-[10px] font-bold">COMPLETADA</span>` :
                            item.isLate ? `<span class="bg-red-50 text-red-600 px-2 py-0.5 rounded border border-red-100 text-[10px] font-bold">ATRASADA</span>` :
                            `<span class="bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100 text-[10px] font-bold">EN PROCESO</span>`;
                
                let rowClasses = isCompleted ? 'bg-slate-50 dark:bg-slate-900 opacity-60' : 'hover:bg-slate-50 dark:hover:bg-slate-700';

                contentHtml += `
                <tr class="${rowClasses} transition-colors">
                    <td class="px-4 py-3">${badge}</td>
                    <td class="px-4 py-3" onclick="openAssignModal('${item.orderId}')" style="cursor:pointer">
                        <div class="font-bold text-slate-800 dark:text-white">${escapeHTML(item.cliente)}</div>
                        <div class="text-[10px] text-slate-500">${escapeHTML(item.codigoContrato)} - ${escapeHTML(item.estilo)}</div>
                    </td>
                    <td class="px-4 py-3">${designerSelect}</td>
                    <td class="px-4 py-3 text-slate-600 dark:text-slate-400">${item.fechaDespacho ? new Date(item.fechaDespacho).toLocaleDateString() : '-'}</td>
                    <td class="px-4 py-3 text-right font-bold font-mono">${pzs.toLocaleString()}</td>
                    <td class="px-4 py-3 text-right">
                        <button class="btn-remove-from-plan text-slate-300 hover:text-red-500 transition" data-plan-entry-id="${item.planEntryId}" data-order-code="${item.codigoContrato}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>`;
            });
            contentHtml += `</tbody></table></div>`;

        } else {
            // === VISTA CALENDARIO (COLUMNAS) ===
            const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Otros'];
            const cols = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [] }; // 0=Lun, 4=Vie, 5=Otros

            planData.forEach(item => {
                if (!item.fechaDespacho) { cols[5].push(item); return; }
                
                // Ajustar día de la semana (getDay: 0=Dom, 1=Lun...)
                const d = new Date(item.fechaDespacho);
                let dayIdx = d.getDay(); // 0(Sun) - 6(Sat)
                
                // Mapeo: Lun(1)->0, Mar(2)->1, ..., Vie(5)->4, Sab/Dom/Otros -> 5
                let colIdx = (dayIdx >= 1 && dayIdx <= 5) ? dayIdx - 1 : 5;
                cols[colIdx].push(item);
            });

            contentHtml = `<div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 min-h-[500px]">`;
            
            days.forEach((dayName, idx) => {
                const ordersInDay = cols[idx] || [];
                const isToday = (new Date().getDay() - 1) === idx;
                
                contentHtml += `
                <div class="flex flex-col bg-slate-100 dark:bg-slate-800/50 rounded-xl border ${isToday ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-200 dark:border-slate-700'} h-full">
                    <div class="p-2 border-b border-slate-200 dark:border-slate-700 font-bold text-center text-xs uppercase text-slate-600 dark:text-slate-300 bg-slate-200/50 dark:bg-slate-700 rounded-t-xl sticky top-0 backdrop-blur-sm">
                        ${dayName} <span class="ml-1 bg-white dark:bg-slate-600 px-1.5 rounded-full text-[10px]">${ordersInDay.length}</span>
                    </div>
                    <div class="p-2 space-y-2 flex-1 overflow-y-auto max-h-[600px] scrollbar-thin">`;

                if (ordersInDay.length === 0) {
                    contentHtml += `<div class="text-center text-[10px] text-slate-400 italic mt-4">- Libre -</div>`;
                } else {
                    ordersInDay.forEach(item => {
                        const liveOrder = allOrders.find(o => o.orderId === item.orderId);
                        const isDone = liveOrder && liveOrder.customStatus === CONFIG.STATUS.COMPLETED;
                        const pzs = (Number(item.cantidad) || 0) + (Number(item.childPieces) || 0);
                        
                        // Card
                        contentHtml += `
                        <div onclick="openAssignModal('${item.orderId}')" class="bg-white dark:bg-slate-800 p-2 rounded border shadow-sm cursor-pointer hover:shadow-md transition group ${isDone ? 'opacity-50 border-slate-200' : 'border-l-4 border-l-blue-400 border-t-slate-100 border-r-slate-100 border-b-slate-100'}">
                            <div class="flex justify-between items-start mb-1">
                                <span class="text-[9px] font-bold bg-slate-50 dark:bg-slate-700 px-1 rounded truncate max-w-[80px]">${escapeHTML(item.cliente)}</span>
                                ${isDone ? '<i class="fa-solid fa-check text-green-500"></i>' : ''}
                            </div>
                            <div class="font-bold text-[10px] leading-tight mb-1 text-slate-800 dark:text-white line-clamp-2" title="${escapeHTML(item.estilo)}">${escapeHTML(item.estilo)}</div>
                            <div class="flex justify-between items-end mt-2">
                                <div class="flex items-center gap-1">
                                    <div class="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[9px] font-bold" title="${item.designer}">
                                        ${item.designer ? item.designer.substring(0,1) : '?'}
                                    </div>
                                </div>
                                <span class="font-mono text-[9px] text-slate-500">${pzs}p</span>
                            </div>
                        </div>`;
                    });
                }
                contentHtml += `</div></div>`;
            });
            contentHtml += `</div>`;
        }

        container.innerHTML = workloadHtml + contentHtml;

    }, 50);
}

// ✅ NUEVO: Edición Rápida desde la Tabla
window.quickUpdatePlanDesigner = async (orderId, newDesigner) => {
    // Feedback visual inmediato (opcional: poner spinner)
    showCustomAlert(`Asignando a ${newDesigner || 'Sin asignar'}...`, 'info');

    await safeFirestoreOperation(async () => {
        const batch = db_firestore.batch();
        
        // 1. Actualizar Orden Principal (Assignments)
        const assignRef = db_firestore.collection('assignments').doc(orderId);
        let desEmail = null;
        if (newDesigner) {
            const dObj = Array.from(firebaseDesignersMap.values()).find(d => d.name === newDesigner);
            if (dObj) desEmail = dObj.email;
        }

        batch.set(assignRef, { 
            designer: newDesigner, 
            designerEmail: desEmail,
            lastModified: new Date().toISOString() 
        }, { merge: true });

        // 2. Actualizar también el Plan Semanal (WeeklyPlan) para que no parpadee al refrescar
        // Nota: Esto busca en memoria el ID del plan activo para esa orden
        const weekInput = document.getElementById('view-workPlanWeekSelector');
        if (weekInput && weekInput.value) {
            const planItems = firebaseWeeklyPlanMap.get(weekInput.value) || [];
            const planItem = planItems.find(p => p.orderId === orderId);
            if (planItem) {
                batch.update(db_firestore.collection('weeklyPlan').doc(planItem.planEntryId), { designer: newDesigner });
            }
        }

        // 3. Historial
        const histRef = db_firestore.collection('history').doc();
        batch.set(histRef, {
            orderId: orderId,
            change: `Reasignado (Plan Rápido) a ${newDesigner}`,
            user: usuarioActual.displayName,
            timestamp: new Date().toISOString()
        });

        await batch.commit();

        // Actualización local optimista
        const localOrder = allOrders.find(o => o.orderId === orderId);
        if(localOrder) localOrder.designer = newDesigner;

        return true;
    }, 'Actualizando...', 'Diseñador actualizado.');
    
    // Recargar plan para reflejar cambios en gráficas
    setTimeout(generateWorkPlan, 500); 
};

// Función de eliminar (mantenida del paso anterior)
window.removeOrderFromPlan = async (planEntryId, orderCode) => {
    showConfirmModal(`¿Retirar la orden ${orderCode} del plan semanal?`, async () => {
        await safeFirestoreOperation(async () => {
            await db_firestore.collection('weeklyPlan').doc(planEntryId).delete();
            return true;
        }, 'Eliminando...', 'Orden retirada del plan.');
        if(typeof generateWorkPlan === 'function') generateWorkPlan();
    });
};
// ======================================================
// ===== 15. COMPARACIÓN Y REPORTES =====
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

window.openWeeklyReportModal = () => {
    const weekSelector = document.getElementById('weekSelector');
    if (weekSelector) weekSelector.value = getWeekIdentifierString(new Date());
    generateWeeklyReport();
    openModalById('weeklyReportModal');
};

// ======================================================
// ===== 17. KANBAN (CON RECHAZO Y CARGA DE TRABAJO) =====
// ======================================================

function updateKanban() {
    const designerFilterSelect = document.getElementById('kanbanDesignerFilter');
    let targetDesigner = designerFilterSelect.value;

    if (currentDesignerName && userRole !== 'admin') {
        targetDesigner = currentDesignerName;
        designerFilterSelect.style.display = 'none'; 
    } else {
        designerFilterSelect.style.display = 'block';
    }

    // Ocultar columna Completada
    const completedZone = document.querySelector('.kanban-dropzone[data-status="Completada"]');
    if (completedZone) {
        const parentCol = completedZone.closest('.kanban-column');
        if (parentCol) parentCol.style.display = 'none';
    }

    // 1. Filtrar órdenes
    let orders = allOrders.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART);
    if(targetDesigner) {
        orders = orders.filter(o => o.designer === targetDesigner);
    }

    // --- NUEVO: RENDERIZAR CARGA DE TRABAJO EN KANBAN ---
    renderKanbanWorkload(orders);

    // 2. Definir columnas
    const columns = {
        'Bandeja': document.querySelector('.kanban-dropzone[data-status="Bandeja"]'),
        'Producción': document.querySelector('.kanban-dropzone[data-status="Producción"]'),
        'Auditoría': document.querySelector('.kanban-dropzone[data-status="Auditoría"]')
    };

    // Limpiar columnas
    Object.keys(columns).forEach(k => {
        if(columns[k]) columns[k].innerHTML = '';
        const countEl = document.getElementById(`count-${k}`);
        if(countEl) countEl.textContent = '0';
    });

    const counts = { 'Bandeja': 0, 'Producción': 0, 'Auditoría': 0 };

    // 3. Renderizar Tarjetas
    orders.forEach(o => {
        let status = o.customStatus || 'Bandeja';
        if (!columns[status]) return; 

        counts[status]++;

        const card = document.createElement('div');
        card.className = 'kanban-card bg-white dark:bg-slate-700 p-3 rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 cursor-move hover:shadow-md transition group relative border-l-4';

        if(o.isVeryLate) card.classList.add('border-l-red-500');
        else if(o.isLate) card.classList.add('border-l-orange-400');
        else if(o.isAboutToExpire) card.classList.add('border-l-yellow-400');
        else card.classList.add('border-l-slate-300'); 

        card.draggable = true;
        card.dataset.id = o.orderId;
        card.dataset.designer = o.designer || ''; // Guardamos diseñador para referencia
        card.ondragstart = drag;
        card.onclick = () => openAssignModal(o.orderId); 

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

    // Actualizar contadores
    Object.keys(counts).forEach(k => {
        const countEl = document.getElementById(`count-${k}`);
        if(countEl) countEl.textContent = counts[k];
    });

    filterKanbanCards();
}

// --- FUNCIÓN NUEVA: Mostrar Carga de Trabajo en Header de Kanban ---
function renderKanbanWorkload(orders) {
    // Buscar o Crear contenedor
    let workloadContainer = document.getElementById('kanbanWorkloadContainer');
    if (!workloadContainer) {
        const header = document.querySelector('#kanbanView header');
        workloadContainer = document.createElement('div');
        workloadContainer.id = 'kanbanWorkloadContainer';
        workloadContainer.className = "w-full bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-2 flex gap-4 overflow-x-auto scrollbar-thin";
        // Insertar después del header
        if(header && header.nextSibling) {
            header.parentNode.insertBefore(workloadContainer, header.nextSibling);
        }
    }

    // Calcular Carga (Solo Producción y Auditoría cuentan como carga activa)
    const activeOrders = orders.filter(o => o.customStatus === 'Producción' || o.customStatus === 'Auditoría');
    const workload = {};
    let maxLoad = 0;

    activeOrders.forEach(o => {
        const d = o.designer || 'Sin asignar';
        const pzs = (Number(o.cantidad) || 0) + (Number(o.childPieces) || 0);
        if (!workload[d]) workload[d] = { count: 0, pieces: 0 };
        workload[d].count++;
        workload[d].pieces += pzs;
        if (workload[d].pieces > maxLoad) maxLoad = workload[d].pieces;
    });

    // Generar HTML
    if (Object.keys(workload).length === 0) {
        workloadContainer.innerHTML = '<span class="text-[10px] text-slate-400 italic">Sin carga activa en Producción/Auditoría</span>';
        return;
    }

    let html = `<div class="flex items-center gap-2 mr-4 border-r border-slate-200 dark:border-slate-600 pr-4"><i class="fa-solid fa-chart-simple text-slate-400"></i> <span class="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase">Carga Activa</span></div>`;
    
    Object.entries(workload).sort((a,b) => b[1].pieces - a[1].pieces).forEach(([name, data]) => {
        const percent = maxLoad > 0 ? Math.round((data.pieces / maxLoad) * 100) : 0;
        // Color semáforo
        const colorClass = percent > 80 ? 'bg-red-500' : percent > 50 ? 'bg-yellow-500' : 'bg-green-500';
        
        html += `
        <div class="flex flex-col justify-center min-w-[100px]">
            <div class="flex justify-between text-[9px] mb-0.5">
                <span class="font-bold text-slate-700 dark:text-slate-300 truncate max-w-[70px]" title="${name}">${name}</span>
                <span class="text-slate-500">${data.pieces}p</span>
            </div>
            <div class="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                <div class="${colorClass} h-1.5 rounded-full" style="width: ${percent}%"></div>
            </div>
        </div>`;
    });

    workloadContainer.innerHTML = html;
}

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

function allowDrop(ev) {
    ev.preventDefault();
    ev.currentTarget.classList.add('bg-blue-50/50', 'ring-2', 'ring-blue-300', 'ring-inset');
}

function dragLeave(ev) {
    ev.currentTarget.classList.remove('bg-blue-50/50', 'ring-2', 'ring-blue-300', 'ring-inset');
}

function drag(ev) {
    ev.dataTransfer.setData("text", ev.target.dataset.id);
    ev.dataTransfer.effectAllowed = "move";
}

// ✅ DROP CORREGIDO: INTERCEPTA RECHAZOS Y ABRE MODAL
async function drop(ev) {
    ev.preventDefault();
    const zone = ev.currentTarget;
    zone.classList.remove('bg-blue-50/50', 'ring-2', 'ring-blue-300', 'ring-inset'); 

    const orderId = ev.dataTransfer.getData("text");
    const newStatus = zone.dataset.status;

    // Obtener referencia a la tarjeta y su estado anterior
    const card = document.querySelector(`div[data-id="${orderId}"]`);
    if (!card) return;

    const oldZone = card.closest('.kanban-dropzone');
    const oldStatus = oldZone ? oldZone.dataset.status : '';
    const designerName = card.dataset.designer;

    // --- LOGICA DE INTERCEPCIÓN PARA AUDITORES (O ADMINS) ---
    // Si se mueve de Auditoría -> Producción, se considera un RECHAZO.
    if (newStatus === 'Producción' && oldStatus === 'Auditoría') {
        
        // 1. Guardar estado pendiente en memoria global
        window.pendingRejection = {
            orderId: orderId,
            newStatus: newStatus,
            prevStatus: oldStatus,
            designer: designerName
        };

        // 2. Abrir Modal de Rechazo inmediatamente
        // Asegurarse de que el modal de rechazo esté disponible en el HTML
        if (document.getElementById('rejectionModal')) {
            openModalById('rejectionModal');
        } else {
            showCustomAlert('Error: Modal de rechazo no encontrado en HTML.', 'error');
        }

        return; // 🛑 DETENER LA EJECUCIÓN AQUÍ (No mover la tarjeta visualmente aún)
    }

    // --- SI NO ES RECHAZO, PROCEDER NORMALMENTE ---
    if(card) { zone.appendChild(card); }

    try {
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

            const hRef = db_firestore.collection('history').doc();
            batch.set(hRef, {
                orderId: orderId,
                change: `Movido a ${newStatus} (Kanban)`,
                user: usuarioActual.displayName,
                timestamp: new Date().toISOString()
            });

            await batch.commit();
        }, 'Moviendo...', null);
    } catch (e) {
        console.error("Error moviendo tarjeta, revirtiendo UI");
        if(oldZone) oldZone.appendChild(card); // Revertir si falla
    }
}

function updateKanbanDropdown() {
    const sel = document.getElementById('kanbanDesignerFilter');
    if(sel) {
        sel.innerHTML = '<option value="">Todos los Diseñadores</option>' + 
        designerList.map(d => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
    }
}

// ======================================================
// ===== 18. CHAT Y MENCIONES (CORREGIDO) =====
// ======================================================

function loadOrderComments(orderId) {
    const chatContainer = document.getElementById('chatHistory');
    if(!chatContainer) return;

    chatContainer.innerHTML = '<div class="flex justify-center pt-4"><div class="spinner"></div></div>';

    if (unsubscribeChat) {
        unsubscribeChat();
        unsubscribeChat = null;
    }

    const commentsRef = db_firestore.collection('assignments').doc(orderId).collection('comments').orderBy('timestamp', 'asc');

    unsubscribeChat = commentsRef.onSnapshot(snapshot => {
        chatContainer.innerHTML = '';
        if (snapshot.empty) {
            const order = allOrders.find(o => o.orderId === orderId);
            if(order && order.notes) {
                renderSystemMessage(`Nota del Excel: "${order.notes}"`);
            } else {
                chatContainer.innerHTML = '<p class="text-center text-slate-300 italic text-xs mt-4">No hay comentarios aún.</p>';
            }
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const isMe = usuarioActual && (data.userEmail === usuarioActual.email);
            renderMessage(data, isMe, chatContainer);
        });

        chatContainer.scrollTop = chatContainer.scrollHeight;
    });
}

function renderMessage(data, isMe, container) {
    const div = document.createElement('div');
    div.className = `chat-bubble ${isMe ? 'me' : 'other'}`;
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

// ✅ CORRECCIÓN #6: Menciones robustas
async function sendComment() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();

    if (!text || !currentEditingOrderId || !usuarioActual) return;

    input.value = ''; 
    input.style.height = 'auto'; 
    document.getElementById('mentionDropdown').classList.add('hidden');

    try {
        await db_firestore.collection('assignments').doc(currentEditingOrderId).collection('comments').add({
            text: text,
            userId: usuarioActual.uid,
            userName: usuarioActual.displayName || 'Usuario',
            userEmail: usuarioActual.email,
            timestamp: new Date().toISOString()
        });

        db_firestore.collection('assignments').doc(currentEditingOrderId).update({
            lastModified: new Date().toISOString()
        });

        if (designerList && designerList.length > 0) {
            designerList.forEach(designerName => {
                // Chequeo simple de string en lugar de regex compleja
                if (text.includes(`@${designerName}`)) {
                    let targetEmail = null;
                    firebaseDesignersMap.forEach(dData => {
                        if (dData.name === designerName) targetEmail = dData.email;
                    });

                    if (targetEmail && targetEmail.toLowerCase() !== usuarioActual.email.toLowerCase()) {
                        createNotification(
                            targetEmail,
                            'mention',
                            'Te mencionaron',
                            `${usuarioActual.displayName} te mencionó en una orden`,
                            currentEditingOrderId
                        );
                    }
                }
            });
        }

    } catch (e) {
        console.error(e);
        showCustomAlert('Error enviando mensaje', 'error');
    }
}

function handleChatInput(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight) + 'px';

    const val = textarea.value;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPos);
    const lastAt = textBeforeCursor.lastIndexOf('@');
    const dropdown = document.getElementById('mentionDropdown');

    if (lastAt !== -1) {
        const query = textBeforeCursor.substring(lastAt + 1).toLowerCase();
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
    textarea.value = `${before}@${name} `;
    document.getElementById('mentionDropdown').classList.add('hidden');
    textarea.focus();
}

function insertEmoji(emoji) {
    const input = document.getElementById('chatInput');
    input.value += emoji;
    input.focus();
}

document.getElementById('chatInput')?.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendComment();
    }
});

// ======================================================
// ===== 19. FUNCIONES GLOBALES ( HELPERS UI ) =====
// ======================================================

window.changePage = (p) => { 
    if(typeof currentPage !== 'undefined') { currentPage = p; updateTable(); }
};
window.changeRowsPerPage = () => { 
    const el = document.getElementById('rowsPerPage');
    if(el) { rowsPerPage = parseInt(el.value); currentPage = 1; updateTable(); }
};
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
window.clearSelection = () => { selectedOrders.clear(); updateTable(); };
window.toggleNotifications = () => { const drop = document.getElementById('notificationDropdown'); if(drop) drop.classList.toggle('hidden'); };

function getStatusBadge(order) {
    const base = "px-3 py-1 rounded-full text-xs font-medium inline-flex items-center justify-center shadow-sm whitespace-nowrap";
    if (order.isVeryLate) return `<div class="flex flex-col items-start gap-1"><span class="${base} bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800">MUY ATRASADA</span><span class="text-[10px] font-bold text-red-600 dark:text-red-400 ml-1"><i class="fa-solid fa-clock"></i> ${order.daysLate} días</span></div>`;
    if (order.isLate) return `<div class="flex flex-col items-start gap-1"><span class="${base} bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-800">Atrasada</span><span class="text-[10px] font-bold text-orange-600 dark:text-orange-400 ml-1"><i class="fa-regular fa-clock"></i> ${order.daysLate} días</span></div>`;
    if (order.isAboutToExpire) return `<span class="${base} bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800">Por Vencer</span>`;
    return `<span class="${base} bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800">A Tiempo</span>`;
}

function getCustomStatusBadge(status) {
    const base = "px-3 py-1 rounded-full text-xs font-medium border inline-block min-w-[90px] text-center shadow-sm";
    const safeStatus = escapeHTML(status || 'Sin estado');
    // Si está completada pero sigue en Arte, la marcamos como "En Espera de Salida" o similar, o simplemente mantenemos el badge verde.
    if (status === 'Completada') return `<span class="${base} bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-600">${safeStatus}</span>`;
    if (status === 'Bandeja') return `<span class="${base} bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800">${safeStatus}</span>`;
    if (status === 'Producción') return `<span class="${base} bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800">${safeStatus}</span>`;
    if (status === 'Auditoría') return `<span class="${base} bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800">${safeStatus}</span>`;
    return `<span class="text-slate-400 text-xs italic pl-2">${safeStatus}</span>`;
}

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

function populateFilterDropdowns() {
    const populate = (id, key) => {
        const sel = document.getElementById(id);
        if(!sel) return;
        
        // 🔴 LIMPIEZA FORZADA PARA EL FILTRO SUPERIOR
        if (id === 'customStatusFilter') {
            for (let i = sel.options.length - 1; i >= 0; i--) {
                if (sel.options[i].value === 'Completada') sel.remove(i);
            }
            return; // No repoblar, usar lo del HTML menos "Completada"
        }

        const currentVal = sel.value;
        const options = [...new Set(allOrders.map(o => o[key]).filter(Boolean))].sort();
        if(id === 'departamentoFilter') {
             sel.innerHTML = '<option value="">(Defecto: Solo Arte)</option><option value="ALL_DEPTS">🌎 VER TODOS LOS DEPTOS</option>' + options.map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('');
        } else {
             sel.innerHTML = '<option value="">Todos</option>' + options.map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('');
        }
        sel.value = currentVal;
    };
    populate('clientFilter', 'cliente'); populate('styleFilter', 'estilo'); populate('teamFilter', 'teamName'); populate('departamentoFilter', 'departamento'); 
    
    // Llamar explícitamente al de estado para limpiarlo
    populate('customStatusFilter', 'customStatus');
    
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

// ======================================================
// ===== 20. SISTEMA DE DRILL-DOWN Y NAVEGACIÓN =====
// ======================================================

// Estado de filtros activos (Mapeo a variables globales existentes)
const FILTER_STATE = {
    labels: [], // Para breadcrumbs visuales
    active: false
};

/**
 * Función Maestra de Drill-Down
 * Aplica filtros, actualiza la URL, la UI y navega a la tabla.
 * @param {string} filterType - Tipo de filtro: 'status', 'client', 'designer', 'late', 'team', etc.
 * @param {string} value - Valor a filtrar.
 * @param {string} description - Texto para el breadcrumb (Ej: "Cliente: Nike").
 */
function handleDrillDown(filterType, value, description) {
    // 1. Limpiar filtros previos si es un drill-down nuevo (opcional, depende de UX deseada)
    // clearAllFilters(false); // false = no refrescar tabla aún

    // 2. Mapear drill-down a variables globales existentes en app.js
    switch (filterType) {
        case 'client':
            document.getElementById('clientFilter').value = value;
            currentClientFilter = value;
            break;
        case 'designer':
            document.getElementById('designerFilter').value = value;
            currentDesignerFilter = value;
            break;
        case 'status':
            // Mapeo especial para estados internos
            document.getElementById('customStatusFilter').value = value;
            currentCustomStatusFilter = value;
            break;
        case 'team':
            document.getElementById('teamFilter').value = value;
            currentTeamFilter = value;
            break;
        case 'late':
            // Filtros predefinidos de estado
            currentFilter = value; 
            break;
        case 'week':
             // Lógica para filtrar por fecha (semana actual)
             // Implementación simplificada: set date range
             break;
    }

    // 3. Agregar a Breadcrumbs
    addBreadcrumb(description, filterType);

    // 4. Sincronizar URL (Query Params)
    updateURLParams();

    // 5. Navegar a la vista de dashboard si no estamos ahí
    if (document.getElementById('dashboard').style.display === 'none') {
        navigateTo('dashboard');
    }

    // 6. Ejecutar filtro y scroll a la tabla
    currentPage = 1;
    updateTable();
    
    // Smooth scroll a la tabla
    const tableElement = document.querySelector('.table-container');
    if (tableElement) {
        tableElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * Gestión de Breadcrumbs (Migas de Pan)
 */
function addBreadcrumb(label, type) {
    const container = document.getElementById('activeFiltersContainer');
    const list = document.getElementById('filterBreadcrumbsList');
    
    if (!container || !list) return;

    // Mostrar contenedor si estaba oculto
    container.classList.remove('hidden');
    container.classList.add('flex');

    // Evitar duplicados visuales
    const existing = Array.from(list.children).find(li => li.innerText.includes(label));
    if (existing) return;

    const li = document.createElement('li');
    li.className = "flex items-center text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 px-3 py-1 rounded-full shadow-sm border border-slate-200 dark:border-slate-600 animate-fade-in-up";
    li.innerHTML = `
        <span class="mr-2">${label}</span>
        <button onclick="removeBreadcrumb(this, '${type}')" class="text-slate-400 hover:text-red-500 transition">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;
    list.appendChild(li);
}

window.removeBreadcrumb = (element, type) => {
    // Remover visualmente
    element.closest('li').remove();

    // Revertir lógica de filtro global
    switch (type) {
        case 'client': document.getElementById('clientFilter').value = ''; currentClientFilter = ''; break;
        case 'designer': document.getElementById('designerFilter').value = ''; currentDesignerFilter = ''; break;
        case 'status': document.getElementById('customStatusFilter').value = ''; currentCustomStatusFilter = ''; break;
        case 'team': document.getElementById('teamFilter').value = ''; currentTeamFilter = ''; break;
        case 'late': currentFilter = 'all'; break;
    }

    // Si no quedan breadcrumbs, ocultar contenedor
    const list = document.getElementById('filterBreadcrumbsList');
    if (list.children.length === 0) {
        document.getElementById('activeFiltersContainer').classList.add('hidden');
        document.getElementById('activeFiltersContainer').classList.remove('flex');
    }

    updateURLParams();
    updateTable();
};

window.clearBreadcrumbs = () => {
    const list = document.getElementById('filterBreadcrumbsList');
    if (list) list.innerHTML = '';
    document.getElementById('activeFiltersContainer')?.classList.add('hidden');
    document.getElementById('activeFiltersContainer')?.classList.remove('flex');
    
    // Llamar a la función original de limpieza
    clearAllFilters();
    
    // Limpiar URL
    const url = new URL(window.location);
    url.search = "";
    window.history.pushState({}, '', url);
};

/**
 * Persistencia de Estado en URL
 */
function updateURLParams() {
    const params = new URLSearchParams();
    if (currentClientFilter) params.set('client', currentClientFilter);
    if (currentDesignerFilter) params.set('designer', currentDesignerFilter);
    if (currentCustomStatusFilter) params.set('status', currentCustomStatusFilter);
    if (currentFilter !== 'all') params.set('filter', currentFilter);
    
    // Actualizar URL sin recargar
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
}

function loadFiltersFromURL() {
    const params = new URLSearchParams(window.location.search);
    let hasFilters = false;

    if (params.has('client')) {
        const val = params.get('client');
        handleDrillDown('client', val, `Cliente: ${val}`);
        hasFilters = true;
    }
    if (params.has('designer')) {
        const val = params.get('designer');
        handleDrillDown('designer', val, `Diseñador: ${val}`);
        hasFilters = true;
    }
    if (params.has('status')) {
        const val = params.get('status');
        handleDrillDown('status', val, `Estado: ${val}`);
        hasFilters = true;
    }
    if (params.has('filter')) {
        const val = params.get('filter');
        let label = val === 'late' ? 'Atrasadas' : val === 'veryLate' ? 'Muy Atrasadas' : 'Filtro';
        handleDrillDown('late', val, label);
        hasFilters = true;
    }

    if (hasFilters) updateTable();
}

/**
 * Chart.js Click Handler (Integración)
 * Esta función se debe asignar a la propiedad onClick de tus gráficos Chart.js
 */
function chartClickHandler(evt, elements, chartInstance) {
    if (!elements || elements.length === 0) return;

    const index = elements[0].index;
    
    // Obtener etiqueta y dataset
    const label = chartInstance.data.labels[index];
    const datasetLabel = chartInstance.data.datasets[elements[0].datasetIndex].label;

    // Lógica inteligente según el ID del canvas
    const canvasId = chartInstance.canvas.id;

    if (canvasId === 'designerDoughnutChart') {
        // Grafico de Pastel (Estado)
        handleDrillDown('status', label, `Estado: ${label}`);
    } 
    else if (canvasId === 'designerBarChart') {
        // Grafico de Barras (Eficiencia)
        if (label === 'Atrasadas') handleDrillDown('late', 'late', 'Solo Atrasadas');
        else if (label === 'Muy Atrasadas') handleDrillDown('late', 'veryLate', 'Críticas (>7 días)');
        // 'A Tiempo' es más complejo filtrar directamente con la lógica actual, omitimos o creamos filtro custom
    }
    else if (canvasId === 'deptLoadBarChart') {
        // Grafico de Lead Time (Nombres de Diseñadores en eje Y/X)
        handleDrillDown('designer', label, `Diseñador: ${label}`);
    }
}

// ======================================================
// ===== INTEGRACIÓN EN INICIALIZACIÓN =====
// ======================================================

// Sobrescribir la función existing loadMasterOrders para chequear URL al final
const originalLoadMasterOrders = loadMasterOrders;
loadMasterOrders = async function() {
    await originalLoadMasterOrders();
    // Una vez cargados los datos, aplicamos filtros de URL si existen
    setTimeout(loadFiltersFromURL, 500);
};

// Modificar configuración de ChartJS (inyectar dinámicamente)
const originalChartConstructor = Chart;
Chart = function(ctx, config) {
    // Inyectar onClick si no existe y es uno de nuestros gráficos objetivo
    if (!config.options.onClick) {
        config.options.onClick = (e, els) => chartClickHandler(e, els, this);
    }
    return new originalChartConstructor(ctx, config);
}
// Copiar prototipo para mantener compatibilidad
Object.assign(Chart, originalChartConstructor);

// ======================================================
// ===== 23. HERRAMIENTAS ADMINISTRATIVAS (USUARIOS) =====
// ======================================================

window.openUserRoleManager = async () => {
    if (!requireAdmin()) return;
    openModalById('userRoleModal');
    renderUserRoleList();
};

async function renderUserRoleList() {
    const list = document.getElementById('userRoleList');
    list.innerHTML = '<tr><td colspan="3" class="p-4 text-center"><div class="spinner"></div></td></tr>';

    try {
        const snapshot = await db_firestore.collection('users').orderBy('email').get();
        if (snapshot.empty) {
            list.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-slate-400 italic">No hay usuarios con roles asignados.</td></tr>';
            return;
        }
        let html = '';
        snapshot.forEach(doc => {
            const u = doc.data();
            const badgeColor = u.role === 'admin' ? 'bg-red-100 text-red-700' : u.role === 'auditor' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700';
            html += `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/50 group">
                <td class="p-3">
                    <div class="font-bold text-slate-800 dark:text-white">${escapeHTML(u.email)}</div>
                    <div class="text-[10px] text-slate-400">Actualizado: ${new Date(u.updatedAt || u.createdAt || Date.now()).toLocaleDateString()}</div>
                </td>
                <td class="p-3">
                    <span class="px-2 py-1 rounded text-xs font-bold uppercase ${badgeColor} border border-opacity-20">${escapeHTML(u.role)}</span>
                </td>
                <td class="p-3 text-right">
                    <button onclick="deleteUserRole('${doc.id}')" class="text-slate-400 hover:text-red-500 transition p-2" title="Revocar permisos">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        });
        list.innerHTML = html;
    } catch (e) { console.error(e); list.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-red-500">Error cargando usuarios.</td></tr>'; }
}

window.saveUserRole = async () => {
    const email = document.getElementById('roleUserEmail').value.trim().toLowerCase();
    const role = document.getElementById('roleUserType').value;
    if (!email || !email.includes('@')) return showCustomAlert('Ingresa un correo válido.', 'error');
    if (!requireAdmin()) return;

    await safeFirestoreOperation(async () => {
        await db_firestore.collection('users').doc(email).set({
            email: email, role: role, updatedAt: new Date().toISOString(), updatedBy: usuarioActual.email
        }, { merge: true });
        document.getElementById('roleUserEmail').value = '';
        renderUserRoleList();
        return true;
    }, 'Guardando permisos...', `Usuario ${email} ahora es ${role.toUpperCase()}`);
};

window.deleteUserRole = async (emailId) => {
    if (!requireAdmin()) return;
    if (emailId === usuarioActual.email.toLowerCase()) return showCustomAlert('No puedes eliminar tu propio rol de administrador.', 'error');
    showConfirmModal(`¿Revocar permisos a ${emailId}?`, async () => {
        await safeFirestoreOperation(async () => {
            await db_firestore.collection('users').doc(emailId).delete();
            renderUserRoleList();
            return true;
        }, 'Eliminando...', 'Permisos revocados.');
    });
};

window.resetApp = () => {
    // ✅ CORRECCIÓN: Debug logs y validación admin explícita para que el botón responda
    console.log("Intento de resetear app. Rol actual:", userRole);

    if (userRole !== 'admin') {
        showCustomAlert(`Acceso denegado. Tu rol es: ${userRole}. Contacta a soporte.`, 'error');
        return;
    }

    showConfirmModal("¿Subir nuevo archivo? Se borrarán los datos de la memoria local (no de la nube).", () => {
        console.log("Reseteando interfaz...");
        
        const main = document.getElementById('appMainContainer');
        const nav = document.getElementById('mainNavigation');
        const upload = document.getElementById('uploadSection');

        if(main) main.style.display = 'none';
        if(nav) nav.style.display = 'none';
        if(upload) upload.style.display = 'block';
        
        allOrders = []; 
        isExcelLoaded = false;
        masterOrdersLoaded = false;
        document.getElementById('fileInput').value = ''; 
        document.getElementById('fileName').textContent = '';
        
        desconectarDatosDeFirebase(); 
        
        if (typeof destroyAllCharts === 'function') destroyAllCharts();

        showCustomAlert("Listo para cargar nuevo archivo.", "info");
    });
};

// ======================================================
// ===== 24. FUNCIONES DE CALIDAD =====
// ======================================================

window.updateQualityView = () => {
    const view = document.getElementById('qualityView');
    if (!view || view.style.display === 'none') return;

    // Obtener logs ordenados por fecha descendente
    const logs = Array.from(firebaseQualityLogsMap.values()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // 1. Calcular KPIs
    const totalErrors = logs.length;
    const artOrdersCount = allOrders.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART).length;
    const rejectRate = artOrdersCount > 0 ? ((totalErrors / artOrdersCount) * 100).toFixed(1) : 0;

    const categories = {};
    logs.forEach(l => categories[l.category] = (categories[l.category] || 0) + 1);
    const topCategoryEntry = Object.entries(categories).sort((a,b) => b[1] - a[1])[0];
    const topCategoryName = topCategoryEntry ? topCategoryEntry[0] : '-';

    // 2. Actualizar DOM KPIs
    if(document.getElementById('kpiRejectRate')) document.getElementById('kpiRejectRate').textContent = rejectRate + '%';
    if(document.getElementById('kpiTotalErrors')) document.getElementById('kpiTotalErrors').textContent = totalErrors;
    if(document.getElementById('kpiTopCategory')) document.getElementById('kpiTopCategory').textContent = topCategoryName;

    // 3. Renderizar Tabla
    const tbody = document.getElementById('qualityLogTableBody');
    if (tbody) {
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400 italic">No hay registros de rechazos aún.</td></tr>';
        } else {
            tbody.innerHTML = logs.map(log => {
                const order = allOrders.find(o => o.orderId === log.orderId);
                const clientName = order ? order.cliente : 'Orden Archivada';
                const styleName = order ? order.estilo : log.orderId;

                return `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition border-b border-slate-100 dark:border-slate-700">
                    <td class="px-4 py-3 text-slate-500 dark:text-slate-400">
                        ${new Date(log.timestamp).toLocaleDateString()} 
                        <span class="text-[10px] opacity-70">${new Date(log.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    </td>
                    <td class="px-4 py-3">
                        <div class="font-bold text-slate-700 dark:text-slate-200">${escapeHTML(clientName)}</div>
                        <div class="text-[10px] text-slate-400">${escapeHTML(styleName)}</div>
                    </td>
                    <td class="px-4 py-3 font-medium text-blue-600 dark:text-blue-400">${escapeHTML(log.designer)}</td>
                    <td class="px-4 py-3">
                        <span class="px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded text-[10px] font-bold border border-red-100 dark:border-red-900">
                            ${escapeHTML(log.category)}
                        </span>
                    </td>
                    <td class="px-4 py-3 text-slate-600 dark:text-slate-300 italic">"${escapeHTML(log.reason)}"</td>
                    <td class="px-4 py-3 text-slate-500 dark:text-slate-400 text-[11px]">${escapeHTML(log.auditor)}</td>
                </tr>`;
            }).join('');
        }
    }

    // 4. Renderizar Gráficos
    if (typeof Chart !== 'undefined') {
        renderQualityCharts(logs, categories);
    }
};

function renderQualityCharts(logs, categoryCounts) {
    // ============================================================
    // CORRECCIÓN: Destrucción robusta usando Chart.getChart(id)
    // ============================================================
    
    // 1. Limpiar Pareto Chart (Busca instancia en el DOM)
    const existingPareto = Chart.getChart("qualityParetoChart");
    if (existingPareto) {
        existingPareto.destroy();
    }
    // Limpiar referencia de variable global por seguridad
    if (window.qualityParetoChart instanceof Chart) {
        window.qualityParetoChart = null;
    }

    // 2. Limpiar Designer Chart (Busca instancia en el DOM)
    const existingDesigner = Chart.getChart("qualityDesignerChart");
    if (existingDesigner) {
        existingDesigner.destroy();
    }
    // Limpiar referencia de variable global por seguridad
    if (window.qualityDesignerChart instanceof Chart) {
        window.qualityDesignerChart = null;
    }

    // ============================================================
    // RE-RENDERIZADO
    // ============================================================

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#cbd5e1' : '#666';

    // Gráfico de Barras (Pareto)
    const ctxPareto = document.getElementById('qualityParetoChart');
    if (ctxPareto) {
        window.qualityParetoChart = new Chart(ctxPareto, {
            type: 'bar',
            data: {
                labels: Object.keys(categoryCounts),
                datasets: [{
                    label: 'Cantidad',
                    data: Object.values(categoryCounts),
                    backgroundColor: '#ef4444',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                indexAxis: 'y',
                scales: { 
                    x: { ticks: { color: textColor } }, 
                    y: { ticks: { color: textColor } } 
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    // Gráfico Donut (Diseñadores)
    const designerErrors = {};
    logs.forEach(l => designerErrors[l.designer] = (designerErrors[l.designer] || 0) + 1);

    const ctxDesigner = document.getElementById('qualityDesignerChart');
    if (ctxDesigner) {
        window.qualityDesignerChart = new Chart(ctxDesigner, {
            type: 'doughnut',
            data: {
                labels: Object.keys(designerErrors),
                datasets: [{
                    data: Object.values(designerErrors),
                    backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#6366f1'],
                    borderColor: isDark ? '#1e293b' : '#fff'
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'right', labels: { color: textColor, boxWidth: 10 } } }
            }
        });
    }
}