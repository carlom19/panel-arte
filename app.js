// ======================================================
// ===== MÓDULO 1: CONFIGURACIÓN, VARIABLES Y UTILS =====
// ======================================================

// 1.1 CONFIGURACIÓN DE FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyAX9jZYnVSGaXdM06I0LTBvbvDpNulMPpk",
    authDomain: "panel-arte.firebaseapp.com",
    projectId: "panel-arte",
    storageBucket: "panel-arte.firebasestorage.app",
    messagingSenderId: "236381043860",
    appId: "1:236381043860:web:f6a9c2cb211dd9161d0881"
}; 

// Inicialización segura
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} else if (typeof firebase === 'undefined') {
    console.error("Error CRÍTICO: El SDK de Firebase no se ha cargado en el HTML.");
}

const db_firestore = firebase.firestore(); 
// Habilitar persistencia offline para mejorar velocidad
db_firestore.enablePersistence({ synchronizeTabs: true })
    .catch(err => console.warn('Persistencia:', err.code));

// 1.2 CONSTANTES GLOBALES
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

// 1.3 VARIABLES DE ESTADO
let allOrders = []; 
let selectedOrders = new Set();
let usuarioActual = null; 
let isExcelLoaded = false;
let userRole = 'user'; 
let currentDesignerName = null; 
let masterOrdersLoaded = false;

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

// Suscripciones de Firebase (Declaración única)
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

// Variables de Gráficos (para limpieza)
let designerDoughnutChart = null;
let designerBarChart = null;
let deptLoadPieChart = null;
let deptLoadBarChart = null;
let compareChart = null;
let currentCompareDesigner1 = '';

// 1.4 GESTOR DE MODALES
const modalStack = []; 

function openModalById(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    // Manejo de z-index para modales apilados
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

// Atajos globales para cerrar modales específicos
window.closeModal = () => closeTopModal(); 
window.closeConfirmModal = () => closeTopModal(); 
window.closeMultiModal = () => closeTopModal(); 
window.closeAddChildModal = () => closeTopModal(); 
window.closeDesignerManager = () => closeTopModal(); 
window.closeCompareModals = () => closeAllModals(); 
window.closeWeeklyReportModal = () => closeTopModal(); 
window.closeLegendModal = () => closeTopModal();

// Cerrar con tecla ESC
document.addEventListener('keydown', (e) => { 
    if (e.key === 'Escape' && modalStack.length > 0) closeTopModal(); 
});

// 1.5 TEMA (DARK MODE)
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

// 1.6 UTILIDADES GENERALES
async function safeFirestoreOperation(operation, loadingMsg = 'Procesando...', successMsg = null) {
    showLoading(loadingMsg);
    // Timeout extendido a 15s para operaciones batch grandes
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 15000));
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
    alertDiv.innerHTML = `
        <div class="p-4 flex items-start">
            <div class="flex-shrink-0"><i class="fa-solid ${icon} text-xl"></i></div>
            <div class="ml-3 w-0 flex-1 pt-0.5">
                <p class="text-sm font-medium text-slate-900 dark:text-white uppercase">${type}</p>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-300">${escapeHTML(message)}</p>
            </div>
            <div class="ml-4 flex flex-shrink-0">
                <button onclick="document.getElementById('customAlert').style.display='none'" class="text-slate-400 hover:text-slate-500 dark:hover:text-white"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>`;
    alertDiv.style.display = 'block';
    
    if (window.alertTimeout) clearTimeout(window.alertTimeout);
    window.alertTimeout = setTimeout(() => { alertDiv.style.display = 'none'; }, 4000);
}

function showLoading(msg='Cargando...') {
    if (document.getElementById('loadingOverlay')) return;
    const o = document.createElement('div'); 
    o.id = 'loadingOverlay'; 
    o.className = 'loading-overlay fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm'; 
    o.innerHTML = `<div class="spinner border-4 border-slate-200 dark:border-slate-700 border-t-blue-600 dark:border-t-blue-500 rounded-full w-10 h-10 animate-spin"></div><p class="text-xs font-bold text-slate-600 dark:text-slate-300 mt-4 animate-pulse">${escapeHTML(msg)}</p>`;
    document.body.appendChild(o);
}

function hideLoading() { 
    const o = document.getElementById('loadingOverlay'); 
    if(o) o.remove(); 
}

let debounceTimer;
function debounce(func, delay) { 
    return function() { 
        clearTimeout(debounceTimer); 
        debounceTimer = setTimeout(() => func.apply(this, arguments), delay); 
    } 
}

function preventDefaults(e){ 
    e.preventDefault(); 
    e.stopPropagation(); 
}

function escapeHTML(str) { 
    return !str ? '' : String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;'); 
}

function formatDate(d) { 
    if (!d || !(d instanceof Date) || isNaN(d)) return '-';
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getWeekIdentifierString(d) { 
    const date = new Date(d.getTime()); 
    date.setHours(0, 0, 0, 0); 
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7); 
    var week1 = new Date(date.getFullYear(), 0, 4); 
    return `${date.getFullYear()}-W${String(1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)).padStart(2, '0')}`; 
}

// Función auxiliar para notificaciones (usada en otros módulos)
async function createNotification(recipientEmail, type, title, message, orderId) { 
    try { 
        await db_firestore.collection('notifications').add({ 
            recipientEmail: recipientEmail.toLowerCase().trim(), 
            type, title, message, orderId, 
            read: false, 
            timestamp: new Date().toISOString() 
        }); 
    } catch (e) { 
        console.error("Error notify:", e); 
    } 
}

// ======================================================
// ===== MÓDULO 2: INICIALIZACIÓN Y DATOS (CORE) =====
// ======================================================

// 2.1 INICIALIZACIÓN DEL DOM Y EVENTOS
document.addEventListener('DOMContentLoaded', () => {
    console.log('Módulo 2: Core Cargado');
    
    // Aplicar tema guardado (función del Módulo 1)
    initTheme();
    
    // Eventos de Auth
    const btnLogin = document.getElementById('loginButton');
    if(btnLogin) btnLogin.addEventListener('click', iniciarLoginConGoogle);
    
    const btnLogout = document.getElementById('logoutNavBtn');
    if(btnLogout) btnLogout.addEventListener('click', iniciarLogout);

    // Monitor de Estado de Auth
    firebase.auth().onAuthStateChanged((user) => {
        const login = document.getElementById('loginSection');
        const upload = document.getElementById('uploadSection');
        const main = document.getElementById('appMainContainer');
        const nav = document.getElementById('mainNavigation');
        const userNameDisplay = document.getElementById('navUserName');

        if (user) {
            // USUARIO LOGUEADO
            usuarioActual = user;
            if(userNameDisplay) userNameDisplay.textContent = user.displayName;
            
            // Verificación de Rol (Admin)
            const userEmail = user.email.toLowerCase();
            db_firestore.collection('users').doc(userEmail).get().then((doc) => {
                if (doc.exists && doc.data().role === 'admin') {
                    userRole = 'admin';
                    // Mostrar controles de admin
                    if(document.getElementById('nav-resetApp')) document.getElementById('nav-resetApp').style.display = 'flex';
                    if(document.getElementById('nav-manageTeam')) document.getElementById('nav-manageTeam').style.display = 'flex';
                } else {
                    userRole = 'user';
                    if(document.getElementById('nav-resetApp')) document.getElementById('nav-resetApp').style.display = 'none';
                    if(document.getElementById('nav-manageTeam')) document.getElementById('nav-manageTeam').style.display = 'none';
                }
            }).catch(() => { userRole = 'user'; });

            // Gestión de Vistas
            login.style.display = 'none';
            if (!isExcelLoaded) {
                // Si no hay datos cargados, mostrar zona de carga
                upload.style.display = 'block'; 
                main.style.display = 'none'; 
                nav.style.display = 'none'; 
                main.classList.remove('main-content-shifted');
            } else {
                // Si ya hay datos (recarga de página), ir al main
                upload.style.display = 'none'; 
                main.style.display = 'block'; 
                nav.style.display = 'flex'; 
                main.classList.add('main-content-shifted');
            }
            
            // INICIAR CONEXIÓN DE DATOS
            conectarDatosDeFirebase();

        } else {
            // USUARIO DESCONECTADO
            desconectarDatosDeFirebase(); 
            usuarioActual = null; 
            isExcelLoaded = false; 
            userRole = 'user';
            
            login.style.display = 'flex'; 
            upload.style.display = 'none'; 
            main.style.display = 'none'; 
            nav.style.display = 'none'; 
            main.classList.remove('main-content-shifted');
        }
    });

    // Eventos Globales de UI (Sidebar y Búsqueda)
    const sidebarBtn = document.getElementById('sidebarToggleBtn');
    if (sidebarBtn) sidebarBtn.addEventListener('click', () => { document.body.classList.toggle('sidebar-collapsed'); });
    
    const searchInp = document.getElementById('searchInput');
    if(searchInp) searchInp.addEventListener('input', debounce((e) => { 
        currentSearch = e.target.value; 
        currentPage = 1; 
        updateTable(); // Se definirá en Módulo UI
    }, 300));
    
    // Listeners para filtros
    ['clientFilter', 'styleFilter', 'teamFilter', 'departamentoFilter', 'designerFilter', 'customStatusFilter', 'dateFrom', 'dateTo'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('change', debounce((e) => {
            // Actualización de variables globales según el filtro
            if(id==='clientFilter') currentClientFilter = e.target.value;
            if(id==='styleFilter') currentStyleFilter = e.target.value;
            if(id==='teamFilter') currentTeamFilter = e.target.value;
            if(id==='departamentoFilter') currentDepartamentoFilter = e.target.value;
            if(id==='designerFilter') currentDesignerFilter = e.target.value;
            if(id==='customStatusFilter') currentCustomStatusFilter = e.target.value;
            if(id==='dateFrom') currentDateFrom = e.target.value;
            if(id==='dateTo') currentDateTo = e.target.value;
            
            currentPage = 1; 
            updateTable();
        }, 150));
    });

    // Delegación de Eventos (Botones dinámicos)
    // Nota: Las funciones handlers (deleteDesigner, etc.) se definirán en módulos posteriores.
    const delegate = (id, sel, cb) => { 
        const el = document.getElementById(id); 
        if(el) el.addEventListener('click', e => { 
            const t = e.target.closest(sel); 
            if(t) cb(t, e); 
        }); 
    };
    
    delegate('designerManagerList', '.btn-delete-designer', (btn) => deleteDesigner(btn.dataset.id, btn.dataset.name));
    delegate('childOrdersList', '.btn-delete-child', (btn, e) => { e.stopPropagation(); deleteChildOrder(btn.dataset.childId, btn.dataset.childCode); });
    delegate('view-workPlanContent', '.btn-remove-from-plan', (btn, e) => { e.stopPropagation(); removeOrderFromPlan(btn.dataset.planEntryId, btn.dataset.orderCode); });
    
    // Drag & Drop de Archivos
    const dropZone = document.getElementById('dropZone'), fileInput = document.getElementById('fileInput');
    if(dropZone && fileInput) {
        ['dragenter','dragover','dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, preventDefaults, false));
        dropZone.addEventListener('drop', (e) => { dropZone.classList.remove('border-blue-500','bg-blue-50'); handleFiles(e.dataTransfer.files); });
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    }
});

