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
// ELIMINADO: firebaseWeeklyPlanMap

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
// ELIMINADO: Gráficos de Depto.
// ELIMINADO: currentWorkPlanWeek
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
    
    // ELIMINADO: Listener de 'viewWorkPlanContent'

    // --- Listeners de Atajos de Teclado ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeMultiModal();
            // ELIMINADO: closeWeeklyReportModal()
            // ELIMINADO: hideWorkPlanView()
            closeDesignerManager();
            hideMetricsView(); 
            // ELIMINADO: hideDepartmentMetrics()
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

    // --- 5. ELIMINADO: Sincronizar Plan Semanal ---
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

// ELIMINADO: addOrderToWorkPlanDB
// ELIMINADO: getWorkPlanForWeek
// ELIMINADO: removeOrderFromWorkPlanDB

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
                    <span>Eliminar</span>
                </button>
            </div>
        `;
    });
}

function openDesignerManager() {
    document.getElementById('designerManagerModal').classList.add('active');
    document.body.classList.add('modal-open');
}
function closeDesignerManager() {
    document.getElementById('designerManagerModal').classList.remove('active');
    document.body.classList.remove('modal-open');
}

// ======================================================
// ===== LÓGICA DE UI (ACTUALIZACIÓN DEL DASHBOARD) =====
// ======================================================

/**
 * Función principal para actualizar toda la UI después de un cambio.
 */
async function updateDashboard() {
    if (!isExcelLoaded) return;
    console.log("Actualizando dashboard completo...");
    
    // 1. Actualizar la tabla principal (esto incluye filtrado, paginación)
    updateTable();
    
    // 2. Actualizar el reporte de carga de trabajo (sidebar)
    generateWorkloadReport();
    
    // 3. Actualizar los resúmenes (cards superiores)
    generateSummary();
}

/**
* Filtra y ordena el array principal 'allOrders' basado en los filtros globales.
*/
function filterAndSortOrders() {
    const searchLower = currentSearch.toLowerCase();
    
    // 1. Filtrar
    const filtered = allOrders.filter(order => {
        // Filtro de Búsqueda
        if (currentSearch) {
            const inClient = order.cliente.toLowerCase().includes(searchLower);
            const inCode = order.codigoContrato.toLowerCase().includes(searchLower);
            const inStyle = order.estilo.toLowerCase().includes(searchLower);
            if (!inClient && !inCode && !inStyle) return false;
        }
        
        // Filtros de Dropdown
        if (currentClientFilter && order.cliente !== currentClientFilter) return false;
        if (currentStyleFilter && order.estilo !== currentStyleFilter) return false;
        if (currentTeamFilter && order.teamName !== currentTeamFilter) return false;
        if (currentDepartamentoFilter && order.departamento !== currentDepartamentoFilter) return false;
        if (currentDesignerFilter && order.designer !== currentDesignerFilter) return false;
        if (currentCustomStatusFilter && order.customStatus !== currentCustomStatusFilter) return false;

        // Filtros de Fecha
        if (currentDateFrom && order.fechaDespacho) {
            const fromDate = new Date(currentDateFrom + 'T00:00:00Z');
            if (order.fechaDespacho < fromDate) return false;
        }
        if (currentDateTo && order.fechaDespacho) {
            const toDate = new Date(currentDateTo + 'T23:59:59Z');
            if (order.fechaDespacho > toDate) return false;
        }

        return true;
    });

    // 2. Ordenar
    const { key, direction } = sortConfig;
    filtered.sort((a, b) => {
        let valA = a[key];
        let valB = b[key];

        if (valA === valB) return 0;
        if (valA === null || valA === undefined || valA === '') return 1;
        if (valB === null || valB === undefined || valB === '') return -1;
        
        // Ordenamiento específico para fechas
        if (key === 'fechaDespacho') {
            valA = a.fechaDespacho ? a.fechaDespacho.getTime() : 0;
            valB = b.fechaDespacho ? b.fechaDespacho.getTime() : 0;
        }

        if (direction === 'asc') {
            return valA > valB ? 1 : -1;
        } else {
            return valA < valB ? 1 : -1;
        }
    });

    return filtered;
}

/**
 * Renderiza la tabla principal con los datos filtrados y paginados.
 */
function updateTable() {
    const tbody = document.getElementById('ordersTableBody');
    const summary = document.getElementById('tableSummary');
    if (!tbody || !summary) return;

    const filteredOrders = filterAndSortOrders();
    const totalRows = filteredOrders.length;
    
    // Paginación
    const totalPages = Math.ceil(totalRows / rowsPerPage);
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    paginatedOrders = filteredOrders.slice(start, end);

    // Actualizar resumen
    summary.textContent = `Mostrando ${start + 1} - ${Math.min(end, totalRows)} de ${totalRows} órdenes`;
    
    let tableHTML = '';
    
    if (paginatedOrders.length === 0) {
        tableHTML = '<tr><td colspan="11" class="text-center text-gray-500 py-10">No se encontraron órdenes que coincidan con los filtros.</td></tr>';
    } else {
        paginatedOrders.forEach(order => {
            const isSelected = selectedOrders.has(order.orderId);
            const safeOrderId = escapeHTML(order.orderId);
            const isPArt = order.departamento === 'P_Art';

            let rowClass = 'bg-white hover:bg-gray-50';
            if (order.isVeryLate) rowClass = 'bg-red-100 hover:bg-red-200';
            else if (order.isLate) rowClass = 'bg-red-50 hover:bg-red-100';
            else if (order.isAboutToExpire) rowClass = 'bg-yellow-50 hover:bg-yellow-100';

            tableHTML += `
                <tr class="${rowClass} cursor-pointer" id="row-${safeOrderId}">
                    <td class="table-cell checkbox-cell">
                        <input type="checkbox" class="form-checkbox" 
                            ${isSelected ? 'checked' : ''} 
                            onclick="toggleRowSelection('${safeOrderId}', this)">
                    </td>
                    <td class="table-cell" onclick="openAssignModal('${safeOrderId}')">
                        ${formatDate(order.fechaDespacho)}
                    </td>
                    <td class="table-cell" onclick="openAssignModal('${safeOrderId}')">${escapeHTML(order.cliente)}</td>
                    <td class="table-cell" onclick="openAssignModal('${safeOrderId}')">${escapeHTML(order.codigoContrato)}</td>
                    <td class="table-cell" onclick="openAssignModal('${safeOrderId}')">${escapeHTML(order.estilo)}</td>
                    <td class="table-cell" onclick="openAssignModal('${safeOrderId}')">${escapeHTML(order.teamName)}</td>
                    <td class="table-cell" onclick="openAssignModal('${safeOrderId}')">
                        <span class="badge ${getBadgeClass(order.departamento)}">${escapeHTML(order.departamento)}</span>
