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
                'chart-sin-estado': '#6B7280',
            }
        },
    },
}

// ======================================================
// ===== VARIABLES GLOBALES =====
// ======================================================

// --- Variables de Estado de la App ---
let allOrders = []; // Almacenará la fusión de Excel + Firebase
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
let isExcelLoaded = false; // Controla si el Excel ya se cargó

// --- Variables de Paginación ---
let currentPage = 1;
let rowsPerPage = 50;
let paginatedOrders = [];

// --- Variables de Firebase ---
let usuarioActual = null; 
const db_firestore = firebase.firestore(); 

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
let currentCompareDesigner1 = ''; // Variable faltante corregida

// ======================================================
// ===== FUNCIONES AUXILIARES DE SEGURIDAD (FIXED) =====
// ======================================================

/**
 * (NUEVO) Agrega un event listener solo si el elemento existe.
 * Evita que la app se rompa si falta un botón en el HTML.
 */
function safeAddEventListener(id, event, handler) {
    const element = document.getElementById(id);
    if (element) {
        element.addEventListener(event, handler);
    } else {
        // Solo advertencia en consola, no rompe el flujo
        // console.warn(`Elemento '${id}' no encontrado para evento '${event}'.`); 
    }
}

// ======================================================
// ===== FUNCIONES DE INICIALIZACIÓN =====
// ======================================================

document.addEventListener('DOMContentLoaded', (event) => {
    console.log('DOM cargado. Inicializando App v5.1...');
    
    // --- Listeners de Autenticación (Usando Safe Listeners) ---
    safeAddEventListener('loginButton', 'click', iniciarLoginConGoogle);
    safeAddEventListener('logoutButton', 'click', iniciarLogout);

    // --- Listener de Autenticación Principal ---
    firebase.auth().onAuthStateChanged((user) => {
        const loginSection = document.getElementById('loginSection');
        const uploadSection = document.getElementById('uploadSection');
        const dashboard = document.getElementById('dashboard');

        if (user) {
            // Usuario ha iniciado sesión
            usuarioActual = user;
            console.log("Usuario conectado:", usuarioActual.displayName);
            document.getElementById('userName').textContent = usuarioActual.displayName;
            
            loginSection.style.display = 'none';
            if (!isExcelLoaded) {
                uploadSection.style.display = 'block'; 
            } else {
                dashboard.style.display = 'block'; 
            }
            
            // Conectar a los datos de Firebase en tiempo real
            conectarDatosDeFirebase();

        } else {
            // Usuario ha cerrado sesión
            usuarioActual = null;
            isExcelLoaded = false;
            allOrders = []; 
            console.log("Usuario desconectado.");

            loginSection.style.display = 'block';
            uploadSection.style.display = 'none';
            dashboard.style.display = 'none';
        }
    });

    // --- Listeners de UI (Filtros) ---
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
        safeAddEventListener(id, 'change', (e) => {
            // Mapeo dinámico de variables globales según el ID
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
        });
    });

    // --- Listeners de Drag & Drop (Excel) ---
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

    // --- Listeners de Delegación (Listas dinámicas) ---
    const designerManagerList = document.getElementById('designerManagerList');
    if(designerManagerList) {
        designerManagerList.addEventListener('click', function(e) {
            const deleteButton = e.target.closest('.btn-delete-designer');
            if (deleteButton) {
                const name = deleteButton.dataset.name;
                const docId = deleteButton.dataset.id; 
                if (name && docId) {
                    deleteDesigner(docId, name);
                }
            }
        });
    }

    const metricsSidebarList = document.getElementById('metricsSidebarList');
    if(metricsSidebarList) {
        metricsSidebarList.addEventListener('click', function(e) {
            const metricsButton = e.target.closest('.filter-btn'); 
            if (metricsButton) {
                const name = metricsButton.dataset.designer;
                if (name) {
                    generateDesignerMetrics(name);
                }
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
                if (childId && childCode) {
                    deleteChildOrder(childId, childCode);
                }
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
                if (planEntryId) {
                    removeOrderFromPlan(planEntryId, orderCode);
                }
             }
        });
    }

    // --- Listeners de Atajos de Teclado ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeMultiModal();
            closeWeeklyReportModal();
            hideWorkPlanView();
            closeDesignerManager();
            hideMetricsView(); 
            hideDepartmentMetrics();
            closeConfirmModal(); 
            closeCompareModals(); 
            closeAddChildModal();
        }
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            const assignModal = document.getElementById('assignModal');
            if (assignModal && assignModal.classList.contains('active')) {
                saveAssignment();
            }
        }
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            const dashboard = document.getElementById('dashboard');
            const searchInput = document.getElementById('searchInput');
            if (dashboard && dashboard.style.display === 'block' && searchInput) {
                searchInput.focus();
            }
        }
        
        const targetNode = e.target.nodeName.toLowerCase();
        if (targetNode !== 'input' && targetNode !== 'textarea' && targetNode !== 'select') {
            const dashboard = document.getElementById('dashboard');
            if (dashboard && dashboard.style.display === 'block') {
                if (e.key === 'ArrowLeft') { e.preventDefault(); changePage(currentPage - 1); }
                if (e.key === 'ArrowRight') { e.preventDefault(); changePage(currentPage + 1); }
            }
        }
    });

    console.log("App lista. Esperando inicio de sesión.");
});

// ======================================================
// ===== FUNCIONES DE FIREBASE (NÚCLEO) =====
// ======================================================

function iniciarLoginConGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider).catch((error) => {
        console.error("Error de autenticación:", error);
        showCustomAlert(`Error de autenticación: ${error.message}`, 'error');
    });
}

function iniciarLogout() {
    firebase.auth().signOut();
}

function conectarDatosDeFirebase() {
    if (!usuarioActual) return;
    
    const dbStatus = document.getElementById('dbStatus');
    if(dbStatus) {
        dbStatus.textContent = '● Conectando a Firebase...';
        dbStatus.className = "ml-3 font-medium text-yellow-600";
    }
    
    // --- 1. Sincronizar Asignaciones ---
    db_firestore.collection('assignments').onSnapshot((snapshot) => {
        firebaseAssignmentsMap.clear();
        snapshot.forEach((doc) => {
            firebaseAssignmentsMap.set(doc.id, doc.data());
        });
        console.log(`Sincronizadas ${firebaseAssignmentsMap.size} asignaciones.`);
        if(isExcelLoaded) mergeYActualizar(); 
        
        if(dbStatus) {
            dbStatus.textContent = '● Conectado (Tiempo Real)';
            dbStatus.className = "ml-3 font-medium text-green-600";
        }

    }, (error) => {
        console.error("Error de Firestore (assignments):", error);
        if(dbStatus) {
            dbStatus.textContent = '● Error de Conexión';
            dbStatus.className = "ml-3 font-medium text-red-600";
        }
    });

    // --- 2. Sincronizar Historial ---
    db_firestore.collection('history').onSnapshot((snapshot) => {
        firebaseHistoryMap.clear();
        snapshot.forEach((doc) => {
            const data = doc.data();
            const orderId = data.orderId;
            if (!firebaseHistoryMap.has(orderId)) {
                firebaseHistoryMap.set(orderId, []);
            }
            firebaseHistoryMap.get(orderId).push(data);
        });
    }, (error) => console.error("Error de Firestore (history):", error));

    // --- 3. Sincronizar Órdenes Hijas ---
    db_firestore.collection('childOrders').onSnapshot((snapshot) => {
        firebaseChildOrdersMap.clear();
        snapshot.forEach((doc) => {
            const data = doc.data();
            const parentId = data.parentOrderId;
            if (!firebaseChildOrdersMap.has(parentId)) {
                firebaseChildOrdersMap.set(parentId, []);
            }
            firebaseChildOrdersMap.get(parentId).push(data);
        });
        needsRecalculation = true;
        if(isExcelLoaded) mergeYActualizar();
    }, (error) => console.error("Error de Firestore (childOrders):", error));
    
    // --- 4. Sincronizar Diseñadores ---
    db_firestore.collection('designers').orderBy('name').onSnapshot((snapshot) => {
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

    }, (error) => console.error("Error de Firestore (designers):", error));

    // --- 5. Sincronizar Plan Semanal ---
    db_firestore.collection('weeklyPlan').onSnapshot((snapshot) => {
        firebaseWeeklyPlanMap.clear();
        snapshot.forEach((doc) => {
            const data = doc.data();
            const weekId = data.weekIdentifier;
            if (!firebaseWeeklyPlanMap.has(weekId)) {
                firebaseWeeklyPlanMap.set(weekId, []);
            }
            firebaseWeeklyPlanMap.get(weekId).push(data);
        });
        
        const workPlanView = document.getElementById('workPlanView');
        if (workPlanView && workPlanView.style.display === 'block') {
            generateWorkPlan();
        }
    }, (error) => console.error("Error de Firestore (weeklyPlan):", error));
}

function mergeYActualizar() {
    if (!isExcelLoaded) return;
    
    console.log("Fusionando Excel con datos de Firebase...");
    
    recalculateChildPieces(); 

    for (let i = 0; i < allOrders.length; i++) {
        const order = allOrders[i];
        const orderId = order.orderId;
        
        const fbData = firebaseAssignmentsMap.get(orderId);
        
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

        // Auto-completado
        if (fbData && 
            (fbData.customStatus === 'Bandeja' || fbData.customStatus === 'Producción' || fbData.customStatus === 'Auditoría') &&
            order.departamento !== 'P_Art' && 
            order.departamento !== 'Sin Departamento') 
        {
            order.customStatus = 'Completada';
            const newCompletedDate = new Date().toISOString();
            order.completedDate = newCompletedDate;
            
            const changes = [`Estado automático: ${fbData.customStatus} → Completada (movido a ${order.departamento})`];
            saveAssignmentToDB_Firestore(orderId, 
                { customStatus: 'Completada', completedDate: newCompletedDate }, 
                changes
            );
        }
    }
    
    updateDashboard();
}

// ======================================================
// ===== FUNCIONES CRUD DE FIREBASE =====
// ======================================================

async function saveAssignmentToDB_Firestore(orderId, dataToSave, historyChanges = []) {
    if (!usuarioActual) throw new Error("No estás autenticado.");
    
    const assignmentRef = db_firestore.collection('assignments').doc(orderId);
    const batch = db_firestore.batch();

    dataToSave.lastModified = new Date().toISOString();
    if (dataToSave.designer === undefined) dataToSave.designer = '';
    
    batch.set(assignmentRef, dataToSave, { merge: true });

    if (historyChanges.length > 0) {
        const user = usuarioActual.displayName || usuarioActual.email;
        for (const change of historyChanges) {
            const historyRef = db_firestore.collection('history').doc();
            batch.set(historyRef, {
                orderId: orderId,
                change: change,
                user: user,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    return await batch.commit();
}

async function saveChildOrderToDB(childOrder) {
    const childRef = db_firestore.collection('childOrders').doc(childOrder.childOrderId);
    return await childRef.set(childOrder);
}

async function deleteChildOrderFromDB(childOrderId) {
    const childRef = db_firestore.collection('childOrders').doc(childOrderId);
    return await childRef.delete();
}

async function addDesigner() {
    const input = document.getElementById('newDesignerName');
    const name = input.value.trim();
    if (!name) return;

    if (designerList.map(d => d.toLowerCase()).includes(name.toLowerCase())) {
        showCustomAlert(`El diseñador "${name}" ya existe.`, 'error');
        return;
    }

    try {
        await db_firestore.collection('designers').add({ name: name });
        input.value = '';
        showCustomAlert(`Diseñador "${name}" agregado.`, 'success');
    } catch (error) {
        console.error('Error en addDesigner:', error);
        showCustomAlert(`Error al agregar: ${error.message}`, 'error');
    }
}

async function deleteDesigner(docId, name) {
    const assignedOrders = allOrders.filter(o => o.designer === name && o.departamento === 'P_Art');
    
    let message = `¿Estás seguro de eliminar a "${name}" de la lista?`;
    if (assignedOrders.length > 0) {
        message = `¿Estás seguro de eliminar a "${name}"? \n\n⚠️ ADVERTENCIA: Este diseñador tiene ${assignedOrders.length} orden(es) activa(s) en P_Art. Si continúas, estas órdenes quedarán "Sin asignar".`;
    }

    showConfirmModal(message, async () => {
        try {
            await db_firestore.collection('designers').doc(docId).delete();
            
            const batch = db_firestore.batch();
            firebaseAssignmentsMap.forEach((data, orderId) => {
                if (data.designer === name) {
                    const docRef = db_firestore.collection('assignments').doc(orderId);
                    batch.update(docRef, { designer: '' });
                }
            });
            await batch.commit();
            
            showCustomAlert(`Diseñador "${name}" eliminado.`, 'success');
        } catch (error) {
            console.error('Error en deleteDesigner:', error);
            showCustomAlert(`Error: ${error.message}`, 'error');
        }
    });
}

async function addOrderToWorkPlanDB(order, weekIdentifier) {
    const planEntryId = `${order.orderId}_${weekIdentifier}`;
    const planRef = db_firestore.collection('weeklyPlan').doc(planEntryId);

    const doc = await planRef.get();
    if (doc.exists) {
        console.log(`Orden ${order.codigoContrato} ya está en el plan ${weekIdentifier}`);
        return false; 
    }

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
        fechaDespacho: order.fechaDespacho,
        cantidad: order.cantidad,
        childPieces: order.childPieces,
        isLate: order.isLate,
        isAboutToExpire: order.isAboutToExpire
    };
    
    await planRef.set(planEntry);
    return true; 
}

async function getWorkPlanForWeek(weekIdentifier) {
    return firebaseWeeklyPlanMap.get(weekIdentifier) || [];
}

async function removeOrderFromWorkPlanDB(planEntryId) {
    const planRef = db_firestore.collection('weeklyPlan').doc(planEntryId);
    return await planRef.delete();
}

// ======================================================
// ===== FUNCIONES BÁSICAS (Auxiliares) =====
// ======================================================

function preventDefaults(e){ e.preventDefault(); e.stopPropagation(); }

function escapeHTML(str) {
    if (str === null || typeof str === 'undefined') return '';
    return String(str)
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;')
         .replace(/'/g, '&#39;');
}

function showCustomAlert(message, type = 'info') {
    const alertDiv = document.getElementById('customAlert');
    if(!alertDiv) return;

    let alertClass = 'bg-blue-100 border-blue-500 text-blue-800'; 
    if (type === 'error') alertClass = 'bg-red-100 border-red-500 text-red-800';
    if (type === 'success') alertClass = 'bg-green-100 border-green-500 text-green-800';
    
    alertDiv.className = `p-4 mb-4 rounded-lg border-l-4 ${alertClass}`;
    alertDiv.innerHTML = `<strong class="font-semibold">${escapeHTML(message)}</strong>`;
    alertDiv.style.display = 'block';
    
    const duration = (type === 'error') ? 10000 : 5000;
    
    setTimeout(() => {
        alertDiv.style.display = 'none';
    }, duration);
}

let confirmCallback = null;
function showConfirmModal(message, onConfirmCallback) {
    document.getElementById('confirmModalMessage').textContent = message;
    confirmCallback = onConfirmCallback;
    document.getElementById('confirmModal').classList.add('active');
    document.body.classList.add('modal-open');
    
    const confirmBtn = document.getElementById('confirmModalConfirm');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    newConfirmBtn.addEventListener('click', () => {
        if (confirmCallback) {
            confirmCallback();
        }
        closeConfirmModal();
    }, { once: true });
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
    document.body.classList.remove('modal-open');
    confirmCallback = null;
}

function showLoading(message = 'Cargando...') {
    if (document.getElementById('loadingOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.className = 'loading-overlay'; 
    overlay.innerHTML = `
        <div class="spinner"></div>
        <p>${escapeHTML(message)}</p> 
    `;
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.remove();
    }
}

// ======================================================
// ===== LÓGICA DE MANEJO DE EXCEL =====
// ======================================================

function handleDrop(e){
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}
function handleFileSelect(e){
    const files = e.target.files;
    handleFiles(files);
}
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
        const sheetName = workbook.SheetNames.find(n => /working\s*pro[c]{1,2}ess\s*all/i.test(n));

        if (!sheetName) {
            showCustomAlert('No se encontró la pestaña "Working Process All".', 'error');
            document.getElementById('fileInput').value = ''; 
            document.getElementById('fileName').textContent = '';
            hideLoading();
            return;
        }
        
        const worksheet = workbook.Sheets[sheetName];
        const arr = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

        let headerIndex = -1;
        for (let i = 0; i < Math.min(arr.length, 12); i++) {
            const row = arr[i].map(c => String(c).toLowerCase());
            if (row.some(c => c.includes('fecha')) && row.some(c => c.includes('cliente'))) {
                headerIndex = i;
                break;
            }
        }
        if (headerIndex === -1) {
             showCustomAlert('No se pudo detectar la fila de encabezados.', 'error');
            hideLoading();
            return;
        }
        
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
            { pattern: /p[_\s]*order[_\s]*entry/i, name: 'P_Order_Entry' },
            { pattern: /p[_\s]*art/i, name: 'P_Art' },
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
            if (matched) {
                departmentIndices.push({ index: index, name: matched.name });
            }
        });
        
        let processedOrders = []; 
        let currentDate = null;
        let currentClient = "";
        let currentContrato = "";
        let currentStyle = "";
        let currentTeam = "";
        
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
                }
                if (deliveryDate && !isNaN(deliveryDate)) {
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
                    if (!isNaN(n) && n > 0) {
                        orderCantidad = n;
                        orderDepartamento = col.name;
                        break; 
                    }
                }
            }
            
            if (orderCantidad <= 0) {
                orderCantidad = 0;
                orderDepartamento = "Sin Departamento";
            }

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
            
            // Fusión con datos de Firebase
            const fbData = firebaseAssignmentsMap.get(orderId);
            let currentStatus = fbData ? fbData.customStatus : '';
            let currentCompletedDate = fbData ? fbData.completedDate : null;

            if (fbData && 
                (fbData.customStatus === 'Bandeja' || fbData.customStatus === 'Producción' || fbData.customStatus === 'Auditoría') &&
                orderDepartamento !== 'P_Art' && 
                orderDepartamento !== 'Sin Departamento') 
            {
                currentStatus = 'Completada';
                currentCompletedDate = new Date().toISOString();
                
                const changes = [`Estado automático: ${fbData.customStatus} → Completada (movido a ${orderDepartamento})`];
                saveAssignmentToDB_Firestore(orderId, 
                    { customStatus: 'Completada', completedDate: currentCompletedDate }, 
                    changes
                );
            }

            const order = {
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
                customStatus: currentStatus,
                receivedDate: fbData ? fbData.receivedDate : '', 
                notes: fbData ? fbData.notes : '',
                completedDate: currentCompletedDate
            };

            processedOrders.push(order);
        }

        allOrders = processedOrders;
        isExcelLoaded = true; 
        console.log(`✅ Órdenes procesadas del Excel: ${allOrders.length}`);

        needsRecalculation = true; 
        recalculateChildPieces(); 
        
        await updateDashboard();
        generateSummary();

        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';

    } catch (error) {
        showCustomAlert('Error al procesar el archivo: ' + (error.message || error), 'error');
        console.error(error);
    } finally {
        hideLoading();
    }
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
    console.log('Caché de piezas hijas reconstruido desde Firebase.');
}