// 2.2 FUNCIONES DE AUTH
function iniciarLoginConGoogle() { 
    firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider())
        .catch(e => showCustomAlert(e.message, 'error')); 
}

function iniciarLogout() { 
    firebase.auth().signOut().then(() => { 
        document.getElementById('mainNavigation').style.transform = 'translateX(-100%)'; 
        document.getElementById('appMainContainer').classList.remove('main-content-shifted'); 
    }); 
}

// 2.3 CONEXIÓN Y SINCRONIZACIÓN DE DATOS
function conectarDatosDeFirebase() {
    if (!usuarioActual) return;
    const navDbStatus = document.getElementById('navDbStatus'); 

    const setStatus = (connected) => {
        if(navDbStatus) {
            navDbStatus.innerHTML = connected 
            ? `<span class="w-1.5 h-1.5 rounded-full bg-green-500"></span> Conectado`
            : `<span class="w-1.5 h-1.5 rounded-full bg-yellow-500"></span> Sincronizando...`;
        }
    };

    setStatus(false);
    
    // Carga inicial de Maestros (Estrategia Híbrida)
    loadMasterOrders().then(() => {
        console.log("Datos maestros listos.");
        setupRealtimeListeners(setStatus);
    });
}

async function loadMasterOrders() {
    try {
        const snapshot = await db_firestore.collection('master_orders').get();
        masterOrdersMap.clear();
        snapshot.forEach(doc => { masterOrdersMap.set(doc.id, doc.data()); });
        
        masterOrdersLoaded = true;
        isExcelLoaded = masterOrdersMap.size > 0; 
        
        if (masterOrdersMap.size > 0) {
            rebuildAllOrders(); // Construcción inicial en memoria
            
            // Transición de UI
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

function setupRealtimeListeners(statusCallback) {
    // 1. Asignaciones (Cambios de estado, diseñador)
    unsubscribeAssignments = db_firestore.collection('assignments').onSnapshot(s => {
        firebaseAssignmentsMap.clear();
        s.forEach(d => firebaseAssignmentsMap.set(d.id, d.data()));
        if(masterOrdersLoaded) mergeYActualizar(); 
        statusCallback(true);
    });

    // 2. Historial (Solo últimos 100 para rendimiento)
    unsubscribeHistory = db_firestore.collection('history').orderBy('timestamp', 'desc').limit(100).onSnapshot(s => {
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
        if(masterOrdersLoaded) mergeYActualizar();
    });
    
    // 4. Diseñadores
    unsubscribeDesigners = db_firestore.collection('designers').orderBy('name').onSnapshot(s => {
        firebaseDesignersMap.clear(); 
        let newDesignerList = [];
        s.forEach(d => { 
            const v = d.data(); 
            firebaseDesignersMap.set(d.id, v); 
            newDesignerList.push(v.name); 
            // Detectar identidad del usuario actual
            if (usuarioActual && v.email && v.email.toLowerCase() === usuarioActual.email.toLowerCase()) {
                currentDesignerName = v.name;
            }
        });
        designerList = newDesignerList;
        
        if (typeof populateFilterDropdowns === 'function') populateFilterDropdowns();
        if (typeof updateDashboard === 'function' && document.getElementById('dashboard').style.display === 'block') updateDashboard();
    });

    // 5. Plan Semanal
    unsubscribeWeeklyPlan = db_firestore.collection('weeklyPlan').onSnapshot(s => {
        firebaseWeeklyPlanMap.clear();
        s.forEach(d => { 
            const v = d.data(); 
            if(!firebaseWeeklyPlanMap.has(v.weekIdentifier)) firebaseWeeklyPlanMap.set(v.weekIdentifier, []); 
            firebaseWeeklyPlanMap.get(v.weekIdentifier).push(v); 
        });
        if(document.getElementById('workPlanView').style.display === 'block' && typeof generateWorkPlan === 'function') generateWorkPlan();
    });

    // 6. Notificaciones Personales
    listenToMyNotifications();
}

function desconectarDatosDeFirebase() {
    if(unsubscribeAssignments) unsubscribeAssignments();
    if(unsubscribeHistory) unsubscribeHistory();
    if(unsubscribeChildOrders) unsubscribeChildOrders();
    if(unsubscribeDesigners) unsubscribeDesigners();
    if(unsubscribeWeeklyPlan) unsubscribeWeeklyPlan();
    if(unsubscribeNotifications) unsubscribeNotifications();
    if(unsubscribeChat) unsubscribeChat(); // Importante: Limpiar chat
    
    autoCompletedOrderIds.clear();
    masterOrdersLoaded = false;
}

// 2.4 PROCESAMIENTO DE DATOS (FUSIÓN)

// Recálculo de Piezas Hijas (Definida antes de usarse)
function recalculateChildPieces() {
    let cache = new Map();
    firebaseChildOrdersMap.forEach((list, parentId) => {
        const sum = list.reduce((s, c) => s + (Number(c.cantidad) || 0), 0);
        cache.set(parentId, sum);
    });
    allOrders.forEach(o => { o.childPieces = cache.get(o.orderId) || 0; });
}

function rebuildAllOrders() {
    let processed = [];
    masterOrdersMap.forEach((masterData) => {
        // CORRECCIÓN: Convertir fechas string a Objetos Date reales
        let fdLocal = null;
        if (masterData.fechaDespacho) {
            const parsed = new Date(masterData.fechaDespacho);
            if (!isNaN(parsed.getTime())) fdLocal = parsed;
        }

        const today = new Date(); today.setHours(0,0,0,0);
        const dl = (fdLocal && fdLocal < today) ? Math.ceil((today - fdLocal) / 86400000) : 0;

        processed.push({
            ...masterData, 
            fechaDespacho: fdLocal, // Ahora es un objeto Date
            isLate: fdLocal && fdLocal < today,
            isVeryLate: dl > 7,
            isAboutToExpire: fdLocal && !dl && ((fdLocal - today) / 86400000) <= 2,
            daysLate: dl,
            // Campos vacíos por defecto (se llenarán en merge)
            designer: '', customStatus: '', receivedDate: '', notes: '', completedDate: null, complexity: 'Media'
        });
    });
    allOrders = processed;
    mergeYActualizar();
}

function mergeYActualizar() {
    if (!masterOrdersLoaded) return;
    
    // Optimización: Recalcular solo si hubo cambios en childOrders
    if (needsRecalculation) {
        recalculateChildPieces(); 
        needsRecalculation = false;
    }
    
    autoCompleteBatchWrites = []; 
    filteredCache.key = null; // Invalidar caché de búsqueda

    for (let i = 0; i < allOrders.length; i++) {
        const o = allOrders[i];
        const fb = firebaseAssignmentsMap.get(o.orderId);
        
        if (fb) {
            // Sobreescribir con datos de Firebase
            o.designer = fb.designer || '';
            o.customStatus = fb.customStatus || '';
            o.receivedDate = fb.receivedDate || '';
            o.notes = fb.notes || '';
            o.completedDate = fb.completedDate || null;
            o.complexity = fb.complexity || 'Media'; 
        } else {
            o.designer = ''; o.customStatus = ''; o.receivedDate = ''; o.notes = ''; o.completedDate = null; o.complexity = 'Media';
        }

        // Auto-Completado: Si salió de Arte en el Excel nuevo
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
    
    // Actualizar UI si está visible
    if (document.getElementById('dashboard') && document.getElementById('dashboard').style.display === 'block' && typeof updateDashboard === 'function') {
        updateDashboard();
    }
    
    // Ejecutar Batch de Autocompletado
    if (autoCompleteBatchWrites.length > 0) confirmAutoCompleteBatch();
}

// 2.5 NOTIFICACIONES E INTERNOS
function listenToMyNotifications() {
    if (!usuarioActual) return;
    const myEmail = usuarioActual.email.toLowerCase();
    if (unsubscribeNotifications) unsubscribeNotifications();

    unsubscribeNotifications = db_firestore.collection('notifications')
        .where('recipientEmail', '==', myEmail).where('read', '==', false).orderBy('timestamp', 'desc').limit(20)
        .onSnapshot(snapshot => { updateNotificationUI(snapshot.docs); }, error => { console.log("Info notificaciones (permisos):", error.code); });
}

function updateNotificationUI(docs) {
    const container = document.getElementById('notif-personal'); 
    if (!container) return;
    if (docs.length === 0) { container.innerHTML = ''; updateTotalBadge(); return; }

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
    if (orderId && typeof openAssignModal === 'function') await openAssignModal(orderId);
}

// ======================================================
// ===== MÓDULO 3: PARSER EXCEL & OPERACIONES BATCH =====
// ======================================================

// 3.1 MANEJO DE ARCHIVOS (DROP & SELECT)
function handleFiles(files) {
    if (files.length > 0) {
        document.getElementById('fileName').textContent = files[0].name;
        processAndUploadFile(files[0]);
    }
}

async function processAndUploadFile(file) {
    // 1. Verificación de Seguridad
    if (userRole !== 'admin') {
        return showCustomAlert('Acceso Denegado: Solo administradores pueden actualizar la BD.', 'error');
    }

    showLoading('Analizando Excel...');
    
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        
        // Buscar hoja por nombre aproximado (flexible)
        const sheetName = workbook.SheetNames.find(n => /working\s*pro[c]{1,2}ess/i.test(n));
        if (!sheetName) throw new Error('No se encontró la hoja "Working Process".');
        
        const arr = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
        
        // 2. Escaneo Inteligente de Encabezados
        let hIdx = -1;
        // Buscamos en las primeras 20 filas
        for (let i = 0; i < Math.min(arr.length, 20); i++) {
            const r = arr[i].map(c => String(c).toLowerCase().trim());
            // Condición: debe tener "fecha" y "cliente" en la misma fila
            if (r.some(c => c.includes('fecha')) && r.some(c => c.includes('cliente'))) { 
                hIdx = i; 
                break; 
            }
        }
        if (hIdx === -1) throw new Error('No se detectaron los encabezados clave (Fecha, Cliente).');

        const rawHeaders = arr[hIdx].map(h => String(h).trim().replace(/,/g, '').toLowerCase());
        
        // Mapeo de columnas dinámico
        const cols = {
            fecha: rawHeaders.findIndex(h => h.includes('fecha')),
            cliente: rawHeaders.findIndex(h => h.includes('cliente')),
            codigo: rawHeaders.findIndex(h => h.includes('codigo') || h.includes('contrato')),
            estilo: rawHeaders.findIndex(h => h.includes('estilo')),
            team: rawHeaders.findIndex(h => h.includes('team'))
        };

        // Mapeo de Departamentos (Regex)
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

        // 3. Procesamiento de Filas
        showLoading('Calculando diferencias...');
        const rows = arr.slice(hIdx + 1);
        let batchData = [];
        
        // Variables para lógica "Fill-Down" (celdas vacías heredan valor anterior)
        let currentClient = "", currentContrato = "", currentStyle = "", currentTeam = "", currentDate = null;

        for (const r of rows) {
            if (!r || r.every(c => !c)) continue; // Saltar filas vacías
            
            // A. Procesar Fecha (Excel Date Serial o String)
            if (cols.fecha >= 0 && r[cols.fecha]) { 
                const v = r[cols.fecha]; 
                let dObj = null;
                if (typeof v === 'number') dObj = new Date((v - 25569) * 86400 * 1000);
                else { const parsed = new Date(v); if (!isNaN(parsed.getTime())) dObj = parsed; }
                
                if (dObj) currentDate = new Date(Date.UTC(dObj.getFullYear(), dObj.getMonth(), dObj.getDate()));
            }
            
            // B. Procesar Textos
            if (cols.cliente >= 0 && r[cols.cliente]) currentClient = String(r[cols.cliente]).trim();
            if (cols.codigo >= 0 && r[cols.codigo]) currentContrato = String(r[cols.codigo]).trim();
            if (cols.estilo >= 0 && r[cols.estilo]) currentStyle = String(r[cols.estilo]).trim();
            if (cols.team >= 0 && r[cols.team]) currentTeam = String(r[cols.team]).trim();

            if (!currentClient || !currentContrato) continue; // Datos mínimos requeridos

            // C. Determinar Cantidad y Departamento (Prioridad inversa: último depto encontrado gana)
            let qty = 0, dept = CONFIG.DEPARTMENTS.NONE;
            for (let i = deptCols.length - 1; i >= 0; i--) {
                const val = r[deptCols[i].idx];
                if (val) { 
                    const n = Number(String(val).replace(/[^0-9.-]+/g,"")); 
                    if (!isNaN(n) && n > 0) { qty = n; dept = deptCols[i].name; break; } 
                }
            }

            // D. Generar ID Único
            const timePart = currentDate ? currentDate.getTime() : 'nodate';
            const oid = `${currentClient}_${currentContrato}_${timePart}_${currentStyle}`;
            const fdISO = currentDate ? currentDate.toISOString() : null;

            // E. Lógica Diferencial (CRÍTICO)
            // Comparamos con masterOrdersMap (cargado en Módulo 2)
            const existing = masterOrdersMap.get(oid);
            
            let hasChanges = true;
            if (existing) {
                // Si existe, verificamos si algo importante cambió
                if (existing.cantidad === qty && 
                    existing.departamento === dept && 
                    existing.fechaDespacho === fdISO &&
                    existing.teamName === currentTeam) {
                    hasChanges = false; // Datos idénticos, ignorar
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
            showCustomAlert('El archivo se analizó pero no hay datos nuevos.', 'success');
            hideLoading();
            return;
        }

        // 4. Subida a la Nube
        await uploadBatchesToFirestore(batchData);

    } catch (e) { 
        showCustomAlert(e.message, 'error'); 
        console.error(e); 
    } finally { 
        hideLoading(); 
    }
}

async function uploadBatchesToFirestore(dataArray) {
    const BATCH_SIZE = 400; // Límite seguro de Firestore (max 500)
    const totalBatches = Math.ceil(dataArray.length / BATCH_SIZE);
    
    showLoading(`Actualizando ${dataArray.length} registros...`);
    
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
    
    // Recargar datos locales para reflejar los cambios inmediatamente
    if (typeof loadMasterOrders === 'function') loadMasterOrders();
}

// 3.2 OPERACIONES BATCH (PLAN SEMANAL)

// Cargar Órdenes Urgentes al Plan
window.loadUrgentOrdersToPlan = async () => {
    const wid = document.getElementById('view-workPlanWeekSelector').value;
    if (!wid) return showCustomAlert('Selecciona una semana primero', 'error');
    
    // Filtro: Solo Arte + (Atrasadas O Por Vencer)
    const urgents = allOrders.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART && (o.isLate || o.isAboutToExpire));
    
    if (urgents.length === 0) return showCustomAlert('No hay órdenes urgentes pendientes.', 'info');
    
    showConfirmModal(`¿Cargar ${urgents.length} órdenes urgentes al plan ${wid}?`, async () => {
        await safeFirestoreOperation(async () => {
            const batch = db_firestore.batch();
            let count = 0;
            // Limitamos a 450 para seguridad del batch
            urgents.slice(0, 450).forEach(o => {
                const pid = `${o.orderId}_${wid}`;
                const ref = db_firestore.collection('weeklyPlan').doc(pid);
                batch.set(ref, {
                    planEntryId: pid, orderId: o.orderId, weekIdentifier: wid, 
                    designer: o.designer || '', cliente: o.cliente || '', 
                    codigoContrato: o.codigoContrato || '', estilo: o.estilo || '',
                    fechaDespacho: o.fechaDespacho ? o.fechaDespacho.toISOString() : null,
                    cantidad: o.cantidad || 0, childPieces: o.childPieces || 0, 
                    isLate: !!o.isLate, isAboutToExpire: !!o.isAboutToExpire,
                    addedAt: new Date().toISOString(), schemaVersion: CONFIG.DB_VERSION
                }, { merge: true });
                count++;
            });
            await batch.commit();
            
            // Recargar vista si está activa
            if(typeof generateWorkPlan === 'function') generateWorkPlan(); 
            return true;
        }, `Cargando urgentes...`, `¡Éxito! ${urgents.length} órdenes agregadas.`);
    });
};

// Cargar Selección Manual al Plan
window.addSelectedToWorkPlan = async () => {
    if (selectedOrders.size === 0) return showCustomAlert('Selecciona órdenes primero', 'info');
    
    // Calculamos semana actual automáticamente
    const wid = getWeekIdentifierString(new Date());

    await safeFirestoreOperation(async () => {
        const batch = db_firestore.batch();
        let count = 0;
        
        for (let id of selectedOrders) {
            const o = allOrders.find(x => x.orderId === id);
            // Solo permitimos órdenes que estén actualmente en ARTE
            if (o && o.departamento === CONFIG.DEPARTMENTS.ART) {
                const pid = `${o.orderId}_${wid}`;
                const ref = db_firestore.collection('weeklyPlan').doc(pid);
                batch.set(ref, {
                    planEntryId: pid, orderId: o.orderId, weekIdentifier: wid, 
                    designer: o.designer || '', cliente: o.cliente, 
                    codigoContrato: o.codigoContrato, estilo: o.estilo,
                    fechaDespacho: o.fechaDespacho ? o.fechaDespacho.toISOString() : null,
                    cantidad: o.cantidad, childPieces: o.childPieces, 
                    isLate: !!o.isLate, isAboutToExpire: !!o.isAboutToExpire,
                    addedAt: new Date().toISOString(), schemaVersion: CONFIG.DB_VERSION
                }, { merge: true });
                count++;
            }
        }
        
        if (count === 0) throw new Error("Ninguna orden válida seleccionada (deben estar en P_Art).");
        await batch.commit();
        
        clearSelection(); // Limpiar UI
        if(document.getElementById('workPlanView').style.display === 'block') generateWorkPlan();
        
        return true;
    }, 'Agregando al plan...', `${count} órdenes agregadas a la semana actual.`);
};

// ======================================================
// ===== MÓDULO 4: FILTROS INTELIGENTES Y RENDERIZADO UI =====
// ======================================================

// 4.1 MOTOR DE FILTRADO (SMART SEARCH)
function getFilteredOrders() {
    const currentFilterKey = JSON.stringify({
        s: currentSearch.trim().toLowerCase(),
        c: currentClientFilter, d: currentDepartamentoFilter, des: currentDesignerFilter, st: currentCustomStatusFilter,
        f: currentFilter, df: currentDateFrom, dt: currentDateTo, sort: sortConfig
    });

    const now = Date.now();
    // Cache de corta duración (3s) para evitar recálculos en tipeo rápido
    if (filteredCache.key === currentFilterKey && (now - filteredCache.timestamp < 3000)) {
        return filteredCache.results;
    }

    let res = allOrders;
    const s = currentSearch.toLowerCase();
    
    // 1. Búsqueda Global por Texto
    if (s) {
        res = res.filter(o => 
            (o.cliente || '').toLowerCase().includes(s) || 
            (o.codigoContrato || '').toLowerCase().includes(s) || 
            (o.estilo || '').toLowerCase().includes(s) || 
            (o.designer || '').toLowerCase().includes(s)
        );
    }
    
    // 2. Filtro de Cliente
    if (currentClientFilter) res = res.filter(o => o.cliente === currentClientFilter);
    
    // 3. Lógica de Departamento Inteligente (TU SOLICITUD)
    if (currentDepartamentoFilter) {
        // A. Prioridad 1: Si elegiste un depto explícito, se respeta siempre.
        res = res.filter(o => o.departamento === currentDepartamentoFilter);
    } else if (s !== '') {
        // B. Prioridad 2: Si estás BUSCANDO texto y NO elegiste depto...
        // ... Buscamos en TODOS los departamentos (no filtramos nada).
    } else {
        // C. Prioridad 3: Si NO buscas y NO eliges depto...
        // ... Mostramos solo ARTE por defecto para no saturar la vista.
        res = res.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART); 
    }
    
    // 4. Resto de Filtros
    if (currentDesignerFilter) res = res.filter(o => o.designer === currentDesignerFilter);
    if (currentCustomStatusFilter) res = res.filter(o => o.customStatus === currentCustomStatusFilter);
    
    if (currentFilter === 'late') res = res.filter(o => o.isLate);
    else if (currentFilter === 'veryLate') res = res.filter(o => o.isVeryLate);
    else if (currentFilter === 'aboutToExpire') res = res.filter(o => o.isAboutToExpire);
    
    if(currentDateFrom) { const df = new Date(currentDateFrom); res = res.filter(o => o.fechaDespacho && o.fechaDespacho >= df); }
    if(currentDateTo) { const dt = new Date(currentDateTo); res = res.filter(o => o.fechaDespacho && o.fechaDespacho <= dt); }

    // 5. Ordenamiento
    res.sort((a, b) => {
        let va = a[sortConfig.key], vb = b[sortConfig.key];
        if (sortConfig.key === 'date') { 
            va = a.fechaDespacho ? a.fechaDespacho.getTime() : 0; 
            vb = b.fechaDespacho ? b.fechaDespacho.getTime() : 0; 
        }
        if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
        return (va < vb ? -1 : 1) * (sortConfig.direction === 'asc' ? 1 : -1);
    });
    
    // Actualizar caché
    filteredCache = { key: currentFilterKey, results: res, timestamp: now };
    return res;
}

// 4.2 NAVEGACIÓN (ROUTER)
function navigateTo(viewId) {
    // Protección: No navegar si no hay datos (salvo para ir a cargar archivo)
    if (!isExcelLoaded && viewId !== 'uploadSection') return;

    // Ocultar todas las vistas
    document.querySelectorAll('.main-view').forEach(el => el.style.display = 'none');
    
    // Mostrar vista objetivo
    const target = document.getElementById(viewId);
    if (target) { target.style.display = 'block'; window.scrollTo(0, 0); }

    // Actualizar estilos del menú lateral
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active-nav', 'bg-blue-50', 'text-blue-700', 'border-l-4', 'border-blue-600', 'font-bold');
        btn.classList.add('text-slate-500'); 
        const icon = btn.querySelector('i');
        // Limpiar colores específicos
        if(icon) { icon.className = icon.className.replace(/text-(blue|pink|orange|purple|green)-[0-9]+/g, '').trim(); icon.classList.add('text-slate-400'); }
    });

    const activeBtn = document.getElementById('nav-' + viewId);
    if (activeBtn) {
        activeBtn.classList.add('active-nav', 'bg-blue-50', 'text-blue-700', 'border-l-4', 'border-blue-600', 'font-bold');
        activeBtn.classList.remove('text-slate-500');
        const icon = activeBtn.querySelector('i');
        if (icon) {
            icon.classList.remove('text-slate-400');
            // Asignar color según la vista
            const colors = { 'dashboard': 'blue-600', 'kanbanView': 'pink-500', 'workPlanView': 'orange-500', 'designerMetricsView': 'purple-500', 'departmentMetricsView': 'green-500' };
            if(colors[viewId]) icon.classList.add(`text-${colors[viewId]}`);
        }
    }

    // Inicializar lógica específica de la vista
    if (viewId === 'dashboard') updateDashboard();
    else if (viewId === 'kanbanView') { 
        if(typeof updateKanbanDropdown === 'function') updateKanbanDropdown(); 
        if(typeof updateKanban === 'function') updateKanban(); 
    } 
    else if (viewId === 'workPlanView' && typeof generateWorkPlan === 'function') generateWorkPlan();
    else if (viewId === 'designerMetricsView' && typeof populateMetricsSidebar === 'function') populateMetricsSidebar();
    else if (viewId === 'departmentMetricsView' && typeof generateDepartmentMetrics === 'function') generateDepartmentMetrics();
    
    // Limpieza de memoria (Gráficos) al salir de vistas de análisis
    if (!['designerMetricsView', 'departmentMetricsView'].includes(viewId) && typeof destroyAllCharts === 'function') destroyAllCharts();
}

// 4.3 RENDERIZADO DEL DASHBOARD
function updateDashboard() {
    if (!isExcelLoaded) return;
    
    // Filtrar para estadísticas (Solo Arte se usa para los widgets superiores)
    const artOrders = allOrders.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART);
    const stats = calculateStats(artOrders);
    
    // Actualizar Widgets Numéricos
    if(document.getElementById('statTotal')) document.getElementById('statTotal').textContent = artOrders.length;
    
    const totalPiezas = artOrders.reduce((s, o) => s + (Number(o.cantidad) || 0) + (Number(o.childPieces) || 0), 0);
    if(document.getElementById('statTotalPieces')) document.getElementById('statTotalPieces').textContent = totalPiezas.toLocaleString();
    
    if(document.getElementById('statLate')) document.getElementById('statLate').textContent = stats.late;
    if(document.getElementById('statExpiring')) document.getElementById('statExpiring').textContent = stats.aboutToExpire;
    if(document.getElementById('statOnTime')) document.getElementById('statOnTime').textContent = stats.onTime;
    
    // Calcular órdenes de "Esta Semana"
    const thisWeekCount = artOrders.filter(o => {
        if (!o.fechaDespacho) return false;
        const today = new Date(); today.setHours(0,0,0,0);
        const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
        return o.fechaDespacho >= today && o.fechaDespacho <= nextWeek;
    }).length;
    if(document.getElementById('statThisWeek')) document.getElementById('statThisWeek').textContent = thisWeekCount;
    
    updateAlerts(stats);
    updateWidgets(artOrders);
    
    // Actualizar Dropdowns solo si están vacíos
    if(document.getElementById('clientFilter') && document.getElementById('clientFilter').children.length <= 1) {
        populateFilterDropdowns();
    }
    
    // Renderizar la Tabla Principal
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
    if (stats.veryLate > 0) html += `<div onclick="setFilter('veryLate'); toggleNotifications();" class="p-3 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer border-b border-slate-50 dark:border-slate-700 group transition flex gap-3 items-start bg-white dark:bg-slate-800"><div class="mt-1 text-red-500"><i class="fa-solid fa-circle-exclamation"></i></div><div><p class="text-xs font-bold text-slate-700 dark:text-slate-200 group-hover:text-red-600">Muy Atrasadas (>7 días)</p><p class="text-[10px] text-slate-500">${stats.veryLate} órdenes requieren atención</p></div></div>`;
    if (stats.aboutToExpire > 0) html += `<div onclick="setFilter('aboutToExpire'); toggleNotifications();" class="p-3 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 cursor-pointer border-b border-slate-50 dark:border-slate-700 group transition flex gap-3 items-start bg-white dark:bg-slate-800"><div class="mt-1 text-yellow-500"><i class="fa-solid fa-stopwatch"></i></div><div><p class="text-xs font-bold text-slate-700 dark:text-slate-200 group-hover:text-yellow-600">Por Vencer (≤2 días)</p><p class="text-[10px] text-slate-500">${stats.aboutToExpire} órdenes próximas</p></div></div>`;
    container.innerHTML = html;
    if(typeof updateTotalBadge === 'function') updateTotalBadge();
}

