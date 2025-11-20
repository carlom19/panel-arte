// ======================================================
// ===== CONFIGURACIÓN INICIAL Y VARIABLES GLOBALES =====
// ======================================================

console.log('%cPanel de Control Arte v5.5 - Cargando...', 'color: #22c55e; font-weight: bold;');

// --- Configuración de Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyB9d-XXXXXXXXXXXXXXXXXXXXXXXXXXX",
    authDomain: "fitwell-artes.firebaseapp.com",
    projectId: "fitwell-artes",
    storageBucket: "fitwell-artes.appspot.com",
    messagingSenderId: "XXXXXXXXXXXX",
    appId: "1:XXXXXXXXXXXX:web:YYYYYYYYYYYYYYYYYYYYYY"
};

firebase.initializeApp(firebaseConfig);
const db_firestore = firebase.firestore();
const db_auth = firebase.auth();

// Permitir timestamps en snapshots (si la versión de SDK lo soporta)
if (firebase.firestore && firebase.firestore.setLogLevel) {
    firebase.firestore.setLogLevel('error');
}

// --- Constantes de la App ---
const DB_SCHEMA_VERSION = 1;
const CUSTOM_STATUS_OPTIONS = ['Bandeja', 'Producción', 'Auditoría', 'Completada'];
let needsRecalculation = true; 

// --- Configuración Global ---
const EXCLUDE_DESIGNERS = ['No asignar', 'Sin diseñador']; 

// --- Estado Global de la Aplicación ---
let isExcelLoaded = false;
let isAuthInitialized = false;
let currentUserRole = null;
let usuarioActual = null; 

let allOrders = [];
let filteredOrders = [];
let currentPage = 1;
const PAGE_SIZE = 30;

// --- Mapa de Asignaciones, Historial y Órdenes Hijas (Caché en tiempo real) ---
let firebaseAssignmentsMap = new Map();
let firebaseHistoryMap = new Map();
let firebaseChildOrdersMap = new Map();
let firebaseDesignersMap = new Map();

// --- Variables para Batch de Auto-Completado ---
let autoCompleteBatchWrites = []; 
let autoCompletedOrderIds = new Set(); 

// --- Instancias de Gráficos ---
let designerDoughnutChart = null;
let designerBarChart = null;
let designerActivityChart = null; 
let currentDesignerTrendChart = null;
let ordersByStatusChart = null;
let ordersByClientChart = null;
let ordersByStyleChart = null;
let ordersByWeekChart = null;

// --- Filtros Globales ---
let currentSearchTerm = '';
let currentStatusFilter = 'Todos';
let currentDesignerFilter = 'Todos';
let currentDepartmentFilter = 'P_Art';
let currentSortField = 'fechaDespacho';
let currentSortDirection = 'asc';
let currentDateFilter = null;

// --- Observadores / Suscripciones ---
let unsubscribeAssignments = null;
let unsubscribeHistory = null;
let unsubscribeChildOrders = null;
let unsubscribeDesigners = null;
let unsubscribeWeeklyPlan = null;

// --- Estado del Modal de Confirmación ---
let confirmCallback = null;
let isStrictConfirm = false;

// ================================================
// ============ UTILIDADES GENERALES ==============
// ================================================

function safeAddEventListener(idOrElement, event, handler, options) {
    try {
        let el = typeof idOrElement === 'string' 
            ? document.getElementById(idOrElement) 
            : idOrElement;
        if (el) el.addEventListener(event, handler, options || false);
    } catch (e) {
        console.error('Error en safeAddEventListener:', e);
    }
}

function showLoading(message = 'Cargando...') {
    if (document.getElementById('loadingOverlay')) {
        const text = document.getElementById('loadingText');
        text.textContent = message;
        document.getElementById('loadingOverlay').classList.remove('hidden');
    } else {
        console.log('LOADING:', message);
    }
}

function hideLoading() {
    if (document.getElementById('loadingOverlay')) {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }
}

function showCustomAlert(message, type = 'info', duration = 4000) {
    const container = document.getElementById('customAlertContainer');
    if (!container) {
        alert(message);
        return;
    }
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `custom-alert custom-alert-${type}`;
    alertDiv.innerHTML = `
        <div class="flex items-center">
            <span class="mr-2">
                ${type === 'success' ? '✅' 
                    : type === 'error' ? '❌'
                    : type === 'warning' ? '⚠️'
                    : 'ℹ️'}
            </span>
            <span>${message}</span>
        </div>
    `;
    container.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.classList.add('fade-out');
        setTimeout(() => container.removeChild(alertDiv), 300);
    }, duration);
}

function logToFirestore(action, payload) {
    try {
        const logRef = db_firestore.collection('logs').doc();
        logRef.set({
            action,
            payload: JSON.stringify(payload || null),
            user: usuarioActual ? usuarioActual.email : null,
            timestamp: new Date().toISOString(),
            schemaVersion: DB_SCHEMA_VERSION
        }).catch(err => {
            console.warn('Error guardando log:', err);
        });
    } catch (e) {
        console.warn('Error logToFirestore:', e);
    }
}

// ================================================
// ========== AUTENTICACIÓN Y ROLES ===============
// ================================================