model-output/javascript
                    </td>
                    <td class="table-cell" onclick="openAssignModal('${safeOrderId}')">
                        ${isPArt ? `<span class="badge ${getStatusClass(order.customStatus)}">${escapeHTML(order.customStatus || 'Bandeja')}</span>` : 'N/A'}
        _            </td>
                    <td class="table-cell" onclick="openAssignModal('${safeOrderId}')">
                        ${isPArt ? (escapeHTML(order.designer) || '<em class="text-gray-400">Sin asignar</em>') : 'N/A'}
                    </td>
                    <td class="table-cell text-right" onclick="openAssignModal('${safeOrderId}')">
                        ${order.cantidad.toLocaleString()}
                    </td>
                    <td class="table-cell text-right" onclick="openAssignModal('${safeOrderId}')">
                        ${order.childPieces > 0 ? order.childPieces.toLocaleString() : '-'}
                    </td>
                </tr>
            `;
        });
    }

    tbody.innerHTML = tableHTML;
    updatePagination(totalRows, totalPages);
}

// ======================================================
// ===== LÓGICA DE SELECCIÓN DE TABLA =====
// ======================================================

function toggleRowSelection(orderId, checkbox) {
    checkbox.checked ? selectedOrders.add(orderId) : selectedOrders.delete(orderId);
    document.getElementById(`row-${orderId}`).classList.toggle('selected-row', checkbox.checked);
    updateSelectionUI();
}

function toggleSelectAll(masterCheckbox) {
    const isChecked = masterCheckbox.checked;
    selectedOrders.clear();
    
    paginatedOrders.forEach(order => {
        const checkbox = document.querySelector(`#row-${order.orderId} input[type="checkbox"]`);
        if (checkbox) checkbox.checked = isChecked;
        document.getElementById(`row-${order.orderId}`).classList.toggle('selected-row', isChecked);
        if (isChecked) selectedOrders.add(order.orderId);
    });
    
    updateSelectionUI();
}