function updateWidgets(artOrders) {
    // Top Clientes
    const clientCounts = {};
    artOrders.forEach(o => clientCounts[o.cliente] = (clientCounts[o.cliente] || 0) + 1);
    const topClients = Object.entries(clientCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const cr = document.getElementById('clientReport');
    if (cr) cr.innerHTML = topClients.map(([c, n], i) => `<div class="flex justify-between py-2 border-b border-slate-50 dark:border-slate-700 last:border-0 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 px-2 rounded transition"><span class="text-slate-600 dark:text-slate-300 truncate w-40 font-medium" title="${c}">${i+1}. ${c}</span><span class="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">${n}</span></div>`).join('');

    // Carga Trabajo
    const workload = {}; let totalWorkload = 0;
    artOrders.forEach(o => {
        if (o.designer) {
            const pieces = (Number(o.cantidad) || 0) + (Number(o.childPieces) || 0);
            workload[o.designer] = (workload[o.designer] || 0) + pieces;
            if (!CONFIG.EXCLUDED_DESIGNERS.includes(o.designer)) totalWorkload += pieces;
        }
    });
    
    if(document.getElementById('workloadTotal')) document.getElementById('workloadTotal').textContent = totalWorkload.toLocaleString() + ' pzs';
    
    const wl = document.getElementById('workloadList');
    if (wl) {
        wl.innerHTML = Object.entries(workload).sort((a, b) => b[1] - a[1]).map(([designer, pieces]) => {
            const isExcluded = CONFIG.EXCLUDED_DESIGNERS.includes(designer);
            const pct = (totalWorkload > 0 && !isExcluded) ? ((pieces / totalWorkload) * 100).toFixed(1) : 0;
            return `<div class="mb-3 ${isExcluded ? 'opacity-50' : ''}"><div class="flex justify-between text-xs mb-1"><span class="text-slate-700 dark:text-slate-300 font-bold truncate w-32">${designer} ${isExcluded ? '(Excl)' : ''}</span><span class="text-slate-500 dark:text-slate-400">${pieces.toLocaleString()} ${!isExcluded ? `(${pct}%)` : ''}</span></div><div class="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full" style="width: ${isExcluded ? 0 : pct}%"></div></div></div>`;
        }).join('');
    }
}

// 4.4 RENDERIZADO DE TABLA (HTML)
function updateTable() {
    const filtered = getFilteredOrders();
    const start = (currentPage - 1) * rowsPerPage;
    paginatedOrders = filtered.slice(start, start + rowsPerPage);
    
    // Actualizar contadores
    if(document.getElementById('resultCount')) document.getElementById('resultCount').textContent = filtered.length;
    const totalTable = filtered.reduce((s, o) => s + (Number(o.cantidad) || 0) + (Number(o.childPieces) || 0), 0);
    if(document.getElementById('resultPieces')) document.getElementById('resultPieces').textContent = totalTable.toLocaleString();

    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    if (paginatedOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" class="text-center py-12 text-slate-400 italic">No se encontraron órdenes.</td></tr>`;
    } else {
        tbody.innerHTML = paginatedOrders.map(order => {
            const rowClass = order.isVeryLate ? 'very-late' : order.isLate ? 'late' : order.isAboutToExpire ? 'expiring' : '';
            const statusBadge = getStatusBadge(order);
            const internalBadge = getCustomStatusBadge(order.customStatus);
            const hasChild = order.childPieces > 0 ? `<span class="ml-1 text-[9px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 rounded-full font-bold border border-blue-200 dark:border-blue-800">+${order.childPieces}</span>` : '';
            const isArt = order.departamento === CONFIG.DEPARTMENTS.ART;
            
            // Badges visuales
            const deptBadge = order.departamento ? `<span class="px-3 py-1 rounded-full text-xs font-medium border inline-block shadow-sm text-center whitespace-nowrap ${order.departamento === CONFIG.DEPARTMENTS.ART ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' : 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600'}">${escapeHTML(order.departamento)}</span>` : '-';
            const designerBadge = order.designer ? `<span class="px-3 py-1 rounded-full text-xs font-medium border inline-block shadow-sm text-center whitespace-nowrap bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800">${escapeHTML(order.designer)}</span>` : '<span class="text-slate-400 text-xs italic">--</span>';

            return `
            <tr class="${rowClass} hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors cursor-pointer border-b border-slate-50 dark:border-slate-700 last:border-b-0" onclick="openAssignModal('${order.orderId}')">
                <td class="px-3 py-2.5 text-center" onclick="event.stopPropagation()">
                    ${isArt ? `<input type="checkbox" class="w-4 h-4 cursor-pointer" onchange="toggleOrderSelection('${order.orderId}')" ${selectedOrders.has(order.orderId) ? 'checked' : ''}>` : ''}
                </td>
                <td class="px-3 py-2.5">${statusBadge}</td>
                <td class="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">${formatDate(order.fechaDespacho)}</td>
                <td class="px-3 py-2.5 font-medium text-slate-900 dark:text-white truncate max-w-[160px]" title="${escapeHTML(order.cliente)}">${escapeHTML(order.cliente)}</td>
                <td class="px-3 py-2.5 text-slate-500 dark:text-slate-400 font-mono text-xs whitespace-nowrap">${escapeHTML(order.codigoContrato)}</td>
                <td class="px-3 py-2.5 text-slate-600 dark:text-slate-300 truncate max-w-[160px]">${escapeHTML(order.estilo)}</td>
                <td class="px-3 py-2.5 hidden lg:table-cell text-slate-500 dark:text-slate-400 text-[11px] truncate max-w-[160px]">${escapeHTML(order.teamName)}</td>
                <td class="px-3 py-2.5 hidden md:table-cell">${deptBadge}</td>
                <td class="px-3 py-2.5">${designerBadge}</td>
                <td class="px-3 py-2.5">${internalBadge}</td>
                <td class="px-3 py-2.5 hidden lg:table-cell text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">${order.receivedDate ? formatDate(new Date(order.receivedDate + 'T00:00:00')) : '-'}</td>
                <td class="px-3 py-2.5 text-right"><div class="flex items-center justify-end gap-1 font-bold text-slate-700 dark:text-slate-200">${(Number(order.cantidad)||0).toLocaleString()} ${hasChild}</div></td>
                <td class="px-3 py-2.5 text-right"><i class="fa-solid fa-chevron-right text-slate-300 dark:text-slate-600 text-[10px]"></i></td>
            </tr>`;
        }).join('');
    }
    
    // Actualizar estado del checkbox "Seleccionar Todo"
    const sa = document.getElementById('selectAll');
    if (sa) { 
        sa.checked = paginatedOrders.length > 0 && paginatedOrders.every(o => selectedOrders.has(o.orderId)); 
        sa.indeterminate = !sa.checked && paginatedOrders.some(o => selectedOrders.has(o.orderId)); 
    }
    
    // Barra flotante de selección múltiple
    const bar = document.getElementById('multiSelectBar');
    if (selectedOrders.size > 0) { 
        bar.classList.add('active'); 
        document.getElementById('selectedCount').textContent = selectedOrders.size; 
    } else { 
        bar.classList.remove('active'); 
    }
    
    renderPagination();
}

function renderPagination() {
    const totalPages = Math.ceil(getFilteredOrders().length / rowsPerPage);
    const c = document.getElementById('paginationControls'); 
    if (!c) return;
    
    let h = `<button onclick="changePage(${currentPage-1})" ${currentPage===1?'disabled':''} class="w-8 h-8 flex items-center justify-center border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-600 dark:text-slate-300"><i class="fa-solid fa-chevron-left text-[10px]"></i></button>`;
    
    let start = Math.max(1, currentPage - 2); 
    let end = Math.min(totalPages, start + 4); 
    if (end - start < 4) start = Math.max(1, end - 4);
    
    for (let i = start; i <= end; i++) {
        h += `<button onclick="changePage(${i})" class="w-8 h-8 flex items-center justify-center border rounded-lg text-xs font-medium ${i === currentPage ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900 shadow-sm' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600'}">${i}</button>`;
    }
    
    h += `<button onclick="changePage(${currentPage+1})" ${currentPage>=totalPages?'disabled':''} class="w-8 h-8 flex items-center justify-center border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-600 dark:text-slate-300"><i class="fa-solid fa-chevron-right text-[10px]"></i></button>`;
    c.innerHTML = h;
}
// ======================================================
// ===== MÓDULO 5: GESTIÓN DE MODALES Y ACCIONES =====
// ======================================================

// 5.1 MODAL DE EDICIÓN / ASIGNACIÓN (CORREGIDO)
window.openAssignModal = async (id) => {
    currentEditingOrderId = id;
    const o = allOrders.find(x => x.orderId === id);
    if (!o) return;

    // A. Inyectar Datos Estáticos
    document.getElementById('detailCliente').textContent = o.cliente || '-';
    document.getElementById('detailCodigo').textContent = o.codigoContrato || '-';
    document.getElementById('detailEstilo').textContent = o.estilo || '-';
    document.getElementById('detailFecha').textContent = formatDate(o.fechaDespacho);
    
    const totalPcs = (Number(o.cantidad)||0) + (Number(o.childPieces)||0);
    document.getElementById('detailPiezas').textContent = `${(Number(o.cantidad)||0).toLocaleString()} (+${(Number(o.childPieces)||0)}) = ${totalPcs.toLocaleString()}`;
    
    // B. Preparar Inputs Dinámicos
    document.getElementById('modalStatus').value = o.customStatus || 'Bandeja';
    
    // Manejo seguro de fecha para el input type="date"
    let dateVal = '';
    if (o.receivedDate) {
        // Si ya es YYYY-MM-DD
        if (o.receivedDate.includes('-')) dateVal = o.receivedDate; 
    } else {
        dateVal = new Date().toISOString().split('T')[0];
    }
    document.getElementById('modalReceivedDate').value = dateVal;

    if(document.getElementById('modalComplexity')) document.getElementById('modalComplexity').value = o.complexity || 'Media';

    // C. Lógica de Permisos (TU CORRECCIÓN AQUÍ)
    const designerSelect = document.getElementById('modalDesigner');
    const container = designerSelect.parentNode;
    
    // 1. Limpieza: Eliminar cualquier botón "Tomar/Bloqueado" previo
    const oldBtn = document.getElementById('btn-self-assign');
    if(oldBtn) oldBtn.remove();
    
    // 2. Estado Base: Selector visible y habilitado
    designerSelect.style.display = 'block';
    designerSelect.disabled = false;
    designerSelect.value = o.designer || '';

    // 3. Aplicar Restricciones SOLO si NO es Admin
    if (currentDesignerName && userRole !== 'admin') {
        
        // Caso A: Orden ocupada por otro (BLOQUEO)
        if (o.designer && o.designer !== 'Sin asignar' && o.designer !== currentDesignerName) {
            designerSelect.style.display = 'none';
            container.insertAdjacentHTML('beforeend', `
                <button id="btn-self-assign" class="w-full py-2 rounded-lg text-xs font-bold transition shadow-sm border flex items-center justify-center gap-2 mt-1 bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600" disabled>
                    <i class="fa-solid fa-lock"></i> Asignado a: ${escapeHTML(o.designer)}
                </button>
            `);
        } 
        // Caso B: Orden es mía (LIBERAR)
        else if (o.designer === currentDesignerName) {
            designerSelect.style.display = 'none';
            const btn = document.createElement('button');
            btn.id = 'btn-self-assign';
            btn.className = 'w-full py-2 rounded-lg text-xs font-bold transition shadow-sm border flex items-center justify-center gap-2 mt-1 bg-red-50 text-red-600 border-red-200 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
            btn.innerHTML = `<i class="fa-solid fa-user-xmark"></i> Liberar (Es mía)`;
            btn.onclick = () => { designerSelect.value = ''; saveAssignment(); };
            container.appendChild(btn);
        } 
        // Caso C: Orden libre (TOMAR)
        else {
            designerSelect.style.display = 'none';
            const btn = document.createElement('button');
            btn.id = 'btn-self-assign';
            btn.className = 'w-full py-2 rounded-lg text-xs font-bold transition shadow-sm border flex items-center justify-center gap-2 mt-1 bg-green-50 text-green-600 border-green-200 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
            btn.innerHTML = `<i class="fa-solid fa-hand-point-up"></i> Tomar Orden`;
            btn.onclick = () => { designerSelect.value = currentDesignerName; saveAssignment(); };
            container.appendChild(btn);
        }
    }
    // Si eres Admin, el código salta el bloque 'if' anterior y te deja el select libre.

    // D. Cargar Historial
    const h = firebaseHistoryMap.get(id) || [];
    const histContainer = document.getElementById('modalHistory');
    if (h.length === 0) {
        histContainer.innerHTML = '<p class="text-slate-400 italic text-xs text-center py-4">Sin historial.</p>';
    } else {
        histContainer.innerHTML = h.reverse().map(x => `
            <div class="border-b border-slate-100 dark:border-slate-700 pb-2 last:border-0 mb-2">
                <div class="flex justify-between items-center text-[10px] text-slate-400 mb-0.5">
                    <span>${new Date(x.timestamp).toLocaleString()}</span>
                    <span>${escapeHTML(x.user)}</span>
                </div>
                <div class="text-xs text-slate-600 dark:text-slate-300">${escapeHTML(x.change)}</div>
            </div>`).join('');
    }

    // E. Cargar Sub-componentes
    if (typeof loadOrderComments === 'function') loadOrderComments(id);
    await loadChildOrders();
    
    openModalById('assignModal');
};

// 5.2 GUARDAR ASIGNACIÓN
window.saveAssignment = async () => {
    if (!currentEditingOrderId) return;
    const o = allOrders.find(x => x.orderId === currentEditingOrderId);
    
    const desName = document.getElementById('modalDesigner').value;
    const stat = document.getElementById('modalStatus').value;
    const rd = document.getElementById('modalReceivedDate').value;
    const comp = document.getElementById('modalComplexity') ? document.getElementById('modalComplexity').value : 'Media';
    
    const changes = []; 
    const data = {};
    
    // Buscar Email para vinculación
    let desEmail = null;
    if (desName && desName !== 'Sin asignar') {
        firebaseDesignersMap.forEach(d => { if (d.name === desName) desEmail = d.email; });
    }

    // Detectar Cambios
    if(o.designer !== desName) { 
        changes.push(`Diseñador: ${o.designer || 'N/A'} -> ${desName}`); 
        data.designer = desName; 
        data.designerEmail = desEmail; 
        
        // Notificar al diseñador (si no se asignó él mismo)
        if (desEmail && usuarioActual && usuarioActual.email !== desEmail) {
            createNotification(desEmail, 'assign', 'Nueva Asignación', `${usuarioActual.displayName || 'Admin'} te asignó ${o.codigoContrato}`, currentEditingOrderId);
        }
    }

    if(o.customStatus !== stat) { 
        changes.push(`Estado: ${o.customStatus} -> ${stat}`); 
        data.customStatus = stat; 
        if(stat === CONFIG.STATUS.COMPLETED) data.completedDate = new Date().toISOString(); 
    }
    
    if(o.receivedDate !== rd) { 
        changes.push(`Fecha Rx: ${rd}`); 
        data.receivedDate = rd; 
    }
    
    if((o.complexity || 'Media') !== comp) { 
        changes.push(`Complejidad: ${comp}`); 
        data.complexity = comp; 
    }
    
    if(changes.length === 0) return showCustomAlert('Sin cambios', 'info');

    // Guardar en Firestore
    const ok = await safeFirestoreOperation(async () => {
        const batch = db_firestore.batch();
        
        batch.set(db_firestore.collection('assignments').doc(currentEditingOrderId), { 
            ...data, 
            lastModified: new Date().toISOString(), 
            schemaVersion: CONFIG.DB_VERSION 
        }, { merge: true });
        
        changes.forEach(c => {
            batch.set(db_firestore.collection('history').doc(), { 
                orderId: currentEditingOrderId, 
                change: c, 
                user: usuarioActual.displayName, 
                timestamp: new Date().toISOString() 
            });
        });
        
        await batch.commit();
    }, 'Guardando...', 'Guardado');

    if(ok) closeTopModal();
};

// 5.3 GESTIÓN DE ÓRDENES HIJAS
window.loadChildOrders = async () => {
    const list = document.getElementById('childOrdersList'); 
    if(!list) return;
    
    const children = firebaseChildOrdersMap.get(currentEditingOrderId) || [];
    document.getElementById('childOrderCount').textContent = children.length;
    
    list.innerHTML = children.map(c => `
        <div class="flex justify-between items-center bg-white dark:bg-slate-700 p-2 rounded border border-slate-200 dark:border-slate-600 shadow-sm text-xs">
            <div>
                <strong class="text-blue-600 dark:text-blue-400 block">${escapeHTML(c.childCode)}</strong>
                <span class="text-slate-500 dark:text-slate-300">${c.cantidad} pzs</span>
            </div>
            <button class="btn-delete-child text-red-400 hover:text-red-600 p-1" data-child-id="${c.childOrderId}" data-child-code="${c.childCode}">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>`).join('') || '<p class="text-slate-400 italic text-xs p-2 text-center">No hay órdenes hijas.</p>';
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
    
    if (!num || !pcs) return showCustomAlert('Datos incompletos', 'error');
    
    const ok = await safeFirestoreOperation(async () => {
        const childId = `${o.orderId}_child_${Date.now()}`;
        await db_firestore.collection('childOrders').doc(childId).set({ 
            childOrderId: childId, 
            parentOrderId: o.orderId, 
            childCode: `${o.codigoContrato}-${num}`, 
            cantidad: pcs, 
            createdAt: new Date().toISOString() 
        });
    }, 'Creando...', 'Orden hija creada');
    
    if(ok) closeTopModal();
};

window.deleteChildOrder = async (id, code) => { 
    if (userRole !== 'admin') return showCustomAlert('Acceso denegado', 'error'); 
    showConfirmModal(`¿Eliminar ${code}?`, async () => { 
        await safeFirestoreOperation(() => db_firestore.collection('childOrders').doc(id).delete(), 'Eliminando...', 'Eliminada'); 
    }); 
};

// 5.4 ASIGNACIÓN MASIVA
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
    
    let desEmail = null;
    if (d && d !== 'Sin asignar') {
        firebaseDesignersMap.forEach(dData => { if (dData.name === d) desEmail = dData.email; });
    }

    const ok = await safeFirestoreOperation(async () => {
        const batch = db_firestore.batch();
        let c = 0;
        selectedOrders.forEach(id => {
            const data = { schemaVersion: CONFIG.DB_VERSION, lastModified: new Date().toISOString() };
            if (d) { data.designer = d; data.designerEmail = desEmail; }
            if (s) data.customStatus = s; 
            if (r) data.receivedDate = r; 
            if (n) data.notes = n; 
            
            if (Object.keys(data).length > 2) { // Si hay algo más que schema y lastModified
                batch.set(db_firestore.collection('assignments').doc(id), data, { merge: true }); 
                c++; 
            }
        });
        if(c > 0) await batch.commit();
        else throw new Error("Sin cambios seleccionados.");
    }, 'Aplicando...', 'Actualizado');
    
    if(ok) { closeTopModal(); clearSelection(); }
};