async function saveChildOrder() {
    try {
        if (!currentEditingOrderId) return;
        
        const childNumber = document.getElementById('childOrderNumber').value;
        const childPieces = parseInt(document.getElementById('childPieces').value);
        const childDeliveryDate = document.getElementById('childDeliveryDate').value;
        const childNotes = document.getElementById('childNotes').value;
        
        if (!childNumber || childNumber < 1) {
            showCustomAlert('Por favor ingresa un número para la orden hija', 'error');
            return;
        }
        if (!childPieces || childPieces < 1) {
            showCustomAlert('Por favor ingresa la cantidad de piezas', 'error');
            return;
        }
        
        const parentOrder = allOrders.find(o => o.orderId === currentEditingOrderId);
        if (!parentOrder) return;
        
        const childCode = `${parentOrder.codigoContrato}-${childNumber}`;
        
        const existingChildren = firebaseChildOrdersMap.get(parentOrder.orderId) || [];
        if (existingChildren.some(child => child.childCode === childCode)) {
            showCustomAlert(`Ya existe una orden hija con el código ${childCode}`, 'error');
            return;
        }
        
        const deliveryDate = childDeliveryDate 
            ? new Date(childDeliveryDate + 'T00:00:00Z') 
            : (parentOrder.fechaDespacho ? new Date(parentOrder.fechaDespacho) : new Date());

        const childOrder = {
            childOrderId: `${parentOrder.orderId}_child_${Date.now()}`,
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
        await saveAssignmentToDB_Firestore(parentOrder.orderId, {}, [`Orden hija creada: ${childCode} (${childPieces} piezas)`]);

        closeAddChildModal();
        showCustomAlert(`Orden hija ${childCode} creada exitosamente`, 'success');
        
    } catch (error) {
        console.error('Error en saveChildOrder:', error);
        showCustomAlert(`Error al guardar orden hija: ${error.message}`, 'error');
    }
}

async function deleteChildOrder(childOrderId, childCode) {
    showConfirmModal(`¿Estás seguro de eliminar la orden hija ${childCode}?`, async () => {
        try {
            await deleteChildOrderFromDB(childOrderId);
            await saveAssignmentToDB_Firestore(currentEditingOrderId, {}, [`Orden hija eliminada: ${childCode}`]);
        } catch (e) {
            console.error('Error en deleteChildOrder:', e);
            showCustomAlert(e.message, 'error');
        }
    });
}

async function loadChildOrders() {
    try {
        if (!currentEditingOrderId) return;
        
        const parentOrder = allOrders.find(o => o.orderId === currentEditingOrderId);
        const childOrders = firebaseChildOrdersMap.get(currentEditingOrderId) || [];
        
        const childOrdersList = document.getElementById('childOrdersList');
        const childOrderCount = document.getElementById('childOrderCount');
        
        childOrderCount.textContent = childOrders.length;
        
        if (childOrders.length === 0) {
            childOrdersList.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No hay órdenes hijas</p>';
            return;
        }
        
        childOrdersList.innerHTML = childOrders.map(child => {
            const deliveryDate = child.fechaDespacho ? new Date(child.fechaDespacho) : null;
            const today = new Date(); today.setHours(0,0,0,0);
            const isLate = deliveryDate && deliveryDate < today;
            
            const statusBadge = isLate 
                ? '<span class="bg-red-100 text-red-800 px-2 py-0.5 rounded-full text-xs font-medium ml-2">Atrasada</span>' 
                : '<span class="bg-green-100 text-green-800 px-2 py-0.5 rounded-full text-xs font-medium ml-2">A Tiempo</span>';
            
            const safeChildCode = escapeHTML(child.childCode);
            const safeChildOrderId = escapeHTML(child.childOrderId);
            const safeNotes = child.notes ? `<div class="mt-1"><strong class="text-gray-600">Notas:</strong> ${escapeHTML(child.notes)}</div>` : '';

            return `
                <div class="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <strong class="text-blue-600 font-semibold">${safeChildCode}</strong>
                            ${statusBadge}
                        </div>
                        <button class="btn-delete-child font-medium py-1 px-2 rounded-lg text-xs transition-colors bg-red-100 text-red-700 hover:bg-red-200" 
                                data-child-id="${safeChildOrderId}" 
                                data-child-code="${safeChildCode}"
                                ${parentOrder.departamento !== 'P_Art' ? 'disabled' : ''} 
                                aria-label="Eliminar orden hija ${safeChildCode}">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                              <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.518.149.022a.75.75 0 1 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75a1.25 1.25 0 0 0-1.25-1.25h-2.5A1.25 1.25 0 0 0 7.5 3.75v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd" />
                            </svg>
                        </button>
                    </div>
                    <div class="text-xs text-gray-500 space-y-1">
                        <div><strong class="text-gray-600">Piezas:</strong> ${child.cantidad.toLocaleString()}</div>
                        <div><strong class="text-gray-600">Fecha:</strong> ${deliveryDate ? formatDate(deliveryDate) : '-'}</div>
                        ${safeNotes}
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error en loadChildOrders:', error);
        showCustomAlert(`Error al cargar órdenes hijas: ${error.message}`, 'error');
    }
}

function openAddChildModal() {
    if (!currentEditingOrderId) return;
    const parentOrder = allOrders.find(o => o.orderId === currentEditingOrderId);
    if (!parentOrder) return;
    
    document.getElementById('parentOrderInfo').textContent = 
        `${parentOrder.codigoContrato} - ${parentOrder.cliente} - ${parentOrder.estilo}`;
    document.getElementById('childOrderNumber').value = '';
    document.getElementById('childOrderCode').value = '';
    document.getElementById('childPieces').value = '';
    document.getElementById('childDeliveryDate').value = '';
    document.getElementById('childNotes').value = '';
    
    document.getElementById('addChildModal').classList.add('active');
    document.body.classList.add('modal-open');
}
function closeAddChildModal() {
    document.getElementById('addChildModal').classList.remove('active');
    // Si no hay otros modales abiertos, quitar la clase del body
    if(!document.getElementById('assignModal').classList.contains('active')) {
        document.body.classList.remove('modal-open');
    }
}
function updateChildOrderCode() {
    if (!currentEditingOrderId) return;
    const parentOrder = allOrders.find(o => o.orderId === currentEditingOrderId);
    if (!parentOrder) {
        console.error('No se encontró la orden padre');
        return;
    }
    const childNumber = document.getElementById('childOrderNumber').value;
    const childCodeInput = document.getElementById('childOrderCode');
    
    if (childNumber) {
        childCodeInput.value = `${parentOrder.codigoContrato}-${childNumber}`;
    } else {
        childCodeInput.value = '';
    }
}

// ======================================================
// ===== LÓGICA DE MODALES (ASIGNACIÓN) =====
// ======================================================

window.openAssignModal = async function(orderId) {
    try {
        currentEditingOrderId = orderId;
        const order = allOrders.find(o => o.orderId === orderId);
        if (!order) return;
        
        document.getElementById('detailCliente').textContent = order.cliente || '-';
        document.getElementById('detailCodigo').textContent = order.codigoContrato || '-';
        document.getElementById('detailEstilo').textContent = order.estilo || '-';
        document.getElementById('detailDepartamento').textContent = order.departamento || '-';
        document.getElementById('detailFecha').textContent = formatDate(order.fechaDespacho);
        document.getElementById('detailPiezas').textContent = (order.cantidad || 0).toLocaleString();
        
        document.getElementById('modalDesigner').value = order.designer || '';
        document.getElementById('modalStatus').value = order.customStatus || '';
        document.getElementById('modalReceivedDate').value = order.receivedDate || '';
        document.getElementById('modalNotes').value = order.notes || '';
        
        const history = firebaseHistoryMap.get(orderId) || [];
        
        const isPArt = order.departamento === 'P_Art';
        document.getElementById('modalDesigner').disabled = !isPArt;
        document.getElementById('modalStatus').disabled = !isPArt;
        document.getElementById('modalReceivedDate').disabled = !isPArt;
        document.getElementById('addChildOrderBtn').disabled = !isPArt;
        document.getElementById('modalNotes').disabled = false; 

        const historyDiv = document.getElementById('modalHistory');
        if (history && history.length > 0) {
            historyDiv.innerHTML = history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map(item => `
                <div class="history-item p-2 bg-white rounded border border-gray-200">
                    <div class="history-date text-xs text-gray-500 mb-1">
                        ${new Date(item.timestamp).toLocaleString('es-ES')}
                        <strong class="text-gray-700 ml-2">${escapeHTML(item.user || 'Sistema')}</strong>
                    </div>
                    <div class="history-change text-sm text-gray-800">${escapeHTML(item.change)}</div>
                </div>
            `).join('');
        } else {
            historyDiv.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Sin historial</p>';
        }
        
        await loadChildOrders(); 
        
        document.getElementById('assignModal').classList.add('active');
        document.body.classList.add('modal-open');
    } catch (error) {
        console.error('Error en openAssignModal:', error);
        showCustomAlert(`Error al abrir el modal: ${error.message}`, 'error');
    }
}

window.closeModal = function() {
    document.getElementById('assignModal').classList.remove('active');
    document.body.classList.remove('modal-open');
    currentEditingOrderId = null;
}

async function asignarmeAmi() {
    if (!usuarioActual) {
        showCustomAlert("Error: No se pudo identificar al usuario. Vuelve a iniciar sesión.", "error");
        return;
    }
    if (!currentEditingOrderId) return;
    
    const nombreUsuario = usuarioActual.displayName;
    const order = allOrders.find(o => o.orderId === currentEditingOrderId);
    if (!order) return;

    const oldDesigner = order.designer;
    const oldStatus = order.customStatus;

    if (oldDesigner === nombreUsuario) {
        showCustomAlert(`Esta orden ya está asignada a ti.`, "info");
        return;
    }

    const newStatus = (oldStatus === '' || !oldStatus) ? 'Bandeja' : oldStatus;

    const dataToSave = {
        designer: nombreUsuario,
        customStatus: newStatus
    };
    
    const changes = [];
    changes.push(`Diseñador: ${oldDesigner || 'Sin asignar'} → ${nombreUsuario}`);
    if (newStatus !== oldStatus) {
        changes.push(`Estado: ${oldStatus || 'Sin estado'} → ${newStatus}`);
    }

    try {
        await saveAssignmentToDB_Firestore(currentEditingOrderId, dataToSave, changes);
        showCustomAlert(`Orden asignada a ${nombreUsuario}`, "success");
        closeModal();
    } catch (error) {
        console.error("Error en asignarmeAmi:", error);
        showCustomAlert(`Error al asignar: ${error.message}`, "error");
    }
}

window.saveAssignment = async function() {
    if (!currentEditingOrderId) return;
    
    try {
        const order = allOrders.find(o => o.orderId === currentEditingOrderId);
        if (!order) return;

        const oldAssignment = {
            designer: order.designer,
            customStatus: order.customStatus,
            receivedDate: order.receivedDate,
            notes: order.notes,
            completedDate: order.completedDate
        };
        
        const newDesigner = document.getElementById('modalDesigner').value;
        const newStatus = document.getElementById('modalStatus').value;
        const newReceivedDate = document.getElementById('modalReceivedDate').value;
        const newNotes = document.getElementById('modalNotes').value;
        
        const isPArt = order.departamento === 'P_Art';
        const changes = [];
        let dataToSave = {};

        if (isPArt) {
            if (oldAssignment.designer !== newDesigner) {
                changes.push(`Diseñador: ${oldAssignment.designer || 'Sin asignar'} → ${newDesigner || 'Sin asignar'}`);
                dataToSave.designer = newDesigner;
            }
            if (oldAssignment.customStatus !== newStatus) {
                changes.push(`Estado: ${oldAssignment.customStatus || 'Sin estado'} → ${newStatus || 'Sin estado'}`);
                dataToSave.customStatus = newStatus;
                
                if (newStatus === 'Completada' && oldAssignment.customStatus !== 'Completada') {
                    dataToSave.completedDate = new Date().toISOString();
                    changes.push(`Completada el: ${new Date().toLocaleDateString('es-ES')}`);
                } else if (newStatus !== 'Completada' && oldAssignment.customStatus === 'Completada') {
                    dataToSave.completedDate = null; 
                    changes.push(`Revertida de 'Completada'`);
                }
            }
            if (oldAssignment.receivedDate !== newReceivedDate) {
                if (newReceivedDate) {
                    const formattedDate = new Date(newReceivedDate + 'T00:00:00Z').toLocaleDateString('es-ES');
                    const oldDateFormatted = oldAssignment.receivedDate ? new Date(oldAssignment.receivedDate + 'T00:00:00Z').toLocaleDateString('es-ES') : 'Sin fecha';
                    changes.push(`Fecha Recibida: ${oldDateFormatted} → ${formattedDate}`);
                    dataToSave.receivedDate = newReceivedDate;
                }
            }
        }
        
        if (oldAssignment.notes !== newNotes) {
            changes.push(`Nota actualizada: "${newNotes}"`);
            dataToSave.notes = newNotes;
        }
        
        if (changes.length > 0) {
            await saveAssignmentToDB_Firestore(currentEditingOrderId, dataToSave, changes);
            showCustomAlert('Cambios guardados en la nube', 'success');
        } else {
            showCustomAlert('No se detectaron cambios', 'info');
        }
        
        closeModal();
        
    } catch (error) {
        console.error('Error en saveAssignment:', error);
        showCustomAlert(`Error al guardar: ${error.message}`, 'error');
    }
}

// --- Modales de Multi-Asignación ---

function openMultiAssignModal() {
    if (selectedOrders.size === 0) return;
    
    let allInPArt = true;
    const selectedOrdersList = document.getElementById('selectedOrdersList');
    let listHTML = '';
    
    for (const orderId of selectedOrders) {
        const order = allOrders.find(o => o.orderId === orderId);
        if (order) {
            if(order.departamento !== 'P_Art') {
                allInPArt = false;
                break;
            }
            listHTML += `<div class="selected-order-item py-2 border-b border-gray-200 last:border-b-0 text-sm text-gray-800">
                <strong class="font-medium text-gray-900">${escapeHTML(order.codigoContrato)}</strong> - ${escapeHTML(order.cliente)} - ${escapeHTML(order.estilo)}
            </div>`;
        }
    }

    if (!allInPArt) {
        showCustomAlert("Error: Solo puedes asignar en masa órdenes que están en P_Art.", 'error');
        clearSelection();
        return;
    }
    
    document.getElementById('multiModalCount').textContent = selectedOrders.size;
    selectedOrdersList.innerHTML = listHTML;
    document.getElementById('multiModalDesigner').innerHTML = '<option value="">Sin asignar</option>' + designerList.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('');
    document.getElementById('multiModalDesigner').value = '';
    document.getElementById('multiModalStatus').value = '';
    document.getElementById('multiModalReceivedDate').value = '';
    document.getElementById('multiModalNotes').value = '';
    
    document.getElementById('multiAssignModal').classList.add('active');
    document.body.classList.add('modal-open');
}

function closeMultiModal() {
    document.getElementById('multiAssignModal').classList.remove('active');
    document.body.classList.remove('modal-open');
}

async function saveMultiAssignment() {
    if (selectedOrders.size === 0) return;
    
    try {
        const newDesigner = document.getElementById('multiModalDesigner').value;
        const newStatus = document.getElementById('multiModalStatus').value;
        const newReceivedDate = document.getElementById('multiModalReceivedDate').value;
        const newNotes = document.getElementById('multiModalNotes').value;
        
        let changesCount = 0;
        
        const batch = db_firestore.batch();
        const user = usuarioActual.displayName || usuarioActual.email;
        
        for (const orderId of selectedOrders) {
            const order = allOrders.find(o => o.orderId === orderId);
            if (!order || order.departamento !== 'P_Art') continue; 
            
            const oldAssignment = firebaseAssignmentsMap.get(orderId) || {};
            const changes = [];
            let dataToSave = {};

            if (newDesigner) {
                if (oldAssignment.designer !== newDesigner) {
                    changes.push(`Diseñador: ${oldAssignment.designer || 'Sin asignar'} → ${newDesigner}`);
                    dataToSave.designer = newDesigner;
                }
            }
            if (newStatus) {
                if (oldAssignment.customStatus !== newStatus) {
                    changes.push(`Estado: ${oldAssignment.customStatus || 'Sin estado'} → ${newStatus}`);
                    dataToSave.customStatus = newStatus;
                    
                    if (newStatus === 'Completada' && oldAssignment.customStatus !== 'Completada') {
                        dataToSave.completedDate = new Date().toISOString();
                        changes.push(`Completada el: ${new Date().toLocaleDateString('es-ES')}`);
                    } else if (newStatus !== 'Completada') {
                        dataToSave.completedDate = null; 
                    }
                }
            }
            if (newReceivedDate) {
                 if (oldAssignment.receivedDate !== newReceivedDate) {
                    const formattedDate = new Date(newReceivedDate + 'T00:00:00Z').toLocaleDateString('es-ES');
                    const oldDateFormatted = oldAssignment.receivedDate ? new Date(oldAssignment.receivedDate + 'T00:00:00Z').toLocaleDateString('es-ES') : 'Sin fecha';
                    changes.push(`Fecha Recibida: ${oldDateFormatted} → ${formattedDate}`);
                    dataToSave.receivedDate = newReceivedDate;
                }
            }
            if (newNotes) {
                if (oldAssignment.notes !== newNotes) {
                    changes.push(`Nota actualizada: "${newNotes}"`);
                    dataToSave.notes = newNotes;
                }
            }
            
            if (changes.length > 0) {
                dataToSave.lastModified = new Date().toISOString();
                const assignmentRef = db_firestore.collection('assignments').doc(orderId);
                batch.set(assignmentRef, dataToSave, { merge: true });
                
                const historyRef = db_firestore.collection('history').doc();
                batch.set(historyRef, {
                    orderId: orderId,
                    change: `Asignación múltiple: ${changes.join(', ')}`,
                    user: user,
                    timestamp: new Date().toISOString()
                });
                
                changesCount++;
            }
        }
        
        await batch.commit();
        
        closeMultiModal();
        clearSelection();
        
        showCustomAlert(`Se han actualizado ${changesCount} de ${selectedOrders.size} órdenes en la nube.`, 'success');
    } catch (error) {
        console.error('Error en saveMultiAssignment:', error);
        showCustomAlert(`Error al guardar: ${error.message}`, 'error');
    }
}

// ======================================================
// ===== LÓGICA DE UI (GENERAL) =====
// ======================================================

function updateAllDesignerDropdowns() {
    const optionsHTML = '<option value="">Todos</option>' + designerList.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('');
    const modalOptionsHTML = '<option value="">Sin asignar</option>' + designerList.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('');

    const designerFilter = document.getElementById('designerFilter');
    if (designerFilter) {
        designerFilter.innerHTML = optionsHTML;
        designerFilter.value = currentDesignerFilter;
    }
    
    const modalDesigner = document.getElementById('modalDesigner');
    if (modalDesigner) modalDesigner.innerHTML = modalOptionsHTML;
    
    const multiModalDesigner = document.getElementById('multiModalDesigner');
    if (multiModalDesigner) multiModalDesigner.innerHTML = modalOptionsHTML;
}

function populateDesignerManagerModal() {
    const listDiv = document.getElementById('designerManagerList');
    if (!listDiv) return;
    
    listDiv.innerHTML = '';
    
    if (firebaseDesignersMap.size === 0) {
        listDiv.innerHTML = '<p class="text-gray-500 text-center">No hay diseñadores en Firebase</p>';
        return;
    }

    firebaseDesignersMap.forEach((data, docId) => {
        const safeName = escapeHTML(data.name);
        listDiv.innerHTML += `
            <div class="designer-item flex justify-between items-center p-3 bg-white border border-gray-200 rounded-lg">
                <span class="designer-item-name font-medium text-gray-800">${safeName}</span>
                <button class="btn-delete-designer font-medium py-1 px-3 rounded-lg text-xs transition-colors shadow-sm bg-red-100 text-red-700 hover:bg-red-200 flex items-center gap-1" 
                        data-name="${safeName}"
                        data-id="${escapeHTML(docId)}">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                      <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.518.149.022a.75.75 0 1 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75a1.25 1.25 0 0 0-1.25-1.25h-2.5A1.25 1.25 0 0 0 7.5 3.75v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd" />
                    </svg>
                    Eliminar
                </button>
            </div>
        `;
    });
}

function openDesignerManager() {
    populateDesignerManagerModal(); 
    document.getElementById('designerManagerModal').classList.add('active');
    document.body.classList.add('modal-open');
}
function closeDesignerManager() {
    document.getElementById('designerManagerModal').classList.remove('active');
    document.body.classList.remove('modal-open');
}

// --- Lógica de Selección Múltiple ---
function toggleOrderSelection(orderId) {
    if (selectedOrders.has(orderId)) {
        selectedOrders.delete(orderId);
    } else {
        selectedOrders.add(orderId);
    }
    updateMultiSelectBar();
    updateCheckboxes();
}
function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAll');
    const ordersOnPage = paginatedOrders
        .filter(o => o.departamento === 'P_Art')
        .map(o => o.orderId);
    
    if (selectAllCheckbox.checked) {
        ordersOnPage.forEach(id => selectedOrders.add(id));
    } else {
        ordersOnPage.forEach(id => selectedOrders.delete(id));
    }
    updateMultiSelectBar();
    updateCheckboxes();
}
function clearSelection() {
    selectedOrders.clear();
    // CORRECCIÓN 3: Eliminar explícitamente la clase activa
    const bar = document.getElementById('multiSelectBar');
    if (bar) bar.classList.remove('active');
    
    updateMultiSelectBar();
    updateCheckboxes();
}
function updateMultiSelectBar() {
    const bar = document.getElementById('multiSelectBar');
    const count = document.getElementById('selectedCount');
    if (selectedOrders.size > 0) {
        bar.classList.add('active'); 
        count.textContent = selectedOrders.size;
    } else {
        bar.classList.remove('active');
    }
}
function updateCheckboxes() {
    const checkboxes = document.querySelectorAll('tbody input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
        const orderId = checkbox.dataset.orderId;
        if (orderId) {
            checkbox.checked = selectedOrders.has(orderId);
        }
    });
    const selectAllCheckbox = document.getElementById('selectAll');
    const pArtOrdersOnPage = paginatedOrders.filter(o => o.departamento === 'P_Art');
    const allOnPageSelected = pArtOrdersOnPage.length > 0 && pArtOrdersOnPage.every(order => selectedOrders.has(order.orderId));
    if(selectAllCheckbox) selectAllCheckbox.checked = allOnPageSelected;
}

// --- Lógica de Plan Semanal ---
async function addSelectedToWorkPlan() {
    if (selectedOrders.size === 0) {
        showCustomAlert('No hay órdenes seleccionadas', 'error');
        return;
    }
    const weekIdentifier = getWeekIdentifier(new Date());
    let addedCount = 0;
    let skippedCount = 0;
    let errorMsg = '';
    for (const orderId of selectedOrders) {
        const order = allOrders.find(o => o.orderId === orderId);
        if (!order || order.departamento !== 'P_Art') {
            errorMsg = 'Solo se pueden agregar órdenes de P_Art al plan.';
            skippedCount++;
            continue;
        }
        if (!order.designer) {
            errorMsg = 'Solo se pueden agregar órdenes ASIGNADAS al plan.';
            skippedCount++;
            continue;
        }
        try {
            const added = await addOrderToWorkPlanDB(order, weekIdentifier);
            if (added) {
                addedCount++;
            } else {
                skippedCount++;
            }
        } catch (e) {
            console.error('Error agregando al plan:', e);
            showCustomAlert(`Error al guardar en DB: ${e.message}`, 'error');
            return; 
        }
    }
    let successMsg = `Se agregaron ${addedCount} órdenes al plan de esta semana (${weekIdentifier}).`;
    if (skippedCount > 0) {
        successMsg += ` Se omitieron ${skippedCount} (probablemente ya estaban en el plan).`;
    }
    if (errorMsg && addedCount === 0) {
        showCustomAlert(errorMsg, 'error');
    } else {
        showCustomAlert(successMsg, 'success');
    }
    clearSelection();
}

// --- Lógica de Paginación ---
function setupPagination(filteredOrders) {
    const totalItems = filteredOrders.length;
    const totalPages = Math.ceil(totalItems / rowsPerPage);
    if (currentPage > totalPages) { currentPage = totalPages; }
    if (currentPage < 1) { currentPage = 1; }
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    paginatedOrders = filteredOrders.slice(start, end);
    document.getElementById('currentPage').textContent = totalPages === 0 ? 0 : currentPage;
    document.getElementById('totalPages').textContent = totalPages || 1;
    renderPaginationControls(totalPages);
}
function renderPaginationControls(totalPages) {
    const controlsDiv = document.getElementById('paginationControls');
    if (!controlsDiv) return;

    controlsDiv.innerHTML = '';
    controlsDiv.innerHTML += `<button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>&laquo; Anterior</button>`;
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    if (endPage - startPage + 1 < maxPagesToShow) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    if (startPage > 1) {
        controlsDiv.innerHTML += `<button onclick="changePage(1)">1</button>`;
        if (startPage > 2) {
            controlsDiv.innerHTML += `<button disabled>...</button>`;
        }
    }
    for (let i = startPage; i <= endPage; i++) {
        controlsDiv.innerHTML += `<button onclick="changePage(${i})" class="${i === currentPage ? 'active' : ''}">${i}</button>`;
    }
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            controlsDiv.innerHTML += `<button disabled>...</button>`;
        }
        controlsDiv.innerHTML += `<button onclick="changePage(${totalPages})">${totalPages}</button>`;
    }
    controlsDiv.innerHTML += `<button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages || totalPages === 0 ? 'disabled' : ''}>Siguiente &raquo;</button>`;
}
window.changePage = function(page) {
    const totalPages = Math.ceil(getFilteredOrders(false).length / rowsPerPage);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    updateTable();
}
window.changeRowsPerPage = function() {
    rowsPerPage = parseInt(document.getElementById('rowsPerPage').value, 10);
    currentPage = 1; 
    updateTable();
}

// --- Lógica de UI y Actualización ---
function populateFilterDropdowns() {
    const clients = [...new Set(allOrders.map(o => o.cliente))].filter(Boolean).sort();
    const styles = [...new Set(allOrders.map(o => o.estilo))].filter(Boolean).sort();
    const teams = [...new Set(allOrders.map(o => o.teamName))].filter(Boolean).sort();
    const departamentos = [...new Set(allOrders.map(o => o.departamento))].filter(Boolean).sort();
    const designers = designerList; 
    const statuses = [...new Set(allOrders.map(o => o.customStatus))].filter(Boolean).sort();
    CUSTOM_STATUS_OPTIONS.forEach(opt => {
        if (!statuses.includes(opt)) statuses.push(opt);
    });
    populateSelect('clientFilter', clients, currentClientFilter);
    populateSelect('styleFilter', styles, currentStyleFilter);
    populateSelect('teamFilter', teams, currentTeamFilter);
    populateSelect('departamentoFilter', departamentos, currentDepartamentoFilter);
    populateSelect('designerFilter', designers, currentDesignerFilter);
    populateSelect('customStatusFilter', statuses, currentCustomStatusFilter);
    updateAllDesignerDropdowns(); 
}
function populateSelect(elementId, options, selectedValue) {
    const select = document.getElementById(elementId);
    if (!select) return;
    
    select.innerHTML = '<option value="">Todos</option>';
    options.forEach(option => {
        const safeOption = escapeHTML(option);
        select.innerHTML += `<option value="${safeOption}">${safeOption}</option>`;
    });
    select.value = selectedValue;
}

async function generateSummary() {
    const artOrders = allOrders.filter(o => o.departamento === 'P_Art');
    const stats = calculateStats(artOrders);
    const summaryBox = document.getElementById('summaryBox');
    let summaryText = `Resumen: Tienes ${stats.total} órdenes activas en P_Art con ${stats.totalPieces.toLocaleString()} piezas totales (incluyendo hijas).`;
    if (stats.veryLate > 0) { summaryText += ` ${stats.veryLate} órdenes están muy atrasadas (más de 7 días).`; }
    if (stats.aboutToExpire > 0) { summaryText += ` ${stats.aboutToExpire} órdenes vencen en 1-2 días.`; }
    if (stats.thisWeek > 0) { summaryText += ` Tienes ${stats.thisWeek} órdenes para esta semana.`; }
    if (stats.late === 0 && stats.aboutToExpire === 0) { summaryText += ` No tienes órdenes atrasadas en P_Art.`; }
    summaryBox.innerHTML = `<h3 class="text-lg font-semibold text-gray-900 mb-2">Estado Actual (P_Art)</h3><p class="text-gray-700 leading-relaxed">${escapeHTML(summaryText)}</p>`;
}

function generateReports() {
    const clientCounts = {};
    allOrders.filter(o => o.cantidad > 0).forEach(o => {
        if (o.cliente) {
            clientCounts[o.cliente] = (clientCounts[o.cliente] || 0) + 1;
        }
    });
    const sortedClients = Object.entries(clientCounts).sort((a,b) => b[1] - a[1]).slice(0, 10);
    const clientReport = document.getElementById('clientReport');
    clientReport.innerHTML = sortedClients.map(([client, count]) => 
        `<div class="report-item flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0 text-sm">
            <span class="text-gray-700">${escapeHTML(client)}</span>
            <strong class="font-medium text-gray-900">${count}</strong>
        </div>`
    ).join('') || '<div class="report-item text-gray-500 text-center py-4">No hay datos</div>';
    generateWorkloadReport();
}

function generateWorkloadReport() {
    const designerStats = {};
    designerList.forEach(designer => {
        designerStats[designer] = { orders: 0, pieces: 0 };
    });
    let totalPiecesInPArt = 0;
    allOrders.forEach(order => {
        if (order.departamento === 'P_Art' && order.designer && designerStats.hasOwnProperty(order.designer)) {
            designerStats[order.designer].orders++;
            const totalOrderPieces = (order.cantidad || 0) + (order.childPieces || 0);
            designerStats[order.designer].pieces += totalOrderPieces;
            if (order.designer !== 'Magdali Fernadez') { 
                totalPiecesInPArt += totalOrderPieces;
            }
        }
    });
    document.getElementById('workloadTotal').textContent = 
        `${totalPiecesInPArt.toLocaleString()} piezas (en P_Art, sin Magdali F.)`;
    const workloadList = document.getElementById('workloadList');
    let html = '';
    designerList.forEach(designer => {
        const stats = designerStats[designer];
        const percentage = totalPiecesInPArt > 0 && designer !== 'Magdali Fernadez'
            ? ((stats.pieces / totalPiecesInPArt) * 100).toFixed(1)
            : 0;
        const displayPercentage = designer === 'Magdali Fernadez' ? '-' : `${percentage}%`;
        html += `
            <div class="workload-item">
                <div class="workload-header flex justify-between items-center mb-1.5">
                    <span class="designer-name font-semibold text-gray-800">${escapeHTML(designer)}</span>
                    <span class="workload-stats text-xs text-gray-500">
                        ${stats.orders} órdenes | ${stats.pieces.toLocaleString()} pzs | ${displayPercentage}
                    </span>
                </div>
                <div class="progress-bar w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div class="progress-fill h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-300" style="width: ${designer === 'Magdali Fernadez' ? 0 : percentage}%"></div>
                </div>
            </div>
        `;
    });
    workloadList.innerHTML = html;
}

function clearAllFilters() {
    currentClientFilter = '';
    currentStyleFilter = '';
    currentTeamFilter = '';
    currentDepartamentoFilter = '';
    currentDesignerFilter = '';
    currentCustomStatusFilter = '';
    currentDateFrom = '';
    currentDateTo = '';
    currentSearch = '';
    currentFilter = 'all';
    currentDateFilter = 'all';
    document.getElementById('clientFilter').value = '';
    document.getElementById('styleFilter').value = '';
    document.getElementById('teamFilter').value = '';
    document.getElementById('departamentoFilter').value = '';
    document.getElementById('designerFilter').value = '';
    document.getElementById('customStatusFilter').value = '';
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
    document.getElementById('searchInput').value = '';
    currentPage = 1; 
    updateDashboard();
}

async function updateDashboard() {
    if (!isExcelLoaded) return; 
    
    if (needsRecalculation) {
        recalculateChildPieces(); 
    }
    
    const artOrders = allOrders.filter(o => o.departamento === 'P_Art');
    const stats = calculateStats(artOrders);
    
    updateStats(stats);
    updateAlerts(stats);
    updateFilters(stats);
    
    generateReports();
    populateFilterDropdowns();
    updateTable(); 
    updateAllDesignerDropdowns(); 
}

function calculateStats(ordersToStat) {
    const total = ordersToStat.length;
    const late = ordersToStat.filter(o => o.isLate).length;
    const veryLate = ordersToStat.filter(o => o.isVeryLate).length;
    const aboutToExpire = ordersToStat.filter(o => o.isAboutToExpire).length;
    const onTime = ordersToStat.filter(o => !o.isLate && !o.isAboutToExpire).length;
    let totalPieces = ordersToStat.reduce((sum, order) => {
        return sum + (order.cantidad || 0) + (order.childPieces || 0);
    }, 0);
    const today = new Date(); today.setHours(0,0,0,0);
    const thisWeekEnd = new Date(today); 
    thisWeekEnd.setDate(today.getDate()+7);
    const thisWeek = ordersToStat.filter(o => o.fechaDespacho && o.fechaDespacho >= today && o.fechaDespacho <= thisWeekEnd).length;
    return { total, late, veryLate, aboutToExpire, onTime, thisWeek, totalPieces };
}

function updateStats(stats) {
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statTotalPieces').textContent = (stats.totalPieces || 0).toLocaleString();
    document.getElementById('statLate').textContent = stats.late;
    document.getElementById('statExpiring').textContent = stats.aboutToExpire;
    document.getElementById('statOnTime').textContent = stats.onTime;
    document.getElementById('statThisWeek').textContent = stats.thisWeek;
}

function updateAlerts(stats) {
    const alertsDiv = document.getElementById('alerts');
    alertsDiv.innerHTML = '';
    const baseClasses = "p-4 mb-4 rounded-lg border-l-4 cursor-pointer transition-colors";
    const hoverDanger = "hover:bg-red-200";
    const hoverWarning = "hover:bg-yellow-200";
    const hoverInfo = "hover:bg-blue-200";
    if (stats.veryLate > 0) {
        alertsDiv.innerHTML += `<div class="alert ${baseClasses} bg-red-100 border-red-500 text-red-800 ${hoverDanger}" onclick="setFilter('veryLate')" title="Haz clic para ver estas órdenes"><strong class="font-semibold">URGENTE (P_Art):</strong> ${stats.veryLate} órdenes con más de 7 días de atraso</div>`;
    }
    if (stats.aboutToExpire > 0) {
        alertsDiv.innerHTML += `<div class="alert ${baseClasses} bg-yellow-100 border-yellow-500 text-yellow-800 ${hoverWarning}" onclick="setFilter('aboutToExpire')" title="Haz clic para ver estas órdenes"><strong class="font-semibold">ATENCIÓN (P_Art):</strong> ${stats.aboutToExpire} órdenes vencen en 1-2 días</div>`;
    }
    if (stats.thisWeek > 0 && stats.late === 0) {
        alertsDiv.innerHTML += `<div class="alert ${baseClasses} bg-blue-100 border-blue-500 text-blue-800 ${hoverInfo}" onclick="setDateFilter('thisWeek')" title="Haz clic para ver estas órdenes"><strong class="font-semibold">Esta Semana (P_Art):</strong> ${stats.thisWeek} órdenes deben despacharse en 7 días</div>`;
    }
    if (stats.late === 0 && stats.aboutToExpire === 0) {
        alertsDiv.innerHTML += `<div class="alert ${baseClasses} bg-green-100 border-green-500 text-green-800 !cursor-default"><strong class="font-semibold">Perfecto:</strong> No tienes órdenes atrasadas ni por vencer en P_Art</div>`;
    }
}

function updateFilters(stats) {
    const statusFilters = document.getElementById('statusFilters');
    const btnBase = "flex-1 font-medium py-2 px-3 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50";
    const btnInactive = "bg-white text-gray-700 hover:bg-gray-100 border-l border-gray-300 first:border-l-0";
    const btnActive = "bg-blue-600 text-white shadow-inner";
   statusFilters.innerHTML = `
        <button class="${btnBase} ${currentFilter==='all'?btnActive:btnInactive}" onclick="setFilter('all')">Todas (${stats.total})</button>
        <button class="${btnBase} ${currentFilter==='late'?btnActive:btnInactive}" onclick="setFilter('late')">Atrasadas (${stats.late})</button>
        <button class="${btnBase} ${currentFilter==='veryLate'?btnActive:btnInactive}" onclick="setFilter('veryLate')">Muy Atrasadas (${stats.veryLate})</button>
        <button class="${btnBase} ${currentFilter==='aboutToExpire'?btnActive:btnInactive}" onclick="setFilter('aboutToExpire')">Por Vencer (${stats.aboutToExpire})</button>
        <button class="${btnBase} ${currentFilter==='onTime'?btnActive:btnInactive}" onclick="setFilter('onTime')">A Tiempo (${stats.onTime})</button>
    `;
    const dateFilters = document.getElementById('dateFilters');
    dateFilters.innerHTML = `
        <button class="${btnBase} ${currentDateFilter==='all'?btnActive:btnInactive}" onclick="setDateFilter('all')">Todas</button>
        <button class="${btnBase} ${currentDateFilter==='thisWeek'?btnActive:btnInactive}" onclick="setDateFilter('thisWeek')">Esta Semana</button>
        <button class="${btnBase} ${currentDateFilter==='thisMonth'?btnActive:btnInactive}" onclick="setDateFilter('thisMonth')">Este Mes</button>
        <button class="${btnBase} ${currentDateFilter==='nextWeek'?btnActive:btnInactive}" onclick="setDateFilter('nextWeek')">Próxima Semana</button>
    `;
}

async function updateTable() {
    const partFilters = document.querySelectorAll('.filters');
    if (currentDepartamentoFilter && currentDepartamentoFilter !== 'P_Art') {
        partFilters.forEach(f => f.style.display = 'none');
    } else {
        partFilters.forEach(f => f.style.display = 'block');
    }

    const filtered = getFilteredOrders(false); 
    const tableBody = document.getElementById('tableBody');
    
    const filteredPieces = filtered.reduce((sum, order) => {
        return sum + (order.cantidad || 0) + (order.childPieces || 0);
    }, 0);
    
    setupPagination(filtered); 
    
    if (paginatedOrders.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="14" class="px-6 py-12 text-center text-gray-500">No hay órdenes que coincidan</td></tr>';
    } else {
        let tableRowsHTML = '';
        for (const order of paginatedOrders) {
            // CORRECCIÓN 2: VALIDACIÓN DEFENSIVA DE DATOS
            // Evita pintar "undefined" en la tabla
            const hasNotes = order.notes && order.notes.trim().length > 0;
            const receivedDateFormatted = order.receivedDate ? new Date(order.receivedDate + 'T00:00:00Z').toLocaleDateString('es-ES') : '-';
            const hasChildren = order.childPieces > 0;
            
            // Uso de operador || para valores por defecto
            const safeCliente = escapeHTML(order.cliente || '-');
            const safeCodigo = escapeHTML(order.codigoContrato || 'S/C');
            const safeEstilo = escapeHTML(order.estilo || '-');
            const safeTeam = escapeHTML(order.teamName || '-');
            const safeDepartamento = escapeHTML(order.departamento || 'Sin Depto');
            const safeDesigner = escapeHTML(order.designer || ''); // Vacío es válido para diseñador
            const safeCantidad = (order.cantidad || 0).toLocaleString();

            let fechaTexto = '-';
            if (order.fechaDespacho && !isNaN(new Date(order.fechaDespacho))) {
                fechaTexto = formatDate(order.fechaDespacho);
            }

            tableRowsHTML += `
            <tr class="cursor-pointer ${order.isVeryLate?'very-late':order.isLate?'late':order.isAboutToExpire?'expiring':''}" onclick="openAssignModal('${order.orderId}')">
                <td class="px-6 py-4 whitespace-nowrap" onclick="event.stopPropagation()">
                    ${order.departamento === 'P_Art' ? 
                    `<input type="checkbox" data-order-id="${order.orderId}" onchange="toggleOrderSelection('${order.orderId}')" aria-label="Seleccionar orden ${safeCodigo}"
                            class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer">` :
                    ''}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">${getStatusBadge(order)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${fechaTexto}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">${safeCliente}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${safeCodigo}
                    ${hasChildren ? `<br><span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-medium mt-1 inline-block flex items-center gap-1 w-fit">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                        </svg>
                        con hijas
                    </span>` : ''}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${safeEstilo}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${safeTeam}</td>
                <td class="px-6 py-4 whitespace-nowrap">${safeDepartamento !== 'Sin Depto' ? `<span class="bg-gray-100 text-gray-800 px-2.5 py-0.5 rounded-full text-xs font-medium">${safeDepartamento}</span>` : '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap">${safeDesigner ? `<span class="bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full text-xs font-medium">${safeDesigner}</span>` : '<span class="text-gray-400 text-sm italic">Sin asignar</span>'}</td>
                <td class="px-6 py-4 whitespace-nowrap">${getCustomStatusBadge(order.customStatus)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${receivedDateFormatted}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-bold">${safeCantidad}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${hasNotes ? `
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-gray-500">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375M9 15l2.25 2.25L15 12" />
                    </svg>
                    ` : '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm" onclick="event.stopPropagation()">
                    <button class="font-medium py-1 px-3 rounded-lg text-xs transition-colors shadow-sm bg-blue-600 text-white hover:bg-blue-700" onclick="openAssignModal('${order.orderId}')">Ver</button>
                </td>
            </tr>
            `;
        }
        tableBody.innerHTML = tableRowsHTML;
    }

    const selectAllCheckbox = document.getElementById('selectAll');
    const hasPArtOnPage = paginatedOrders.some(o => o.departamento === 'P_Art');
    if (selectAllCheckbox) {
        selectAllCheckbox.disabled = !hasPArtOnPage;
        if (!hasPArtOnPage) {
            selectAllCheckbox.checked = false;
        }
    }
    
    document.getElementById('resultCount').textContent = filtered.length;
    document.getElementById('totalCount').textContent = allOrders.length;
    document.getElementById('resultPieces').textContent = filteredPieces.toLocaleString();
    
    updateCheckboxes();
}

function getCustomStatusBadge(status) {
    const base = "px-2.5 py-0.5 rounded-full text-xs font-medium";
    if (!status) return `<span class="text-gray-400 text-sm italic">Sin estado</span>`;
    const safeStatus = escapeHTML(status);
    if (status === 'Completada') return `<span class="${base} bg-gray-100 text-gray-800 border border-gray-300">${safeStatus}</span>`;
    if (status === 'Bandeja') return `<span class="${base} bg-yellow-100 text-yellow-800">${safeStatus}</span>`;
    if (status === 'Producción') return `<span class="${base} bg-purple-100 text-purple-800">${safeStatus}</span>`;
    if (status === 'Auditoría') return `<span class="${base} bg-cyan-100 text-cyan-800">${safeStatus}</span>`;
    return `<span class="${base} bg-gray-100 text-gray-800">${safeStatus}</span>`;
}

function getStatusBadge(order) {
    const base = "px-2.5 py-0.5 rounded-full text-xs font-medium inline-block";
    if (order.isVeryLate) return `<span class="${base} bg-red-100 text-red-800">MUY ATRASADA</span><br><small class="text-red-600 text-xs mt-1 block">${order.daysLate}d</small>`;
    if (order.isLate) return `<span class="${base} bg-red-100 text-red-800">Atrasada</span><br><small class="text-red-500 text-xs mt-1 block">${order.daysLate}d</small>`;
    if (order.isAboutToExpire) return `<span class="${base} bg-yellow-100 text-yellow-800">Por Vencer</span>`;
    return `<span class="${base} bg-green-100 text-green-800">A Tiempo</span>`;
}

function formatDate(date) {
    if (!date) return '-';
    return date.toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', timeZone: 'UTC' });
}

function getWeekIdentifier(d) {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    const weekNumber = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${date.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}

function applySearchFilter(orders, searchText, searchFields = null) {
    if (!searchText || searchText.trim() === '') return orders;
    const s = searchText.toLowerCase().trim();
    const defaultFields = ['cliente', 'codigoContrato', 'estilo', 'teamName', 'departamento', 'designer', 'customStatus', 'notes'];
    const fields = searchFields || defaultFields;
    return orders.filter(order =>
         fields.some(field =>
            (order[field] || '').toString().toLowerCase().includes(s)
        )
    );
}

function applyMultipleFilters(orders, filters) {
    let result = [...orders];
    if (filters.cliente) result = result.filter(o => o.cliente === filters.cliente);
    if (filters.estilo) result = result.filter(o => o.estilo === filters.estilo);
    if (filters.teamName) result = result.filter(o => o.teamName === filters.teamName);
    if (filters.departamento) result = result.filter(o => o.departamento === filters.departamento);
    if (filters.designer) result = result.filter(o => o.designer === filters.designer);
    if (filters.customStatus) result = result.filter(o => o.customStatus === filters.customStatus);
    if (filters.dateFrom) {
        const fromDate = new Date(filters.dateFrom + 'T00:00:00Z');
        result = result.filter(o => o.fechaDespacho && o.fechaDespacho >= fromDate);
    }
    if (filters.dateTo) {
        const toDate = new Date(filters.dateTo + 'T23:59:59Z');
        result = result.filter(o => o.fechaDespacho && o.fechaDespacho <= toDate);
    }
    return result;
}

function getFilteredOrders(applyPagination = true) {
    let filtered = [...allOrders];
    filtered = applySearchFilter(filtered, currentSearch);
    filtered = applyMultipleFilters(filtered, {
        cliente: currentClientFilter,
        estilo: currentStyleFilter,
        teamName: currentTeamFilter,
        departamento: currentDepartamentoFilter,
        designer: currentDesignerFilter,
        customStatus: currentCustomStatusFilter,
        dateFrom: currentDateFrom,
        dateTo: currentDateTo
    });
    const artOrders = filtered.filter(o => o.departamento === 'P_Art');
    const otherOrders = filtered.filter(o => o.departamento !== 'P_Art');
    let filteredArtOrders = artOrders;
    if (currentFilter === 'late') filteredArtOrders = artOrders.filter(o => o.isLate);
    if (currentFilter === 'veryLate') filteredArtOrders = artOrders.filter(o => o.isVeryLate);
    if (currentFilter === 'aboutToExpire') filteredArtOrders = artOrders.filter(o => o.isAboutToExpire);
    if (currentFilter === 'onTime') filteredArtOrders = artOrders.filter(o => !o.isLate && !o.isAboutToExpire);
    const today = new Date(); today.setHours(0,0,0,0);
    if (currentDateFilter === 'thisWeek') {
        const weekEnd = new Date(today); 
        weekEnd.setDate(today.getDate()+7);
        filteredArtOrders = filteredArtOrders.filter(o => o.fechaDespacho && o.fechaDespacho >= today && o.fechaDespacho <= weekEnd);
    } else if (currentDateFilter === 'thisMonth') {
        const monthEnd = new Date(today.getFullYear(), today.getMonth()+1, 0);
        filteredArtOrders = filteredArtOrders.filter(o => o.fechaDespacho && o.fechaDespacho >= today && o.fechaDespacho <= monthEnd);
    } else if (currentDateFilter === 'nextWeek') {
        const nextWeekStart = new Date(today);
        nextWeekStart.setDate(today.getDate() + 7);
        const nextWeekEnd = new Date(today);
        nextWeekEnd.setDate(today.getDate() + 14);
        filteredArtOrders = filteredArtOrders.filter(o => o.fechaDespacho && o.fechaDespacho >= nextWeekStart && o.fechaDespacho <= nextWeekEnd);
    }
    if (currentFilter !== 'all' || currentDateFilter !== 'all' || currentDepartamentoFilter === 'P_Art') {
        filtered = filteredArtOrders;
    } 
    else if (currentDepartamentoFilter && currentDepartamentoFilter !== 'P_Art') {
        filtered = otherOrders;
    }
    else {
        filtered = [...filteredArtOrders, ...otherOrders];
    }
    if (sortConfig.key) {
        filtered.sort((a,b) => {
            let aVal,bVal;
            switch (sortConfig.key) {
                case 'date': aVal = a.fechaDespacho? a.fechaDespacho.getTime():0; bVal = b.fechaDespacho? b.fechaDespacho.getTime():0; break;
                case 'cliente': aVal = a.cliente; bVal = a.cliente; break;
                case 'estilo': aVal = a.estilo; bVal = a.estilo; break;
                case 'teamName': aVal = a.teamName; bVal = a.teamName; break;
                case 'departamento': aVal = a.departamento; bVal = a.departamento; break;
                case 'designer': aVal = a.designer || ''; bVal = b.designer || ''; break;
                case 'customStatus': aVal = a.customStatus || ''; bVal = b.customStatus || ''; break;
                case 'receivedDate': aVal = a.receivedDate ? new Date(a.receivedDate + 'T00:00:00Z').getTime() : 0; bVal = b.receivedDate ? new Date(b.receivedDate + 'T00:00:00Z').getTime() : 0; break;
                case 'cantidad': aVal = a.cantidad; bVal = a.cantidad; break;
                case 'status': aVal = a.isVeryLate?4: a.isLate?3: a.isAboutToExpire?2:1; bVal = b.isVeryLate?4: b.isLate?3: b.isAboutToExpire?2:1; break;
            }
            if (aVal < bVal) return sortConfig.direction==='asc' ? -1:1;
            if (aVal > bVal) return sortConfig.direction==='asc' ? 1:-1;
            return 0;
        });
    }
    if (applyPagination) {
        return paginatedOrders;
    } else {
        return filtered;
    }
}

function setFilter(f) { 
    currentFilter = f;
    currentDateFilter = 'all'; 
    currentPage = 1; 
    updateDashboard(); 
}
function setDateFilter(f) { 
    currentDateFilter = f;
    currentFilter = 'all'; 
    currentPage = 1; 
    updateDashboard(); 
}
function sortTable(key) {
    if (sortConfig.key === key) {
        sortConfig.direction = sortConfig.direction==='asc' ? 'desc':'asc';
    } else { 
        sortConfig.key = key; 
        sortConfig.direction='asc'; 
    }
    document.querySelectorAll('[id^="sort-"]').forEach(el => el.textContent='');
    const indicator = document.getElementById(`sort-${key}`);
    if (indicator) indicator.textContent = sortConfig.direction==='asc' ? '↑':'↓';
    currentPage = 1; 
    updateTable();
}

// --- Lógica de Reportes y Exportación ---
function resetApp() {
    showConfirmModal("¿Estás seguro de que quieres subir un nuevo archivo de Excel? Los datos de la nube permanecerán, pero la lista se refrescará.", () => {
        allOrders = [];
        isExcelLoaded = false;
        selectedOrders.clear();
        currentFilter = 'all';
        currentDateFilter = 'all';
        currentSearch = '';
        currentClientFilter = '';
        currentStyleFilter = '';
        currentTeamFilter = '';
        currentDepartamentoFilter = '';
        currentDesignerFilter = '';
        currentCustomStatusFilter = '';
        currentDateFrom = '';
        currentDateTo = '';
        sortConfig = { key: 'date', direction: 'asc' };
        currentPage = 1;
        needsRecalculation = true;
        
        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('designerMetricsView').style.display = 'none';
        document.getElementById('departmentMetricsView').style.display = 'none';
        document.getElementById('uploadSection').style.display = 'block';
        document.getElementById('workPlanView').style.display = 'none';
        document.getElementById('fileInput').value = '';
        document.getElementById('fileName').textContent = '';
        updateMultiSelectBar();
    }); 
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

// --- Lógica de Reporte Semanal ---
function openWeeklyReportModal() {
    document.getElementById('weeklyReportModal').classList.add('active');
    document.body.classList.add('modal-open');
    const today = new Date();
    const weekIdentifier = getWeekIdentifier(today);
    document.getElementById('weekSelector').value = weekIdentifier;
    generateWeeklyReport();
}
function closeWeeklyReportModal() {
    document.getElementById('weeklyReportModal').classList.remove('active');
    if(!document.getElementById('assignModal').classList.contains('active')) {
        document.body.classList.remove('modal-open');
    }
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
    spinner.style.display = 'block'; 
    contentDiv.innerHTML = ''; 

    setTimeout(() => {
        try {
            const weekValue = document.getElementById('weekSelector').value;
            if (!weekValue) {
                contentDiv.innerHTML = '<p>Por favor, selecciona una semana.</p>';
                spinner.style.display = 'none';
                return;
            }
            
            const [year, week] = weekValue.split('-W').map(Number);
            const { startDate, endDate } = getWeekDateRange(year, week);
            endDate.setUTCHours(23, 59, 59, 999);

            const filteredOrders = allOrders.filter(order => {
                if (!order.receivedDate) return false;
                const receivedDate = new Date(order.receivedDate + 'T00:00:00Z');
                return receivedDate >= startDate && receivedDate <= endDate;
            });

            let reportHTML = `
                <h4 class="text-lg font-semibold text-gray-800 mt-4 mb-2">Reporte para la semana del ${startDate.toLocaleDateString('es-ES', { timeZone: 'UTC' })} al ${endDate.toLocaleDateString('es-ES', { timeZone: 'UTC' })}</h4>
                <div class="table-container rounded-lg border border-gray-200 overflow-hidden mt-4 max-h-96 overflow-y-auto">
                    <table id="weeklyReportTable" class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha Recibida</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Diseñador</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cantidad</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
            `;

            if (filteredOrders.length > 0) {
                filteredOrders.sort((a,b) => new Date(a.receivedDate) - new Date(b.receivedDate));
                let totalPieces = 0;
                filteredOrders.forEach(order => {
                    const orderTotalPieces = (order.cantidad || 0) + (order.childPieces || 0);
                    totalPieces += orderTotalPieces;
                    reportHTML += `
                        <tr class="hover:bg-gray-50">
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-800">${new Date(order.receivedDate + 'T00:00:00Z').toLocaleDateString('es-ES', { timeZone: 'UTC' })}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-800 font-medium">${escapeHTML(order.cliente)}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${escapeHTML(order.codigoContrato)}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${escapeHTML(order.designer) || 'Sin asignar'}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${escapeHTML(order.customStatus) || 'Sin estado'}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-800 font-semibold">${orderTotalPieces.toLocaleString()}</td>
                        </tr>
                    `;
                });
                reportHTML += `
                    <tr class="font-bold bg-gray-50">
                        <td colspan="5" class="px-4 py-3 text-right text-sm text-gray-800">Total de Piezas (con hijas):</td>
                        <td class="px-4 py-3 text-left text-sm text-gray-900">${totalPieces.toLocaleString()}</td>
                    </tr>
                `;
            } else {
                reportHTML += '<tr><td colspan="6" class="text-center text-gray-500 py-12">No hay órdenes recibidas en esta semana.</td></tr>';
            }
            reportHTML += `</tbody></table></div>`;
            spinner.style.display = 'none';
            contentDiv.innerHTML = reportHTML;
        } catch (error) {
            console.error("Error generando reporte semanal:", error);
            showCustomAlert(`Error en reporte: ${error.message}`, 'error');
            spinner.style.display = 'none';
            contentDiv.innerHTML = '<p class="text-red-600">Error al generar el reporte.</p>';
        }
    }, 50);
}

function exportWeeklyReportAsPDF() {
    try {
        const table = document.getElementById('weeklyReportTable');
        if (!table || table.rows.length <= 1 || table.querySelector('td[colspan="6"]')) {
            showCustomAlert('No hay datos para exportar.', 'error');
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const weekValue = document.getElementById('weekSelector').value;
        const [year, week] = weekValue.split('-W').map(Number);
        const { startDate, endDate } = getWeekDateRange(year, week);
        doc.text(`Reporte Semanal de Órdenes`, 14, 16);
        doc.setFontSize(10);
        doc.text(`Semana: ${startDate.toLocaleDateString('es-ES', { timeZone: 'UTC' })} - ${endDate.toLocaleDateString('es-ES', { timeZone: 'UTC' })}`, 14, 22);
        doc.autoTable({
            html: '#weeklyReportTable',
            startY: 28,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] }, 
        });
        doc.save(`Reporte_Semanal_${year}_W${week}.pdf`);
    } catch (error) {
        console.error("Error exportando PDF semanal:", error);
        showCustomAlert(`Error al exportar PDF: ${error.message}`, 'error');
    }
}

// --- Lógica de Plan Semanal ---
function showWorkPlanView() {
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('designerMetricsView').style.display = 'none';
    document.getElementById('departmentMetricsView').style.display = 'none';
    document.getElementById('workPlanView').style.display = 'block';
    document.getElementById('multiSelectBar').classList.remove('active');
    const today = new Date();
    const weekIdentifier = getWeekIdentifier(today);
    document.getElementById('view-workPlanWeekSelector').value = weekIdentifier;
    currentWorkPlanWeek = weekIdentifier;
    generateWorkPlan();
}
function hideWorkPlanView() {
    document.getElementById('workPlanView').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
}

async function loadUrgentOrdersToPlan() {
    const weekIdentifier = document.getElementById('view-workPlanWeekSelector').value;
    if (!weekIdentifier) {
        showCustomAlert('Por favor, selecciona una semana primero.', 'error');
        return;
    }
    const spinner = document.getElementById('view-workPlanSpinner');
    spinner.style.display = 'block';
    
    const urgentAssignedOrders = allOrders.filter(o =>
        o.departamento === 'P_Art' &&
        (o.isLate || o.isAboutToExpire) &&
        o.designer && o.designer !== ''
    );
    
    if (urgentAssignedOrders.length === 0) {
        showCustomAlert('No se encontraron órdenes urgentes y asignadas para cargar.', 'info');
        spinner.style.display = 'none';
        return;
    }

    let addedCount = 0;
    let skippedCount = 0;
    for (const order of urgentAssignedOrders) {
        try {
            const added = await addOrderToWorkPlanDB(order, weekIdentifier);
            if (added) {
                addedCount++;
            } else {
                skippedCount++;
            }
        } catch (e) {
            console.error('Error al cargar urgentes:', e);
            showCustomAlert(`Error al guardar: ${e.message}`, 'error');
            spinner.style.display = 'none';
            return;
        }
    }
    showCustomAlert(`Se cargaron ${addedCount} órdenes urgentes. Se omitieron ${skippedCount} (ya estaban en el plan).`, 'success');
}

async function removeOrderFromPlan(planEntryId, orderCode) {
    showConfirmModal(`¿Estás seguro de que quieres quitar la orden ${orderCode} de este plan semanal?`, async () => {
        try {
            await removeOrderFromWorkPlanDB(planEntryId);
            showCustomAlert(`Orden ${orderCode} eliminada del plan.`, 'success');
        } catch (e) {
            console.error('Error al eliminar del plan:', e);
            showCustomAlert(`Error al eliminar: ${e.message}`, 'error');
        }
    });
}

async function generateWorkPlan() {
    const spinner = document.getElementById('view-workPlanSpinner');
    const contentDiv = document.getElementById('view-workPlanContent');
    const summarySpan = document.getElementById('view-workPlanSummary');
    spinner.style.display = 'block';
    contentDiv.innerHTML = '';
    summarySpan.textContent = '';
    
    currentWorkPlanWeek = document.getElementById('view-workPlanWeekSelector').value;
    if (!currentWorkPlanWeek) {
        spinner.style.display = 'none';
        contentDiv.innerHTML = '<p class="text-center text-gray-500">Por favor, selecciona una semana.</p>';
        return;
    }

    try {
        let planOrders = await getWorkPlanForWeek(currentWorkPlanWeek);
        
        if (planOrders.length === 0) {
            spinner.style.display = 'none';
            contentDiv.innerHTML = '<p class="text-center text-gray-500 py-12">No hay órdenes en el plan para esta semana.</p>';
            return;
        }
        
        const planByDesigner = {};
        designerList.forEach(designer => {
            const designerOrders = planOrders.filter(p => p.designer === designer);
            if (designerOrders.length > 0) {
                planByDesigner[designer] = designerOrders;
            }
        });
        
        const orphanOrders = planOrders.filter(p => !p.designer || !designerList.includes(p.designer));
        if (orphanOrders.length > 0) {
            planByDesigner['Sin Asignar (o Desconocido)'] = orphanOrders;
        }
        
        let totalPlanPieces = 0;
        let reportHTML = '';
        
        for (const designerName of Object.keys(planByDesigner)) {
            const designerOrders = planByDesigner[designerName];
            designerOrders.sort((a, b) => {
                if (a.isLate && !b.isLate) return -1;
                if (!a.isLate && b.isLate) return 1;
                if (a.isAboutToExpire && !b.isAboutToExpire) return -1;
                if (!a.isAboutToExpire && b.isAboutToExpire) return 1;
                return (new Date(a.fechaDespacho) || 0) - (new Date(b.fechaDespacho) || 0);
            });
            
            const designerPieces = designerOrders.reduce((sum, o) => sum + (o.cantidad || 0) + (o.childPieces || 0), 0);
            totalPlanPieces += designerPieces;

            reportHTML += `
                <div class="designer-plan-section mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div class="flex justify-between items-center mb-3">
                        <h3 class="text-xl font-semibold text-gray-800">${escapeHTML(designerName)}</h3>
                        <span class="text-sm font-semibold text-blue-600">${designerOrders.length} órdenes | ${designerPieces.toLocaleString()} piezas</span>
                    </div>
                    <div class="table-container rounded-lg border border-gray-200 overflow-hidden">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-100">
                                <tr>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Piezas</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Acción</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-100">`;
            
            designerOrders.forEach(order => {
                const totalPieces = (order.cantidad || 0) + (order.childPieces || 0);
                const today = new Date(); today.setHours(0,0,0,0);
                const fechaDespacho = order.fechaDespacho ? new Date(order.fechaDespacho) : null;
                const isLate = fechaDespacho && fechaDespacho < today;
                const isAboutToExpire = fechaDespacho && !isLate && ((fechaDespacho.getTime() - today.getTime()) / (1000*60*60*24)) <= 2;
                let statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">A Tiempo</span>`;
                if (isLate) {
                    statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Atrasada</span>`;
                } else if (isAboutToExpire) {
                    statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Por Vencer</span>`;
                }
                reportHTML += `
                    <tr class="hover:bg-gray-50">
                        <td class="px-4 py-2 whitespace-nowrap">${statusBadge}</td>
                        <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-800">${formatDate(fechaDespacho)}</td>
                        <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-800 font-medium">${escapeHTML(order.cliente)}</td>
                        <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${escapeHTML(order.codigoContrato)}</td>
                        <td class="px-4 py-2 whitespace-nowrap text-sm text-blue-600 font-bold">${totalPieces.toLocaleString()}</td>
                        <td class="px-4 py-2 whitespace-nowrap">
                            <button class="btn-remove-from-plan font-medium py-1 px-2 rounded-lg text-xs transition-colors bg-red-100 text-red-700 hover:bg-red-200 flex items-center gap-1"
                                    data-plan-entry-id="${escapeHTML(order.planEntryId)}"
                                    data-order-code="${escapeHTML(order.codigoContrato)}"
                                    title="Quitar del plan">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                                  <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.518.149.022a.75.75 0 1 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75a1.25 1.25 0 0 0-1.25-1.25h-2.5A1.25 1.25 0 0 0 7.5 3.75v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd" />
                                </svg>
                                Quitar
                            </button>
                        </td>
                    </tr>`;
            });
            reportHTML += `</tbody></table></div></div>`;
        }
        spinner.style.display = 'none';
        contentDiv.innerHTML = reportHTML;
        summarySpan.textContent = `Total en el Plan: ${planOrders.length} órdenes | ${totalPlanPieces.toLocaleString()} piezas`;

    } catch (error) {
        console.error("Error generando plan de trabajo:", error);
        showCustomAlert(`Error al cargar el plan: ${error.message}`, 'error');
        spinner.style.display = 'none';
        contentDiv.innerHTML = '<p class="text-red-600 text-center py-12">Error al cargar el plan.</p>';
    }
}

// --- Lógica de Métricas ---
function showDepartmentMetrics() {
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('designerMetricsView').style.display = 'none';
    document.getElementById('workPlanView').style.display = 'none';
    document.getElementById('departmentMetricsView').style.display = 'block';
    document.getElementById('multiSelectBar').classList.remove('active');
    document.getElementById('departmentMetricsContent').innerHTML = `
        <div id="deptSpinnerContainer" class="text-center py-20">
            <div class="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mx-auto"></div>
            <p class="text-gray-600 mt-4">Calculando métricas del departamento...</p>
        </div>
    `;
    setTimeout(generateDepartmentMetrics, 50);
}
function hideDepartmentMetrics() {
    document.getElementById('departmentMetricsView').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    if (deptLoadPieChart) { deptLoadPieChart.destroy(); deptLoadPieChart = null; }
    if (deptLoadBarChart) { deptLoadBarChart.destroy(); deptLoadBarChart = null; }
    if (deptProductivityChart) { deptProductivityChart.destroy(); deptProductivityChart = null; }
}

async function generateDepartmentMetrics() {
    try {
        const contentDiv = document.getElementById('departmentMetricsContent');
        const pArtActiveOrders = allOrders.filter(o => 
            o.departamento === 'P_Art' && 
            o.designer && 
            o.designer !== '' &&
            o.designer !== 'Magdali Fernadez' &&
            o.customStatus !== 'Completada'
        );
        const allAssignedPArtOrders = allOrders.filter(o => 
            o.departamento === 'P_Art' &&
            o.designer && 
            o.designer !== ''
        );
        const criticalOrders = allOrders.filter(o => 
            o.departamento === 'P_Art' &&
            (!o.designer || o.designer === '') &&
            o.isLate
        );
        const totalActiveOrders = pArtActiveOrders.length;
        const totalActivePieces = pArtActiveOrders.reduce((sum, o) => sum + (o.cantidad || 0) + (o.childPieces || 0), 0);
        const avgPiecesPerOrder = totalActiveOrders > 0 ? (totalActivePieces / totalActiveOrders) : 0;
        const lateOrders = pArtActiveOrders.filter(o => o.isLate).length;
        const lateOrdersPercent = totalActiveOrders > 0 ? (lateOrders / totalActiveOrders) * 100 : 0;
        const completedOrders = allAssignedPArtOrders.filter(o => o.customStatus === 'Completada');
        const completedOnTime = completedOrders.filter(o => !o.isLate).length;
        const complianceRate = completedOrders.length > 0 ? (completedOnTime / completedOrders.length) * 100 : 0;
        let totalEstimatedCapacity = 0;
        let totalCurrentPieces = 0;
        for (const designerName of designerList) {
            if (designerName === 'Magdali Fernadez') continue;
            const designerAllOrders = allAssignedPArtOrders.filter(o => o.designer === designerName);
            const designerActiveOrders = pArtActiveOrders.filter(o => o.designer === designerName);
            const last30Days = new Date(); last30Days.setDate(last30Days.getDate() - 30);
            const completadasRecientes = designerAllOrders.filter(o => o.customStatus === 'Completada' && o.completedDate && new Date(o.completedDate) >= last30Days);
            const piezasCompletadasRecientes = completadasRecientes.reduce((sum, o) => sum + (o.cantidad || 0) + (o.childPieces || 0), 0);
            const weeklyCapacityPieces = (piezasCompletadasRecientes / 4.2857); 
            const estimatedCapacity = weeklyCapacityPieces > 0 ? weeklyCapacityPieces : 100;
            totalEstimatedCapacity += estimatedCapacity;
            const currentActivePieces = designerActiveOrders.reduce((sum, o) => sum + (o.cantidad || 0) + (o.childPieces || 0), 0);
            totalCurrentPieces += currentActivePieces;
        }
        const totalCapacityUsed = totalEstimatedCapacity > 0 ? (totalCurrentPieces / totalEstimatedCapacity) * 100 : 0;
        const designerLoad = {};
        designerList.forEach(name => {
            if (name !== 'Magdali Fernadez') {
                designerLoad[name] = { pieces: 0, orders: 0 };
            }
        });
        pArtActiveOrders.forEach(o => {
            if (designerLoad[o.designer]) {
                designerLoad[o.designer].pieces += (o.cantidad || 0) + (o.childPieces || 0);
                designerLoad[o.designer].orders += 1;
            }
        });
        const sortedByPieces = Object.entries(designerLoad).sort((a, b) => b[1].pieces - a[1].pieces);
        const [maxLoadDesigner, maxLoadStats] = sortedByPieces[0] || ['N/A', { pieces: 0 }];
        const [minLoadDesigner, minLoadStats] = sortedByPieces[sortedByPieces.length - 1] || ['N/A', { pieces: 0 }];
        const allPieces = Object.values(designerLoad).map(d => d.pieces);
        const avgPieces = totalActivePieces / allPieces.length;
        const variance = allPieces.reduce((sum, pieces) => sum + Math.pow(pieces - avgPieces, 2), 0) / allPieces.length;
        const stdDeviation = Math.sqrt(variance);
        const stdDevPercent = (avgPieces > 0) ? (stdDeviation / avgPieces) * 100 : 0;
        const today = new Date();
        const startOfThisWeek = new Date(today.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1)));
        startOfThisWeek.setHours(0,0,0,0);
        const startOfLastWeek = new Date(startOfThisWeek);
        startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
        const completedThisWeek = completedOrders.filter(o => o.completedDate && new Date(o.completedDate) >= startOfThisWeek).length;
        const last30Days = new Date(); last30Days.setDate(last30Days.getDate() - 30);
        const completedLast30Days = completedOrders.filter(o => o.completedDate && new Date(o.completedDate) >= last30Days).length;
        const teamThroughput = (completedLast30Days / 4.2857).toFixed(1);
        const completadasConTiempo = completedOrders.filter(o => o.receivedDate && o.completedDate);
        let avgCompletionSpeed = 0;
        if (completadasConTiempo.length > 0) {
            const totalDays = completadasConTiempo.reduce((sum, o) => {
                try {
                    const start = new Date(o.receivedDate + 'T00:00:00Z');
                    const end = new Date(o.completedDate);
                    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                    return sum + Math.max(0, diffDays);
                } catch(e) { return sum; }
            }, 0);
            avgCompletionSpeed = totalDays / completadasConTiempo.length;
        }
        const clientLoad = {};
        const styleLoad = {};
        pArtActiveOrders.forEach(o => {
            const totalOrderPieces = (o.cantidad || 0) + (o.childPieces || 0);
            clientLoad[o.cliente] = (clientLoad[o.cliente] || 0) + totalOrderPieces;
            styleLoad[o.estilo] = (styleLoad[o.estilo] || 0) + totalOrderPieces;
        });
        const top3Clients = Object.entries(clientLoad).sort((a,b) => b[1] - a[1]).slice(0, 3);
        const top5Styles = Object.entries(styleLoad).sort((a,b) => b[1] - a[1]).slice(0, 5);
        const receivedThisWeek = allAssignedPArtOrders.filter(o => o.receivedDate && new Date(o.receivedDate + 'T00:00:00Z') >= startOfThisWeek).length;
        const receivedLastWeek = allAssignedPArtOrders.filter(o => o.receivedDate && new Date(o.receivedDate + 'T00:00:00Z') >= startOfLastWeek && new Date(o.receivedDate + 'T00:00:00Z') < startOfThisWeek).length;
        let trendArrow = '→';
        let trendClass = 'text-gray-500';
        if (receivedThisWeek > receivedLastWeek) { trendArrow = '↑'; trendClass = 'text-green-600'; }
        if (receivedThisWeek < receivedLastWeek) { trendArrow = '↓'; trendClass = 'text-red-600'; }
        let complianceClass = 'text-green-600';
        if (complianceRate < 90) complianceClass = 'text-yellow-600';
        if (complianceRate < 70) complianceClass = 'text-red-600';
        let capacityClass = 'text-green-600';
        if (totalCapacityUsed > 100) capacityClass = 'text-red-600';
        else if (totalCapacityUsed > 80) capacityClass = 'text-yellow-600';
        let balanceClass = 'text-green-600';
        if (stdDevPercent > 30) balanceClass = 'text-yellow-600';
        if (stdDevPercent > 50) balanceClass = 'text-red-600';
        contentDiv.innerHTML = `
            <h3 class="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">Sección 1: Resumen del Departamento (P_Art Activo)</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-6 mb-6">
                <div class="bg-white rounded-lg shadow-lg p-5 border border-gray-200"><div class="text-sm font-medium text-gray-500 mb-1">Órdenes Activas (Asignadas)</div><div class="text-3xl font-bold text-gray-900">${totalActiveOrders}</div></div>
                <div class="bg-white rounded-lg shadow-lg p-5 border border-gray-200"><div class="text-sm font-medium text-gray-500 mb-1">Piezas Activas (Asignadas)</div><div class="text-3xl font-bold text-gray-900">${totalActivePieces.toLocaleString()}</div></div>
                <div class="bg-white rounded-lg shadow-lg p-5 border border-gray-200"><div class="text-sm font-medium text-gray-500 mb-1">Promedio Piezas / Orden</div><div class="text-3xl font-bold text-gray-900">${avgPiecesPerOrder.toFixed(1)}</div></div>
                <div class="bg-white rounded-lg shadow-lg p-5 border border-gray-200"><div class="text-sm font-medium text-gray-500 mb-1">Órdenes Atrasadas</div><div class="text-3xl font-bold ${lateOrdersPercent > 10 ? 'text-red-600' : 'text-gray-900'}">${lateOrders} <span class="text-xl font-medium text-gray-500">(${lateOrdersPercent.toFixed(1)}%)</span></div></div>
                <div class="bg-white rounded-lg shadow-lg p-5 border border-gray-200"><div class="text-sm font-medium text-gray-500 mb-1">Tasa de Cumplimiento (Hist.)</div><div class="text-3xl font-bold ${complianceClass}">${complianceRate.toFixed(1)}%</div></div>
                <div class="bg-white rounded-lg shadow-lg p-5 border border-gray-200"><div class="text-sm font-medium text-gray-500 mb-1">Capacidad Utilizada (Estimada)</div><div class="text-3xl font-bold ${capacityClass}">${totalCapacityUsed.toFixed(0)}%</div></div>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">Sección 2: Distribución de Carga Activa</h3>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <div class="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="bg-white rounded-lg shadow-lg p-5 border border-gray-200"><div class="text-sm font-medium text-gray-500 mb-1">Diseñador con Mayor Carga</div><div class="text-2xl font-bold text-gray-900 truncate" title="${escapeHTML(maxLoadDesigner)}">${escapeHTML(maxLoadDesigner)}</div><div class="text-sm text-gray-500 mt-1">${maxLoadStats.pieces.toLocaleString()} piezas</div></div>
                    <div class="bg-white rounded-lg shadow-lg p-5 border border-gray-200"><div class="text-sm font-medium text-gray-500 mb-1">Diseñador con Menor Carga</div><div class="text-2xl font-bold text-gray-900 truncate" title="${escapeHTML(minLoadDesigner)}">${escapeHTML(minLoadDesigner)}</div><div class="text-sm text-gray-500 mt-1">${minLoadStats.pieces.toLocaleString()} piezas</div></div>
                    <div class="md:col-span-2 bg-white rounded-lg shadow-lg p-5 border border-gray-200"><div class="text-sm font-medium text-gray-500 mb-1">Balance de Carga (Desv. Est.)</div><div class="text-2xl font-bold ${balanceClass}">${stdDevPercent.toFixed(1)}%</div><div class="text-sm text-gray-500 mt-1">Un ${stdDevPercent > 30 ? 'alto' : 'bajo'} % indica carga desbalanceada</div></div>
                </div>
                <div class="lg:col-span-1 bg-white rounded-lg shadow-lg p-4 border border-gray-200 min-h-[300px]"><canvas id="deptLoadPieChartCanvas"></canvas></div>
            </div>
            <div class="bg-white rounded-lg shadow-lg p-4 border border-gray-200 mb-6 min-h-[350px]"><canvas id="deptLoadBarChartCanvas"></canvas></div>
            <h3 class="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">Sección 3: Productividad del Equipo</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                <div class="bg-white rounded-lg shadow-lg p-5 border border-gray-200"><div class="text-sm font-medium text-gray-500 mb-1">Completadas esta Semana</div><div class="text-3xl font-bold text-gray-900">${completedThisWeek}</div></div>
                <div class="bg-white rounded-lg shadow-lg p-5 border border-gray-200"><div class="text-sm font-medium text-gray-500 mb-1">Throughput (Órdenes/Semana)</div><div class="text-3xl font-bold text-gray-900">${teamThroughput}</div></div>
                <div class="bg-white rounded-lg shadow-lg p-5 border border-gray-200"><div class="text-sm font-medium text-gray-500 mb-1">Velocidad Promedio (Hist.)</div><div class="text-3xl font-bold text-gray-900">${avgCompletionSpeed.toFixed(1)} <span class="text-2xl font-medium text-gray-500">días</span></div></div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200"><h4 class="text-base font-semibold text-gray-900 mb-3">Top 3 Clientes (Carga Activa)</h4><div class="space-y-2 max-h-40 overflow-y-auto">${top3Clients.length > 0 ? top3Clients.map(([client, pieces]) => `<div class="report-item flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0 text-sm"><span class="text-gray-700 font-medium">${escapeHTML(client)}</span><strong class="font-semibold text-gray-900">${pieces.toLocaleString()} pzs</strong></div>`).join('') : '<p class="text-gray-500 text-center py-4">No hay datos</p>'}</div></div>
                <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200"><h4 class="text-base font-semibold text-gray-900 mb-3">Top 5 Estilos (Carga Activa)</h4><div class="space-y-2 max-h-40 overflow-y-auto">${top5Styles.length > 0 ? top5Styles.map(([style, pieces]) => `<div class="report-item flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0 text-sm"><span class="text-gray-700 font-medium">${escapeHTML(style)}</span><strong class="font-semibold text-gray-900">${pieces.toLocaleString()} pzs</strong></div>`).join('') : '<p class="text-gray-500 text-center py-4">No hay datos</p>'}</div></div>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">Sección 4: Alertas y Tendencias</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div class="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg shadow-lg"><h4 class="text-base font-semibold text-red-800 mb-3">Órdenes Críticas (Atrasadas y Sin Asignar)</h4><div class="text-3xl font-bold text-red-600 mb-3">${criticalOrders.length} <span class="text-2xl font-medium">órdenes</span></div><button class="${criticalOrders.length === 0 ? 'hidden' : ''} font-medium py-2 px-4 rounded-lg text-sm transition-colors shadow-sm bg-red-600 text-white hover:bg-red-700" onclick="goToCriticalOrders()">Ver Órdenes Críticas</button></div>
                <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200"><h4 class="text-base font-semibold text-gray-900 mb-3">Tendencia Semanal (Nuevas Recibidas)</h4><div class="text-3xl font-bold text-gray-900 flex items-center gap-3">${receivedThisWeek} <span class="text-3xl font-bold ${trendClass}">${trendArrow}</span></div><div class="text-sm text-gray-500 mt-1">${receivedLastWeek} órdenes la semana pasada</div></div>
            </div>
        `;
        initDepartmentCharts(designerLoad, completedOrders);
    } catch (error) {
        console.error("Error generando métricas del departamento:", error);
        document.getElementById('departmentMetricsContent').innerHTML = `<p class="text-red-600 text-center py-12">Error al generar las métricas: ${error.message}</p>`;
    }
}
function initDepartmentCharts(designerLoad, completedOrders) {
    if (deptLoadPieChart) { deptLoadPieChart.destroy(); }
    if (deptLoadBarChart) { deptLoadBarChart.destroy(); }
    if (deptProductivityChart) { deptProductivityChart.destroy(); }
    
    const getTailwindColor = (name, fallback) => {
        try {
            if (name.includes('.')) {
                const parts = name.split('.'); let color = tailwind.config.theme.colors;
                for (const part of parts) { color = color[part]; } return color || fallback;
            }
            if (tailwind.config.theme.extend.colors[name]) { return tailwind.config.theme.extend.colors[name] || fallback; }
            if (tailwind.config.theme.colors[name]) { return tailwind.config.theme.colors[name] || fallback; }
            return fallback;
        } catch (e) { return fallback; }
    };
    
    const colorBorder = getTailwindColor('white', '#FFFFFF');
    const colorText = getTailwindColor('gray.500', '#6B7280');
    const colorTextTitle = getTailwindColor('gray.800', '#1F2937');
    const colorIndigo = getTailwindColor('indigo.600', '#4F46E5');
    const chartColors = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444', '#6366F1', '#EC4899', '#F97316', '#06B6D4', '#D946EF', '#6B7280', '#22C55E'];
    
    const pieCtx = document.getElementById('deptLoadPieChartCanvas')?.getContext('2d');
    const sortedByPieces = Object.entries(designerLoad).sort((a, b) => b[1].pieces - a[1].pieces);
    const pieLabels = sortedByPieces.map(d => d[0]);
    const pieData = sortedByPieces.map(d => d[1].pieces);
    const totalPieces = pieData.reduce((a, b) => a + b, 0);
    if (pieCtx) {
        deptLoadPieChart = new Chart(pieCtx, {
            type: 'doughnut',
            data: { labels: pieLabels, datasets: [{ label: 'Piezas Activas', data: pieData, backgroundColor: chartColors, borderColor: colorBorder, borderWidth: 2 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'Distribución de Piezas Activas', font: { size: 12, family: 'Inter', weight: '600' }, color: colorTextTitle },
                    tooltip: { callbacks: { label: function(context) { const label = context.label || ''; const value = context.raw || 0; const percentage = totalPieces > 0 ? ((value / totalPieces) * 100).toFixed(1) : 0; return `${label}: ${value.toLocaleString()} pzs (${percentage}%)`; } } }
                }
            }
        });
    }
    const barCtx = document.getElementById('deptLoadBarChartCanvas')?.getContext('2d');
    const barLabels = Object.keys(designerLoad).sort((a, b) => designerLoad[b].pieces - designerLoad[a].pieces);
    if (barCtx) {
        deptLoadBarChart = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: barLabels,
                datasets: [
                    { label: 'Piezas', data: barLabels.map(name => designerLoad[name].pieces), backgroundColor: 'rgba(79, 70, 229, 0.7)', borderColor: 'rgba(79, 70, 229, 1)', borderWidth: 1, yAxisID: 'yPieces' },
                    { label: 'Órdenes', data: barLabels.map(name => designerLoad[name].orders), backgroundColor: 'rgba(245, 158, 11, 0.7)', borderColor: 'rgba(245, 158, 11, 1)', borderWidth: 1, yAxisID: 'yOrders' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Carga de Trabajo Activa por Diseñador (Piezas y Órdenes)', font: { size: 12, family: 'Inter', weight: '600' }, color: colorTextTitle },
                    legend: { position: 'bottom', labels: { font: { family: 'Inter' }, color: colorText } }
                },
                scales: {
                    x: { ticks: { color: colorText, font: { family: 'Inter', size: 10 } } },
                    yPieces: { type: 'linear', position: 'left', beginAtZero: true, title: { display: true, text: 'Total Piezas', font: { size: 10, family: 'Inter' }, color: colorText }, ticks: { color: colorIndigo } },
                    yOrders: { type: 'linear', position: 'right', beginAtZero: true, title: { display: true, text: 'Total Órdenes', font: { size: 10, family: 'Inter' }, color: colorText }, ticks: { color: getTailwindColor('chart-bandeja', '#F59E0B') }, grid: { drawOnChartArea: false } }
                }
            }
        });
    }
}
function goToCriticalOrders() {
    hideDepartmentMetrics();
    clearAllFilters();
    currentDepartamentoFilter = 'P_Art';
    currentDesignerFilter = ''; 
    currentFilter = 'late'; 
    document.getElementById('departamentoFilter').value = 'P_Art';
    document.getElementById('designerFilter').value = '';
    updateDashboard();
    showCustomAlert('Mostrando órdenes críticas: P_Art, Sin Asignar y Atrasadas', 'info');
}