async function initAuth() {
    if (isAuthInitialized) return;
    isAuthInitialized = true;

    db_auth.onAuthStateChanged(async (user) => {
        if (user) {
            usuarioActual = user;
            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('mainApp').classList.remove('hidden');
            await fetchUserRole(user);
            await initRealtimeListeners();
            updateUIForRole();
        } else {
            usuarioActual = null;
            document.getElementById('mainApp').classList.add('hidden');
            document.getElementById('loginSection').classList.remove('hidden');
        }
    });

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('emailInput').value.trim();
            const pass = document.getElementById('passwordInput').value.trim();
            if (!email || !pass) return;
            
            showLoading('Conectando...');
            try {
                await db_auth.signInWithEmailAndPassword(email, pass);
                showCustomAlert('Sesión iniciada con éxito.', 'success');
            } catch (error) {
                console.error('Error login:', error);
                showCustomAlert('Error al iniciar sesión: ' + (error.message || error), 'error');
            } finally {
                hideLoading();
            }
        });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await db_auth.signOut();
                showCustomAlert('Sesión cerrada.', 'success');
            } catch (error) {
                console.error('Error logout:', error);
                showCustomAlert('Error al cerrar sesión.', 'error');
            }
        });
    }
}

async function fetchUserRole(user) {
    try {
        const docRef = db_firestore.collection('users').doc(user.uid);
        const doc = await docRef.get();
        if (doc.exists) {
            const data = doc.data();
            currentUserRole = data.role || 'viewer';
        } else {
            currentUserRole = 'viewer';
        }
    } catch (e) {
        console.error('Error obteniendo rol:', e);
        currentUserRole = 'viewer';
    }
}

function updateUIForRole() {
    const adminOnly = document.querySelectorAll('.role-admin');
    adminOnly.forEach(el => {
        el.style.display = (currentUserRole === 'admin' || currentUserRole === 'coordinator') ? '' : 'none';
    });
}

// ======================================================
// ====== LISTENERS EN TIEMPO REAL DE FIREBASE =========
// ======================================================

async function initRealtimeListeners() {
    if (!usuarioActual) return;

    if (unsubscribeAssignments) unsubscribeAssignments();
    if (unsubscribeHistory) unsubscribeHistory();
    if (unsubscribeChildOrders) unsubscribeChildOrders();
    if (unsubscribeDesigners) unsubscribeDesigners();

    showLoading('Conectando con Firebase...');

    // Escucha de Asignaciones
    unsubscribeAssignments = db_firestore.collection('assignments')
        .onSnapshot((snapshot) => {
            firebaseAssignmentsMap.clear();
            snapshot.forEach(doc => {
                const data = doc.data();
                firebaseAssignmentsMap.set(doc.id, {
                    designer: data.designer || '',
                    customStatus: data.customStatus || '',
                    receivedDate: data.receivedDate || '',
                    notes: data.notes || '',
                    completedDate: data.completedDate || null,
                    childPieces: typeof data.childPieces === 'number' ? data.childPieces : null
                });
            });
            if (isExcelLoaded) mergeYActualizar();
        }, (error) => {
            console.error('Error en snapshot assignments:', error);
            showCustomAlert('Error al escuchar asignaciones.', 'error');
        });

    // Escucha de Historial
    unsubscribeHistory = db_firestore.collection('history')
        .onSnapshot((snapshot) => {
            firebaseHistoryMap.clear();
            snapshot.forEach(doc => {
                const data = doc.data();
                const orderId = data.orderId;
                if (!firebaseHistoryMap.has(orderId)) {
                    firebaseHistoryMap.set(orderId, []);
                }
                firebaseHistoryMap.get(orderId).push(data);
            });
            needsRecalculation = true; 
            if(isExcelLoaded) mergeYActualizar();
        }, (error) => {
            console.error('Error en snapshot history:', error);
        });

    // Escucha de Órdenes Hijas
    unsubscribeChildOrders = db_firestore.collection('childOrders')
        .onSnapshot((snapshot) => {
            firebaseChildOrdersMap.clear();
            snapshot.forEach(doc => {
                const data = doc.data();
                if (!firebaseChildOrdersMap.has(data.parentOrderId)) {
                    firebaseChildOrdersMap.set(data.parentOrderId, []);
                }
                firebaseChildOrdersMap.get(data.parentOrderId).push(data);
            });
            needsRecalculation = true; 
            if(isExcelLoaded) mergeYActualizar();
        }, (error) => {
            console.error('Error en snapshot childOrders:', error);
        });

    // Escucha de Diseñadores
    unsubscribeDesigners = db_firestore.collection('designers')
        .orderBy('name')
        .onSnapshot((snapshot) => {
            firebaseDesignersMap.clear();
            snapshot.forEach(doc => {
                firebaseDesignersMap.set(doc.id, doc.data());
            });
            populateDesignersDropdown();
        }, (error) => {
            console.error('Error en snapshot designers:', error);
        });

    hideLoading();
    showCustomAlert('Conectado a Firebase.', 'success');
    updateFirebaseConnectionStatus(true);
}

function updateFirebaseConnectionStatus(isConnected) {
    const dbStatus = document.getElementById('dbStatus');
    if (!dbStatus) return;
    if (isConnected) {
        dbStatus.innerHTML = '<i class="fa-solid fa-circle-check text-green-500 mr-1"></i> Conectado';
        dbStatus.className = "ml-3 text-xs inline-flex items-center text-green-700";
    } else {
        dbStatus.innerHTML = '<i class="fa-solid fa-circle-xmark text-red-500 mr-1"></i> Desconectado';
        dbStatus.className = "ml-3 text-xs inline-flex items-center text-red-700";
    }
}