// 5.5 GESTOR DE EQUIPO (ADMIN)
window.openDesignerManager = () => { 
    populateDesignerManagerModal(); 
    openModalById('designerManagerModal'); 
};

function populateDesignerManagerModal() {
    const l = document.getElementById('designerManagerList');
    l.innerHTML = firebaseDesignersMap.size === 0 ? '<p class="text-center text-slate-400 text-xs py-4">Sin diseñadores.</p>' : '';
    
    firebaseDesignersMap.forEach((d, id) => {
        l.innerHTML += `
        <div class="flex justify-between items-center p-3 border-b border-slate-100 dark:border-slate-600 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700 rounded transition">
            <div>
                <div class="font-bold text-slate-800 dark:text-white text-xs">${escapeHTML(d.name)}</div>
                <div class="text-[10px] text-slate-400">${escapeHTML(d.email)}</div>
            </div>
            <button class="btn-delete-designer text-red-500 hover:text-red-700 text-[10px] font-bold px-2 py-1 bg-red-50 dark:bg-red-900/20 rounded hover:bg-red-100 transition" data-name="${escapeHTML(d.name)}" data-id="${id}">Eliminar</button>
        </div>`;
    });
}

window.addDesigner = async () => {
    if (userRole !== 'admin') return showCustomAlert('Acceso denegado', 'error');
    const name = document.getElementById('newDesignerName').value.trim();
    const email = document.getElementById('newDesignerEmail').value.trim().toLowerCase();
    
    if(!name || !email) return showCustomAlert('Datos incompletos', 'error');
    
    const ok = await safeFirestoreOperation(() => db_firestore.collection('designers').add({ 
        name, email, createdAt: new Date().toISOString() 
    }), 'Agregando...', 'Agregado');
    
    if(ok) { 
        document.getElementById('newDesignerName').value = ''; 
        document.getElementById('newDesignerEmail').value = ''; 
        populateDesignerManagerModal(); 
    }
};