function clearSelection() {
    selectedOrders.clear();
    document.querySelectorAll('#ordersTableBody tr').forEach(row => {
        row.classList.remove('selected-row');
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = false;
    });
    const masterCheckbox = document.getElementById('selectAllCheckbox');
    if (masterCheckbox) masterCheckbox.checked = false;
    updateSelectionUI();
}

function updateSelectionUI() {
    const selectionBar = document.getElementById('selectionBar');
    const selectionCount = document.getElementById('selectionCount');
    if (!selectionBar || !selectionCount) return;
    
    const count = selectedOrders.size;
    if (count > 0) {
        selectionCount.textContent = `${count} ${count === 1 ? 'orden seleccionada' : 'órdenes seleccionadas'}`;
        selectionBar.classList.remove('hidden');
    } else {
        selectionBar.classList.add('hidden');
    }
}

// ======================================================
// ===== LÓGICA DE PAGINACIÓN =====
// ======================================================

function updatePagination(totalRows, totalPages) {
    const paginationControls = document.getElementById('paginationControls');
    if (!paginationControls) return;

    if (totalPages <= 1) {
        paginationControls.innerHTML = '';
        return;
    }

    let html = '';
    
    // Botón "Anterior"
    html += `<button class="pagination-btn ${currentPage === 1 ? 'disabled' : ''}" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>&laquo; Ant</button>`;

    // Números de Página
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);

    if (currentPage - 2 > 1) html += `<button class="pagination-btn" onclick="changePage(1)">1</button><span class="px-3">...</span>`;

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
    }

    if (currentPage + 2 < totalPages) html += `<span class="px-3">...</span><button class="pagination-btn" onclick="changePage(${totalPages})">${totalPages}</button>`;
    
    // Botón "Siguiente"
    html += `<button class="pagination-btn ${currentPage === totalPages ? 'disabled' : ''}" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Sig &raquo;</button>`;

    paginationControls.innerHTML = html;
}

function changePage(page) {
    if (page < 1 || page > Math.ceil(filterAndSortOrders().length / rowsPerPage)) return;
    currentPage = page;
    updateTable();
}

// ======================================================
// ===== LÓGICA DE MÉTRICAS DEL DASHBOARD =====
// ======================================================

function generateSummary() {
    const pArtOrders = allOrders.filter(o => o.departamento === 'P_Art');
    const inBandeja = pArtOrders.filter(o => o.customStatus === 'Bandeja').length;
    const inProduccion = pArtOrders.filter(o => o.customStatus === 'Producción').length;
    const inAuditoria = pArtOrders.filter(o => o.customStatus === 'Auditoría').length;
    const lateOrders = allOrders.filter(o => o.isLate).length;

    document.getElementById('summaryTotal').textContent = allOrders.length.toLocaleString();
    document.getElementById('summaryPArt').textContent = pArtOrders.length.toLocaleString();
    document.getElementById('summaryBandeja').textContent = inBandeja.toLocaleString();
    document.getElementById('summaryProduccion').textContent = inProduccion.toLocaleString();
    document.getElementById('summaryAuditoria').textContent = inAuditoria.toLocaleString();
    document.getElementById('summaryAtrasadas').textContent = lateOrders.toLocaleString();
}