// =============================================
// ========= MODAL DE CONFIRMACIÓN =============
// =============================================

function showConfirmModal(message, onConfirmCallback, strict = false) {
    // Configurar mensaje y flags
    document.getElementById('confirmModalMessage').textContent = message;
    confirmCallback = onConfirmCallback;
    isStrictConfirm = strict;
    
    const strictContainer = document.getElementById('confirmStrictContainer');
    const confirmBtn = document.getElementById('confirmModalConfirm');
    const input = document.getElementById('confirmStrictInput');
    
    // Modo estricto: requiere escribir CONFIRMAR
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
    
    // Mostrar modal
    document.getElementById('confirmModal').classList.add('active');
    document.body.classList.add('modal-open');
    
    // Clonar botón para eliminar listeners previos
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    // Nuevo handler de confirmación con validación estricta
    newConfirmBtn.addEventListener('click', () => {
        // Si es confirmación estricta, volvemos a validar el texto
        if (isStrictConfirm) {
            const value = (document.getElementById('confirmStrictInput').value || '').trim().toUpperCase();
            if (value !== 'CONFIRMAR') {
                alert('Para continuar, escribe exactamente CONFIRMAR en el campo de verificación.');
                return;
            }
        }
        
        if (typeof confirmCallback === 'function') {
            confirmCallback();
        }
        closeConfirmModal();
    }, { once: true });
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
    checkAndCloseModalStack(); 
    confirmCallback = null;
    document.getElementById('confirmStrictInput').value = ''; 
    isStrictConfirm = false;
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
    console.log('DOM cargado. Inicializando App v5.5...');
    
    safeAddEventListener('legendButton', 'click', openLegendModal);
    safeAddEventListener('legendCloseBtn', 'click', () => {
        document.getElementById('legendModal').classList.remove('active');
        checkAndCloseModalStack();
    });
    safeAddEventListener('legendOverlay', 'click', (e) => {
        if (e.target.id === 'legendOverlay') {
            document.getElementById('legendModal').classList.remove('active');
            checkAndCloseModalStack();
        }
    });

    safeAddEventListener('confirmStrictInput', 'input', checkStrictInput);
    safeAddEventListener('confirmModalCancel', 'click', closeConfirmModal);
    safeAddEventListener('confirmModalOverlay', 'click', (e) => {
        if (e.target.id === 'confirmModalOverlay') {
            closeConfirmModal();
        }
    });

    initAuth();

    safeAddEventListener('fileInput', 'change', handleFileSelection);
    safeAddEventListener('uploadButton', 'click', () => {
        const input = document.getElementById('fileInput');
        if (input && input.files && input.files[0]) {
            processFile(input.files[0]);
        } else {
            showCustomAlert('Selecciona un archivo primero.', 'warning');
        }
    });

    initFiltersUI();
    initNotificationsDropdown();
});

// ===========================================
// ======= GESTIÓN DE MODALES STACK =========
// ===========================================

function checkAndCloseModalStack() {
    const anyActive = document.querySelector('.modal-overlay.active');
    if (!anyActive) document.body.classList.remove('modal-open');
}

// ============================================
// ========= MANEJO DE ARCHIVO EXCEL ==========
// ============================================