window.deleteDesigner = (id, name) => {
    if (userRole !== 'admin') return showCustomAlert('Acceso denegado', 'error');
    showConfirmModal(`¿Eliminar a ${name}?`, async () => { 
        await safeFirestoreOperation(() => db_firestore.collection('designers').doc(id).delete(), 'Eliminando...', 'Eliminado'); 
    });
};

// ======================================================
// ===== MÓDULO 6: CHAT, KANBAN, MÉTRICAS Y HELPERS =====
// ======================================================

// 6.1 SISTEMA DE CHAT Y MENCIONES
function loadOrderComments(orderId) {
    const chatContainer = document.getElementById('chatHistory'); 
    if(!chatContainer) return;
    
    chatContainer.innerHTML = '<div class="flex justify-center pt-4"><div class="spinner"></div></div>';
    
    // Limpiar listener anterior para evitar duplicados
    if (unsubscribeChat) { unsubscribeChat(); unsubscribeChat = null; }

    unsubscribeChat = db_firestore.collection('assignments').doc(orderId).collection('comments')
        .orderBy('timestamp', 'asc')
        .onSnapshot(snapshot => {
            chatContainer.innerHTML = '';
            if (snapshot.empty) {
                const o = allOrders.find(x => x.orderId === orderId);
                if(o && o.notes) renderSystemMessage(`Nota original: "${o.notes}"`);
                else chatContainer.innerHTML = '<p class="text-center text-slate-300 italic text-xs mt-4">No hay comentarios aún.</p>';
                return;
            }
            snapshot.forEach(doc => {
                const data = doc.data();
                // Determinar si el mensaje es mío
                const isMe = usuarioActual && (data.userEmail === usuarioActual.email);
                renderMessage(data, isMe, chatContainer);
            });
            chatContainer.scrollTop = chatContainer.scrollHeight;
        });
}