function generateWorkloadReport() {
    const pArtOrders = allOrders.filter(o => o.departamento === 'P_Art');
    let workload = new Map();

    // Inicializar a todos los diseñadores de la lista
    designerList.forEach(designer => {
        workload.set(designer, { total: 0, bandeja: 0, produccion: 0, auditoria: 0, piezas: 0 });
    });
    // Añadir "Sin asignar"
    workload.set("Sin asignar", { total: 0, bandeja: 0, produccion: 0, auditoria: 0, piezas: 0 });

    pArtOrders.forEach(order => {
        const designerName = order.designer || "Sin asignar";
        if (!workload.has(designerName)) {
            workload.set(designerName, { total: 0, bandeja: 0, produccion: 0, auditoria: 0, piezas: 0 });
        }
        
        const stats = workload.get(designerName);
        stats.total++;
        stats.piezas += order.cantidad;
        if (order.customStatus === 'Bandeja') stats.bandeja++;
        else if (order.customStatus === 'Producción') stats.produccion++;
        else if (order.customStatus === 'Auditoría') stats.auditoria++;
    });

    const listDiv = document.getElementById('metricsSidebarList');
    listDiv.innerHTML = '';
    
    // Ordenar por nombre, pero poner "Sin asignar" al final
    const sortedWorkload = [...workload.entries()].sort((a, b) => {
        if (a[0] === "Sin asignar") return 1;
        if (b[0] === "Sin asignar") return -1;
        return a[0].localeCompare(b[0]);
    });

    sortedWorkload.forEach(([designer, stats]) => {
        if (stats.total === 0 && designer !== "Sin asignar") return; // Ocultar diseñadores sin carga
        
        const safeName = escapeHTML(designer);
        listDiv.innerHTML += `
            <div class="filter-btn" data-designer="${safeName}">
                <div class="flex justify-between items-center w-full">
                    <span class="font-semibold text-sm ${designer === "Sin asignar" ? 'text-gray-500 italic' : 'text-gray-800'}">${safeName}</span>
                    <span class="font-bold text-sm text-blue-600">${stats.total}</span>
                </div>
                <div class="text-xs text-gray-500 mt-1.5 flex justify-between">
                    <span>B: <strong class="text-amber-600">${stats.bandeja}</strong></span>
                    <span>P: <strong class="text-purple-600">${stats.produccion}</strong></span>
                    <span>A: <strong class="text-blue-500">${stats.auditoria}</strong></span>
                    <span>Piezas: <strong class="text-gray-700">${stats.piezas.toLocaleString()}</strong></span>
                </div>
            </div>
        `;
    });
}

// ======================================================
// ===== LÓGICA DE MÉTRICAS DE DISEÑADOR (VISTA) =====
// ======================================================

function showMetricsView() {
    document.getElementById('metricsView').classList.add('active');
    document.body.classList.add('modal-open');
}
function hideMetricsView() {
    document.getElementById('metricsView').classList.remove('active');
    document.body.classList.remove('modal-open');
}

function generateDesignerMetrics(designerName) {
    document.getElementById('designerMetricsName').textContent = designerName;
    showMetricsView();
    
    // Filtrar órdenes para este diseñador (incluyendo completadas de Firebase)
    let designerOrders = [];
    
    if (designerName === 'Sin asignar') {
        designerOrders = allOrders.filter(o => o.departamento === 'P_Art' && !o.designer);
    } else {
        designerOrders = allOrders.filter(o => o.designer === designerName);
    }

    // Calcular estadísticas
    const totalActivas = designerOrders.filter(o => o.departamento === 'P_Art').length;
    const stats = {
        bandeja: designerOrders.filter(o => o.customStatus === 'Bandeja').length,
        produccion: designerOrders.filter(o => o.customStatus === 'Producción').length,
        auditoria: designerOrders.filter(o => o.customStatus === 'Auditoría').length
    };
    const totalCompletadas = designerOrders.filter(o => o.customStatus === 'Completada').length;
    const totalPiezas = designerOrders.reduce((sum, o) => sum + o.cantidad, 0);

    // Actualizar Stats
    document.getElementById('designerStatTotal').textContent = totalActivas.toLocaleString();
    document.getElementById('designerStatBandeja').textContent = stats.bandeja.toLocaleString();
    document.getElementById('designerStatProduccion').textContent = stats.produccion.toLocaleString();
    document.getElementById('designerStatAuditoria').textContent = stats.auditoria.toLocaleString();
    document.getElementById('designerStatCompletadas').textContent = totalCompletadas.toLocaleString();
    document.getElementById('designerStatPiezas').textContent = totalPiezas.toLocaleString();

    // Generar Gráficos
    createDesignerDoughnutChart(stats);
    createDesignerBarChart(designerOrders);
    createDesignerActivityChart(designerOrders);
    
    // Generar Tabla
    updateDesignerTable(designerOrders);
}