// --- Lógica de Métricas de Diseñador ---
function showMetricsView() {
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('departmentMetricsView').style.display = 'none';
    document.getElementById('designerMetricsView').style.display = 'block';
    document.getElementById('workPlanView').style.display = 'none';
    populateMetricsSidebar();
    document.getElementById('metricsDetail').innerHTML = `<p class="text-gray-500 text-center py-12">← Selecciona un diseñador de la lista para ver sus estadísticas.</p>`;
    document.getElementById('multiSelectBar').classList.remove('active'); 
}
function hideMetricsView() {
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('designerMetricsView').style.display = 'none';
    document.getElementById('departmentMetricsView').style.display = 'none';
    destroyDesignerCharts();
    closeCompareModals(); 
}
function populateMetricsSidebar() {
    const listDiv = document.getElementById('metricsSidebarList');
    listDiv.innerHTML = ''; 
    const pArtOrders = allOrders.filter(o => o.departamento === 'P_Art');
    const unassignedCount = pArtOrders.filter(o => !o.designer).length;
    let html = '';
    const badgeClasses = "bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full text-xs font-medium";
    if (unassignedCount > 0) {
         html += `<button class="filter-btn" id="btn-metric-Sin-asignar" data-designer="Sin asignar">
                    Sin asignar <span class="${badgeClasses}">${unassignedCount}</span>
                 </button>`;
    }
    designerList.forEach(name => {
        const count = pArtOrders.filter(o => o.designer === name).length;
        if (count > 0) {
            const safeName = escapeHTML(name);
            const btnId = `btn-metric-${name.replace(/[^a-zA-Z0-9]/g, '-')}`;
            html += `<button class="filter-btn" id="${btnId}" data-designer="${safeName}">
                        ${safeName} <span class="${badgeClasses}">${count}</span>
                     </button>`;
        }
    });
    listDiv.innerHTML = html;
}
function destroyDesignerCharts() {
    if (designerDoughnutChart) { designerDoughnutChart.destroy(); designerDoughnutChart = null; }
    if (designerBarChart) { designerBarChart.destroy(); designerBarChart = null; }
    if (designerActivityChart) { designerActivityChart.destroy(); designerActivityChart = null; }
}
async function generateDesignerMetrics(designerName) {
    showLoading('Generando métricas...');
    try {
        const contentDiv = document.getElementById('metricsDetail');
        contentDiv.innerHTML = '<div class="spinner-container"><div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto my-12"></div></div><p style="text-align: center;">Cargando métricas...</p>';
        destroyDesignerCharts();
        currentDesignerTableFilter = { search: '', cliente: '', estado: '', fechaDesde: '', fechaHasta: '' };
        document.querySelectorAll('#metricsSidebarList .filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const btnId = `btn-metric-${designerName.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const activeBtn = document.getElementById(btnId);
        if (activeBtn) activeBtn.classList.add('active');
        const pArtOrders = allOrders.filter(o => o.departamento === 'P_Art');
        const isUnassigned = designerName === 'Sin asignar';
        const designerOrders = pArtOrders.filter(o => {
            const matchesDesigner = isUnassigned ? (o.designer === '' || !o.designer) : (o.designer === designerName);
            return matchesDesigner && o.customStatus !== 'Completada';
        });
        const allDesignerOrders = allOrders.filter(o => isUnassigned ? !o.designer : o.designer === designerName);
        if (allDesignerOrders.length === 0) {
            contentDiv.innerHTML = '<p class="text-gray-500 text-center py-12">Este diseñador no tiene órdenes asignadas.</p>';
            hideLoading();
            return;
        }
        const completadas = allDesignerOrders.filter(o => o.customStatus === 'Completada');
        const completadasATiempo = completadas.filter(o => !o.isLate); 
        let complianceRate = 0;
        if (completadas.length > 0) {
            complianceRate = (completadasATiempo.length / completadas.length) * 100;
        }
        let complianceClass = 'text-green-600';
        if (complianceRate < 90) complianceClass = 'text-yellow-600';
        if (complianceRate < 70) complianceClass = 'text-red-600';
        const completadasConTiempo = completadas.filter(o => o.receivedDate && o.completedDate);
        let avgCompletionSpeed = 0;
        if (completadasConTiempo.length > 0) {
            const totalDays = completadasConTiempo.reduce((sum, o) => {
                try {
                    const start = new Date(o.receivedDate + 'T00:00:00Z');
                    const end = new Date(o.completedDate);
                    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                    return sum + Math.max(0, diffDays);
                } catch(e) { console.warn("Error parseando fecha en Velocidad:", e); return sum; }
            }, 0);
            avgCompletionSpeed = totalDays / completadasConTiempo.length;
        }
        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);
        const completadasRecientes = completadas.filter(o => {
            if (!o.completedDate) return false;
            try { const completedDate = new Date(o.completedDate); return completedDate >= last30Days; } catch (e) { return false; }
        });
        const weeklyThroughput = (completadasRecientes.length / 4.2857).toFixed(1);
        const currentActivePieces = designerOrders.reduce((sum, o) => sum + (o.cantidad || 0) + (o.childPieces || 0), 0);
        const piezasCompletadasRecientes = completadasRecientes.reduce((sum, o) => sum + (o.cantidad || 0) + (o.childPieces || 0), 0);
        const weeklyCapacityPieces = (piezasCompletadasRecientes / 4.2857);
        const estimatedCapacity = weeklyCapacityPieces > 0 ? weeklyCapacityPieces : (weeklyThroughput > 0 ? (weeklyThroughput * 25) : 100);
        const capacityUsed = estimatedCapacity > 0 ? (currentActivePieces / estimatedCapacity) * 100 : 0;
        let capacityClass = 'text-green-600';
        if (capacityUsed > 100) capacityClass = 'text-red-600';
        else if (capacityUsed > 80) capacityClass = 'text-yellow-600';
        const clientPieces = {};
        const stylePieces = {};
        designerOrders.forEach(o => {
            const totalOrderPieces = (o.cantidad || 0) + (o.childPieces || 0);
            clientPieces[o.cliente] = (clientPieces[o.cliente] || 0) + totalOrderPieces;
            stylePieces[o.estilo] = (stylePieces[o.estilo] || 0) + totalOrderPieces;
        });
        const topClient = Object.entries(clientPieces).sort((a,b) => b[1] - a[1])[0];
        const top5Styles = Object.entries(stylePieces).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const today = new Date();
        const startOfThisWeek = new Date(today.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1)));
        startOfThisWeek.setHours(0,0,0,0);
        const startOfLastWeek = new Date(startOfThisWeek);
        startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
        const receivedThisWeek = allDesignerOrders.filter(o => o.receivedDate && new Date(o.receivedDate + 'T00:00:00Z') >= startOfThisWeek).length;
        const receivedLastWeek = allDesignerOrders.filter(o => o.receivedDate && new Date(o.receivedDate + 'T00:00:00Z') >= startOfLastWeek && new Date(o.receivedDate + 'T00:00:00Z') < startOfThisWeek).length;
        let trendArrow = '→';
        let trendClass = 'text-gray-500';
        if (receivedThisWeek > receivedLastWeek) { trendArrow = '↑'; trendClass = 'text-green-600'; }
        if (receivedThisWeek < receivedLastWeek) { trendArrow = '↓'; trendClass = 'text-red-600'; }
        const safeDesignerName = escapeHTML(designerName);
        const btnBase = "font-medium py-2 px-4 rounded-lg text-sm transition-colors shadow-sm flex items-center gap-2";
        const btnSuccess = "bg-green-600 text-white hover:bg-green-700";
        const btnInfo = "bg-cyan-500 text-white hover:bg-cyan-600";
        const btnOutline = "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50";
        contentDiv.innerHTML = `
            <div class="flex flex-wrap justify-between items-start gap-4 mb-6">
                <h2 class="text-2xl font-bold text-gray-900">${safeDesignerName}</h2>
                <div class="flex flex-wrap gap-2">
                    <button class="${btnBase} ${btnSuccess}" onclick="exportDesignerMetricsPDF('${safeDesignerName.replace(/'/g, "\\'")}')"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>Exportar PDF</button>
                    <button class="${btnBase} ${btnInfo}" onclick="exportDesignerMetricsExcel('${safeDesignerName.replace(/'/g, "\\'")}')"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25A1.125 1.125 0 0 1 9.75 19.875V8.625ZM16.5 3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v16.5c0 .621-.504 1.125-1.125 1.125h-2.25A1.125 1.125 0 0 1 16.5 19.875V3.375Z" /></svg>Exportar Excel</button>
                    <button class="${btnBase} ${btnOutline}" onclick="openCompareModal('${safeDesignerName.replace(/'/g, "\\'")}')"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>Comparar</button>
                </div>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">Métricas de Rendimiento y Productividad</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <div class="bg-white rounded-lg shadow-lg p-5 border border-gray-200"><div class="text-sm font-medium text-gray-500 mb-1">Tasa de Cumplimiento (Histórico)</div><div class="text-2xl font-bold ${complianceClass}">${complianceRate.toFixed(1)}%</div><div class="text-xs text-gray-500 mt-1">${completadasATiempo.length} de ${completadas.length} completadas a tiempo</div></div>
                <div class="bg-white rounded-lg shadow-lg p-5 border border-gray-200"><div class="text-sm font-medium text-gray-500 mb-1">Velocidad de Completación (Histórico)</div><div class="text-2xl font-bold text-gray-900 flex items-baseline gap-1">${avgCompletionSpeed.toFixed(1)} <span class="text-lg font-medium text-gray-500">días</span></div><div class="text-xs text-gray-500 mt-1">Recibida → Completada (${completadasConTiempo.length} órdenes)</div></div>
                <div class="bg-white rounded-lg shadow-lg p-5 border border-gray-200"><div class="text-sm font-medium text-gray-500 mb-1">Throughput Semanal</div><div class="text-2xl font-bold text-gray-900 flex items-baseline gap-1">${weeklyThroughput} <span class="text-lg font-medium text-gray-500">órd/sem</span></div><div class="text-xs text-gray-500 mt-1">Últimos 30 días (${completadasRecientes.length} completadas)</div></div>
                <div class="bg-white rounded-lg shadow-lg p-5 border border-gray-200"><div class="text-sm font-medium text-gray-500 mb-1">Capacidad Utilizada</div><div class="text-2xl font-bold ${capacityClass}">${capacityUsed.toFixed(0)}%</div><div class="text-xs text-gray-500 mt-1">${currentActivePieces.toLocaleString()} pzs / ~${estimatedCapacity.toFixed(0)} cap. pzs/sem</div></div>
                <div class="bg-white rounded-lg shadow-lg p-5 border border-gray-200"><div class="text-sm font-medium text-gray-500 mb-1">Pico de Carga (Activas)</div><div class="text-2xl font-bold text-gray-900 truncate" title="${topClient ? escapeHTML(topClient[0]) : '-'}">${topClient ? escapeHTML(topClient[0]) : '-'}</div><div class="text-xs text-gray-500 mt-1">${topClient ? topClient[1].toLocaleString() : '0'} piezas activas</div></div>
                <div class="bg-white rounded-lg shadow-lg p-5 border border-gray-200"><div class="text-sm font-medium text-gray-500 mb-1">Tendencia Semanal (Recibidas)</div><div class="text-2xl font-bold text-gray-900 flex items-center gap-2">${receivedThisWeek} <span class="text-2xl font-bold ${trendClass}">${trendArrow}</span></div><div class="text-xs text-gray-500 mt-1">${receivedLastWeek} la semana pasada</div></div>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">Top 5 Estilos (Carga Activa)</h3>
            <div class="report-list max-h-52 overflow-y-auto mb-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
                ${top5Styles.length > 0 ? top5Styles.map(([style, pieces]) => `<div class="report-item flex justify-between items-center py-2 border-b border-gray-200 last:border-b-0 text-sm"><span class="text-gray-700">${escapeHTML(style)}</span><strong class="font-medium text-gray-900">${pieces.toLocaleString()} pzs</strong></div>`).join('') : '<p class="text-gray-500 text-center py-8">No hay carga activa para mostrar.</p>'}
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">Visualización de Carga Activa (Solo P_Art)</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div class="chart-container h-72 bg-white rounded-lg shadow-lg p-4 border border-gray-200"><canvas id="designerDoughnutChartCanvas"></canvas></div>
                <div class="chart-container h-72 bg-white rounded-lg shadow-lg p-4 border border-gray-200"><canvas id="designerBarChartCanvas"></canvas></div>
                <div class="chart-container md:col-span-2 h-72 bg-white rounded-lg shadow-lg p-4 border border-gray-200"><canvas id="designerActivityChartCanvas"></canvas></div>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">Órdenes Asignadas (P_Art)</h3>
            <div class="designer-filter-section grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 mb-4">
                <div class="filter-item md:col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Buscar (Cliente, Código, Estilo):</label>
                    <div class="relative">
                        <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-gray-400"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg></div>
                        <input type="text" id="designerSearchInput" class="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500" placeholder="Buscar...">
                    </div>
                </div>
                <div class="filter-item">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Estado de Orden:</label>
                    <select id="designerStatusFilter" class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white">
                        <option value="">Todos</option>
                        ${CUSTOM_STATUS_OPTIONS.map(s => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join
('')}
                    </select>
                </div>
                <div class="filter-item">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Cliente:</label>
                    <select id="designerClienteFilter" class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white">
                        <option value="">Todos</option>
                        ${[...new Set(allDesignerOrders.map(o => o.cliente))].sort().map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('')}
                    </select>
                </div>
                <button class="font-medium py-2 px-4 rounded-lg text-sm transition-colors shadow-sm bg-white text-red-600 border border-red-300 hover:bg-red-50 flex items-center justify-center gap-2 h-10 mt-auto" id="designerClearFiltersBtn">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                    Limpiar
                </button>
            </div>
            <div id="designerOrdersTableContainer"></div>
        `;
        
        // Renderizar tabla y gráficos
        renderDesignerOrdersTable(designerName); 
        initDesignerCharts(designerOrders, allDesignerOrders); 
        
        // Listeners para los filtros internos de esta vista
        document.getElementById('designerSearchInput').addEventListener('input', debounce((e) => {
            currentDesignerTableFilter.search = e.target.value;
            renderDesignerOrdersTable(designerName);
        }, 300));
        
        document.getElementById('designerStatusFilter').addEventListener('change', (e) => {
            currentDesignerTableFilter.estado = e.target.value;
            renderDesignerOrdersTable(designerName);
        });
        
        document.getElementById('designerClienteFilter').addEventListener('change', (e) => {
            currentDesignerTableFilter.cliente = e.target.value;
            renderDesignerOrdersTable(designerName);
        });
        
        document.getElementById('designerClearFiltersBtn').addEventListener('click', () => {
            currentDesignerTableFilter = { search: '', cliente: '', estado: '', fechaDesde: '', fechaHasta: '' };
            document.getElementById('designerSearchInput').value = '';
            document.getElementById('designerStatusFilter').value = '';
            document.getElementById('designerClienteFilter').value = '';
            renderDesignerOrdersTable(designerName);
        });

    } catch (error) {
        console.error("Error generando métricas:", error);
        showCustomAlert(`Error al generar métricas: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

function renderDesignerOrdersTable(designerName) {
    const container = document.getElementById('designerOrdersTableContainer');
    if (!container) return;
    
    const isUnassigned = designerName === 'Sin asignar';
    let designerOrders = allOrders.filter(o => {
        return (isUnassigned ? (o.designer === '' || !o.designer) : (o.designer === designerName)) && o.departamento === 'P_Art';
    });
    
    const { search, cliente, estado } = currentDesignerTableFilter;
    designerOrders = applySearchFilter(designerOrders, search, ['cliente', 'codigoContrato', 'estilo']);
    designerOrders = applyMultipleFilters(designerOrders, { cliente: cliente, customStatus: estado });
    
    const filterSummary = document.createElement('div');
    filterSummary.className = "p-3 bg-gray-50 rounded-lg border border-gray-200 mb-4 text-sm text-gray-600";
    filterSummary.innerHTML = `Mostrando <strong class="text-blue-600 font-semibold">${designerOrders.length}</strong> ${designerOrders.length === 1 ? 'orden' : 'órdenes'} ${(search || cliente || estado) ? ' (filtradas)' : ''}`;
    
    container.innerHTML = '';
    container.appendChild(filterSummary);
    
    let tableHTML = `
        <div class="table-container rounded-lg border border-gray-200 overflow-hidden">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha Despacho</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estilo</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado Orden</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Piezas</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
    `;
    
    if (designerOrders.length === 0) {
        tableHTML += '<tr><td colspan="7" class="text-center text-gray-500 py-12">No hay órdenes que coincidan con los filtros.</td></tr>';
    } else {
        designerOrders.sort((a,b) => (a.fechaDespacho || 0) - (b.fechaDespacho || 0));
        for (const order of designerOrders) {
            const totalOrderPieces = (order.cantidad || 0) + (order.childPieces || 0);
            tableHTML += `
                <tr class="cursor-pointer ${order.isVeryLate?'very-late':order.isLate?'late':order.isAboutToExpire?'expiring':''}" onclick="openAssignModal('${order.orderId}')">
                    <td class="px-4 py-3 whitespace-nowrap">${getStatusBadge(order)}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-800">${formatDate(order.fechaDespacho)}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-800 font-medium">${escapeHTML(order.cliente)}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        ${escapeHTML(order.codigoContrato)}
                        ${order.childPieces > 0 ? `<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-medium mt-1 inline-block flex items-center gap-1 w-fit"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg></span>` : ''}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${escapeHTML(order.estilo)}</td>
                    <td class="px-4 py-3 whitespace-nowrap">${getCustomStatusBadge(order.customStatus)}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-blue-600 font-bold">${totalOrderPieces.toLocaleString()}</td>
                </tr>
            `;
        }
    }
    tableHTML += '</tbody></table></div>';
    container.innerHTML += tableHTML;
}

function initDesignerCharts(designerOrders, allDesignerOrders) {
    function getTailwindColor(name, fallback) {
        try {
            if (name.includes('.')) {
                const parts = name.split('.'); let color = tailwind.config.theme.colors;
                for (const part of parts) { color = color[part]; } return color || fallback;
            }
            if (tailwind.config.theme.extend.colors[name]) { return tailwind.config.theme.extend.colors[name] || fallback; }
            if (tailwind.config.theme.colors[name]) { return tailwind.config.theme.colors[name] || fallback; }
            return fallback;
        } catch (e) { return fallback; }
    }
    
    const colorBandeja = getTailwindColor('chart-bandeja', '#F59E0B');
    const colorProduccion = getTailwindColor('chart-produccion', '#8B5CF6');
    const colorAuditoria = getTailwindColor('chart-auditoria', '#3B82F6');
    const colorSinEstado = getTailwindColor('chart-sin-estado', '#6B7280');
    const colorBorder = getTailwindColor('white', '#FFFFFF');
    const colorText = getTailwindColor('gray.500', '#6B7280');
    const colorTextTitle = getTailwindColor('gray.800', '#1F2937');
    
    const chartColors = [ colorBandeja, colorProduccion, colorAuditoria, colorSinEstado ];
    const chartLabels = ['Bandeja', 'Producción', 'Auditoría', 'Sin estado'];
    
    const statusCounts = { 'Bandeja': 0, 'Producción': 0, 'Auditoría': 0, 'Sin estado': 0 };
    designerOrders.forEach(o => { statusCounts[o.customStatus || 'Sin estado']++; });
    
    const doughnutData = {
        labels: chartLabels,
        datasets: [{
            label: 'Órdenes Activas',
            data: [ statusCounts['Bandeja'], statusCounts['Producción'], statusCounts['Auditoría'], statusCounts['Sin estado'] ],
            backgroundColor: chartColors,
            borderColor: colorBorder,
            borderWidth: 2
        }]
    };
    
    const doughnutCtx = document.getElementById('designerDoughnutChartCanvas')?.getContext('2d');
    if (doughnutCtx) {
        designerDoughnutChart = new Chart(doughnutCtx, {
            type: 'doughnut', data: doughnutData,
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 10, family: 'Inter' }, color: colorText } },
                    title: { display: true, text: 'Distribución de Órdenes Activas', font: { size: 12, family: 'Inter', weight: '600' }, color: colorTextTitle },
                    tooltip: { callbacks: { label: function(context) { const label = context.label || ''; const value = context.raw || 0; const total = context.chart.getDatasetMeta(0).total; if (total === 0) return `${label}: 0 (0%)`; const percentage = ((value / total) * 100).toFixed(1); return `${label}: ${value} (${percentage}%)`; } } }
                }
            }
        });
    }
    
    const piecesCounts = { 'Bandeja': 0, 'Producción': 0, 'Auditoría': 0, 'Sin estado': 0 };
    designerOrders.forEach(o => {
        const totalPieces = (o.cantidad || 0) + (o.childPieces || 0);
        piecesCounts[o.customStatus || 'Sin estado'] += totalPieces;
    });
    
    const barData = {
        labels: chartLabels,
        datasets: [{
            label: 'Piezas Activas (Padre + Hijas)',
            data: [ piecesCounts['Bandeja'], piecesCounts['Producción'], piecesCounts['Auditoría'], piecesCounts['Sin estado'] ],
            backgroundColor: chartColors,
            borderColor: colorBorder,
            borderWidth: 1
        }]
    };
    
    const barCtx = document.getElementById('designerBarChartCanvas')?.getContext('2d');
    if(barCtx) {
        designerBarChart = new Chart(barCtx, {
            type: 'bar', data: barData,
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'Carga de Piezas Activas', font: { size: 12, family: 'Inter', weight: '600' }, color: colorTextTitle }
                },
                scales: {
                    x: { beginAtZero: true, title: { display: true, text: 'Cantidad de Piezas', font: { size: 10, family: 'Inter' }, color: colorText }, ticks: { color: colorText, font: { family: 'Inter' } } },
                    y: { ticks: { font: { size: 10, family: 'Inter' }, color: colorText } }
                }
            }
        });
    }
    
    const weeklyActivity = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 7; i >= 0; i--) {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - (i * 7) - today.getDay() + 1);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        const weekLabel = `Sem ${weekStart.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}`;
        const completedInWeek = allDesignerOrders.filter(o => {
            if (!o.completedDate) return false;
            try { const completedDate = new Date(o.completedDate); return completedDate >= weekStart && completedDate <= weekEnd; } catch(e) { return false; }
        }).length;
        weeklyActivity[weekLabel] = completedInWeek;
    }
    
    const activityCtx = document.getElementById('designerActivityChartCanvas')?.getContext('2d');
    if (activityCtx) {
        designerActivityChart = new Chart(activityCtx, {
            type: 'bar',
            data: {
                labels: Object.keys(weeklyActivity),
                datasets: [{
                    label: 'Órdenes Completadas',
                    data: Object.values(weeklyActivity),
                    backgroundColor: Object.values(weeklyActivity).map(val => {
                        if (val === 0) return getTailwindColor('gray.300', '#D1D5DB');
                        if (val < 3) return getTailwindColor('yellow.500', '#F59E0B');
                        if (val < 6) return getTailwindColor('blue.500', '#3B82F6');
                        return getTailwindColor('green.500', '#22C55E');
                    }),
                    borderColor: getTailwindColor('gray.300', '#D1D5DB'),
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'Actividad Semanal (Órdenes Completadas, Últ. 8 Semanas)', font: { size: 12, family: 'Inter', weight: '600' }, color: colorTextTitle }
                },
                scales: {
                    x: { beginAtZero: true, ticks: { stepSize: 1, color: colorText, font: { family: 'Inter' } }, title: { display: true, text: 'Órdenes Completadas', font: { size: 10, family: 'Inter' }, color: colorText } },
                    y: { ticks: { color: colorText, font: { family: 'Inter' } } }
                }
            }
        });
    }
}

// ======================================================
// ===== LÓGICA DE COMPARACIÓN =====
// ======================================================

function openCompareModal(designerName1) {
    currentCompareDesigner1 = designerName1;
    document.getElementById('compareDesigner1Name').textContent = designerName1;
    const select = document.getElementById('compareDesignerSelect');
    select.innerHTML = '<option value="">Selecciona uno...</option>';
    const designersToCompare = designerList.filter(d => d !== designerName1);
    designersToCompare.forEach(name => {
        const safeName = escapeHTML(name);
        select.innerHTML += `<option value="${safeName}">${safeName}</option>`;
    });
    document.getElementById('selectCompareModal').classList.add('active');
    document.body.classList.add('modal-open');
}

function closeCompareModals() {
    document.getElementById('selectCompareModal').classList.remove('active');
    document.getElementById('compareModal').classList.remove('active');
    // Solo quitar del body si no hay otros modales
    if(!document.getElementById('assignModal').classList.contains('active')) {
        document.body.classList.remove('modal-open');
    }
    
    if (compareChart) {
        compareChart.destroy();
        compareChart = null;
    }
    currentCompareDesigner1 = '';
}

function startComparison() {
    const designerName2 = document.getElementById('compareDesignerSelect').value;
    if (!designerName2) {
        showCustomAlert('Por favor, selecciona un diseñador para comparar.', 'error');
        return;
    }
    if (!currentCompareDesigner1) {
        showCustomAlert('Error: Diseñador 1 no encontrado.', 'error');
        closeCompareModals();
        return;
    }
    generateCompareReport(currentCompareDesigner1, designerName2);
}

function generateCompareReport(name1, name2) {
    try {
        const pArtOrders = allOrders.filter(o => o.departamento === 'P_Art');
        const orders1 = pArtOrders.filter(o => o.designer === name1);
        const orders2 = pArtOrders.filter(o => o.designer === name2);
        
        const allOrders1 = allOrders.filter(o => o.designer === name1);
        const allOrders2 = allOrders.filter(o => o.designer === name2);
        
        const stats1 = calculateStats(orders1);
        const t1_completadas = allOrders1.filter(o => o.customStatus === 'Completada');
        const t1_aTiempo = t1_completadas.filter(o => !o.isLate).length;
        const t1_tasa = t1_completadas.length > 0 ? (t1_aTiempo / t1_completadas.length) * 100 : 0;
        const t1_bandeja = orders1.filter(o => o.customStatus === 'Bandeja').length;
        const t1_produccion = orders1.filter(o => o.customStatus === 'Producción').length;
        
        const stats2 = calculateStats(orders2);
        const t2_completadas = allOrders2.filter(o => o.customStatus === 'Completada');
        const t2_aTiempo = t2_completadas.filter(o => !o.isLate).length;
        const t2_tasa = t2_completadas.length > 0 ? (t2_aTiempo / t2_completadas.length) * 100 : 0;
        const t2_bandeja = orders2.filter(o => o.customStatus === 'Bandeja').length;
        const t2_produccion = orders2.filter(o => o.customStatus === 'Producción').length;
        
        const tableContainer = document.getElementById('compareTableContainer');
        tableContainer.innerHTML = `
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Métrica</th>
                        <th class="px-6 py-3 text-center text-sm font-semibold text-blue-600">${escapeHTML(name1)}</th>
                        <th class="px-6 py-3 text-center text-sm font-semibold text-yellow-600">${escapeHTML(name2)}</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    <tr><td class="px-6 py-4 text-sm font-medium text-gray-900">Total Órdenes (P_Art)</td><td class="value-a px-6 py-4 text-sm">${stats1.total}</td><td class="value-b px-6 py-4 text-sm">${stats2.total}</td></tr>
                    <tr><td class="px-6 py-4 text-sm font-medium text-gray-900">Total Piezas (P_Art)</td><td class="value-a px-6 py-4 text-sm">${stats1.totalPieces.toLocaleString()}</td><td class="value-b px-6 py-4 text-sm">${stats2.totalPieces.toLocaleString()}</td></tr>
                    <tr><td class="px-6 py-4 text-sm font-medium text-gray-900">Órdenes Atrasadas</td><td class="value-a px-6 py-4 text-sm">${stats1.late}</td><td class="value-b px-6 py-4 text-sm">${stats2.late}</td></tr>
                    <tr><td class="px-6 py-4 text-sm font-medium text-gray-900">Órdenes por Vencer</td><td class="value-a px-6 py-4 text-sm">${stats1.aboutToExpire}</td><td class="value-b px-6 py-4 text-sm">${stats2.aboutToExpire}</td></tr>
                    <tr><td class="px-6 py-4 text-sm font-medium text-gray-900">En Bandeja</td><td class="value-a px-6 py-4 text-sm">${t1_bandeja}</td><td class="value-b px-6 py-4 text-sm">${t2_bandeja}</td></tr>
                    <tr><td class="px-6 py-4 text-sm font-medium text-gray-900">En Producción</td><td class="value-a px-6 py-4 text-sm">${t1_produccion}</td><td class="value-b px-6 py-4 text-sm">${t2_produccion}</td></tr>
                    <tr><td class="px-6 py-4 text-sm font-medium text-gray-900">Tasa Cumplimiento (Hist.)</td><td class="value-a px-6 py-4 text-sm">${t1_tasa.toFixed(1)}%</td><td class="value-b px-6 py-4 text-sm">${t2_tasa.toFixed(1)}%</td></tr>
                </tbody>
            </table>
        `;
        
        if (compareChart) { compareChart.destroy(); }
        
        const safeColor = (name, fallback) => {
            try {
                if (name.includes('.')) { const parts = name.split('.'); let color = tailwind.config.theme.colors; for (const part of parts) { color = color[part]; } return color || fallback; }
                return tailwind.config.theme.colors[name] || fallback;
            } catch(e) { return fallback; }
        };
        
        const colorText = safeColor('gray.500', '#6B7280');
        const colorTextTitle = safeColor('gray.800', '#1F2937');
        const compareCtx = document.getElementById('compareChartCanvas').getContext('2d');
        
        compareChart = new Chart(compareCtx, {
            type: 'bar',
            data: {
                labels: ['Total Piezas', 'Atrasadas', 'En Bandeja', 'En Producción'],
                datasets: [
                    { label: name1, data: [stats1.totalPieces, stats1.late, t1_bandeja, t1_produccion], backgroundColor: 'rgba(79, 70, 229, 0.7)', borderColor: 'rgba(79, 70, 229, 1)', borderWidth: 1 },
                    { label: name2, data: [stats2.totalPieces, stats2.late, t2_bandeja, t2_produccion], backgroundColor: 'rgba(245, 158, 11, 0.7)', borderColor: 'rgba(245, 158, 11, 1)', borderWidth: 1 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { family: 'Inter' }, color: colorText } },
                    title: { display: true, text: 'Comparativa de Carga Activa (P_Art)', font: { size: 12, family: 'Inter', weight: '600' }, color: colorTextTitle }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { color: colorText, font: { family: 'Inter' } } },
                    x: { ticks: { color: colorText, font: { family: 'Inter' } } }
                }
            }
        });
        
        document.getElementById('selectCompareModal').classList.remove('active');
        document.getElementById('compareModal').classList.add('active');
        document.body.classList.add('modal-open');
        
    } catch (error) {
        console.error("Error generando comparación:", error);
        showCustomAlert(`Error al comparar: ${error.message}`, 'error');
        closeCompareModals();
    }
}

// ======================================================
// ===== FUNCIONES DE EXPORTACIÓN (EXTRA) =====
// ======================================================

function exportDesignerMetricsPDF(designerName) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.text(`Reporte de Métricas: ${designerName}`, 14, 16);
        doc.setFontSize(10);
        doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 22);
        
        // Tabla de órdenes
        const tableRows = [];
        const orders = allOrders.filter(o => o.designer === designerName && o.departamento === 'P_Art');
        orders.forEach(o => {
            tableRows.push([
                o.cliente || '-',
                o.codigoContrato || '-',
                o.estilo || '-',
                o.customStatus || 'Sin estado',
                o.fechaDespacho ? new Date(o.fechaDespacho).toLocaleDateString() : '-',
                (o.cantidad || 0).toLocaleString()
            ]);
        });
        
        doc.autoTable({
            head: [['Cliente', 'Código', 'Estilo', 'Estado', 'Fecha', 'Piezas']],
            body: tableRows,
            startY: 30,
            theme: 'grid'
        });
        
        doc.save(`Metricas_${designerName.replace(/\s+/g, '_')}.pdf`);
        
    } catch (error) {
        console.error("Error PDF:", error);
        showCustomAlert('Error al generar PDF', 'error');
    }
}

function exportDesignerMetricsExcel(designerName) {
    try {
        const orders = allOrders.filter(o => o.designer === designerName && o.departamento === 'P_Art');
        
        const data = orders.map(o => ({
            'Cliente': o.cliente,
            'Código': o.codigoContrato,
            'Estilo': o.estilo,
            'Estado': o.customStatus,
            'Fecha Despacho': o.fechaDespacho ? new Date(o.fechaDespacho).toLocaleDateString() : '-',
            'Piezas': o.cantidad
        }));
        
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Métricas");
        XLSX.writeFile(wb, `Metricas_${designerName.replace(/\s+/g, '_')}.xlsx`);
        
    } catch (error) {
        console.error("Error Excel:", error);
        showCustomAlert('Error al generar Excel', 'error');
    }
}