function renderMessage(data, isMe, container) {
    const div = document.createElement('div');
    div.className = `chat-bubble ${isMe ? 'me' : 'other'}`;
    
    // Resaltar menciones y saltos de línea
    let formattedText = escapeHTML(data.text)
        .replace(/@([a-zA-Z0-9\s]+?)(?=\s|$)/g, '<span class="mention-tag">@$1</span>')
        .replace(/\n/g, '<br>');

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

async function sendComment() {
    const input = document.getElementById('chatInput'); 
    const text = input.value.trim();
    
    if (!text || !currentEditingOrderId || !usuarioActual) return;
    
    // UI Optimista
    input.value = ''; 
    input.style.height = 'auto'; 
    document.getElementById('mentionDropdown').classList.add('hidden');

    try {
        await db_firestore.collection('assignments').doc(currentEditingOrderId).collection('comments').add({ 
            text, 
            userId: usuarioActual.uid, 
            userName: usuarioActual.displayName, 
            userEmail: usuarioActual.email, 
            timestamp: new Date().toISOString() 
        });
        
        // Actualizar timestamp de la orden
        db_firestore.collection('assignments').doc(currentEditingOrderId).update({ lastModified: new Date().toISOString() });

        // Detección de Menciones
        const mentions = text.match(/@([a-zA-Z0-9\s]+?)(?=\s|$)/g);
        if (mentions) {
            mentions.forEach(m => {
                const name = m.substring(1).trim();
                let targetEmail = null;
                firebaseDesignersMap.forEach(d => { 
                    if (d.name.toLowerCase().includes(name.toLowerCase())) targetEmail = d.email; 
                });
                
                if (targetEmail && targetEmail !== usuarioActual.email) {
                    createNotification(targetEmail, 'mention', 'Te mencionaron', `${usuarioActual.displayName} te mencionó`, currentEditingOrderId);
                }
            });
        }
    } catch (e) { 
        console.error(e); 
        showCustomAlert('Error enviando mensaje', 'error'); 
    }
}

function handleChatInput(textarea) {
    // Auto-resize
    textarea.style.height = 'auto'; 
    textarea.style.height = (textarea.scrollHeight) + 'px';
    
    // Lógica Dropdown Menciones
    const val = textarea.value;
    const cursorPos = textarea.selectionStart;
    const textBefore = val.substring(0, cursorPos);
    const lastAt = textBefore.lastIndexOf('@');
    const dropdown = document.getElementById('mentionDropdown');

    if (lastAt !== -1) {
        const query = textBefore.substring(lastAt + 1).toLowerCase();
        if (query.length < 20) {
            const matches = designerList.filter(d => d.toLowerCase().includes(query));
            if (matches.length > 0) {
                dropdown.innerHTML = '';
                matches.forEach(name => {
                    const item = document.createElement('div'); 
                    item.className = 'mention-item p-2 hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer text-xs border-b border-slate-50 dark:border-slate-600 last:border-0 dark:text-slate-200'; 
                    item.textContent = name;
                    item.onclick = () => { 
                        textarea.value = `${val.substring(0, lastAt)}@${name} `; 
                        dropdown.classList.add('hidden'); 
                        textarea.focus(); 
                    };
                    dropdown.appendChild(item);
                });
                dropdown.classList.remove('hidden');
                return;
            }
        }
    }
    dropdown.classList.add('hidden');
}

function insertEmoji(emoji) {
    const input = document.getElementById('chatInput');
    input.value += emoji;
    input.focus();
}

// 6.2 TABLERO KANBAN
function updateKanban() {
    // Usar filtro inteligente base + filtro local de Kanban
    let orders = getFilteredOrders().filter(o => o.departamento === CONFIG.DEPARTMENTS.ART);
    const designerFilter = document.getElementById('kanbanDesignerFilter');
    let target = designerFilter.value;
    
    // Forzar filtro si no es admin y es diseñador
    if (currentDesignerName && userRole !== 'admin') {
        target = currentDesignerName;
        designerFilter.style.display = 'none';
    } else {
        designerFilter.style.display = 'block';
    }
    
    if(target) orders = orders.filter(o => o.designer === target);

    // Referencias DOM
    const columns = {
        'Bandeja': document.querySelector('.kanban-dropzone[data-status="Bandeja"]'),
        'Producción': document.querySelector('.kanban-dropzone[data-status="Producción"]'),
        'Auditoría': document.querySelector('.kanban-dropzone[data-status="Auditoría"]'),
        'Completada': document.querySelector('.kanban-dropzone[data-status="Completada"]')
    };

    Object.values(columns).forEach(c => { if(c) c.innerHTML = ''; });
    const counts = { 'Bandeja': 0, 'Producción': 0, 'Auditoría': 0, 'Completada': 0 };

    orders.forEach(o => {
        let status = o.customStatus || 'Bandeja';
        if (!columns[status]) status = 'Bandeja'; 
        counts[status]++;

        const card = document.createElement('div');
        // Estilos condicionales de borde
        const borderClass = o.isVeryLate ? 'border-l-red-500' : o.isLate ? 'border-l-orange-400' : o.isAboutToExpire ? 'border-l-yellow-400' : 'border-l-slate-300';
        
        card.className = `kanban-card bg-white dark:bg-slate-700 p-3 rounded-lg shadow-sm border cursor-move hover:shadow-md transition group relative border-l-4 ${borderClass} border-slate-200 dark:border-slate-600`;
        card.draggable = true;
        card.dataset.id = o.orderId;
        // Dataset optimizado para búsqueda rápida
        card.dataset.search = (o.cliente + ' ' + o.estilo + ' ' + o.codigoContrato + ' ' + o.designer).toLowerCase();
        
        card.ondragstart = (ev) => { 
            ev.dataTransfer.setData("text", ev.target.dataset.id); 
            ev.dataTransfer.effectAllowed = "move"; 
        };
        card.onclick = () => openAssignModal(o.orderId); 

        card.innerHTML = `
            <div class="flex justify-between items-start mb-1">
                <span class="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 rounded truncate max-w-[120px]">${escapeHTML(o.cliente)}</span>
                ${o.childPieces > 0 ? '<span class="text-[9px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-1 rounded-full font-bold">+'+o.childPieces+'</span>' : ''}
            </div>
            <div class="font-bold text-xs text-slate-800 dark:text-slate-200 mb-0.5 truncate">${escapeHTML(o.estilo)}</div>
            <div class="text-[10px] text-slate-500 dark:text-slate-400 font-mono mb-2">${escapeHTML(o.codigoContrato)}</div>
            <div class="flex justify-between items-end border-t border-slate-50 dark:border-slate-600 pt-2">
                <div class="flex items-center gap-1">
                    <div class="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white flex items-center justify-center text-[9px] font-bold">${o.designer ? o.designer.substring(0,2).toUpperCase() : '?'}</div>
                    <span class="text-[10px] text-slate-400 dark:text-slate-500">${formatDate(o.fechaDespacho).slice(0,5)}</span>
                </div>
                <div class="font-bold text-xs text-slate-700 dark:text-slate-300">${(Number(o.cantidad) + Number(o.childPieces)).toLocaleString()} pzs</div>
            </div>`;
            
        if(columns[status]) columns[status].appendChild(card);
    });

    Object.keys(counts).forEach(k => { 
        const el = document.getElementById(`count-${k}`); 
        if(el) el.textContent = counts[k]; 
    });
    
    // Aplicar filtro de búsqueda si hay texto escrito
    filterKanbanCards();
}

window.filterKanbanCards = () => {
    const term = document.getElementById('kanbanSearchInput')?.value.toLowerCase().trim() || '';
    document.querySelectorAll('.kanban-card').forEach(card => {
        // Búsqueda ultrarrápida usando dataset pre-calculado
        card.style.display = card.dataset.search.includes(term) ? 'block' : 'none';
    });
};

function allowDrop(ev) { 
    ev.preventDefault(); 
    ev.currentTarget.classList.add('bg-blue-50/50', 'ring-2', 'ring-blue-300'); 
}

async function drop(ev) {
    ev.preventDefault();
    const zone = ev.currentTarget;
    zone.classList.remove('bg-blue-50/50', 'ring-2', 'ring-blue-300'); 
    
    const orderId = ev.dataTransfer.getData("text");
    const newStatus = zone.dataset.status;

    // UI Optimista
    const card = document.querySelector(`div[data-id="${orderId}"]`);
    if(card) zone.appendChild(card);

    await safeFirestoreOperation(async () => {
        const batch = db_firestore.batch();
        const data = { customStatus: newStatus, lastModified: new Date().toISOString(), schemaVersion: CONFIG.DB_VERSION };
        if (newStatus === 'Completada') data.completedDate = new Date().toISOString();
        
        batch.set(db_firestore.collection('assignments').doc(orderId), data, { merge: true });
        batch.set(db_firestore.collection('history').doc(), { 
            orderId, 
            change: `Movido a ${newStatus} (Kanban)`, 
            user: usuarioActual.displayName, 
            timestamp: new Date().toISOString() 
        });
        
        await batch.commit();
    }, 'Moviendo...', null);
}

function updateKanbanDropdown() {
    const sel = document.getElementById('kanbanDesignerFilter');
    if(sel) {
        sel.innerHTML = '<option value="">Todos los Diseñadores</option>' + 
        designerList.map(d => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
    }
}

// 6.3 HELPERS DE UI (DROPDOWNS, BADGES, PAGINACIÓN)

window.populateFilterDropdowns = () => {
    const populate = (id, key) => {
        const sel = document.getElementById(id); if(!sel) return;
        const currentVal = sel.value;
        const options = [...new Set(allOrders.map(o => o[key]).filter(Boolean))].sort();
        
        let defaultOpt = '<option value="">Todos</option>';
        if (id === 'departamentoFilter') defaultOpt += '<option value="P_Art">Solo P_Art</option>';
        
        sel.innerHTML = defaultOpt + options.map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('');
        sel.value = currentVal;
    };
    
    populate('clientFilter', 'cliente');
    populate('styleFilter', 'estilo');
    populate('teamFilter', 'teamName');
    populate('departamentoFilter', 'departamento');

    // Dropdowns de Diseñadores (Unificados)
    const allHtml = '<option value="">Todos</option>' + designerList.map(d => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
    if(document.getElementById('designerFilter')) document.getElementById('designerFilter').innerHTML = allHtml;
    
    const assignHtml = '<option value="">Sin asignar</option>' + designerList.map(d => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
    if(document.getElementById('modalDesigner')) document.getElementById('modalDesigner').innerHTML = assignHtml;
    if(document.getElementById('multiModalDesigner')) document.getElementById('multiModalDesigner').innerHTML = assignHtml;
    
    const compareHtml = '<option value="">Seleccionar...</option>' + designerList.map(d => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
    if(document.getElementById('compareDesignerSelect')) document.getElementById('compareDesignerSelect').innerHTML = compareHtml;
}

function getStatusBadge(order) {
    const base = "px-3 py-1 rounded-full text-xs font-medium inline-flex items-center justify-center shadow-sm whitespace-nowrap";
    if (order.isVeryLate) return `<div class="flex flex-col items-start gap-1"><span class="${base} bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800">MUY ATRASADA</span><span class="text-[10px] font-bold text-red-600 dark:text-red-400 ml-1"><i class="fa-solid fa-clock"></i> ${order.daysLate} días</span></div>`;
    if (order.isLate) return `<div class="flex flex-col items-start gap-1"><span class="${base} bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-800">Atrasada</span><span class="text-[10px] font-bold text-orange-600 dark:text-orange-400 ml-1"><i class="fa-regular fa-clock"></i> ${order.daysLate} días</span></div>`;
    if (order.isAboutToExpire) return `<span class="${base} bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800">Por Vencer</span>`;
    return `<span class="${base} bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800">A Tiempo</span>`;
}

function getCustomStatusBadge(status) {
    const base = "px-3 py-1 rounded-full text-xs font-medium border inline-block min-w-[90px] text-center shadow-sm";
    if (status === 'Completada') return `<span class="${base} bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-600">${status}</span>`;
    if (status === 'Bandeja') return `<span class="${base} bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800">${status}</span>`;
    if (status === 'Producción') return `<span class="${base} bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800">${status}</span>`;
    if (status === 'Auditoría') return `<span class="${base} bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800">${status}</span>`;
    return `<span class="text-slate-400 text-xs italic pl-2">${status||'Sin estado'}</span>`;
}

// Atajos para la tabla
window.changePage = (p) => { currentPage = p; updateTable(); };
window.changeRowsPerPage = () => { rowsPerPage = parseInt(document.getElementById('rowsPerPage').value); currentPage = 1; updateTable(); };
window.setFilter = (f) => { currentFilter = f; currentPage = 1; updateTable(); };
window.sortTable = (k) => { sortConfig.direction = (sortConfig.key === k && sortConfig.direction === 'asc') ? 'desc' : 'asc'; sortConfig.key = k; filteredCache.key = null; updateTable(); };
window.clearAllFilters = () => { 
    currentSearch = ''; currentClientFilter = ''; currentStyleFilter = ''; currentTeamFilter = ''; currentDepartamentoFilter = ''; currentDesignerFilter = ''; currentCustomStatusFilter = ''; currentFilter = 'all'; currentDateFrom = ''; currentDateTo = '';
    document.querySelectorAll('.filter-select, .filter-input').forEach(el => el.value = '');
    if(document.getElementById('searchInput')) document.getElementById('searchInput').value = '';
    filteredCache.key = null; currentPage = 1; updateTable();
};
window.toggleOrderSelection = (id) => { if (selectedOrders.has(id)) selectedOrders.delete(id); else selectedOrders.add(id); updateTable(); };
window.toggleSelectAll = () => { const c = document.getElementById('selectAll'); if(c) paginatedOrders.forEach(o => c.checked ? selectedOrders.add(o.orderId) : selectedOrders.delete(o.orderId)); updateTable(); };
window.clearSelection = () => { selectedOrders.clear(); updateTable(); };
window.toggleNotifications = () => { document.getElementById('notificationDropdown').classList.toggle('hidden'); };

// 6.4 MÉTRICAS, REPORTES Y GRÁFICOS

function destroyAllCharts() {
    if (designerDoughnutChart) { designerDoughnutChart.destroy(); designerDoughnutChart = null; }
    if (designerBarChart) { designerBarChart.destroy(); designerBarChart = null; }
    if (deptLoadPieChart) { deptLoadPieChart.destroy(); deptLoadPieChart = null; }
    if (deptLoadBarChart) { deptLoadBarChart.destroy(); deptLoadBarChart = null; }
    if (compareChart) { compareChart.destroy(); compareChart = null; }
}

function populateMetricsSidebar() {
    const list = document.getElementById('metricsSidebarList'); if (!list) return;
    const artOrders = allOrders.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART);
    const designers = {};
    artOrders.forEach(o => {
        const d = o.designer || 'Sin asignar';
        if (!designers[d]) designers[d] = { total: 0, pieces: 0 };
        designers[d].total++;
        designers[d].pieces += (Number(o.cantidad) || 0) + (Number(o.childPieces) || 0);
    });
    list.innerHTML = Object.entries(designers).sort((a, b) => b[1].total - a[1].total).map(([name, data]) => `
        <button class="filter-btn w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-blue-50 dark:hover:bg-slate-700 hover:border-blue-200 transition-all" data-designer="${escapeHTML(name)}">
            <div class="flex justify-between items-center"><span class="font-bold text-slate-800 dark:text-white text-sm">${escapeHTML(name)}</span><span class="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full text-[10px] font-bold">${data.total}</span></div>
            <div class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">${data.pieces.toLocaleString()} piezas</div>
        </button>`).join('');
}

function generateDesignerMetrics(designerName) {
    const detail = document.getElementById('metricsDetail'); if (!detail) return;
    const orders = allOrders.filter(o => o.departamento === CONFIG.DEPARTMENTS.ART && (designerName === 'Sin asignar' ? !o.designer : o.designer === designerName));
    const totalPieces = orders.reduce((s, o) => s + (Number(o.cantidad)||0) + (Number(o.childPieces)||0), 0);
    const currentMonth = new Date().toISOString().slice(0, 7);

    destroyAllCharts();

    detail.innerHTML = `
        <div class="bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl p-6 text-white mb-6 shadow-lg">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div><h2 class="text-2xl font-bold">${escapeHTML(designerName)}</h2><p class="text-blue-100 text-xs">Reporte de Productividad</p></div>
                <div class="flex items-center gap-2 bg-white/10 p-2 rounded-lg backdrop-blur-sm border border-white/20">
                    <input type="month" id="reportMonthSelector" value="${currentMonth}" class="bg-white/90 text-slate-800 text-xs rounded border-0 py-1.5 px-2 focus:ring-2 focus:ring-blue-400">
                    <button onclick="exportMonthlyReport('${escapeHTML(designerName)}')" class="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2"><i class="fa-solid fa-file-excel"></i> Descargar</button>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="bg-white/10 rounded-lg p-3 backdrop-blur-sm border border-white/10"><div class="text-white/70 text-xs uppercase font-bold mb-1">Total Órdenes</div><div class="text-3xl font-bold">${orders.length}</div></div>
                <div class="bg-white/10 rounded-lg p-3 backdrop-blur-sm border border-white/10"><div class="text-white/70 text-xs uppercase font-bold mb-1">Total Piezas</div><div class="text-3xl font-bold">${totalPieces.toLocaleString()}</div></div>
            </div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow border border-slate-200 dark:border-slate-700"><h3 class="font-bold text-slate-800 dark:text-white mb-4 text-xs uppercase">Distribución de Estados</h3><div class="relative h-64 w-full"><canvas id="designerDoughnutChart"></canvas></div></div>
            <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow border border-slate-200 dark:border-slate-700"><h3 class="font-bold text-slate-800 dark:text-white mb-4 text-xs uppercase">Eficiencia</h3><div class="relative h-64 w-full"><canvas id="designerBarChart"></canvas></div></div>
        </div>`;
    
    setTimeout(() => {
        if (typeof Chart === 'undefined') return;
        const stats = calculateStats(orders);
        const statusCounts = { 'Bandeja': 0, 'Producción': 0, 'Auditoría': 0, 'Completada': 0 };
        orders.forEach(o => { if(statusCounts[o.customStatus] !== undefined) statusCounts[o.customStatus]++; });
        
        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#cbd5e1' : '#666';

        designerDoughnutChart = new Chart(document.getElementById('designerDoughnutChart'), {
            type: 'doughnut', data: { labels: Object.keys(statusCounts), datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#fbbf24', '#a855f7', '#3b82f6', '#10b981'], borderColor: isDark ? '#1e293b' : '#fff' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textColor, font: { size: 10 }, boxWidth: 12 } } } }
        });
        
        designerBarChart = new Chart(document.getElementById('designerBarChart'), {
            type: 'bar', data: { labels: ['A Tiempo', 'Atrasadas', 'Muy Atrasadas'], datasets: [{ label: 'Órdenes', data: [stats.onTime, stats.late - stats.veryLate, stats.veryLate], backgroundColor: ['#10b981', '#f59e0b', '#ef4444'], borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: isDark ? '#334155' : '#e5e5e5' }, ticks: { color: textColor } }, x: { grid: { display: false }, ticks: { color: textColor } } }, plugins: { legend: { display: false } } }
        });
    }, 100);
}

// Generación de Plan Semanal (Visualización)
function generateWorkPlan() {
    const container = document.getElementById('view-workPlanContent');
    const weekInput = document.getElementById('view-workPlanWeekSelector');
    if (!weekInput) return;
    if (!weekInput.value) weekInput.value = getWeekIdentifierString(new Date());
    
    container.innerHTML = '<div class="spinner"></div>';
    setTimeout(() => {
        const planData = firebaseWeeklyPlanMap.get(weekInput.value) || [];
        if (planData.length === 0) {
            container.innerHTML = `<div class="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50"><i class="fa-regular fa-calendar-xmark text-3xl text-slate-300 dark:text-slate-600 mb-2"></i><p class="text-slate-400 font-medium">El plan para la semana ${weekInput.value} está vacío.</p></div>`;
            return;
        }

        let totalPzs = 0, doneCount = 0;
        planData.sort((a, b) => a.isLate ? -1 : 1); // Priorizar atrasadas

        let html = `
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 overflow-hidden"><table class="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-xs">
            <thead class="bg-slate-50 dark:bg-slate-700 font-bold text-slate-500 dark:text-slate-300 uppercase"><tr><th class="px-4 py-3 text-left">Estado</th><th class="px-4 py-3 text-left">Orden</th><th class="px-4 py-3 text-left">Diseñador</th><th class="px-4 py-3 text-left">Entrega</th><th class="px-4 py-3 text-right">Piezas</th><th class="px-4 py-3"></th></tr></thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">`;

        planData.forEach(item => {
            const liveOrder = allOrders.find(o => o.orderId === item.orderId);
            const isCompleted = liveOrder && liveOrder.customStatus === CONFIG.STATUS.COMPLETED;
            const pzs = (item.cantidad || 0) + (item.childPieces || 0);
            totalPzs += pzs; 
            if (isCompleted) doneCount++;

            const badge = isCompleted ? `<span class="bg-slate-600 text-white px-2 py-1 rounded font-bold flex items-center gap-1 w-fit shadow-sm"><i class="fa-solid fa-check"></i> LISTO</span>` : item.isLate ? `<span class="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-1 rounded font-bold border border-red-200 dark:border-red-800">ATRASADA</span>` : `<span class="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded font-bold border border-blue-100 dark:border-blue-800">En Proceso</span>`;
            const rowClasses = isCompleted ? 'bg-slate-50 dark:bg-slate-900 opacity-60 grayscale' : 'hover:bg-slate-50 dark:hover:bg-slate-700';

            html += `
            <tr class="${rowClasses} transition-colors">
                <td class="px-4 py-3">${badge}</td>
                <td class="px-4 py-3"><div class="font-bold text-slate-800 dark:text-white text-sm">${escapeHTML(item.cliente)}</div><div class="text-slate-500 dark:text-slate-400 text-[11px]">${escapeHTML(item.codigoContrato)} - ${escapeHTML(item.estilo)}</div></td>
                <td class="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">${escapeHTML(item.designer || 'Sin asignar')}</td>
                <td class="px-4 py-3 text-slate-600 dark:text-slate-400">${item.fechaDespacho ? new Date(item.fechaDespacho).toLocaleDateString() : '-'}</td>
                <td class="px-4 py-3 text-right font-bold text-slate-800 dark:text-white">${pzs.toLocaleString()}</td>
                <td class="px-4 py-3 text-right"><button class="btn-remove-from-plan text-red-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20" data-plan-entry-id="${item.planEntryId}" data-order-code="${item.codigoContrato}"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`;
        });
        
        html += `</tbody></table></div>`;
        const progress = planData.length > 0 ? Math.round((doneCount / planData.length) * 100) : 0;
        
        container.innerHTML = `
        <div class="mb-6 bg-white dark:bg-slate-800 border border-blue-100 dark:border-slate-700 p-4 rounded-xl shadow-sm flex items-center justify-between gap-6">
            <div class="flex-1"><div class="flex justify-between mb-2"><span class="font-bold text-slate-700 dark:text-slate-300 text-xs uppercase">Progreso Semanal</span><span class="font-bold text-blue-600 dark:text-blue-400 text-xs">${progress}%</span></div><div class="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden"><div class="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-500" style="width: ${progress}%"></div></div></div>
            <div class="text-right border-l border-slate-100 dark:border-slate-700 pl-6"><div class="text-2xl font-bold text-slate-800 dark:text-white">${doneCount} <span class="text-slate-400 text-sm font-normal">/ ${planData.length}</span></div><div class="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide">Órdenes Listas</div></div>
        </div> ${html}`;
    }, 100);
}

// Exportación Excel (Reporte Mensual)
window.exportMonthlyReport = (designerName) => {
    const monthInput = document.getElementById('reportMonthSelector').value; 
    if (!monthInput) return showCustomAlert('Selecciona un mes válido', 'error');

    const getWeekNumber = (d) => { d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7)); var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1)); return Math.ceil((((d - yearStart) / 86400000) + 1)/7); };

    const reportData = allOrders.filter(o => {
        const matchDesigner = (designerName === 'Sin asignar' ? !o.designer : o.designer === designerName);
        if (!matchDesigner || !o.receivedDate) return false;
        return o.receivedDate.startsWith(monthInput);
    });

    if (reportData.length === 0) return showCustomAlert('No hay datos para este mes', 'info');

    const excelData = reportData.map(o => {
        const dateObj = new Date(o.receivedDate + "T12:00:00");
        return {
            "SEMANA #-": getWeekNumber(dateObj), "DIA": dateObj.toLocaleDateString('es-ES', { weekday: 'long' }).toUpperCase(),
            "FECHA DE LLEGADA": o.receivedDate || '-', "FECHA DE DESPACHO": o.fechaDespacho ? o.fechaDespacho.toLocaleDateString() : '-',
            "CLIENTE": o.cliente, "#- DE ORDEN": o.codigoContrato, "CANT. PIEZAS": (Number(o.cantidad) || 0) + (Number(o.childPieces) || 0),
            "CANT. MONTADA": "", "PROOF": "", "APROBACION": "", "PRODUCCION": o.completedDate ? new Date(o.completedDate).toLocaleDateString() : ''
        };
    });

    if (typeof XLSX === 'undefined') return showCustomAlert('Librería Excel no cargada', 'error');
    const ws = XLSX.utils.json_to_sheet(excelData); const wb = XLSX.utils.book_new();
    ws['!cols'] = [{wch: 10}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 25}, {wch: 15}, {wch: 12}, {wch: 12}, {wch: 10}, {wch: 15}, {wch: 15}];
    XLSX.utils.book_append_sheet(wb, ws, "Reporte Mensual");
    XLSX.writeFile(wb, `REPORTE_ARTE_${monthInput}_${designerName.toUpperCase().replace(/\s+/g, '_')}.xlsx`);
    showCustomAlert('Reporte descargado', 'success');
};

window.exportTableToExcel = () => {
    if (allOrders.length === 0) return showCustomAlert('No hay datos', 'error');
    const data = getFilteredOrders().map(o => ({
        "Cliente": o.cliente, "Código": o.codigoContrato, "Estilo": o.estilo, "Departamento": o.departamento,
        "Fecha Despacho": o.fechaDespacho ? o.fechaDespacho.toLocaleDateString() : '',
        "Diseñador": o.designer, "Estado Interno": o.customStatus, "Piezas": o.cantidad, "Total Piezas": o.cantidad + o.childPieces
    }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Reporte");
    XLSX.writeFile(wb, `Reporte_Panel_${new Date().toISOString().slice(0,10)}.xlsx`);
};