function updateDesignerTable(designerOrders) {
    const tbody = document.getElementById('designerMetricsTableBody');
    tbody.innerHTML = '';
    
    if (designerOrders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-500 py-6">No hay órdenes para este diseñador.</td></tr>';
        return;
    }

    const sorted = designerOrders.sort((a, b) => (b.fechaDespacho ? b.fechaDespacho.getTime() : 0) - (a.fechaDespacho ? a.fechaDespacho.getTime() : 0));
    
    sorted.forEach(order => {
        let rowClass = 'bg-white';
        if (order.isVeryLate) rowClass = 'bg-red-100';
        else if (order.isLate) rowClass = 'bg-red-50';
        
        tbody.innerHTML += `
            <tr class="${rowClass}">
                <td class="table-cell">${escapeHTML(order.codigoContrato)}</td>
                <td class="table-cell">${escapeHTML(order.cliente)}</td>
                <td class="table-cell">${escapeHTML(order.estilo)}</td>
                <td class="table-cell">${formatDate(order.fechaDespacho)}</td>
                <td class="table-cell">
                    <span class="badge ${getStatusClass(order.customStatus)}">${escapeHTML(order.customStatus || 'Bandeja')}</span>
                </td>
                <td class="table-cell text-right">${order.cantidad.toLocaleString()}</td>
            </tr>
        `;
    });
}

// ======================================================
// ===== LÓGICA DE GRÁFICOS (Chart.js) =====
// ======================================================