function handleFileSelection(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
        showCustomAlert('Por favor selecciona un archivo .xlsx', 'warning');
        e.target.value = '';
        return;
    }
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
        if (headerIndex === -1) {
            throw new Error('No se encontró la fila de encabezados (cliente / fecha).');
        }

        const headers = arr[headerIndex].map(h => String(h).trim());
        const colIndices = {
            fecha: headers.findIndex(h => h.toLowerCase().includes('fecha')),
            cliente: headers.findIndex(h => h.toLowerCase().includes('cliente')),
            codigo: headers.findIndex(h => h.toLowerCase().includes('codigo') || h.toLowerCase().includes('contrato')),
            estilo: headers.findIndex(h => h.toLowerCase().includes('estilo')),
            team: headers.findIndex(h => h.toLowerCase().includes('team')),
        };

        const departmentPatterns = [
            { pattern: /p[_\s]*art/i, name: 'P_Art' }, 
            { pattern: /p[_\s]*order[_\s]*entry/i, name: 'P_Order_Entry' },
            { pattern: /p[_\s]*printing/i, name: 'P_Printing' },
            { pattern: /p[_\s]*press/i, name: 'P_Press' },
            { pattern: /p[_\s]*cut/i, name: 'P_Cut' },
            { pattern: /p[_\s]*r[_\s]*to[_\s]*sew/i, name: 'P_R_to_Sew' },
            { pattern: /p[_\s]*sew/i, name: 'P_Sew' },
            { pattern: /sum[_\s]*of[_\s]*twill/i, name: 'Sum of TWILL' }
        ];

        const departmentIndices = headers.map((h, idx) => {
            const lower = h.toLowerCase();
            for (const dep of departmentPatterns) {
                if (dep.pattern.test(lower)) {
                    return { index: idx, name: dep.name };
                }
            }
            return null;
        }).filter(x => x !== null);

        let currentClient = '';
        let currentContrato = '';
        let currentStyle = '';
        let currentTeam = '';
        let currentDate = null;
        const processedOrders = [];

        autoCompleteBatchWrites = [];
        autoCompletedOrderIds = new Set();

        for (let r = headerIndex + 1; r < arr.length; r++) {
            const row = arr[r];
            if (!row || row.length === 0) continue;

            if (colIndices.fecha >= 0 && row[colIndices.fecha]) {
                const rawFecha = row[colIndices.fecha];
                let deliveryDate = null;
                if (typeof rawFecha === 'number') {
                    deliveryDate = new Date((rawFecha - 25569) * 86400 * 1000);
                } else {
                    const d = new Date(rawFecha);
                    if (!isNaN(d)) deliveryDate = d;
                }
                if (deliveryDate && !isNaN(deliveryDate)) {
                    // Normalizar a fecha UTC sin hora
                    deliveryDate = new Date(Date.UTC(
                        deliveryDate.getFullYear(),
                        deliveryDate.getMonth(),
                        deliveryDate.getDate()
                    ));
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
                const numValue = Number(rawValue);
                if (!isNaN(numValue) && numValue > 0) {
                    orderCantidad = numValue;
                    orderDepartamento = col.name;
                    break;
                }
            }

            if (orderCantidad <= 0) { 
                orderCantidad = 0; 
                orderDepartamento = "Sin Departamento"; 
            }

            const fechaDespacho = currentDate ? new Date(currentDate) : null;
            const orderId = `${currentClient}_${currentContrato}_${fechaDespacho ? fechaDespacho.getTime() : 'nodate'}_${currentStyle}`;

            const today = new Date();
            today.setHours(0,0,0,0);
            let daysLate = 0;
            const isLate = fechaDespacho && fechaDespacho < today;
            if (isLate) {
                const diffTime = today.getTime() - fechaDespacho.getTime();
                daysLate = Math.ceil(diffTime / (1000*60*60*24));
            }
            const isVeryLate = daysLate > 7;
            const isAboutToExpire = !isLate && fechaDespacho && ((fechaDespacho - today) / (1000*60*60*24)) <= 2;
            
            const fbData = firebaseAssignmentsMap.get(orderId);
            let currentStatus = fbData ? fbData.customStatus : '';
            let currentCompletedDate = fbData ? fbData.completedDate : null;

            if (fbData) {
                const historyList = firebaseHistoryMap.get(orderId) || [];
                const alreadyAutoCompleted = historyList.some(h =>
                    h &&
                    typeof h.change === 'string' &&
                    h.change.includes('Estado automático:')
                );

                const isCandidateForAutoComplete =
                    !fbData.completedDate &&
                    (fbData.customStatus === 'Bandeja' ||
                     fbData.customStatus === 'Producción' ||
                     fbData.customStatus === 'Auditoría') &&
                    orderDepartamento !== 'P_Art' &&
                    orderDepartamento !== 'Sin Departamento';

                if (isCandidateForAutoComplete && !alreadyAutoCompleted && !autoCompletedOrderIds.has(orderId)) {
                    currentStatus = 'Completada';
                    currentCompletedDate = new Date().toISOString();
                    autoCompleteBatchWrites.push({
                        orderId: orderId,
                        data: {
                            customStatus: 'Completada',
                            completedDate: currentCompletedDate,
                            lastModified: new Date().toISOString(),
                            schemaVersion: DB_SCHEMA_VERSION
                        },
                        history: [
                            `Estado automático: ${fbData.customStatus} → Completada (movido a ${orderDepartamento})`
                        ]
                    });
                    autoCompletedOrderIds.add(orderId);
                }
            }

            processedOrders.push({
                orderId, 
                fechaDespacho, 
                cliente: currentClient, 
                codigoContrato: currentContrato,
                estilo: currentStyle, 
                teamName: currentTeam, 
                departamento: orderDepartamento,
                cantidad: orderCantidad, 
                childPieces: 0, 
                isLate, 
                daysLate, 
                isVeryLate, 
                isAboutToExpire,
                designer: fbData ? fbData.designer : '', 
                customStatus: currentStatus || '',
                receivedDate: fbData ? fbData.receivedDate : '', 
                notes: fbData ? fbData.notes : '',
                completedDate: currentCompletedDate || null
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
        console.error(error); 
        document.getElementById('fileInput').value = ''; 
        logToFirestore('file:process', error);
    } finally { 
        hideLoading(); 
    }
}

// ======================================================
// ===== MERGE ENTRE EXCEL Y FIREBASE EN MEMORIA ========
// ======================================================

function mergeYActualizar() {
    if (!isExcelLoaded) return;

    // Aseguramos que las piezas hijas estén actualizadas
    recalculateChildPieces();

    // Reiniciamos los batch de autocompletado para esta ejecución
    autoCompleteBatchWrites = [];
    autoCompletedOrderIds = new Set();

    for (let i = 0; i < allOrders.length; i++) {
        const order = allOrders[i];

        const fbData      = firebaseAssignmentsMap.get(order.orderId) || null;
        const historyList = firebaseHistoryMap.get(order.orderId) || [];
        const childOrders = firebaseChildOrdersMap.get(order.orderId) || [];

        // Fusionar datos de Firebase sobre los datos base del Excel
        if (fbData) {
            if (fbData.designer)      order.designer      = fbData.designer;
            if (fbData.customStatus)  order.customStatus  = fbData.customStatus;
            if (fbData.receivedDate)  order.receivedDate  = fbData.receivedDate;
            if (fbData.notes)         order.notes         = fbData.notes;
            if (fbData.completedDate) order.completedDate = fbData.completedDate;

            // Si Firebase guarda childPieces explícito, se respeta
            if (typeof fbData.childPieces === 'number') {
                order.childPieces = fbData.childPieces;
            }
        } else {
            // Sin datos en Firebase, evitamos valores undefined
            order.designer      = order.designer      || '';
            order.customStatus  = order.customStatus  || '';
            order.receivedDate  = order.receivedDate  || '';
            order.notes         = order.notes         || '';
            order.completedDate = order.completedDate || null;
        }

        // Defaults seguros
        if (!order.customStatus) order.customStatus = 'Bandeja';
        if (!order.departamento) order.departamento = 'Sin Departamento';

        // Recalcular piezas hijas si no están definidas
        if (
            order.childPieces === undefined ||
            order.childPieces === null ||
            isNaN(order.childPieces)
        ) {
            order.childPieces = childOrders.reduce(
                (sum, child) => sum + (child.cantidad || 0),
                0
            );
        }

        // Adjuntar información de apoyo
        order.childOrders = childOrders;
        order.history     = historyList;

        // Verificar si ya hubo un autocompletado automático en el historial
        const alreadyAutoCompleted = historyList.some(h =>
            h &&
            typeof h.change === 'string' &&
            h.change.includes('Estado automático:')
        );

        // Regla de Auto-Completado:
        // - Solo si la orden salió de P_Art
        // - Solo si el estado en Firebase está en Bandeja/Producción/Auditoría
        // - Solo si NO tiene completedDate en Firebase
        // - Solo si NO tiene ya un autocompletado previo
        if (
            fbData &&
            !alreadyAutoCompleted &&
            !fbData.completedDate &&
            (fbData.customStatus === 'Bandeja' ||
             fbData.customStatus === 'Producción' ||
             fbData.customStatus === 'Auditoría') &&
            order.departamento !== 'P_Art' &&
            order.departamento !== 'Sin Departamento'
        ) {
            if (fbData.customStatus !== 'Completada' && !autoCompletedOrderIds.has(order.orderId)) {
                order.customStatus = 'Completada';
                const newCompletedDate = new Date().toISOString();
                order.completedDate   = newCompletedDate;

                autoCompleteBatchWrites.push({
                    orderId: order.orderId,
                    data: {
                        customStatus:  'Completada',
                        completedDate: newCompletedDate,
                        lastModified:  new Date().toISOString(),
                        schemaVersion: DB_SCHEMA_VERSION
                    },
                    history: [
                        `Estado automático: ${fbData.customStatus} → Completada (movido a ${order.departamento})`
                    ]
                });

                autoCompletedOrderIds.add(order.orderId);
            }
        }
    }

    // Refrescar tablero y ejecutar batch de autocompletado si aplica
    updateDashboard();
    if (autoCompleteBatchWrites.length > 0 && typeof ejecutarAutoCompleteBatch === 'function') {
        ejecutarAutoCompleteBatch();
    }
}

// ======================================================
// ===== FUNCIONES CRUD DE FIREBASE (BATCH, ETC.) =======
// ======================================================

async function ejecutarAutoCompleteBatch() {
    if (!usuarioActual || autoCompleteBatchWrites.length === 0) return;
    if (autoCompleteBatchWrites.length > 400) {
        console.warn('AutoCompleteBatch demasiado grande, se dividirá en lotes.');
    }

    const BATCH_LIMIT = 450;
    const nowIso = new Date().toISOString();

    try {
        while (autoCompleteBatchWrites.length > 0) {
            const chunk = autoCompleteBatchWrites.splice(0, BATCH_LIMIT);
            const batch = db_firestore.batch();

            chunk.forEach(entry => {
                const docRef = db_firestore.collection('assignments').doc(entry.orderId);
                batch.set(docRef, {
                    ...(entry.data || {}),
                    lastModified: nowIso,
                    schemaVersion: DB_SCHEMA_VERSION
                }, { merge: true });

                if (entry.history && entry.history.length > 0) {
                    const histRef = db_firestore.collection('history').doc();
                    batch.set(histRef, {
                        orderId: entry.orderId,
                        change: entry.history[0],
                        changedBy: usuarioActual ? usuarioActual.email : 'sistema',
                        timestamp: nowIso,
                        schemaVersion: DB_SCHEMA_VERSION
                    });
                }
            });

            await batch.commit();
        }
        showCustomAlert('Auto-completado sincronizado con Firebase.', 'success');
    } catch (e) {
        console.error('Error en ejecutarAutoCompleteBatch:', e);
        showCustomAlert('Error al guardar auto-completados.', 'error');
    }
}

// ======================================================
// ============== CRUD DE DISEÑADORES ===================
// ======================================================

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
                        batch.set(docRef, {
                            designer: '',
                            lastModified: new Date().toISOString(),
                            schemaVersion: DB_SCHEMA_VERSION
                        }, { merge: true });
                    });
                    await batch.commit();
                }
            }
            showCustomAlert('Diseñador eliminado y órdenes limpiadas.', 'success');
        } catch (error) {
            console.error(error);
            showCustomAlert('Error al eliminar diseñador.', 'error');
        } finally {
            hideLoading();
        }
    }, strict);
}