function createDesignerDoughnutChart(stats) {
    const ctx = document.getElementById('designerDoughnutChart');
    if (designerDoughnutChart) designerDoughnutChart.destroy();
    
    const total = stats.bandeja + stats.produccion + stats.auditoria;
    const data = (total === 0) ? [1] : [stats.bandeja, stats.produccion, stats.auditoria];
    const labels = (total === 0) ? ['Sin órdenes'] : ['Bandeja', 'Producción', 'Auditoría'];
    const colors = (total === 0) ? ['#E5E7EB'] : [tailwind.config.theme.extend.colors['chart-bandeja'], tailwind.config.theme.extend.colors['chart-produccion'], tailwind.config.theme.extend.colors['chart-auditoria']];

    designerDoughnutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                hoverOffset: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function createDesignerBarChart(orders) {
    const ctx = document.getElementById('designerBarChart');
    if (designerBarChart) designerBarChart.destroy();
    
    let clientData = new Map();
    orders.forEach(o => {
        const pieces = clientData.get(o.cliente) || 0;
        clientData.set(o.cliente, pieces + o.cantidad);
    });
    
    const sortedClients = [...clientData.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const labels = sortedClients.map(c => c[0]);
    const data = sortedClients.map(c => c[1]);

    designerBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Piezas por Cliente',
                data: data,
                backgroundColor: '#3B82F6',
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function createDesignerActivityChart(orders) {
    const ctx = document.getElementById('designerActivityChart');
    if (designerActivityChart) designerActivityChart.destroy();
    
    let completedData = new Map();
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    orders.forEach(o => {
        if (o.customStatus === 'Completada' && o.completedDate) {
            const d = new Date(o.completedDate);
            if (d >= thirtyDaysAgo) {
                const day = d.toISOString().split('T')[0];
                const count = completedData.get(day) || 0;
                completedData.set(day, count + 1);
            }
        }
    });
    
    const sortedData = [...completedData.entries()].sort((a, b) => new Date(a[0]) - new Date(b[0]));
    const labels = sortedData.map(d => d[0]);
    const data = sortedData.map(d => d[1]);

    designerActivityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Órdenes Completadas (Últimos 30 días)',
                data: data,
                borderColor: '#10B981',
                tension: 0.1
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

// ======================================================
// ===== LÓGICA DE COMPARACIÓN (MODAL Y GRÁFICO) =====
// ======================================================

function openCompareModal() {
    const options = designerList.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('');
    document.getElementById('compareDesigner1').innerHTML = `<option value="">Seleccionar...</option>${options}`;
    document.getElementById('compareDesigner2').innerHTML = `<option value="">Seleccionar...</option>${options}`;
    
    document.getElementById('compareModal').classList.add('active');
    document.body.classList.add('modal-open');
    
    // Limpiar gráfico anterior
    if (compareChart) compareChart.destroy();
    document.getElementById('compareChartContainer').style.display = 'none';
}

function closeCompareModals() {
    document.getElementById('compareModal').classList.remove('active');
    document.body.classList.remove('modal-open');
}

function generateCompareChart() {
    const d1_name = document.getElementById('compareDesigner1').value;
    const d2_name = document.getElementById('compareDesigner2').value;
  s   if (!d1_name || !d2_name) {
        showCustomAlert("Debes seleccionar dos diseñadores", "error");
        return;
    }
    if (d1_name === d2_name) {
        showCustomAlert("Debes seleccionar dos diseñadores diferentes", "error");
        return;
    }

    const getStats = (name) => {
        const orders = allOrders.filter(o => o.designer === name);
        const activas = orders.filter(o => o.departamento === 'P_Art' && o.customStatus !== 'Completada').length;
        const completadas = orders.filter(o => o.customStatus === 'Completada').length;
        const piezas = orders.reduce((sum, o) => sum + o.cantidad, 0);
        return { activas, completadas, piezas };
    };

    const d1_stats = getStats(d1_name);
    const d2_stats = getStats(d2_name);

    const labels = ['Órdenes Activas', 'Órdenes Completadas', 'Total Piezas'];
    
    const ctx = document.getElementById('compareChart');
    if (compareChart) compareChart.destroy();

    document.getElementById('compareChartContainer').style.display = 'block';

    compareChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: d1_name,
                    data: [d1_stats.activas, d1_stats.completadas, d1_stats.piezas],
                    backgroundColor: 'rgba(59, 130, 246, 0.7)', // Blue
                },
                {
                    label: d2_name,
                    data: [d2_stats.activas, d2_stats.completadas, d2_stats.piezas],
                    backgroundColor: 'rgba(245, 158, 11, 0.7)', // Amber
                }
            ]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } },
            plugins: { legend: { position: 'top' } }
        }
    });
}


// ======================================================
// ===== FUNCIONES UTILITARIAS (Formato, Helpers) =====
// ======================================================

/**
 * Formatea un objeto Date a 'dd/MM/yyyy'.
 */
function formatDate(date) {
    if (!date || !(date instanceof Date) || isNaN(date)) {
        return '-';
    }
    // Asegurarse de que estamos tratando con UTC para evitar problemas de zona horaria
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
}

/**
 * Devuelve la clase de Tailwind para un badge de departamento.
 */
function getBadgeClass(dept) {
    switch (dept) {
        case 'P_Art': return 'badge-art';
        case 'P_Order_Entry': return 'badge-entry';
        case 'P_Printing': return 'badge-printing';
        case 'P_Press': return 'badge-press';
        case 'P_Cut': return 'badge-cut';
        case 'P_Sew': return 'badge-sew';
        case 'P_Packing': return 'badge-packing';
        case 'P_Shipping': return 'badge-shipping';
        default: return 'badge-default';
    }
}

/**
 * Devuelve la clase de Tailwind para un badge de estado.
 */
function getStatusClass(status) {
    switch (status) {
        case 'Bandeja': return 'badge-bandeja';
        case 'Producción': return 'badge-produccion';
        case 'Auditoría': return 'badge-auditoria';
        case 'Completada': return 'badge-completada';
        default: return 'badge-default';
    }
}

/**
 * Función Debounce para listeners de input (como la búsqueda).
 */
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