// ======================================================
// =========== RECÁLCULO DE PIEZAS HIJAS =================
// ======================================================

function recalculateChildPieces() {
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

// ======================================================
// =================== TABLA PRINCIPAL ==================
// ======================================================

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

function calculateStats(orders) {
    const today = new Date(); 
    today.setHours(0,0,0,0);
    const weekEnd = new Date(today); 
    weekEnd.setDate(today.getDate()+7);
    return {
        total: orders.length,
        totalPieces: orders.reduce((s, o) => s + (o.cantidad||0) + (o.childPieces||0), 0),
        late: orders.filter(o => o.isLate).length,
        veryLate: orders.filter(o => o.isVeryLate).length,
        expiring: orders.filter(o => o.isAboutToExpire && !o.isLate).length,
        thisWeek: orders.filter(o => o.fechaDespacho && o.fechaDespacho <= weekEnd && !o.isLate).length
    };
}

function updateStats(stats) {
    const totalOrdersEl = document.getElementById('totalOrders');
    const totalPiecesEl = document.getElementById('totalPieces');
    const lateOrdersEl = document.getElementById('lateOrders');
    const thisWeekOrdersEl = document.getElementById('thisWeekOrders');

    if (totalOrdersEl) totalOrdersEl.textContent = stats.total;
    if (totalPiecesEl) totalPiecesEl.textContent = stats.totalPieces.toLocaleString();
    if (lateOrdersEl) lateOrdersEl.textContent = stats.late;
    if (thisWeekOrdersEl) thisWeekOrdersEl.textContent = stats.thisWeek;
}

function updateAlerts(stats) {
    const alertBox = document.getElementById('alertsBox');
    if (!alertBox) return;
    let alerts = [];
    if (stats.veryLate > 0) alerts.push(`Tienes ${stats.veryLate} órdenes muy atrasadas.`);
    if (stats.expiring > 0) alerts.push(`Tienes ${stats.expiring} órdenes que vencen en los próximos 2 días.`);
    if (alerts.length === 0) {
        alertBox.innerHTML = '<p class="text-green-600 text-sm">No hay alertas críticas por ahora.</p>';
    } else {
        alertBox.innerHTML = alerts.map(a => `<p class="text-red-500 text-sm">• ${a}</p>`).join('');
    }
}

function getFilteredOrders() {
    let result = allOrders.slice();

    // Departamento
    if (currentDepartmentFilter && currentDepartmentFilter !== 'Todos') {
        result = result.filter(o => o.departamento === currentDepartmentFilter);
    }

    // Status
    if (currentStatusFilter && currentStatusFilter !== 'Todos') {
        if (currentStatusFilter === 'Sin asignar') {
            result = result.filter(o => !o.designer);
        } else if (currentStatusFilter === 'Completada') {
            result = result.filter(o => o.customStatus === 'Completada');
        } else {
            result = result.filter(o => o.customStatus === currentStatusFilter);
        }
    }

    // Diseñador
    if (currentDesignerFilter && currentDesignerFilter !== 'Todos') {
        if (currentDesignerFilter === 'Sin asignar') {
            result = result.filter(o => !o.designer);
        } else {
            result = result.filter(o => o.designer === currentDesignerFilter);
        }
    }

    // Búsqueda
    if (currentSearchTerm) {
        const term = currentSearchTerm.toLowerCase();
        result = result.filter(o => 
            (o.cliente && o.cliente.toLowerCase().includes(term)) ||
            (o.codigoContrato && o.codigoContrato.toLowerCase().includes(term)) ||
            (o.teamName && o.teamName.toLowerCase().includes(term)) ||
            (o.estilo && o.estilo.toLowerCase().includes(term))
        );
    }

    // Ordenar
    result.sort((a, b) => {
        let v1 = a[currentSortField];
        let v2 = b[currentSortField];
        if (currentSortField === 'fechaDespacho') {
            v1 = a.fechaDespacho ? a.fechaDespacho.getTime() : 0;
            v2 = b.fechaDespacho ? b.fechaDespacho.getTime() : 0;
        }
        if (v1 < v2) return currentSortDirection === 'asc' ? -1 : 1;
        if (v1 > v2) return currentSortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    return result;
}

function updateTable() {
    if (!isExcelLoaded) return;
    
    filteredOrders = getFilteredOrders();
    const tableBody = document.getElementById('ordersTableBody');
    const paginationInfo = document.getElementById('paginationInfo');
    if (!tableBody) return;

    const total = filteredOrders.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * PAGE_SIZE;
    const paginated = filteredOrders.slice(start, start + PAGE_SIZE);

    if (paginated.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="14" class="text-center py-12">
                    <div class="flex flex-col items-center justify-center text-gray-400">
                        <i class="fa-solid fa-magnifying-glass text-4xl mb-4 text-gray-300"></i>
                        <p class="text-lg font-medium">No se encontraron órdenes</p>
                        <p class="text-sm">Intenta ajustar los filtros o la búsqueda.</p>
                        <button onclick="clearAllFilters()" class="mt-3 text-blue-600 hover:underline font-medium">Limpiar filtros</button>
                    </div>
                </td>
            </tr>`;
    } else {
        tableBody.innerHTML = paginated.map(order => {
            const hasChildren = order.childPieces > 0;
            const rowClass = order.isVeryLate ? 'very-late' : order.isLate ? 'late' : order.isAboutToExpire ? 'expiring' : '';
            const receivedDateStr = order.receivedDate ? order.receivedDate : '';
            const completedDateStr = order.completedDate ? new Date(order.completedDate).toLocaleDateString() : '';
            const fechaDespachoStr = order.fechaDespacho ? order.fechaDespacho.toLocaleDateString() : '';

            return `
                <tr class="${rowClass}">
                    <td class="px-2 py-1 text-xs whitespace-nowrap">${order.cliente || ''}</td>
                    <td class="px-2 py-1 text-xs whitespace-nowrap">${order.codigoContrato || ''}</td>
                    <td class="px-2 py-1 text-xs whitespace-nowrap">${order.estilo || ''}</td>
                    <td class="px-2 py-1 text-xs whitespace-nowrap">${order.teamName || ''}</td>
                    <td class="px-2 py-1 text-xs text-center whitespace-nowrap">${order.cantidad || 0}</td>
                    <td class="px-2 py-1 text-xs text-center whitespace-nowrap">${order.childPieces || 0}</td>
                    <td class="px-2 py-1 text-xs whitespace-nowrap">${order.departamento || ''}</td>
                    <td class="px-2 py-1 text-xs whitespace-nowrap">${fechaDespachoStr}</td>
                    <td class="px-2 py-1 text-xs whitespace-nowrap">${receivedDateStr}</td>
                    <td class="px-2 py-1 text-xs whitespace-nowrap">${completedDateStr}</td>
                    <td class="px-2 py-1 text-xs whitespace-nowrap">${order.customStatus || ''}</td>
                    <td class="px-2 py-1 text-xs whitespace-nowrap">${order.designer || 'Sin asignar'}</td>
                    <td class="px-2 py-1 text-xs">${order.notes || ''}</td>
                    <td class="px-2 py-1 text-xs text-center">
                        <button class="btn-xs" onclick="openOrderDetails('${order.orderId}')">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                    </td>
                </tr>`;
        }).join('');
    }

    if (paginationInfo) {
        paginationInfo.textContent = `Página ${currentPage} de ${totalPages} (${total} órdenes)`;
    }
}

// ======================================================
// ========== FILTROS, BÚSQUEDA Y ORDENACIÓN ===========
// ======================================================

function initFiltersUI() {
    safeAddEventListener('searchInput', 'input', (e) => {
        currentSearchTerm = e.target.value.trim();
        currentPage = 1;
        updateTable();
    });

    safeAddEventListener('statusFilter', 'change', (e) => {
        currentStatusFilter = e.target.value;
        currentPage = 1;
        updateTable();
    });

    safeAddEventListener('designerFilter', 'change', (e) => {
        currentDesignerFilter = e.target.value;
        currentPage = 1;
        updateTable();
    });

    safeAddEventListener('departmentFilter', 'change', (e) => {
        currentDepartmentFilter = e.target.value;
        currentPage = 1;
        updateTable();
    });

    safeAddEventListener('prevPageBtn', 'click', () => {
        if (currentPage > 1) {
            currentPage--;
            updateTable();
        }
    });

    safeAddEventListener('nextPageBtn', 'click', () => {
        const total = filteredOrders.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (currentPage < totalPages) {
            currentPage++;
            updateTable();
        }
    });
}

function clearAllFilters() {
    currentSearchTerm = '';
    currentStatusFilter = 'Todos';
    currentDesignerFilter = 'Todos';
    currentDepartmentFilter = 'P_Art';
    const s = document.getElementById('searchInput'); if (s) s.value = '';
    const st = document.getElementById('statusFilter'); if (st) st.value = 'Todos';
    const d = document.getElementById('designerFilter'); if (d) d.value = 'Todos';
    const dep = document.getElementById('departmentFilter'); if (dep) dep.value = 'P_Art';
    currentPage = 1;
    updateTable();
}

function populateFilterDropdowns() {
    const designersSet = new Set();
    allOrders.forEach(o => {
        if (o.designer) designersSet.add(o.designer);
    });
    const designerFilter = document.getElementById('designerFilter');
    if (designerFilter) {
        const current = designerFilter.value;
        designerFilter.innerHTML = '<option value="Todos">Todos</option><option value="Sin asignar">Sin asignar</option>' +
            Array.from(designersSet).sort().map(name => `<option value="${name}">${name}</option>`).join('');
        if (Array.from(designersSet).includes(current) || current === 'Todos' || current === 'Sin asignar') {
            designerFilter.value = current;
        }
    }
}

// ======================================================
// ============== NOTIFICACIONES DROPDOWN ===============
// ======================================================

function initNotificationsDropdown() {
    const btn = document.getElementById('notificationsButton');
    const panel = document.getElementById('notificationsPanel');
    if (!btn || !panel) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
        if (!panel.classList.contains('hidden')) {
            panel.classList.add('hidden');
        }
    });

    panel.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

// ======================================================
// ============== GENERACIÓN DE REPORTES ================
// ======================================================

function generateSummary() {
    const summarySpan = document.getElementById('summaryText');
    if (!summarySpan || !isExcelLoaded) return;
    const total = allOrders.length;
    const artOrders = allOrders.filter(o => o.departamento === 'P_Art');
    summarySpan.textContent = `${total} órdenes cargadas (${artOrders.length} en P_Art).`;
}

function generateReports() {
    // Placeholder para otros reportes si se requiere
}

// ================== REPORTE SEMANAL ===================

function getWeekDateRange(year, week) {
    const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
    const dow = simple.getUTCDay();
    const ISOweekStart = simple;
    if (dow <= 4)
        ISOweekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
    else
        ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
    const startDate = ISOweekStart;
    const endDate = new Date(ISOweekStart);
    endDate.setUTCDate(endDate.getUTCDate() + 6); 
    return { startDate, endDate };
}

function generateWeeklyReport() {
    const spinner = document.getElementById('weeklyReportSpinner');
    const contentDiv = document.getElementById('weeklyReportContent');
    spinner.style.display = 'block'; 
    contentDiv.innerHTML = ''; 

    setTimeout(() => {
        try {
            const weekValue = document.getElementById('weekSelector').value;
            if (!weekValue) { 
                contentDiv.innerHTML = '<p class="text-center py-4 text-gray-500">Selecciona una semana.</p>'; 
                spinner.style.display = 'none'; 
                return; 
            }
            
            const [year, week] = weekValue.split('-W').map(Number);
            const { startDate, endDate } = getWeekDateRange(year, week);
            endDate.setUTCHours(23, 59, 59, 999);

            const filtered = allOrders.filter(order => {
                if (!order.receivedDate) return false;
                const receivedDate = new Date(order.receivedDate + 'T00:00:00Z');
                return receivedDate >= startDate && receivedDate <= endDate;
            });

            if (filtered.length === 0) {
                contentDiv.innerHTML = '<p class="text-center py-4 text-gray-500">No hay órdenes para esta semana.</p>';
                spinner.style.display = 'none';
                return;
            }

            const byDesigner = {};
            filtered.forEach(o => {
                const d = o.designer || 'Sin asignar';
                if (!byDesigner[d]) byDesigner[d] = { count: 0, pieces: 0 };
                byDesigner[d].count++;
                byDesigner[d].pieces += (o.cantidad || 0) + (o.childPieces || 0);
            });

            let html = `
                <h3 class="text-sm font-semibold mb-2">Resumen semanal (${filtered.length} órdenes)</h3>
                <table class="min-w-full text-xs border">
                    <thead>
                        <tr class="bg-gray-100">
                            <th class="px-2 py-1 border">Diseñador</th>
                            <th class="px-2 py-1 border">Órdenes</th>
                            <th class="px-2 py-1 border">Piezas</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            Object.entries(byDesigner).forEach(([name, info]) => {
                html += `
                    <tr>
                        <td class="px-2 py-1 border">${name}</td>
                        <td class="px-2 py-1 border text-center">${info.count}</td>
                        <td class="px-2 py-1 border text-center">${info.pieces}</td>
                    </tr>`;
            });
            html += '</tbody></table>';
            contentDiv.innerHTML = html;

        } catch (e) {
            console.error(e);
            contentDiv.innerHTML = '<p class="text-center py-4 text-red-500">Error al generar el reporte.</p>';
        } finally {
            spinner.style.display = 'none';
        }
    }, 300);
}

// ======================================================
// ================== OTRAS FUNCIONES ===================
// ======================================================

function openOrderDetails(orderId) {
    const order = allOrders.find(o => o.orderId === orderId);
    if (!order) {
        showCustomAlert('No se encontró la orden seleccionada.', 'error');
        return;
    }
    const modal = document.getElementById('orderDetailModal');
    const body = document.getElementById('orderDetailBody');
    if (!modal || !body) return;

    body.innerHTML = `
        <div class="space-y-2 text-sm">
            <p><span class="font-semibold">Cliente:</span> ${order.cliente || ''}</p>
            <p><span class="font-semibold">Contrato:</span> ${order.codigoContrato || ''}</p>
            <p><span class="font-semibold">Team:</span> ${order.teamName || ''}</p>
            <p><span class="font-semibold">Estilo:</span> ${order.estilo || ''}</p>
            <p><span class="font-semibold">Departamento:</span> ${order.departamento || ''}</p>
            <p><span class="font-semibold">Cantidad:</span> ${order.cantidad || 0}</p>
            <p><span class="font-semibold">Piezas hijas:</span> ${order.childPieces || 0}</p>
            <p><span class="font-semibold">Fecha despacho:</span> ${order.fechaDespacho ? order.fechaDespacho.toLocaleDateString() : ''}</p>
            <p><span class="font-semibold">Estado:</span> ${order.customStatus || ''}</p>
            <p><span class="font-semibold">Diseñador:</span> ${order.designer || 'Sin asignar'}</p>
            <p><span class="font-semibold">Notas:</span> ${order.notes || ''}</p>
        </div>
    `;
    modal.classList.add('active');
    document.body.classList.add('modal-open');
}

function closeOrderDetails() {
    const modal = document.getElementById('orderDetailModal');
    if (!modal) return;
    modal.classList.remove('active');
    checkAndCloseModalStack();
}
